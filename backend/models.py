from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from datetime import datetime
from database import Base

class Device(Base):
    __tablename__ = "devices"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(String, index=True, nullable=False)  # Supabase user id
    name = Column(String, index=True)
    device_type = Column(String)  # 'switch', 'sensor', 'pump'
    status = Column(Boolean, default=False)
    pin_number = Column(Integer, nullable=True)
    room_name = Column(String, default="Living Room")  # রুমের নাম
    last_seen = Column(DateTime, default=datetime.utcnow)  # ডিভাইস সর্বশেষ কবে সক্রিয় ছিল


class Schedule(Base):
    __tablename__ = "schedules"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id"))
    target_status = Column(Boolean, default=False)  # True মানে ON, False মানে OFF
    schedule_time = Column(String)  # ফরম্যাট: "23:00" (ঘণ্টা ও মিনিট)
    is_active = Column(Boolean, default=True)
    owner_id = Column(String, index=True)