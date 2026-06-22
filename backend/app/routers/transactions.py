from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import extract

from .. import models, schemas, auth
from ..database import get_db

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


@router.get("", response_model=List[schemas.TransactionOut])
def list_transactions(
    year: Optional[int] = None,
    month: Optional[int] = None,
    type: Optional[models.TransactionType] = None,
    category: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    query = db.query(models.Transaction).filter(
        models.Transaction.user_id == current_user.id
    )
    if year is not None:
        query = query.filter(models.Transaction.year == year)
    if month is not None:
        query = query.filter(models.Transaction.month == month)
    if type is not None:
        query = query.filter(models.Transaction.type == type)
    if category is not None:
        query = query.filter(models.Transaction.category == category)

    return query.order_by(models.Transaction.date.desc(), models.Transaction.id.desc()).all()


@router.post("", response_model=schemas.TransactionOut)
def create_transaction(
    tx_in: schemas.TransactionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    tx = models.Transaction(
        **tx_in.dict(),
        user_id=current_user.id,
        month=tx_in.date.month,
        year=tx_in.date.year,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


@router.put("/{tx_id}", response_model=schemas.TransactionOut)
def update_transaction(
    tx_id: int,
    tx_in: schemas.TransactionUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    tx = (
        db.query(models.Transaction)
        .filter(models.Transaction.id == tx_id, models.Transaction.user_id == current_user.id)
        .first()
    )
    if not tx:
        raise HTTPException(status_code=404, detail="Movimiento no encontrado")

    data = tx_in.dict(exclude_unset=True)
    for field, value in data.items():
        setattr(tx, field, value)
    if "date" in data:
        tx.month = tx.date.month
        tx.year = tx.date.year

    db.commit()
    db.refresh(tx)
    return tx


@router.delete("/{tx_id}")
def delete_transaction(
    tx_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    tx = (
        db.query(models.Transaction)
        .filter(models.Transaction.id == tx_id, models.Transaction.user_id == current_user.id)
        .first()
    )
    if not tx:
        raise HTTPException(status_code=404, detail="Movimiento no encontrado")
    db.delete(tx)
    db.commit()
    return {"ok": True}


@router.get("/months/available")
def available_months(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Devuelve la lista de (año, mes) que ya tienen movimientos registrados."""
    rows = (
        db.query(models.Transaction.year, models.Transaction.month)
        .filter(models.Transaction.user_id == current_user.id)
        .distinct()
        .order_by(models.Transaction.year.desc(), models.Transaction.month.desc())
        .all()
    )
    return [{"year": y, "month": m} for y, m in rows]
