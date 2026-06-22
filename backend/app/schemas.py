from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr, Field
from .models import TransactionType


# ---------- Auth ----------

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    full_name: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    email: EmailStr
    full_name: Optional[str] = None

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------- Transactions ----------

class TransactionBase(BaseModel):
    date: date
    description: str
    amount: float
    type: TransactionType = TransactionType.variable
    category: Optional[str] = "Otros"
    notes: Optional[str] = None


class TransactionCreate(TransactionBase):
    pass


class TransactionUpdate(BaseModel):
    date: Optional[date] = None
    description: Optional[str] = None
    amount: Optional[float] = None
    type: Optional[TransactionType] = None
    category: Optional[str] = None
    notes: Optional[str] = None


class TransactionOut(TransactionBase):
    id: int
    month: int
    year: int
    created_at: datetime

    class Config:
        from_attributes = True


# ---------- Metrics ----------

class MonthlySummary(BaseModel):
    year: int
    month: int
    # Nómina
    total_income: float          # ingresos brutos (sueldo + auxilios)
    total_deduction: float        # deducciones de nómina
    net_income: float             # neto que llega a la cuenta = income - deduction
    # Gastos
    total_fixed: float
    total_variable: float
    total_expenses: float         # fixed + variable
    # Flujo del mes
    balance: float                # net_income - total_expenses (ahorro/déficit del mes)
    # Conciliación bancaria
    opening_balance: float        # lo que tenías al iniciar el mes
    computed_balance: float       # lo que DEBERÍA quedar = opening + net_income - gastos
    actual_bank_balance: Optional[float] = None   # lo que dice el banco (lo ingresas tú)
    reconciliation_diff: Optional[float] = None    # actual - computed
    is_reconciled: Optional[bool] = None           # True si la diferencia es ~0
    transaction_count: int


class StatementUpdate(BaseModel):
    opening_balance: Optional[float] = None
    actual_bank_balance: Optional[float] = None


class StatementOut(BaseModel):
    year: int
    month: int
    opening_balance: float
    actual_bank_balance: Optional[float] = None

    class Config:
        from_attributes = True


class CategoryBreakdown(BaseModel):
    category: str
    total: float


class MonthTrendPoint(BaseModel):
    year: int
    month: int
    total_income: float
    total_expenses: float
    balance: float


# ---------- Fixed Expense Plans ----------

class FixedPlanCreate(BaseModel):
    name: str
    amount: float
    month: int
    year: int


class FixedPlanUpdate(BaseModel):
    name: Optional[str] = None
    amount: Optional[float] = None


class FixedPlanOut(BaseModel):
    id: int
    name: str
    amount: float
    month: int
    year: int
    is_executed: bool
    transaction_id: Optional[int] = None

    class Config:
        from_attributes = True


# ---------- Categories ----------

class CategoryCreate(BaseModel):
    name: str
    icon: Optional[str] = None


class CategoryOut(CategoryCreate):
    id: int

    class Config:
        from_attributes = True
