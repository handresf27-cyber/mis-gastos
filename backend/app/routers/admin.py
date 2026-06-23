from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas, auth
from ..database import get_db

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/users", response_model=List[schemas.AdminUserOut])
def list_users(
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.get_current_admin),
):
    users = db.query(models.User).order_by(models.User.created_at).all()
    result = []
    for u in users:
        tx_count = db.query(models.Transaction).filter(models.Transaction.user_id == u.id).count()
        result.append(schemas.AdminUserOut(
            id=u.id,
            email=u.email,
            full_name=u.full_name,
            created_at=u.created_at,
            transaction_count=tx_count,
            is_admin=(u.email == auth.ADMIN_EMAIL),
        ))
    return result


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(auth.get_current_admin),
):
    if user_id == current_admin.id:
        raise HTTPException(400, "No puedes eliminar tu propia cuenta desde aquí")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Usuario no encontrado")
    db.delete(user)
    db.commit()
    return {"ok": True}
