from pydantic import BaseModel
from typing import Optional

class DeviceBase(BaseModel):
    name: str
    device_type: str
    status: bool = False
    pin_number: Optional[int] = None
    room_name: Optional[str] = "Living Room"

class DeviceCreate(DeviceBase):
    pass

class DeviceResponse(DeviceBase):
    id: int
    owner_id: str

    class Config:
        from_attributes = True