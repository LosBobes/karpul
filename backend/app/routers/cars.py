from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from ..database import get_session
from ..models import CorporateCar
from ..schemas import CorporateCarRead

router = APIRouter(prefix="/api/cars", tags=["cars"])


@router.get("/corporate", response_model=list[CorporateCarRead])
def list_corporate_cars(session: Session = Depends(get_session)):
    stmt = select(CorporateCar).where(CorporateCar.active == True).order_by(CorporateCar.name)  # noqa: E712
    return session.exec(stmt).all()
