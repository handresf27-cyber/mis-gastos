from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, schemas, auth
from ..database import get_db

router = APIRouter(prefix="/api/statement", tags=["statement"])


def _get_or_create(db, user_id, year, month):
    stmt = (
        db.query(models.MonthlyStatement)
        .filter(
            models.MonthlyStatement.user_id == user_id,
            models.MonthlyStatement.year == year,
            models.MonthlyStatement.month == month,
        )
        .first()
    )
    if not stmt:
        stmt = models.MonthlyStatement(
            user_id=user_id, year=year, month=month, opening_balance=0.0
        )
        db.add(stmt)
        db.commit()
        db.refresh(stmt)
    return stmt


@router.get("", response_model=schemas.StatementOut)
def get_statement(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    return _get_or_create(db, current_user.id, year, month)


@router.put("", response_model=schemas.StatementOut)
def update_statement(
    year: int,
    month: int,
    data: schemas.StatementUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    stmt = _get_or_create(db, current_user.id, year, month)
    if data.opening_balance is not None:
        stmt.opening_balance = data.opening_balance
    if data.actual_bank_balance is not None:
        stmt.actual_bank_balance = data.actual_bank_balance
    db.commit()
    db.refresh(stmt)
    return stmt


@router.get("/previous-closing")
def previous_closing(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Devuelve el saldo final calculado del mes anterior, para usarlo como
    saldo inicial de este mes (botón 'usar saldo del mes anterior')."""
    prev_year, prev_month = (year - 1, 12) if month == 1 else (year, month - 1)

    rows = (
        db.query(models.Transaction)
        .filter(
            models.Transaction.user_id == current_user.id,
            models.Transaction.year == prev_year,
            models.Transaction.month == prev_month,
        )
        .all()
    )
    T = models.TransactionType
    income = sum(t.amount for t in rows if t.type == T.income)
    deduction = sum(t.amount for t in rows if t.type == T.deduction)
    expenses = sum(t.amount for t in rows if t.type in (T.fixed, T.variable))

    prev_stmt = (
        db.query(models.MonthlyStatement)
        .filter(
            models.MonthlyStatement.user_id == current_user.id,
            models.MonthlyStatement.year == prev_year,
            models.MonthlyStatement.month == prev_month,
        )
        .first()
    )
    prev_opening = prev_stmt.opening_balance if prev_stmt else 0.0
    # Si el mes anterior fue conciliado, preferimos el saldo real del banco.
    if prev_stmt and prev_stmt.actual_bank_balance is not None:
        closing = prev_stmt.actual_bank_balance
    else:
        closing = prev_opening + (income - deduction) - expenses

    return {"year": prev_year, "month": prev_month, "closing_balance": closing}
