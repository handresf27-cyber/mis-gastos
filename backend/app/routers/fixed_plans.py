from datetime import date
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..auth import get_current_user
from .. import models, schemas

router = APIRouter(prefix="/api/fixed-plans", tags=["fixed-plans"])


@router.get("", response_model=List[schemas.FixedPlanOut])
def list_plans(year: int, month: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return (
        db.query(models.FixedExpensePlan)
        .filter(
            models.FixedExpensePlan.user_id == user.id,
            models.FixedExpensePlan.year == year,
            models.FixedExpensePlan.month == month,
        )
        .order_by(models.FixedExpensePlan.created_at)
        .all()
    )


@router.post("", response_model=schemas.FixedPlanOut)
def create_plan(body: schemas.FixedPlanCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    plan = models.FixedExpensePlan(user_id=user.id, **body.model_dump())
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


@router.patch("/{plan_id}", response_model=schemas.FixedPlanOut)
def update_plan(plan_id: int, body: schemas.FixedPlanUpdate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    plan = db.query(models.FixedExpensePlan).filter(
        models.FixedExpensePlan.id == plan_id,
        models.FixedExpensePlan.user_id == user.id,
    ).first()
    if not plan:
        raise HTTPException(404, "Plan no encontrado")
    updates = body.model_dump(exclude_none=True)
    for k, v in updates.items():
        setattr(plan, k, v)
    # Si ya está ejecutado, sincroniza la transacción vinculada
    if plan.transaction_id:
        tx = db.get(models.Transaction, plan.transaction_id)
        if tx:
            if "name" in updates:
                tx.description = updates["name"]
            if "amount" in updates:
                tx.amount = updates["amount"]
    db.commit()
    db.refresh(plan)
    return plan


@router.patch("/{plan_id}/toggle", response_model=schemas.FixedPlanOut)
def toggle_executed(plan_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    plan = db.query(models.FixedExpensePlan).filter(
        models.FixedExpensePlan.id == plan_id,
        models.FixedExpensePlan.user_id == user.id,
    ).first()
    if not plan:
        raise HTTPException(404, "Plan no encontrado")

    if not plan.is_executed:
        # Crear la transacción de gasto fijo
        tx_date = date.today() if (date.today().year == plan.year and date.today().month == plan.month) else date(plan.year, plan.month, 1)
        tx = models.Transaction(
            user_id=user.id,
            description=plan.name,
            amount=plan.amount,
            type=models.TransactionType.fixed,
            category="Gasto fijo",
            month=plan.month,
            year=plan.year,
            date=tx_date,
            notes="[plan-fijo]",
        )
        db.add(tx)
        db.flush()
        plan.transaction_id = tx.id
        plan.is_executed = True
    else:
        # Revertir: eliminar la transacción vinculada
        if plan.transaction_id:
            tx = db.get(models.Transaction, plan.transaction_id)
            if tx:
                db.delete(tx)
        plan.transaction_id = None
        plan.is_executed = False

    db.commit()
    db.refresh(plan)
    return plan


@router.delete("/{plan_id}")
def delete_plan(plan_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    plan = db.query(models.FixedExpensePlan).filter(
        models.FixedExpensePlan.id == plan_id,
        models.FixedExpensePlan.user_id == user.id,
    ).first()
    if not plan:
        raise HTTPException(404, "Plan no encontrado")
    if plan.transaction_id:
        tx = db.get(models.Transaction, plan.transaction_id)
        if tx:
            db.delete(tx)
    db.delete(plan)
    db.commit()
    return {"ok": True}


@router.post("/copy-previous", response_model=List[schemas.FixedPlanOut])
def copy_from_previous(year: int, month: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Copia los gastos fijos del mes anterior al mes indicado."""
    prev_year, prev_month = (year - 1, 12) if month == 1 else (year, month - 1)

    existing = db.query(models.FixedExpensePlan).filter(
        models.FixedExpensePlan.user_id == user.id,
        models.FixedExpensePlan.year == year,
        models.FixedExpensePlan.month == month,
    ).count()
    if existing > 0:
        raise HTTPException(400, "Este mes ya tiene gastos fijos configurados. Agrega los que falten manualmente.")

    prev_plans = db.query(models.FixedExpensePlan).filter(
        models.FixedExpensePlan.user_id == user.id,
        models.FixedExpensePlan.year == prev_year,
        models.FixedExpensePlan.month == prev_month,
    ).all()

    if not prev_plans:
        raise HTTPException(404, "No hay gastos fijos en el mes anterior para copiar.")

    new_plans = []
    for p in prev_plans:
        new_p = models.FixedExpensePlan(
            user_id=user.id,
            name=p.name,
            amount=p.amount,
            month=month,
            year=year,
            is_executed=False,
        )
        db.add(new_p)
        new_plans.append(new_p)

    db.commit()
    for p in new_plans:
        db.refresh(p)
    return new_plans
