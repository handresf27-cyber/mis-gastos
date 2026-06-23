# CLAUDE.md — Mis Gastos App

Aplicación personal de control de gastos de **Camilo Farias** (handresf27@gmail.com).
PWA web con login, conciliación bancaria, tarjetas de crédito, fondos administrados y comparativos.

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
│   │   ├── models.py               # ORM: todos los modelos
│   │   ├── schemas.py              # Pydantic request/response
│   │   ├── auth.py                 # hash, JWT, get_current_user, get_current_admin
│   │   └── routers/
│   │       ├── auth.py             # POST /api/auth/register|login, GET /api/auth/me
│   │       ├── transactions.py     # CRUD /api/transactions + POST copy-payroll
│   │       ├── fixed_plans.py      # CRUD /api/fixed-plans + toggle + copy-previous
│   │       ├── metrics.py          # GET /api/metrics/summary|categories|trend
│   │       ├── statement.py        # GET/PUT /api/statement
│   │       ├── categories.py       # CRUD /api/categories
│   │       ├── credit_cards.py     # CRUD /api/credit-cards + purchases + payments
│   │       ├── funds.py            # CRUD /api/funds + movements
│   │       └── admin.py            # GET/DELETE /api/admin/users (solo admin)
│   ├── migrate_excel.py
│   ├── requirements.txt
│   ├── .env                        # LOCAL: DATABASE_URL, SECRET_KEY (no subir a git)
│   └── frontend/
│       ├── index.html
│       ├── manifest.json / sw.js   # PWA
│       ├── css/styles.css
│       └── js/
│           ├── api.js              # Api.* — todas las llamadas al backend
│           └── app.js              # lógica UI: state, renderizadores, event listeners
```

---

## Modelos ORM (models.py)

### User
- `id, email, hashed_password, full_name, created_at`
- Relaciones cascade: transactions, categories, statements, fixed_plans, credit_cards, funds

### Transaction
```
type: enum(income, deduction, fixed, variable)
category: str
  - "Ingreso"        → salario/nómina (se copia mes a mes)
  - "Otros ingresos" → ingresos extra (regalos, consignaciones; NO se copian)
  - libre            → gastos variables
notes: "[copiado-de-plantilla]" | "[plan-fijo]" | libre
month, year: int (redundantes para filtrar rápido)
```

### FixedExpensePlan
Checklist de gastos fijos por mes. Al marcar `is_executed=True` se crea una
`Transaction(type=fixed, notes="[plan-fijo]")`. Al desmarcar, se borra.

### MonthlyStatement
`opening_balance` (saldo anterior en cuenta) y `actual_bank_balance` (lo que ves en el banco).

### CreditCard + CreditPurchase + CreditPayment
- `CreditCard`: nombre y color por usuario
- `CreditPurchase`: compra en cuotas (total_amount, installments, first_payment_month/year)
- `CreditPayment`: pago real a la tarjeta (date, amount, notes)
- **Saldo adeudado = total purchases − total payments**

### Fund + FundMovement
- `Fund`: fondo administrado (ej. "Dinero Tío")
- `FundMovement`: `amount` con signo (+ entra / − sale), `move_type`, `description`, `notes`
- **Saldo = suma de todos los amounts**
- Tipos predefinidos: Ingreso, Retiro, Préstamo otorgado, Cobro préstamo, CDT apertura, CDT rendimiento, Intereses, Otros

### Category
Categorías personalizadas del usuario para gastos variables.

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

### Tarjetas de crédito — balance
`balanceDue = sum(purchase.total_amount) - sum(payment.amount)`
El progreso de cuotas se calcula según fecha de hoy vs `first_payment_year/month`.

### Admin
- `ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "handresf27@gmail.com")`
- `get_current_admin()` en auth.py verifica que el email coincida
- Endpoints: `GET /api/admin/users`, `DELETE /api/admin/users/{id}`
- No requiere cambio en DB (no hay columna is_admin, se detecta por email)
- El frontend oculta/muestra el ítem "🛡️ Admin" según `user.is_admin` en el token

---

## UI — Vistas y navegación

### Vistas disponibles
| Vista | `data-view` | Descripción |
|---|---|---|
| Inicio | `home` | Conciliación + nómina + gastos fijos/variables |
| Comparativos | `metrics` | Gráfico Fijos vs Variables por mes, selector de año desde 2026 |
| Tarjetas | `cards` | Tarjetas de crédito con compras, cuotas y pagos |
| Fondos | `funds` | Fondos administrados con movimientos firmados |
| Categorías | `categories` | CRUD de categorías de gastos variables |
| Admin | `admin` | Solo visible para handresf27@gmail.com |

### Navegador de meses
- Solo aparece en la vista `home`
- Grilla de 12 meses del año + botones `‹ año ›`
- `state.navYear` = año navegado; `state.year/month` = mes activo
- Meses sin datos se muestran difuminados (`.empty`), clicables

### Tabs de gastos (vista home)
- **Gastos Fijos**: checklist `FixedExpensePlan` + transacciones `type=fixed` históricas
- **Gastos Variables**: `type=variable` + `type=income, category!="Ingreso"`
- Toggle al hacer clic; por defecto abre Variables

### Modal de transacciones (FAB "+")
- Tipos visibles: **Gasto** (→ `type=variable`) | **Ingreso extra** (→ `type=income, category="Otros ingresos"`)
- Tipos ocultos al crear, visibles al editar: `fixed`, `deduction`
- Al editar salario preserva `category="Ingreso"`

### Nómina (panel colapsable)
1. **Salario y auxilios** — `type=income, category="Ingreso"`
2. **Deducciones nómina** — `type=deduction`

### Comparativos
- Selector de año: tabs 2026, 2027... hasta año actual + 1
- Gráfico de barras agrupadas: Fijos (azul) vs Variables (rojo), eje X = meses
- Tabla mes a mes con totales y mini-barra proporcional

---

## Despliegue

### Railway (web)
- Build: `pip install -r backend/requirements.txt`
- Start: `cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Variables de entorno: `DATABASE_URL`, `SECRET_KEY`, `ADMIN_EMAIL` (opcional)

### Supabase (PostgreSQL)
- **Transaction Pooler**: host `aws-1-us-west-2.pooler.supabase.com`, puerto `6543`
- NO usar conexión directa (puerto 5432 bloqueado desde Railway free tier)
- `config.py` convierte `postgres://` → `postgresql://` automáticamente

### Flujo de deploy
1. Editar archivos localmente
2. GitHub Desktop → Commit → Push origin
3. Railway detecta push y redespliega (~2 min)
4. Para ver cambios en browser: `Cmd+Shift+R`
5. Para ver cambios en iPhone PWA: eliminar y reinstalar el acceso directo

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

## Patrones de código

### Frontend (app.js)
- `state` (objeto global JS): `year`, `month`, `navYear`, `transactions`, `fixedPlans`,
  `summary`, `categories`, `activeExpenseTab`, `creditCards`, `funds`, `compYear`
- `loadHome()` — punto de entrada principal, carga todo en paralelo
- `switchView(view)` — cambia vista, oculta/muestra month-nav según la vista
- `renderFixedPlans(plans)` — checklist + transacciones fijas históricas
- `renderTxList(txs, summary)` — variables + ingresos extra con saldo corrido
- `setExpenseTab(tab)` — toggle entre panel Fijos/Variables
- `renderCards(cards)` — tarjetas con balance = compras − pagos
- `renderFunds(funds)` — fondos con saldo corrido por movimiento
- `loadMetrics(year)` — comparativos con chart.js y tabla mes a mes
- `COMP_START_YEAR = 2026` — año mínimo en comparativos

### Backend (routers)
- Todos los endpoints filtran por `current_user.id` — datos completamente aislados por usuario
- `get_current_admin()` en auth.py protege rutas de administración
- `create_all()` en startup crea tablas nuevas automáticamente (sin migraciones manuales)
