# CLAUDE.md — Mis Gastos App

Aplicación personal de control de gastos de **Camilo Farias** (handresf27@gmail.com).
Convierte el flujo de un Excel histórico en una PWA web con login, métricas y conciliación bancaria.

---

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Python 3.13 · FastAPI · SQLAlchemy 2 |
| Auth | JWT (`python-jose`) + bcrypt (`passlib`) |
| DB local | SQLite (`gastos.db`) |
| DB producción | PostgreSQL en **Supabase** (Transaction Pooler, puerto 6543) |
| Frontend | HTML/CSS/JS vanilla · PWA · Chart.js (bundled en `js/vendor/`) |
| Deploy | **Railway** (web) — URL: `web-production-87a51.up.railway.app` |

---

## Estructura de archivos

```
/
├── CLAUDE.md
├── Procfile                        # web: cd backend && uvicorn ...
├── nixpacks.toml                   # build Railway con Railpack
├── requirements.txt                # copia de backend/requirements.txt (Railway lo exige en raíz)
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI app; monta frontend como StaticFiles
│   │   ├── config.py               # DATABASE_URL (corrige postgres:// → postgresql://)
│   │   ├── database.py             # get_db, engine
│   │   ├── models.py               # ORM: User, Transaction, FixedExpensePlan, MonthlyStatement, Category
│   │   ├── schemas.py              # Pydantic request/response
│   │   ├── auth.py                 # hash, JWT, get_current_user
│   │   └── routers/
│   │       ├── auth.py             # POST /api/auth/register|login, GET /api/auth/me
│   │       ├── transactions.py     # CRUD /api/transactions + POST copy-payroll
│   │       ├── fixed_plans.py      # CRUD /api/fixed-plans + toggle + copy-previous
│   │       ├── metrics.py          # GET /api/metrics/summary|categories|trend
│   │       ├── statement.py        # GET/PUT /api/statement (saldo inicial y real)
│   │       └── categories.py       # CRUD /api/categories
│   ├── migrate_excel.py            # migración histórica desde Excel
│   ├── requirements.txt
│   ├── .env                        # LOCAL: DATABASE_URL, SECRET_KEY (no subir a git)
│   └── frontend/                   # servido como estático desde main.py
│       ├── index.html
│       ├── manifest.json / sw.js   # PWA
│       ├── css/styles.css
│       └── js/
│           ├── api.js              # Api.* — todas las llamadas al backend
│           └── app.js              # lógica UI: state, renderizadores, event listeners
```

---

## Modelos clave

### Transaction
```
type: enum(income, deduction, fixed, variable)
category: str
  - "Ingreso"        → salario / nómina (se copia mes a mes)
  - "Otros ingresos" → ingresos extra (regalos, consignaciones; NO se copian)
  - libre            → gastos variables
notes: "[copiado-de-plantilla]" | "[plan-fijo]" | libre
```

### FixedExpensePlan
Checklist de gastos fijos por mes. Al marcar `is_executed=True` se crea una
`Transaction(type=fixed, notes="[plan-fijo]")` automáticamente. Al desmarcar, se borra.

### MonthlyStatement
Almacena `opening_balance` (saldo anterior en cuenta) y `actual_bank_balance` (lo que ves en el banco).
Usado para la conciliación.

---

## Lógica de negocio importante

### Auto-poblar mes nuevo
Al entrar a un mes sin datos (`loadHome()`):
1. Si no hay transacciones `income/deduction` → llama `POST /api/transactions/copy-payroll`
   - Solo copia `type=income, category="Ingreso"` y todos los `type=deduction`
   - **No copia** `"Otros ingresos"` ni primas
2. Si no hay `FixedExpensePlan` → llama `POST /api/fixed-plans/copy-previous`
3. Si se copió algo → recarga y muestra toast

### Conciliación bancaria
`computed_balance = opening_balance + net_income - total_expenses`
- `net_income = total_income - total_deductions` (incluye "Otros ingresos")
- Si `computed_balance ≈ actual_bank_balance` → Conciliado

### Saldo corrido en movimientos
`startBalance = opening_balance + net_income - total_fixed - extraIncomePre`
Luego: ingresos extra suman, gastos variables restan cronológicamente.
(extraIncomePre se resta para no duplicar, porque ya está en net_income)

---

## UI — Pantalla principal (app.js)

### Navegación de meses
- Grilla de 12 meses del año seleccionado + botones `‹ año ›`
- `state.navYear` = año navegado; `state.year/month` = mes activo
- Meses sin datos se muestran difuminados (`.empty`), pero son clicables

### Tabs de gastos
Dos tarjetas clicables que alternan paneles debajo:
- **Gastos Fijos** → checklist de `FixedExpensePlan` con búsqueda de texto
- **Gastos Variables** → lista de `type=variable` + `type=income, category!="Ingreso"` con filtro por categoría
- Clic en tab activo lo cierra (toggle); por defecto abre Variables

### Modal de transacciones (FAB "+")
Tipos visibles: **Gasto** (→ `type=variable`) | **Ingreso extra** (→ `type=income, category="Otros ingresos"`)
Tipos ocultos (solo aparecen al editar): `fixed`, `deduction`
Al editar ingreso de nómina preserva `category="Ingreso"` (no lo cambia a "Otros ingresos")

### Nómina (panel colapsable)
3 secciones:
1. **Salario y auxilios** — `type=income, category="Ingreso"`
2. **Otros ingresos** — `type=income, category!="Ingreso"` (también editables aquí)
3. **Deducciones nómina** — `type=deduction`

---

## Despliegue

### Railway (web)
- Detecta Python por `requirements.txt` en raíz
- Build: `pip install -r backend/requirements.txt`
- Start: `cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Variables de entorno en Railway: `DATABASE_URL`, `SECRET_KEY`

### Supabase (PostgreSQL)
- Usar **Transaction Pooler** (host: `aws-1-us-west-2.pooler.supabase.com`, puerto `6543`)
- NO usar conexión directa (puerto 5432 bloqueado desde Railway free tier)
- `config.py` convierte `postgres://` → `postgresql://` automáticamente
- La `DATABASE_URL` en Railway NO debe tener saltos de línea al copiarla

### Flujo de deploy
1. Editar archivos localmente
2. GitHub Desktop → **Commit** (con mensaje) → **Push origin**
3. Railway detecta el push y redespliega (~2 min)

---

## Correr localmente

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload
# Abre http://127.0.0.1:8000
```

En local usa SQLite (`backend/gastos.db`). No requiere Supabase.

---

## Datos históricos

Se importaron desde `/Users/camilofariasibarguen/Downloads/Camilo Gastos 2026.xlsx`
con `backend/migrate_excel.py`. Cubre meses desde ~2020. Las hojas de 2018-2019 y
hojas especiales (42 omitidas) tienen formatos inconsistentes y no se importaron.

La migración es idempotente (se puede correr varias veces sin duplicar).

---

## Patrones de código

- `state` (objeto global JS) contiene toda la UI state: `year`, `month`, `navYear`,
  `transactions`, `fixedPlans`, `summary`, `categories`, `activeExpenseTab`
- `loadHome()` es el punto de entrada principal — carga todo en paralelo y renderiza
- `renderFixedPlans(plans)` y `renderTxList(txs, summary)` son los dos renderizadores principales
- `setExpenseTab(tab)` controla cuál panel de gastos está visible
- Backend: todos los endpoints filtran por `current_user.id` — no hay datos compartidos entre usuarios
