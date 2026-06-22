from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from .. import models, schemas, auth
from ..database import get_db

router = APIRouter(prefix="/api/metrics", tags=["metrics"])

T = models.TransactionType


def _totals_for(db: Session, user_id: int, year: int, month: int = None):
    query = db.query(models.Transaction).filter(
        models.Transaction.user_id == user_id, models.Transaction.year == year
    )
    if month is not None:
        query = query.filter(models.Transaction.month == month)
    rows = query.all()

    income = sum(t.amount for t in rows if t.type == T.income)
    deduction = sum(t.amount for t in rows if t.type == T.deduction)
    fixed = sum(t.amount for t in rows if t.type == T.fixed)
    variable = sum(t.amount for t in rows if t.type == T.variable)
    return income, deduction, fixed, variable, len(rows)


def _get_statement(db, user_id, year, month):
    return (
        db.query(models.MonthlyStatement)
        .filter(
            models.MonthlyStatement.user_id == user_id,
            models.MonthlyStatement.year == year,
            models.MonthlyStatement.month == month,
        )
        .first()
    )


@router.get("/summary", response_model=schemas.MonthlySummary)
def monthly_summary(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    income, deduction, fixed, variable, count = _totals_for(db, current_user.id, year, month)
    net_income = income - deduction
    total_expenses = fixed + variable
    balance = net_income - total_expenses

    stmt = _get_statement(db, current_user.id, year, month)
    opening = stmt.opening_balance if stmt else 0.0
    actual = stmt.actual_bank_balance if stmt else None

    computed = opening + net_income - total_expenses

    diff = None
    reconciled = None
    if actual is not None:
        diff = actual - computed
        reconciled = abs(diff) < 1.0

    return schemas.MonthlySummary(
        year=year,
        month=month,
        total_income=income,
        total_deduction=deduction,
        net_income=net_income,
        total_fixed=fixed,
        total_variable=variable,
        total_expenses=total_expenses,
        balance=balance,
        opening_balance=opening,
        computed_balance=computed,
        actual_bank_balance=actual,
        reconciliation_diff=diff,
        is_reconciled=reconciled,
        transaction_count=count,
    )


@router.get("/categories", response_model=List[schemas.CategoryBreakdown])
def category_breakdown(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    rows = (
        db.query(models.Transaction.category, func.sum(models.Transaction.amount))
        .filter(
            models.Transaction.user_id == current_user.id,
            models.Transaction.year == year,
            models.Transaction.month == month,
            models.Transaction.type.in_([T.fixed, T.variable]),
        )
        .group_by(models.Transaction.category)
        .order_by(func.sum(models.Transaction.amount).desc())
        .all()
    )
    return [schemas.CategoryBreakdown(category=c or "Otros", total=t) for c, t in rows if t and t > 0]


@router.get("/trend", response_model=List[schemas.MonthTrendPoint])
def yearly_trend(
    year: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    points = []
    for month in range(1, 13):
        income, deduction, fixed, variable, count = _totals_for(db, current_user.id, year, month)
        if count == 0:
            continue
        net_income = income - deduction
        points.append(
            schemas.MonthTrendPoint(
                year=year,
                month=month,
                total_income=net_income,
                total_expenses=fixed + variable,
                balance=net_income - fixed - variable,
            )
        )
    return points
