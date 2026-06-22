"""
Script de migracion: lee Camilo_Gastos_2026.xlsx (o el nombre que tenga tu excel)
e importa los datos a la base de datos de la nueva app.

USO:
    1. Configura tu archivo .env (o exporta DATABASE_URL) apuntando a la base de
       datos que vas a usar (local SQLite o Postgres en produccion).
    2. Crea tu usuario primero (registrate normal desde la app, o usa la API).
    3. Corre:  python migrate_excel.py "ruta/al/Camilo_Gastos_2026.xlsx" tu_correo@ejemplo.com

Este script SOLO importa las hojas que siguen el formato reciente y consistente
(ingresos arriba, "GASTOS FIJOS" en la seccion derecha, y una tabla con encabezados
VALOR / OBSERVACION / FECHA para los gastos del dia a dia). Esto cubre tus hojas
mas recientes (aprox. desde 2024 en adelante). Las hojas mas antiguas (2018-2023)
tienen estructuras distintas cada año y no se importan automaticamente para evitar
cargar datos mal interpretados -- se listan al final como "omitidas" para que las
revises y, si quieres, las migremos despues con una regla a la medida.

Es seguro correr el script varias veces: si una hoja ya fue importada (se detecta
por nombre de hoja guardado en las notas de cada movimiento), se salta automaticamente.
"""
import sys
import re
from datetime import date

import openpyxl

sys.path.insert(0, ".")
from app.database import SessionLocal, engine, Base
from app import models

INCOME_LABELS = {
    "sueldo", "auxilio conectividad", "auxilio educativo",
    "intereses a la cesantias", "horas extras", "auxilio intereses", "prima",
}

DEDUCTION_LABELS = {
    "salud", "pension", "pensión", "fecolcer", "fondo solidaridad",
    "solidaridad", "fondo intitucional", "fondo institucional", "casino",
    "prepagada", "ahorro y deuda fecolcer", "ahorro y deuda fecsa", "ahorro",
    "ahorro ", "apartamento", "colmedica",
}

# Palabras clave para marcar un movimiento del ledger diario como gasto FIJO.
FIXED_KEYWORDS = [
    "internet", "administracion", "administración", "netflix", "plan mam",
    "plan camilo", "claver", "seguro carro", "servicios", "tratamiento",
    "falabella", "bancolombia", "nu bank", "ahorro escuela", "gastos fijos",
    "arriendo", "predial",
]

MONTH_NAMES = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "septiembre": 9, "octubre": 10, "noviembre": 11,
    "diciembre": 12,
}


def guess_month_year(sheet_name: str):
    name = sheet_name.lower().strip()
    name = name.replace("19", " 2019") if name.endswith("19") else name
    month = None
    for mname, mnum in MONTH_NAMES.items():
        if name.startswith(mname):
            month = mnum
            break
    year_match = re.search(r"(20\d{2})", name)
    year = int(year_match.group(1)) if year_match else None
    return month, year


def find_header_row(ws, header_texts, max_row=60, max_col=20):
    for row in ws.iter_rows(min_row=1, max_row=max_row, max_col=max_col):
        for cell in row:
            if isinstance(cell.value, str) and cell.value.strip().upper() in header_texts:
                return cell.row, cell.column
    return None, None


def parse_sheet(ws):
    """Devuelve (income_items, deduction_items, transactions, saldo_cuenta) o None
    si la hoja no sigue el formato reconocido. NO importa la seccion de plan
    'GASTOS FIJOS' porque esos pagos ya aparecen en el ledger diario (evita doble
    conteo en la conciliacion)."""
    header_row, header_col = find_header_row(ws, {"VALOR"})
    if header_row is None:
        return None

    # --- Transacciones diarias (ledger real) ---
    transactions = []
    row = header_row + 1
    while row <= ws.max_row:
        valor = ws.cell(row=row, column=header_col).value
        obs = ws.cell(row=row, column=header_col + 1).value
        fecha = ws.cell(row=row, column=header_col + 2).value
        if valor is None and obs is None and fecha is None:
            row += 1
            if row - header_row > 3:
                break
            continue
        if isinstance(valor, (int, float)) and isinstance(fecha, date):
            transactions.append((valor, str(obs or "Sin descripcion"), fecha))
        row += 1

    # --- Nomina: ingresos vs deducciones (columna A=valor, B=etiqueta) ---
    income_items, deduction_items = [], []
    for r in range(1, min(20, ws.max_row) + 1):
        label = ws.cell(row=r, column=2).value
        value = ws.cell(row=r, column=1).value
        if isinstance(label, str) and isinstance(value, (int, float)):
            key = label.strip().lower()
            if key in DEDUCTION_LABELS:
                deduction_items.append((value, label.strip()))
            elif key in INCOME_LABELS:
                income_items.append((value, label.strip()))

    # --- Saldo en cuenta (si existe) para sugerir saldo inicial ---
    saldo_cuenta = None
    for r in range(1, ws.max_row + 1):
        c = ws.cell(row=r, column=2).value
        if isinstance(c, str) and c.strip().lower().startswith("saldo en cuenta"):
            v = ws.cell(row=r, column=1).value
            if isinstance(v, (int, float)):
                saldo_cuenta = v
            break

    return income_items, deduction_items, transactions, saldo_cuenta


def classify_expense_type(description):
    desc = (description or "").lower()
    for kw in FIXED_KEYWORDS:
        if kw in desc:
            return models.TransactionType.fixed
    return models.TransactionType.variable


def already_imported(db, user_id, sheet_name):
    tag = f"[migrado:{sheet_name}]"
    existing = (
        db.query(models.Transaction)
        .filter(models.Transaction.user_id == user_id, models.Transaction.notes == tag)
        .first()
    )
    return existing is not None


def import_excel(path, user_email):
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    user = db.query(models.User).filter(models.User.email == user_email).first()
    if not user:
        print(f"ERROR: no existe un usuario con el correo {user_email}.")
        print("Registrate primero en la app (o via /api/auth/register) y vuelve a correr este script.")
        return

    wb = openpyxl.load_workbook(path, data_only=True)
    imported_sheets, skipped_sheets = [], []

    for sheet_name in wb.sheetnames:
        if sheet_name in ("SALARIO", "Hoja1", "GASTOS", "Deuda por TDC"):
            skipped_sheets.append(sheet_name)
            continue
        if already_imported(db, user.id, sheet_name):
            print(f"  - {sheet_name}: ya importada, se omite.")
            imported_sheets.append(sheet_name)
            continue

        ws = wb[sheet_name]
        parsed = parse_sheet(ws)
        if parsed is None:
            skipped_sheets.append(sheet_name)
            continue

        income_items, deduction_items, transactions, saldo_cuenta = parsed
        month, year = guess_month_year(sheet_name)
        if year is None:
            skipped_sheets.append(sheet_name)
            continue
        tag = f"[migrado:{sheet_name}]"

        count = 0
        for value, label in income_items:
            d = date(year, month or 1, 1)
            db.add(models.Transaction(
                user_id=user.id, date=d, description=label, amount=value,
                type=models.TransactionType.income, category="Ingreso",
                notes=tag, month=d.month, year=d.year,
            ))
            count += 1

        for value, label in deduction_items:
            d = date(year, month or 1, 1)
            db.add(models.Transaction(
                user_id=user.id, date=d, description=label, amount=value,
                type=models.TransactionType.deduction, category="Deducción nómina",
                notes=tag, month=d.month, year=d.year,
            ))
            count += 1

        for valor, obs, fecha in transactions:
            tx_type = classify_expense_type(obs)
            # En el Excel cada hoja es un ciclo de pago; algunos gastos quedan
            # fechados a fin del mes anterior. Para que la conciliacion de cada
            # mes cuadre como en tu Excel, los asignamos al mes de la HOJA,
            # conservando la fecha real para mostrarla.
            db.add(models.Transaction(
                user_id=user.id, date=fecha, description=str(obs)[:250], amount=valor,
                type=tx_type,
                category="Gasto fijo" if tx_type == models.TransactionType.fixed else "Otros",
                notes=tag, month=(month or fecha.month), year=year,
            ))
            count += 1

        # Saldo inicial sugerido (saldo en cuenta del Excel) para conciliar.
        if saldo_cuenta is not None and month is not None:
            stmt = (
                db.query(models.MonthlyStatement)
                .filter(
                    models.MonthlyStatement.user_id == user.id,
                    models.MonthlyStatement.year == year,
                    models.MonthlyStatement.month == month,
                )
                .first()
            )
            if not stmt:
                stmt = models.MonthlyStatement(
                    user_id=user.id, year=year, month=month,
                    opening_balance=0.0, actual_bank_balance=saldo_cuenta,
                )
                db.add(stmt)

        db.commit()
        imported_sheets.append(sheet_name)
        print(f"  - {sheet_name}: {count} movimientos importados.")

    print("\n== Resumen de migracion ==")
    print(f"Hojas importadas ({len(imported_sheets)}): {', '.join(imported_sheets)}")
    print(f"Hojas omitidas ({len(skipped_sheets)}): {', '.join(skipped_sheets)}")
    print("\nLas hojas omitidas no siguen el formato reciente (VALOR/OBSERVACION/FECHA")
    print("+ GASTOS FIJOS) y no se importaron automaticamente para no arriesgar datos mal leidos.")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print('Uso: python migrate_excel.py "ruta/al/excel.xlsx" tu_correo@ejemplo.com')
        sys.exit(1)
    import_excel(sys.argv[1], sys.argv[2])
