from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas, auth
from ..database import get_db

router = APIRouter(prefix="/api/credit-cards", tags=["credit-cards"])


def _get_card(card_id: int, user_id: int, db: Session) -> models.CreditCard:
    card = db.query(models.CreditCard).filter(
        models.CreditCard.id == card_id,
        models.CreditCard.user_id == user_id,
    ).first()
    if not card:
        raise HTTPException(404, "Tarjeta no encontrada")
    return card


# ---- Cards ----

@router.get("", response_model=List[schemas.CreditCardOut])
def list_cards(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    return (
        db.query(models.CreditCard)
        .filter(models.CreditCard.user_id == current_user.id)
        .order_by(models.CreditCard.created_at)
        .all()
    )


@router.post("", response_model=schemas.CreditCardOut)
def create_card(
    body: schemas.CreditCardCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    card = models.CreditCard(**body.dict(), user_id=current_user.id)
    db.add(card)
    db.commit()
    db.refresh(card)
    return card


@router.put("/{card_id}", response_model=schemas.CreditCardOut)
def update_card(
    card_id: int,
    body: schemas.CreditCardUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    card = _get_card(card_id, current_user.id, db)
    for k, v in body.dict(exclude_unset=True).items():
        setattr(card, k, v)
    db.commit()
    db.refresh(card)
    return card


@router.delete("/{card_id}")
def delete_card(
    card_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    card = _get_card(card_id, current_user.id, db)
    db.delete(card)
    db.commit()
    return {"ok": True}


# ---- Purchases ----

@router.get("/{card_id}/purchases", response_model=List[schemas.CreditPurchaseOut])
def list_purchases(
    card_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    _get_card(card_id, current_user.id, db)
    return (
        db.query(models.CreditPurchase)
        .filter(models.CreditPurchase.card_id == card_id)
        .order_by(models.CreditPurchase.created_at.desc())
        .all()
    )


@router.post("/{card_id}/purchases", response_model=schemas.CreditPurchaseOut)
def create_purchase(
    card_id: int,
    body: schemas.CreditPurchaseCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    _get_card(card_id, current_user.id, db)
    purchase = models.CreditPurchase(**body.dict(), card_id=card_id)
    db.add(purchase)
    db.commit()
    db.refresh(purchase)
    return purchase


@router.put("/{card_id}/purchases/{purchase_id}", response_model=schemas.CreditPurchaseOut)
def update_purchase(
    card_id: int,
    purchase_id: int,
    body: schemas.CreditPurchaseUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    _get_card(card_id, current_user.id, db)
    purchase = db.query(models.CreditPurchase).filter(
        models.CreditPurchase.id == purchase_id,
        models.CreditPurchase.card_id == card_id,
    ).first()
    if not purchase:
        raise HTTPException(404, "Compra no encontrada")
    for k, v in body.dict(exclude_unset=True).items():
        setattr(purchase, k, v)
    db.commit()
    db.refresh(purchase)
    return purchase


@router.delete("/{card_id}/purchases/{purchase_id}")
def delete_purchase(
    card_id: int,
    purchase_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    _get_card(card_id, current_user.id, db)
    purchase = db.query(models.CreditPurchase).filter(
        models.CreditPurchase.id == purchase_id,
        models.CreditPurchase.card_id == card_id,
    ).first()
    if not purchase:
        raise HTTPException(404, "Compra no encontrada")
    db.delete(purchase)
    db.commit()
    return {"ok": True}


# ---- Payments ----

@router.post("/{card_id}/payments", response_model=schemas.CreditPaymentOut)
def create_payment(
    card_id: int,
    body: schemas.CreditPaymentCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    _get_card(card_id, current_user.id, db)
    payment = models.CreditPayment(**body.dict(), card_id=card_id)
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return payment


@router.put("/{card_id}/payments/{payment_id}", response_model=schemas.CreditPaymentOut)
def update_payment(
    card_id: int,
    payment_id: int,
    body: schemas.CreditPaymentUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    _get_card(card_id, current_user.id, db)
    payment = db.query(models.CreditPayment).filter(
        models.CreditPayment.id == payment_id,
        models.CreditPayment.card_id == card_id,
    ).first()
    if not payment:
        raise HTTPException(404, "Pago no encontrado")
    for k, v in body.dict(exclude_unset=True).items():
        setattr(payment, k, v)
    db.commit()
    db.refresh(payment)
    return payment


@router.delete("/{card_id}/payments/{payment_id}")
def delete_payment(
    card_id: int,
    payment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    _get_card(card_id, current_user.id, db)
    payment = db.query(models.CreditPayment).filter(
        models.CreditPayment.id == payment_id,
        models.CreditPayment.card_id == card_id,
    ).first()
    if not payment:
        raise HTTPException(404, "Pago no encontrado")
    db.delete(payment)
    db.commit()
    return {"ok": True}
