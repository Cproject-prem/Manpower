"""Manpower document upload + download."""
from datetime import datetime, timezone, date
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
import os

from app.config import ALLOWED_EXT, MAX_FILE_SIZE, UPLOAD_DIR
from app.db import db
from app.deps import get_current_user
from app.helpers import audit, filter_for_user
from app.utils import new_id, now_iso, slugify

router = APIRouter(tags=["documents"])


@router.post("/manpower/{mid}/documents")
async def upload_document(
    mid: str,
    doc_type: str = Form(...),
    file: UploadFile = File(...),
    current=Depends(get_current_user),
):
    f = await filter_for_user(current)
    f["id"] = mid
    m = await db.manpower.find_one(f)
    if not m:
        raise HTTPException(status_code=404, detail="Not found")

    # Global toggle: allow super_admin to disable new manpower doc uploads.
    from app.routes.settings import get_upload_controls
    controls = await get_upload_controls()
    if not controls.get("manpower_documents_enabled", True):
        raise HTTPException(status_code=403, detail="Manpower document uploads are currently disabled by the administrator.")

    # Manpower role: upload-once policy; renewal docs allowed only within 30 days of expiry.
    if current["role"] in ("manpower", "member"):
        existing_types = {d.get("doc_type") for d in m.get("documents", [])}
        renewal_map = {
            "medical_certificate_renewal": "medical_expiry_date",
            "height_work_certificate_renewal": "height_work_expiry_date",
            "safety_belt_certificate_renewal": "safety_belt_expiry_date",
            "extension_rope_certificate_renewal": "extension_rope_expiry_date",
            "ppe_register_renewal": "ppe_register_expiry_date",
        }
        if doc_type in renewal_map:
            expiry = m.get(renewal_map[doc_type])
            try:
                exp_date = date.fromisoformat(expiry) if expiry and "T" not in expiry else (
                    datetime.fromisoformat(expiry).date() if expiry else None
                )
            except Exception:
                exp_date = None
            if not exp_date:
                raise HTTPException(status_code=400, detail="No expiry set for this certificate")
            days_left = (exp_date - datetime.now(timezone.utc).date()).days
            if days_left > 30:
                raise HTTPException(status_code=400, detail=f"Renewal allowed only within 30 days of expiry (still {days_left} days remaining)")
        elif doc_type in existing_types:
            raise HTTPException(status_code=400, detail="Document already uploaded. Re-upload not allowed.")

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail=f"Unsupported file type. Allowed: {', '.join(ALLOWED_EXT)}")
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")
    contractor = await db.contractors.find_one({"id": m.get("contractor_id")}) if m.get("contractor_id") else None
    contractor_name = slugify(contractor["name"] if contractor else "no_contractor")
    today = datetime.now(timezone.utc)
    mp_folder = m.get("manpower_id") or m["id"]
    folder = UPLOAD_DIR / contractor_name / str(today.year) / f"{today.month:02d}" / mp_folder
    folder.mkdir(parents=True, exist_ok=True)
    safe_name = f"{doc_type}_{int(today.timestamp())}{ext}"
    fpath = folder / safe_name
    with open(fpath, "wb") as out:
        out.write(contents)
    rel_path = str(fpath.relative_to(UPLOAD_DIR))
    file_doc = {
        "id": new_id(),
        "doc_type": doc_type,
        "file_name": file.filename,
        "file_path": rel_path,
        "uploaded_by": current["id"],
        "uploaded_by_email": current["email"],
        "uploaded_at": now_iso(),
        "size": len(contents),
    }
    await db.manpower.update_one({"id": mid}, {"$push": {"documents": file_doc}, "$set": {"updated_at": now_iso()}})
    await audit(current, "document.upload", mid, {"doc_type": doc_type, "file": file.filename})
    # Best-effort FTP mirror
    from app.storage import mirror_to_ftp
    await mirror_to_ftp(fpath, rel_path)
    return file_doc


@router.get("/documents/{doc_id}")
async def download_document(doc_id: str, download: bool = False, current=Depends(get_current_user)):
    f = await filter_for_user(current)
    f["documents.id"] = doc_id
    m = await db.manpower.find_one(f)
    if not m:
        raise HTTPException(status_code=404, detail="Document not found")
        
    doc = next((d for d in m.get("documents", []) if d["id"] == doc_id), None)
    if not doc:
        raise HTTPException(status_code=404, detail="Document metadata missing")
        
    full = UPLOAD_DIR / doc["file_path"]
    if not full.exists():
        raise HTTPException(status_code=404, detail="File missing on disk")
        
    disp = "attachment" if download else "inline"
    return FileResponse(str(full), filename=doc["file_name"], content_disposition_type=disp)


@router.delete("/manpower/{mid}/documents/{doc_id}")
async def delete_document(mid: str, doc_id: str, current=Depends(get_current_user)):
    f = await filter_for_user(current)
    f["id"] = mid
    m = await db.manpower.find_one(f)
    if not m:
        raise HTTPException(status_code=404, detail="Manpower not found")
        
    doc = next((d for d in m.get("documents", []) if d["id"] == doc_id), None)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    # Permission check: super_admin, admin, or uploader (if draft/rejected)
    is_admin = current["role"] in ("super_admin", "admin")
    can_delete = is_admin or (
        current["id"] == doc.get("uploaded_by") and m.get("status") in ("draft", "rejected")
    )
    if not can_delete:
        raise HTTPException(status_code=403, detail="Not authorized to delete this document")
        
    # Delete file from disk
    full_path = UPLOAD_DIR / doc["file_path"]
    if full_path.exists():
        try:
            os.remove(full_path)
        except Exception:
            pass # Best effort deletion
            
    # Remove from DB
    await db.manpower.update_one(
        {"id": mid}, 
        {"$pull": {"documents": {"id": doc_id}}, "$set": {"updated_at": now_iso()}}
    )
    await audit(current, "document.delete", mid, {"doc_type": doc["doc_type"], "file": doc["file_name"]})
    return {"status": "ok"}
