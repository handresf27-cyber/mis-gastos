import enum
from datetime import datetime, date
from sqlalchemy import (
    Column, Integer, String, Float, Date, DateTime, ForeignKey, Enum, Boolean
)
from sqlalchemy.orm import relationship
from .database import Base


class TransactionType(str, enum.Enum):
    income = "income"            # Ingresos brutos (sueldo, auxilios, etc.)
    deduction = "deduction"       # Deducciones de nómina (salud, pensión, ahorros...)
    fixed = "fixed"               # Gastos fijos mensuales (pagados de la cuenta)
    variable = "variable"         # Gastos del día a día


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    transactions = relationship(
        "Transaction", back_populates="owner", cascade="all, delete-orphan"
    )
    categories = relationship(
        "Category", back_populates="owner", cascade="all, delete-orphan"
    )
    statements = relationship(
        "MonthlyStatement", back_populates="owner", cascade="all, delete-orphan"
    )
    fixed_plans = relationship(
        "FixedExpensePlan", back_populates="owner", cascade="all, delete-orphan"
    )
    credit_cards = relationship(
        "CreditCard", back_populates="owner", cascade="all, delete-orphan"
    )
    funds = relationship(
        "Fund", back_populates="owner", cascade="all, delete-orphan"
    )


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    icon = Column(String, nullable=True)  # nombre de emoji/icono opcional

    owner = relationship("User", back_populates="categories")


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    date = Column(Date, nullable=False, default=date.today)
    description = Column(String, nullable=False)
    amount = Column(Float, nullable=False)  # puede ser negativo (ej. reembolsos)
    type = Column(Enum(TransactionType), nullable=False, default=TransactionType.variable)
    category = Column(String, nullable=True, default="Otros")
    notes = Column(String, nullable=True)

    # Guardamos mes/año explícitos para poder agrupar rápido,
    # independiente de la fecha exacta del movimiento.
    month = Column(Integer, nullable=False)
    year = Column(Integer, nullable=False)
    receipt_url = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    owner = relationship("User", back_populates="transactions")


class FixedExpensePlan(Base):
    """Checklist de gastos fijos planificados para un mes."""
    __tablename__ = "fixed_expense_plans"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    month = Column(Integer, nullable=False)
    year = Column(Integer, nullable=False)
    is_executed = Column(Boolean, default=False, nullable=False)
    # Cuando se marca ejecutado, se crea una Transaction y se guarda su id aquí.
    transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=True)
    payment_date = Column(Date, nullable=True)
    payment_notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User", back_populates="fixed_plans")
    transaction = relationship("Transaction", foreign_keys=[transaction_id])


class MonthlyStatement(Base):
    """Estado de la cuenta bancaria para un mes: saldo inicial y saldo real
    (el que tú lees del banco) para conciliar."""
    __tablename__ = "monthly_statements"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)

    # Lo que tenías en la cuenta al iniciar el mes.
    opening_balance = Column(Float, nullable=False, default=0.0)
    # Lo que dice tu banco hoy (lo ingresas tú para conciliar). Puede ser nulo.
    actual_bank_balance = Column(Float, nullable=True)

    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    owner = relationship("User", back_populates="statements")


class Fund(Base):
    """Fondo de terceros que el usuario administra (ej. 'Dinero Tío')."""
    __tablename__ = "funds"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User", back_populates="funds")
    movements = relationship("FundMovement", back_populates="fund",
                             cascade="all, delete-orphan",
                             order_by="FundMovement.date, FundMovement.id")


class FundMovement(Base):
    """Movimiento de entrada o salida en un fondo administrado.
    amount > 0 = entra dinero, amount < 0 = sale dinero."""
    __tablename__ = "fund_movements"

    id = Column(Integer, primary_key=True, index=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False)
    date = Column(Date, nullable=False, default=date.today)
    amount = Column(Float, nullable=False)           # + entra / - sale
    move_type = Column(String, nullable=False, default="Otros")
    description = Column(String, nullable=False)
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    fund = relationship("Fund", back_populates="movements")


class CreditCard(Base):
    """Tarjeta de crédito del usuario."""
    __tablename__ = "credit_cards"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    color = Column(String, default="#6c8fc7", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User", back_populates="credit_cards")
    purchases = relationship("CreditPurchase", back_populates="card", cascade="all, delete-orphan")
    payments = relationship("CreditPayment", back_populates="card", cascade="all, delete-orphan")


class CreditPurchase(Base):
    """Compra o avance en cuotas de una tarjeta de crédito."""
    __tablename__ = "credit_purchases"

    id = Column(Integer, primary_key=True, index=True)
    card_id = Column(Integer, ForeignKey("credit_cards.id"), nullable=False)
    description = Column(String, nullable=False)
    purchase_date = Column(Date, nullable=True)
    total_amount = Column(Float, nullable=False)
    installments = Column(Integer, nullable=False, default=1)
    first_payment_month = Column(Integer, nullable=False)
    first_payment_year = Column(Integer, nullable=False)
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    card = relationship("CreditCard", back_populates="purchases")


class CreditPayment(Base):
    """Pago real realizado a una tarjeta de crédito."""
    __tablename__ = "credit_payments"

    id = Column(Integer, primary_key=True, index=True)
    card_id = Column(Integer, ForeignKey("credit_cards.id"), nullable=False)
    date = Column(Date, nullable=False, default=date.today)
    amount = Column(Float, nullable=False)
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    card = relationship("CreditCard", back_populates="payments")
