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
    is_admin: bool = False

    class Config:
        from_attributes = True


class AdminUserOut(BaseModel):
    id: int
    email: EmailStr
    full_name: Optional[str] = None
    created_at: datetime
    transaction_count: int = 0
    is_admin: bool = False

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


# ---------- Credit Cards ----------

class CreditPurchaseCreate(BaseModel):
    description: str
    total_amount: float = Field(gt=0)
    installments: int = Field(ge=1, default=1)
    first_payment_month: int = Field(ge=1, le=12)
    first_payment_year: int
    notes: Optional[str] = None


class CreditPurchaseUpdate(BaseModel):
    description: Optional[str] = None
    total_amount: Optional[float] = None
    installments: Optional[int] = None
    first_payment_month: Optional[int] = None
    first_payment_year: Optional[int] = None
    notes: Optional[str] = None


class CreditPurchaseOut(BaseModel):
    id: int
    card_id: int
    description: str
    total_amount: float
    installments: int
    first_payment_month: int
    first_payment_year: int
    notes: Optional[str] = None

    class Config:
        from_attributes = True


class CreditCardCreate(BaseModel):
    name: str
    color: str = "#6c8fc7"


class CreditCardUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None


class CreditPaymentCreate(BaseModel):
    date: date
    amount: float = Field(gt=0)
    notes: Optional[str] = None


class CreditPaymentUpdate(BaseModel):
    date: Optional[date] = None
    amount: Optional[float] = None
    notes: Optional[str] = None


class CreditPaymentOut(BaseModel):
    id: int
    card_id: int
    date: date
    amount: float
    notes: Optional[str] = None

    class Config:
        from_attributes = True


class CreditCardOut(BaseModel):
    id: int
    name: str
    color: str
    purchases: List[CreditPurchaseOut] = []
    payments: List[CreditPaymentOut] = []

    class Config:
        from_attributes = True


# ---------- Fondos administrados ----------

class FundCreate(BaseModel):
    name: str
    description: Optional[str] = None


class FundUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class FundMovementCreate(BaseModel):
    date: date
    amount: float          # positivo = entra, negativo = sale
    move_type: str = "Otros"
    description: str
    notes: Optional[str] = None


class FundMovementUpdate(BaseModel):
    date: Optional[date] = None
    amount: Optional[float] = None
    move_type: Optional[str] = None
    description: Optional[str] = None
    notes: Optional[str] = None


class FundMovementOut(BaseModel):
    id: int
    fund_id: int
    date: date
    amount: float
    move_type: str
    description: str
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class FundOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    balance: float = 0.0
    movements: List[FundMovementOut] = []

    class Config:
        from_attributes = True
