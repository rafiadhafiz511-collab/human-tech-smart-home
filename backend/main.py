from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from datetime import datetime
from pydantic import BaseModel
import pytz
from apscheduler.schedulers.background import BackgroundScheduler

import models, schemas
from database import engine, get_db, SessionLocal
from auth import verify_token

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Smart Home Automation API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Background Scheduler for Automation ---

bd_tz = pytz.timezone('Asia/Dhaka')

def check_and_execute_schedules():
    db: Session = SessionLocal()
    try:
        current_time = datetime.now(bd_tz).strftime("%H:%M")  
        print(f"[Checking Schedules] Current BD Time: {current_time}")
        
        active_schedules = db.query(models.Schedule).filter(
            models.Schedule.schedule_time == current_time,
            models.Schedule.is_active == True
        ).all()

        for sched in active_schedules:
            device = db.query(models.Device).filter(models.Device.id == sched.device_id).first()
            if device and device.status != sched.target_status:
                device.status = sched.target_status
                db.commit()
                print(f"[Automation Success] Device {device.name} updated to {device.status} at {current_time}")
    except Exception as e:
        print(f"[Automation Error] {e}")
    finally:
        db.close()

# FastAPI স্টার্ট হওয়ার সময় ব্যাকগ্রাউন্ড শিডিউলার চালু করা
@app.on_event("startup")
def startup_event():
    scheduler = BackgroundScheduler()
    # প্রতি ১ মিনিট পর পর ফাংশনটি রান করবে
    scheduler.add_job(check_and_execute_schedules, 'interval', minutes=1)
    scheduler.start()
    print("[Scheduler Started] Background automation is running...")


@app.get("/")
def read_root():
    return {"message": "Smart Home System API Working"}


@app.get("/devices", response_model=list[schemas.DeviceResponse])
def get_devices(db: Session = Depends(get_db), user: dict = Depends(verify_token)):
    return db.query(models.Device).filter(models.Device.owner_id == user["sub"]).all()


@app.post("/devices", response_model=schemas.DeviceResponse)
def create_device(
    device: schemas.DeviceCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(verify_token),
):
    db_device = models.Device(**device.model_dump(), owner_id=user["sub"])
    db.add(db_device)
    db.commit()
    db.refresh(db_device)
    return db_device


# --- ESP32 ও পাবলিক ডিভাইস স্ট্যাটাস এন্ডপয়েন্ট ---

@app.get("/api/devices/{device_id}/status")
def get_device_status(device_id: int, db: Session = Depends(get_db)):
    """ESP32 এই লিংকে রিকোয়েস্ট পাঠিয়ে জানবে লাইট অন হবে না অফ"""
    device = db.query(models.Device).filter(models.Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    return {
        "device_id": device.id,
        "name": device.name,
        "status": device.status # true (ON) অথবা false (OFF)
    }


class DeviceStatusUpdate(BaseModel):
    status: bool


@app.post("/api/devices/{device_id}/toggle")
def toggle_device_public(device_id: int, payload: DeviceStatusUpdate, db: Session = Depends(get_db)):
    """বাইরের ডিভাইস বা টেস্টের জন্য ডিরেক্ট স্ট্যাটাস টগল"""
    device = db.query(models.Device).filter(models.Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    device.status = payload.status
    db.commit()
    db.refresh(device)
    
    return {"message": "Status updated successfully", "status": device.status}


# --- ড্যাশবোর্ড ইউজার টগল এন্ডপয়েন্ট (Bearer Token সহ) ---

@app.patch("/devices/{device_id}/toggle", response_model=schemas.DeviceResponse)
def toggle_device_auth(
    device_id: int,
    status: bool,
    db: Session = Depends(get_db),
    user: dict = Depends(verify_token),
):
    db_device = (
        db.query(models.Device)
        .filter(models.Device.id == device_id, models.Device.owner_id == user["sub"])
        .first()
    )
    if not db_device:
        raise HTTPException(status_code=404, detail="Device not found")

    db_device.status = status
    db.commit()
    db.refresh(db_device)
    return db_device


@app.delete("/devices/{device_id}", status_code=204)
def delete_device(
    device_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(verify_token),
):
    db_device = (
        db.query(models.Device)
        .filter(models.Device.id == device_id, models.Device.owner_id == user["sub"])
        .first()
    )
    if not db_device:
        raise HTTPException(status_code=404, detail="Device not found")
    db.delete(db_device)
    db.commit()


@app.post("/devices/{device_id}/heartbeat")
def device_heartbeat(device_id: int, db: Session = Depends(get_db)):
    db_device = db.query(models.Device).filter(models.Device.id == device_id).first()
    if not db_device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    db_device.last_seen = datetime.utcnow()
    db.commit()
    return {"status": "alive", "timestamp": db_device.last_seen}


# --- Schedule Schemas & Endpoints ---

class ScheduleCreate(BaseModel):
    device_id: int
    target_status: bool
    schedule_time: str


@app.get("/schedules")
def get_schedules(db: Session = Depends(get_db), user: dict = Depends(verify_token)):
    schedules = db.query(models.Schedule).filter(models.Schedule.owner_id == user["sub"]).all()
    return schedules


@app.post("/schedules")
def create_schedule(sched: ScheduleCreate, db: Session = Depends(get_db), user: dict = Depends(verify_token)):
    new_schedule = models.Schedule(
        device_id=sched.device_id,
        target_status=sched.target_status,
        schedule_time=sched.schedule_time,
        owner_id=user["sub"]
    )
    db.add(new_schedule)
    db.commit()
    db.refresh(new_schedule)
    return new_schedule


@app.delete("/schedules/{schedule_id}")
def delete_schedule(schedule_id: int, db: Session = Depends(get_db), user: dict = Depends(verify_token)):
    sched = db.query(models.Schedule).filter(
        models.Schedule.id == schedule_id, 
        models.Schedule.owner_id == user["sub"]
    ).first()
    
    if not sched:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    db.delete(sched)
    db.commit()
    return {"message": "Schedule deleted successfully"}