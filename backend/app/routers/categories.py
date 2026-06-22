from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas, auth
from ..database import get_db

router = APIRouter(prefix="/api/categories", tags=["categories"])

DEFAULT_CATEGORIES = [
    "Mercado", "Comida fuera", "Transporte", "Salud", "Hogar",
    "Servicios", "Entretenimiento", "Deudas", "Ahorro", "Familia", "Otros",
]


@router.get("", response_model=List[schemas.CategoryOut])
def list_categories(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    cats = db.query(models.Category).filter(models.Category.user_id == current_user.id).all()
    if not cats:
        for name in DEFAULT_CATEGORIES:
            cat = models.Category(user_id=current_user.id, name=name)
            db.add(cat)
        db.commit()
        cats = db.query(models.Category).filter(models.Category.user_id == current_user.id).all()
    return cats


@router.post("", response_model=schemas.CategoryOut)
def create_category(
    cat_in: schemas.CategoryCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    cat = models.Category(user_id=current_user.id, **cat_in.dict())
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@router.delete("/{cat_id}")
def delete_category(
    cat_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    cat = (
        db.query(models.Category)
        .filter(models.Category.id == cat_id, models.Category.user_id == current_user.id)
        .first()
    )
    if not cat:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    db.delete(cat)
    db.commit()
    return {"ok": True}
