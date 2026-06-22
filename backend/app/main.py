import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import models
from .database import engine
from .routers import auth, transactions, metrics, categories, statement, fixed_plans

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Mis Gastos API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(transactions.router)
app.include_router(metrics.router)
app.include_router(categories.router)
app.include_router(statement.router)
app.include_router(fixed_plans.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


# Sirve el frontend (PWA) como archivos estáticos.
# La carpeta "frontend" vive un nivel arriba de "backend" en el repo.
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend")
if os.path.isdir(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
