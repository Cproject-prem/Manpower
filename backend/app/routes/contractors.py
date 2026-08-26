"""Contractor CRUD + per-contractor compliance metadata & ESI/PF/MSME/GST docs."""
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
import os

from app.config import ALLOWED_EXT, COMPLIANCE_DOC_KEYS, MAX_FILE_SIZE, UPLOAD_DIR
from app.db import db
from app.deps import get_current_user, require_roles
from app.helpers import audit, check_region_scope, contractor_access
from app.schemas import ContractorComplianceUpdate, ContractorIn
from app.utils import new_id, now_iso, slugify

router = APIRouter(prefix="/contractors", tags=["contractors"])


@router.get("")
async def list_contractors(user=Depends(get_current_user), include_disabled: bool = False):
    f = {}
    if user["role"] == "vendor_admin":
        cid = user.get("contractor_id")
        f = {"id": cid} if cid else {"_id": "__none__"}
    elif user["role"] == "admin":
        scope = user.get("region_scope") or []
        if scope:
            f["region"] = {"$in": scope}
    if not include_disabled:
        # Default hides disabled (still visible to admins via flag, vendor_admin always sees own even if disabled)
        if user["role"] != "vendor_admin":
            f["disabled"] = {"$ne": True}
    items = await db.contractors.find(f, {"_id": 0}).to_list(500)
    return items


@router.post("")
async def create_contractor(payload: ContractorIn, current=Depends(require_roles("super_admin", "admin"))):
    doc = {"id": new_id(), **payload.model_dump(), "disabled": False, "created_at": now_iso()}
    await db.contractors.insert_one(doc)
    await audit(current, "contractor.create", doc["id"], {"name": payload.name})
    doc.pop("_id", None)
    return doc


async def _renumber_contractor_manpower(cid: str, new_format: str, roll_type: str) -> dict:
    """Reassign manpower_id for approved records under `cid` matching `roll_type`
    using `new_format`. Preserves creation order; keeps previous ids in history."""
    match = {"contractor_id": cid, "manpower_id": {"$ne": None}, "roll_type": roll_type}
    # Also cover legacy docs with no roll_type when renumbering on-role
    if roll_type == "on_role":
        match = {"contractor_id": cid, "manpower_id": {"$ne": None},
                 "$or": [{"roll_type": "on_role"}, {"roll_type": {"$exists": False}}, {"roll_type": None}]}
    docs = await db.manpower.find(
        match,
        {"id": 1, "manpower_id": 1, "created_at": 1, "manpower_id_history": 1},
    ).sort("created_at", 1).to_list(10000)

    years = set()
    for d in docs:
        try:
            y = int(str(d.get("created_at") or "")[:4])
        except Exception:
            y = datetime.now(timezone.utc).year
        years.add(y)
    suffix = "on" if roll_type == "on_role" else "off"
    for y in years:
        await db.counters.update_one({"key": f"manpower_{y}_{cid}_{suffix}"}, {"$set": {"seq": 0}}, upsert=True)

    updated = 0
    mapping: list[dict] = []
    for d in docs:
        try:
            year = int(str(d.get("created_at") or "")[:4])
        except Exception:
            year = datetime.now(timezone.utc).year
        counter_key = f"manpower_{year}_{cid}_{suffix}"
        r = await db.counters.find_one_and_update(
            {"key": counter_key}, {"$inc": {"seq": 1}}, upsert=True, return_document=True,
        )
        if not r:
            r = await db.counters.find_one({"key": counter_key})
        seq = r["seq"] if r else 1
        try:
            new_id = new_format.format(year=year, seq=seq)
        except Exception:
            new_id = f"MP-{year}-{seq:06d}"
        old_id = d.get("manpower_id")
        if new_id == old_id:
            continue
        history_entry = {"old_id": old_id, "new_id": new_id, "at": now_iso()}
        await db.manpower.update_one(
            {"id": d["id"]},
            {"$set": {"manpower_id": new_id, "updated_at": now_iso()},
             "$push": {"manpower_id_history": history_entry}},
        )
        mapping.append(history_entry)
        updated += 1
    return {"updated": updated, "total_considered": len(docs), "roll_type": roll_type, "mapping": mapping}


@router.put("/{cid}")
async def update_contractor(cid: str, payload: ContractorIn, current=Depends(require_roles("super_admin", "admin"))):
    existing = await db.contractors.find_one({"id": cid})
    if not existing:
        raise HTTPException(status_code=404, detail="Contractor not found")

    data = payload.model_dump()
    await db.contractors.update_one({"id": cid}, {"$set": data})
    await audit(current, "contractor.update", cid, {"name": payload.name})

    renumber_infos = []
    for field, roll_type in (("id_format", "on_role"), ("id_format_offroll", "off_role")):
        new_fmt = (data.get(field) or "").strip() or None
        old_fmt = (existing.get(field) or "").strip() or None
        if new_fmt and new_fmt != old_fmt and current["role"] == "super_admin":
            info = await _renumber_contractor_manpower(cid, new_fmt, roll_type)
            renumber_infos.append(info)
            await audit(current, "contractor.id_format.renumber", cid,
                        {"field": field, "roll_type": roll_type, "updated": info["updated"]})

    result = await db.contractors.find_one({"id": cid}, {"_id": 0})
    if renumber_infos:
        result["_renumber"] = renumber_infos
    return result


@router.post("/{cid}/disable")
async def disable_contractor(cid: str, current=Depends(require_roles("super_admin", "admin"))):
    res = await db.contractors.update_one({"id": cid}, {"$set": {"disabled": True, "updated_at": now_iso()}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Contractor not found")
    await audit(current, "contractor.disable", cid)
    return {"ok": True}


@router.post("/{cid}/enable")
async def enable_contractor(cid: str, current=Depends(require_roles("super_admin", "admin"))):
    res = await db.contractors.update_one({"id": cid}, {"$set": {"disabled": False, "updated_at": now_iso()}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Contractor not found")
    await audit(current, "contractor.enable", cid)
    return {"ok": True}


@router.post("/{cid}/reset-sequence")
async def reset_manpower_sequence(cid: str, roll_type: str = "on_role", current=Depends(require_roles("super_admin"))):
    """Reset per-contractor per-roll-type Manpower ID sequence to 0.
    `roll_type` is one of: on_role | off_role."""
    from datetime import datetime, timezone
    c = await db.contractors.find_one({"id": cid})
    if not c:
        raise HTTPException(status_code=404, detail="Contractor not found")
    year = datetime.now(timezone.utc).year
    suffix = "on" if roll_type == "on_role" else "off"
    counter_key = f"manpower_{year}_{cid}_{suffix}"
    await db.counters.update_one({"key": counter_key}, {"$set": {"seq": 0}}, upsert=True)
    await audit(current, "contractor.reset_sequence", cid, {"key": counter_key, "roll_type": roll_type})
    return {"ok": True, "counter_key": counter_key, "roll_type": roll_type, "reset_to": 0}


@router.delete("/{cid}")
async def delete_contractor(cid: str, current=Depends(require_roles("super_admin"))):
    await db.contractors.delete_one({"id": cid})
    return {"ok": True}


@router.get("/{cid}")
async def get_contractor(cid: str, user=Depends(get_current_user)):
    if not contractor_access(user, cid):
        raise HTTPException(status_code=403, detail="Forbidden")
    c = await db.contractors.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Contractor not found")
    c.setdefault("compliance", {})
    c.setdefault("compliance_documents", [])
    year = datetime.now(timezone.utc).year
    settings = await db.settings.find_one({"key": "system"}) or {}
    global_fmt = settings.get("id_format") or "MP-{year}-{seq:06d}"

    def preview(fmt, counter_key):
        counter = 0
        try:
            counter = 0  # will be set below
        except Exception:
            pass
        return fmt

    on_fmt = c.get("id_format") or global_fmt
    off_fmt = c.get("id_format_offroll") or c.get("id_format") or global_fmt
    on_counter = await db.counters.find_one({"key": f"manpower_{year}_{cid}_on"}) or {"seq": 0}
    off_counter = await db.counters.find_one({"key": f"manpower_{year}_{cid}_off"}) or {"seq": 0}
    try:
        c["next_id_preview"] = on_fmt.format(year=year, seq=on_counter["seq"] + 1)
    except Exception:
        c["next_id_preview"] = on_fmt
    try:
        c["next_id_preview_offroll"] = off_fmt.format(year=year, seq=off_counter["seq"] + 1)
    except Exception:
        c["next_id_preview_offroll"] = off_fmt
    c["id_format_effective"] = on_fmt
    c["id_format_offroll_effective"] = off_fmt
    return c


@router.put("/{cid}/compliance")
async def update_contractor_compliance(cid: str, payload: ContractorComplianceUpdate, current=Depends(get_current_user)):
    if not contractor_access(current, cid):
        raise HTTPException(status_code=403, detail="Forbidden")
    c = await db.contractors.find_one({"id": cid})
    if not c:
        raise HTTPException(status_code=404, detail="Contractor not found")
    merged = {**(c.get("compliance") or {}), **(payload.compliance or {})}
    await db.contractors.update_one({"id": cid}, {"$set": {"compliance": merged, "updated_at": now_iso()}})
    await audit(current, "contractor.compliance.update", cid, {"keys": list(payload.compliance.keys())})
    return await db.contractors.find_one({"id": cid}, {"_id": 0})


@router.post("/{cid}/compliance-documents")
async def upload_contractor_compliance_doc(
    cid: str,
    doc_type: str = Form(...),
    file: UploadFile = File(...),
    current=Depends(get_current_user),
):
    if not contractor_access(current, cid):
        raise HTTPException(status_code=403, detail="Forbidden")
    if doc_type not in COMPLIANCE_DOC_KEYS:
        raise HTTPException(status_code=400, detail=f"Unsupported doc_type. Allowed: {', '.join(COMPLIANCE_DOC_KEYS)}")
    # Global toggle: allow super_admin to disable new contractor-compliance uploads.
    from app.routes.settings import get_upload_controls
    controls = await get_upload_controls()
    if not controls.get("contractor_compliance_enabled", True):
        raise HTTPException(status_code=403, detail="Contractor compliance uploads are currently disabled by the administrator.")
    c = await db.contractors.find_one({"id": cid})
    if not c:
        raise HTTPException(status_code=404, detail="Contractor not found")
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail=f"Unsupported file type. Allowed: {', '.join(ALLOWED_EXT)}")
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")
    contractor_name = slugify(c.get("name", "contractor"))
    today = datetime.now(timezone.utc)
    folder = UPLOAD_DIR / contractor_name / "compliance" / doc_type
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
    existing_docs = c.get("compliance_documents") or []
    archived = c.get("compliance_documents_archive") or []
    current_of_type = [d for d in existing_docs if d.get("doc_type") == doc_type]
    other_docs = [d for d in existing_docs if d.get("doc_type") != doc_type]
    archived = archived + current_of_type
    new_docs = other_docs + [file_doc]
    await db.contractors.update_one(
        {"id": cid},
        {"$set": {
            "compliance_documents": new_docs,
            "compliance_documents_archive": archived,
            "updated_at": now_iso(),
        }},
    )
    await audit(current, "contractor.compliance.upload", cid, {"doc_type": doc_type, "file": file.filename})
    # Best-effort FTP mirror (no-op if FTP not configured)
    from app.storage import mirror_to_ftp
    await mirror_to_ftp(fpath, rel_path)
    return file_doc


@router.get("/{cid}/compliance-documents/{doc_id}")
async def download_contractor_document(cid: str, doc_id: str, download: bool = False, current=Depends(get_current_user)):
    if not contractor_access(current, cid):
        raise HTTPException(status_code=403, detail="Forbidden")
    c = await db.contractors.find_one({"id": cid})
    if not c:
        raise HTTPException(status_code=404, detail="Contractor not found")
    all_docs = (c.get("compliance_documents") or []) + (c.get("compliance_documents_archive") or [])
    doc = next((d for d in all_docs if d["id"] == doc_id), None)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    from app.config import UPLOAD_DIR
    full = UPLOAD_DIR / doc["file_path"]
    if not full.exists():
        raise HTTPException(status_code=404, detail="File missing on disk")
        
    disp = "attachment" if download else "inline"
    return FileResponse(str(full), filename=doc["file_name"], content_disposition_type=disp)


@router.delete("/{cid}/compliance-documents/{doc_id}")
async def delete_contractor_document(cid: str, doc_id: str, current=Depends(get_current_user)):
    c = await db.contractors.find_one({"id": cid})
    if not c:
        raise HTTPException(status_code=404, detail="Contractor not found")
        
    can_manage = current["role"] in ("super_admin", "admin") or (current["role"] == "vendor_admin" and current.get("contractor_id") == cid)
    if not can_manage:
        raise HTTPException(status_code=403, detail="Not authorized to manage this contractor")
        
    doc = next((d for d in c.get("compliance_documents", []) if d["id"] == doc_id), None)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    # Delete file from disk
    from app.config import UPLOAD_DIR
    full_path = UPLOAD_DIR / doc["file_path"]
    if full_path.exists():
        try:
            os.remove(full_path)
        except Exception:
            pass
            
    # Remove from DB
    await db.contractors.update_one(
        {"id": cid}, 
        {"$pull": {"compliance_documents": {"id": doc_id}}, "$set": {"updated_at": now_iso()}}
    )
    await audit(current, "contractor.document.delete", cid, {"doc_type": doc["doc_type"], "file": doc["file_name"]})
    return {"status": "ok"}


async def _maybe_generate_vendor_id(cid: str, c: dict) -> str | None:
    """Check if all uploaded compliance docs are approved; if so generate vendor_id."""
    if c.get("vendor_id"):
        return c["vendor_id"]

    docs = c.get("compliance_documents") or []
    if not docs:
        return None

    # All uploaded docs must be approved
    if not all(d.get("status") == "approved" for d in docs):
        return None

    # Generate vendor ID
    vendor_id_format = (c.get("vendor_id_format") or "").strip()
    if vendor_id_format:
        vendor_id = vendor_id_format
    else:
        prefix = (c.get("name") or "VND")[:3].upper()
        year = datetime.now(timezone.utc).year
        vendor_id = f"{prefix}{year}"

    # Ensure uniqueness by appending a counter if needed
    base_id = vendor_id
    counter = await db.counters.find_one_and_update(
        {"key": f"vendor_id_{base_id}"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    seq = counter["seq"] if counter else 1
    # Seq=1 means first vendor with this prefix — no suffix needed unless collision exists
    if seq > 1 or await db.contractors.count_documents({"vendor_id": base_id, "id": {"$ne": cid}}) > 0:
        vendor_id = f"{base_id}-{seq:03d}"

    await db.contractors.update_one(
        {"id": cid},
        {"$set": {"vendor_id": vendor_id, "vendor_id_generated_at": now_iso(), "updated_at": now_iso()}},
    )
    
    # Propagate to all manpower belonging to this contractor
    await db.manpower.update_many(
        {"contractor_id": cid},
        {"$set": {"vendor_id": vendor_id}}
    )
    
    return vendor_id


@router.post("/{cid}/compliance-documents/{doc_id}/approve")
async def approve_contractor_document(cid: str, doc_id: str, current=Depends(require_roles("super_admin", "admin"))):
    c = await db.contractors.find_one({"id": cid})
    if not c:
        raise HTTPException(status_code=404, detail="Contractor not found")
    if c.get("region"):
        check_region_scope(current, c.get("region"))

    docs = c.get("compliance_documents") or []
    doc = next((d for d in docs if d["id"] == doc_id), None)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    actor_name = current.get("name") or current.get("full_name") or current["email"]
    # Update status on the specific document
    updated_docs = [
        {**d, "status": "approved", "approved_by": actor_name, "approved_by_email": current["email"], "approved_at": now_iso()}
        if d["id"] == doc_id else d
        for d in docs
    ]
    await db.contractors.update_one(
        {"id": cid},
        {"$set": {"compliance_documents": updated_docs, "updated_at": now_iso()}},
    )
    await audit(current, "contractor.document.approve", cid, {"doc_type": doc["doc_type"], "approved_by": actor_name})

    # Re-fetch and try to generate vendor_id
    refreshed = await db.contractors.find_one({"id": cid})
    vendor_id = await _maybe_generate_vendor_id(cid, refreshed)

    # Email vendor admin if vendor_id was just generated
    if vendor_id and not c.get("vendor_id"):
        vendor_admin = await db.users.find_one({"contractor_id": cid, "role": "vendor_admin"})
        if vendor_admin:
            from app.notifications import notify
            await notify(
                [vendor_admin["id"]],
                "Vendor ID Generated",
                f"Your Vendor ID is: {vendor_id}. All compliance documents have been approved.",
                f"/contractors/{cid}",
            )

    result = await db.contractors.find_one({"id": cid}, {"_id": 0})
    return {**result, "vendor_id_generated": vendor_id is not None and not c.get("vendor_id")}


@router.post("/{cid}/compliance-documents/{doc_id}/reject")
async def reject_contractor_document(cid: str, doc_id: str, current=Depends(require_roles("super_admin", "admin")), payload: dict | None = None):
    c = await db.contractors.find_one({"id": cid})
    if not c:
        raise HTTPException(status_code=404, detail="Contractor not found")
    if c.get("region"):
        check_region_scope(current, c.get("region"))

    docs = c.get("compliance_documents") or []
    doc = next((d for d in docs if d["id"] == doc_id), None)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    actor_name = current.get("name") or current.get("full_name") or current["email"]
    reason = (payload or {}).get("reason", "")
    updated_docs = [
        {**d, "status": "rejected", "rejected_by": actor_name, "rejected_by_email": current["email"], "rejected_at": now_iso(), "reject_reason": reason}
        if d["id"] == doc_id else d
        for d in docs
    ]
    await db.contractors.update_one(
        {"id": cid},
        {"$set": {"compliance_documents": updated_docs, "updated_at": now_iso()}},
    )
    await audit(current, "contractor.document.reject", cid, {"doc_type": doc["doc_type"], "reason": reason, "rejected_by": actor_name})
    return await db.contractors.find_one({"id": cid}, {"_id": 0})
