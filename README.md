# Mis Gastos — App de control de gastos

Tu Excel de gastos convertido en una app web que funciona desde **cualquier dispositivo**
(Mac, PC, iPhone, Android, iPad, tablet) con **login por correo y contraseña**, datos
en la nube (no se pierden), creación **mes a mes** y **métricas** con gráficos.

No necesitas instalar nada de App Store / Play Store: es una **PWA**, una web que se
"instala" en la pantalla de inicio y se comporta como app nativa.

---

## 1. Estructura del proyecto

```
gastos-app/
├── backend/                 # API en Python (FastAPI)
│   ├── app/
│   │   ├── main.py          # arranque, sirve también el frontend
│   │   ├── config.py        # lee variables de entorno
│   │   ├── database.py      # conexión a la base de datos
│   │   ├── models.py        # tablas: usuarios, transacciones, categorías, estado mensual
│   │   ├── schemas.py       # validación de datos (entrada/salida)
│   │   ├── auth.py          # login, hash de contraseñas, JWT
│   │   └── routers/
│   │       ├── auth.py          # /api/auth (registro, login, perfil)
│   │       ├── transactions.py  # /api/transactions (CRUD movimientos)
│   │       ├── metrics.py       # /api/metrics (resúmenes, conciliación, tendencia)
│   │       ├── categories.py    # /api/categories
│   │       └── statement.py     # /api/statement (saldo inicial y real para conciliar)
│   ├── migrate_excel.py     # importa tu Excel histórico a la base de datos
│   ├── requirements.txt
│   └── .env.example
├── frontend/                # PWA (HTML/CSS/JS, sin frameworks pesados)
│   ├── index.html
│   ├── manifest.json        # configuración para instalar como app
│   ├── sw.js                # service worker (cache/offline)
│   ├── css/styles.css
│   ├── js/api.js            # llamadas al backend
│   ├── js/app.js            # lógica de la interfaz
│   └── icons/
├── render.yaml              # despliegue automático en Render.com
├── run_local.sh            # correr todo en tu Mac con un comando
└── README.md
```

---

## 2. Probarlo YA en tu Mac (5 minutos)

Abre la Terminal y entra a la carpeta del proyecto:

```bash
cd gastos-app
./run_local.sh
```

Eso crea el entorno, instala dependencias y arranca el servidor.
Cuando veas el mensaje, abre en tu navegador:

```
http://127.0.0.1:8000
```

Crea tu cuenta (correo + contraseña), agrega un par de movimientos y revisa las métricas.

> En local usa SQLite (un archivo `gastos.db`), así que no necesitas instalar ninguna
> base de datos. Es solo para probar; los datos "de verdad" vivirán en la nube (paso 4).

### Si prefieres VS Code
1. Abre la carpeta `gastos-app` en VS Code.
2. Abre una terminal integrada (Terminal → New Terminal).
3. Corre los comandos de arriba.
4. Instala la extensión "Python" de Microsoft si quieres autocompletado.

---

## 3. Importar tu Excel histórico

Una vez tengas tu cuenta creada (paso 2), importa tus datos viejos.
Con el servidor **detenido** (Ctrl+C), corre:

```bash
cd backend
source .venv/bin/activate
python migrate_excel.py "/ruta/a/tu/Camilo_Gastos_2026.xlsx" tu_correo@ejemplo.com
```

(Usa el mismo correo con el que te registraste.)

El script importa automáticamente las hojas que siguen tu formato reciente y
consistente (de ~2020 en adelante): tu nómina (ingresos **y** deducciones por separado),
y los movimientos diarios con encabezados `VALOR / OBSERVACIÓN / FECHA`, clasificados
como gasto fijo o variable. Si encuentra un "Saldo en cuenta" en la hoja, lo usa como
saldo real del banco para esa conciliación. Al final te muestra qué hojas importó y
cuáles omitió (las muy antiguas, 2018–2019, tienen estructuras distintas cada año).

> Nota: la sección de plan "GASTOS FIJOS" del lado derecho de tu Excel **no** se importa
> como gastos, porque esos mismos pagos ya aparecen en el detalle diario (evita
> contarlos dos veces y mantiene la conciliación cuadrada).

Es **seguro correrlo varias veces**: detecta lo que ya importó y no lo duplica.
Tu Excel original **no se modifica** — solo se lee.

> ⚠️ Importante: para producción, primero despliega (paso 4) y configura `DATABASE_URL`
> apuntando a tu base de datos en la nube **antes** de correr la migración, para que los
> datos queden en la nube y no en el archivo local. Si ya importaste en local y quieres
> moverlos a la nube, vuelve a correr la migración con la `DATABASE_URL` de producción.

---

## 4. Desplegar en la nube (gratis) — Render.com

Así lo usas desde el celular, iPad o cualquier PC sin tener tu Mac prendida.

### 4.1 Sube el proyecto a GitHub
1. Crea un repositorio nuevo en GitHub (privado de preferencia).
2. Desde la carpeta `gastos-app`:
   ```bash
   git init
   git add .
   git commit -m "App de gastos"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
   git push -u origin main
   ```

### 4.2 Crea el servicio en Render
1. Entra a https://render.com y regístrate (gratis).
2. Click en **New +** → **Blueprint**.
3. Conecta tu cuenta de GitHub y elige el repositorio.
4. Render detecta el archivo `render.yaml` y crea automáticamente:
   - El **servicio web** (la app).
   - La **base de datos PostgreSQL** (gratis).
   - La clave secreta (`SECRET_KEY`) generada sola.
5. Click en **Apply** y espera unos minutos.

Al terminar tendrás una URL pública tipo `https://mis-gastos.onrender.com`.
Ábrela, crea tu cuenta y ya está disponible desde cualquier dispositivo.

> El plan gratis de Render "duerme" el servicio tras un rato de inactividad; la primera
> carga después de dormir tarda ~30 segundos. Para uso personal es más que suficiente.

### 4.3 Importar tu Excel a la base de datos en la nube
Desde tu Mac, apunta la migración a la base de datos de Render:
```bash
cd backend
source .venv/bin/activate
# Copia la "External Database URL" desde el panel de Render
export DATABASE_URL="postgresql://...la-url-de-render..."
python migrate_excel.py "/ruta/a/tu/Camilo_Gastos_2026.xlsx" tu_correo@ejemplo.com
```

---

## 5. Instalar la app en tus dispositivos

Una vez tengas la URL pública:

- **iPhone / iPad (Safari):** abre la URL → botón Compartir → "Agregar a inicio".
- **Android (Chrome):** abre la URL → menú (⋮) → "Instalar app" / "Agregar a inicio".
- **Mac / PC (Chrome o Edge):** abre la URL → ícono de instalar en la barra de
  direcciones → "Instalar".

Quedará con su ícono propio y se abrirá a pantalla completa como una app normal.

---

## 6. Cómo funciona

### Conciliación bancaria (la pantalla principal)
Tu pantalla de inicio funciona igual que tu Excel y te ayuda a cuadrar con el banco:

- **Nómina del mes:** registras tu sueldo y auxilios (ingresos) y tus deducciones
  (salud, pensión, ahorros, apartamento, etc.). La app calcula el **neto** que te llega
  a la cuenta = ingresos − deducciones.
- **Saldo inicial:** cuánto tenías en la cuenta al empezar el mes (toca la fila para
  editarlo; con un botón puedes traer el saldo de cierre del mes anterior).
- **Saldo calculado:** `saldo inicial + neto − gastos`. Es lo que **debería** quedarte.
  Baja en tiempo real cada vez que registras un gasto.
- **Saldo real en tu banco:** miras tu app del banco y escribes el saldo actual.
- **Estado de conciliación:** la app compara y te dice:
  - ✓ **Conciliado** si cuadra.
  - ⚠ **Descuadrado por $X** si no, indicando si tienes más o menos en el banco,
    para que revises si falta registrar algún movimiento.

### Movimientos
Cada gasto muestra el **saldo corrido** (cuánto te queda en la cuenta después de ese
gasto). El botón "+" registra movimientos; eliges el tipo: **Variable**, **Fijo**,
**Ingreso** o **Deducción**.

### Métricas
Torta de gastos por categoría, barras de ingresos vs. gastos del mes, y línea de
tendencia anual (ingresos netos vs. gastos).

### Categorías
Edítalas en su pestaña; las nuevas aparecen al registrar gastos variables.

---

## 7. Seguridad

- Las contraseñas se guardan **hasheadas** (bcrypt), nunca en texto plano.
- La sesión usa un **token JWT** firmado con tu `SECRET_KEY`.
- Para producción, Render genera una `SECRET_KEY` aleatoria automáticamente.
- Nunca subas tu archivo `.env` a GitHub (ya está en `.gitignore`).
