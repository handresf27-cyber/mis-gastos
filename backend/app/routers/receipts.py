import os
import time
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from supabase import create_client

from .. import models, schemas, auth
from ..database import get_db
from ..config import SUPABASE_URL, SUPABASE_SERVICE_KEY

router = APIRouter(prefix="/api/transactions", tags=["receipts"])

BUCKET = "receipts"
MAX_SIZE = 10 * 1024 * 1024  # 10 MB

ALLOWED_TYPES = {
    "image/jpeg", "image/png", "image/webp",
    "application/pdf",
}

EXT_MAP = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf",
}


def _supabase():
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise HTTPException(500, "Supabase Storage no configurado (faltan SUPABASE_URL / SUPABASE_SERVICE_KEY)")
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def _get_tx(tx_id: int, user_id: int, db: Session) -> models.Transaction:
    tx = db.query(models.Transaction).filter(
        models.Transaction.id == tx_id,
        models.Transaction.user_id == user_id,
    ).first()
    if not tx:
        raise HTTPException(404, "Movimiento no encontrado")
    return tx


def _storage_path_from_url(url: str) -> str:
    marker = f"/storage/v1/object/public/{BUCKET}/"
    idx = url.find(marker)
    return url[idx + len(marker):] if idx >= 0 else ""


@router.post("/{tx_id}/receipt", response_model=schemas.TransactionOut)
async def upload_receipt(
    tx_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    tx = _get_tx(tx_id, current_user.id, db)

    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(400, "Solo se permiten imágenes (JPG, PNG, WebP) o PDF")

    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(400, "El archivo no puede superar 10 MB")

    ext = EXT_MAP.get(file.content_type, "jpg")
    storage_path = f"{current_user.id}/{tx_id}_{int(time.time())}.{ext}"

    sb = _supabase()

    # Borrar soporte anterior si existe
    if tx.receipt_url:
        old_path = _storage_path_from_url(tx.receipt_url)
        if old_path:
            try:
                sb.storage.from_(BUCKET).remove([old_path])
            except Exception:
                pass

    # Subir nuevo archivo
    try:
        sb.storage.from_(BUCKET).upload(
            path=storage_path,
            file=content,
            file_options={"content-type": file.content_type, "upsert": "true"},
        )
    except Exception as e:
        raise HTTPException(500, f"Error al subir el archivo: {e}")

    tx.receipt_url = sb.storage.from_(BUCKET).get_public_url(storage_path)
    db.commit()
    db.refresh(tx)
    return tx


@router.delete("/{tx_id}/receipt", response_model=schemas.TransactionOut)
def delete_receipt(
    tx_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    tx = _get_tx(tx_id, current_user.id, db)

    if tx.receipt_url:
        sb = _supabase()
        old_path = _storage_path_from_url(tx.receipt_url)
        if old_path:
            try:
                sb.storage.from_(BUCKET).remove([old_path])
            except Exception:
                pass
        tx.receipt_url = None
        db.commit()
        db.refresh(tx)

    return tx
