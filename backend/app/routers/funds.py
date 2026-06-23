from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas, auth
from ..database import get_db

router = APIRouter(prefix="/api/funds", tags=["funds"])


def _get_fund(fund_id: int, user_id: int, db: Session) -> models.Fund:
    fund = db.query(models.Fund).filter(
        models.Fund.id == fund_id,
        models.Fund.user_id == user_id,
    ).first()
    if not fund:
        raise HTTPException(404, "Fondo no encontrado")
    return fund


def _fund_out(fund: models.Fund) -> schemas.FundOut:
    balance = sum(m.amount for m in fund.movements)
    return schemas.FundOut(
        id=fund.id,
        name=fund.name,
        description=fund.description,
        balance=balance,
        movements=fund.movements,
    )


# ---- Fondos ----

@router.get("", response_model=List[schemas.FundOut])
def list_funds(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    funds = (
        db.query(models.Fund)
        .filter(models.Fund.user_id == current_user.id)
        .order_by(models.Fund.created_at)
        .all()
    )
    return [_fund_out(f) for f in funds]


@router.post("", response_model=schemas.FundOut)
def create_fund(
    body: schemas.FundCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    fund = models.Fund(**body.dict(), user_id=current_user.id)
    db.add(fund)
    db.commit()
    db.refresh(fund)
    return _fund_out(fund)


@router.put("/{fund_id}", response_model=schemas.FundOut)
def update_fund(
    fund_id: int,
    body: schemas.FundUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    fund = _get_fund(fund_id, current_user.id, db)
    for k, v in body.dict(exclude_unset=True).items():
        setattr(fund, k, v)
    db.commit()
    db.refresh(fund)
    return _fund_out(fund)


@router.delete("/{fund_id}")
def delete_fund(
    fund_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    fund = _get_fund(fund_id, current_user.id, db)
    db.delete(fund)
    db.commit()
    return {"ok": True}


# ---- Movimientos ----

@router.post("/{fund_id}/movements", response_model=schemas.FundMovementOut)
def add_movement(
    fund_id: int,
    body: schemas.FundMovementCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    _get_fund(fund_id, current_user.id, db)
    mov = models.FundMovement(**body.dict(), fund_id=fund_id)
    db.add(mov)
    db.commit()
    db.refresh(mov)
    return mov


@router.put("/{fund_id}/movements/{movement_id}", response_model=schemas.FundMovementOut)
def update_movement(
    fund_id: int,
    movement_id: int,
    body: schemas.FundMovementUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    _get_fund(fund_id, current_user.id, db)
    mov = db.query(models.FundMovement).filter(
        models.FundMovement.id == movement_id,
        models.FundMovement.fund_id == fund_id,
    ).first()
    if not mov:
        raise HTTPException(404, "Movimiento no encontrado")
    for k, v in body.dict(exclude_unset=True).items():
        setattr(mov, k, v)
    db.commit()
    db.refresh(mov)
    return mov


@router.delete("/{fund_id}/movements/{movement_id}")
def delete_movement(
    fund_id: int,
    movement_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    _get_fund(fund_id, current_user.id, db)
    mov = db.query(models.FundMovement).filter(
        models.FundMovement.id == movement_id,
        models.FundMovement.fund_id == fund_id,
    ).first()
    if not mov:
        raise HTTPException(404, "Movimiento no encontrado")
    db.delete(mov)
    db.commit()
    return {"ok": True}
