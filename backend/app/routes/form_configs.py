"""Dynamic form-config (Manpower + Compliance) endpoints."""
from fastapi import APIRouter, Depends, HTTPException

from app.config import DEFAULT_COMPLIANCE_FORM, DEFAULT_CONTRACTOR_FORM, DEFAULT_MANPOWER_FORM, FORM_KEYS
from app.db import db
from app.deps import get_current_user, require_roles
from app.helpers import audit
from app.schemas import FormConfigIn
from app.utils import now_iso

router = APIRouter(prefix="/form-configs", tags=["form-configs"])


def _seed_for(key: str) -> dict:
    return {
        "manpower": DEFAULT_MANPOWER_FORM,
        "compliance": DEFAULT_COMPLIANCE_FORM,
        "contractor": DEFAULT_CONTRACTOR_FORM,
    }[key]


@router.get("/{key}")
async def get_form_config(key: str, user=Depends(get_current_user)):
    if key not in FORM_KEYS:
        raise HTTPException(status_code=404, detail="Unknown form key")
    cfg = await db.form_configs.find_one({"key": key}, {"_id": 0})
    if not cfg:
        await db.form_configs.insert_one({**_seed_for(key), "updated_at": now_iso()})
        cfg = await db.form_configs.find_one({"key": key}, {"_id": 0})
    return cfg


@router.put("/{key}")
async def update_form_config(key: str, payload: FormConfigIn, current=Depends(require_roles("super_admin", "admin"))):
    if key not in FORM_KEYS:
        raise HTTPException(status_code=404, detail="Unknown form key")
    existing = await db.form_configs.find_one({"key": key}) or {}
    existing_system_keys = set()
    for sec in existing.get("sections", []) or []:
        for fld in sec.get("fields", []) or []:
            if fld.get("system"):
                existing_system_keys.add(fld["key"])
    incoming_keys = set()
    for sec in payload.sections:
        for fld in sec.fields:
            incoming_keys.add(fld.key)
    missing_system = existing_system_keys - incoming_keys
    if missing_system:
        raise HTTPException(status_code=400, detail=f"Cannot remove system fields: {', '.join(sorted(missing_system))}")
    seen = set()
    for sec in payload.sections:
        for fld in sec.fields:
            if fld.key in seen:
                raise HTTPException(status_code=400, detail=f"Duplicate field key: {fld.key}")
            seen.add(fld.key)
    sections_dump = [s.model_dump() for s in payload.sections]
    await db.form_configs.update_one(
        {"key": key},
        {"$set": {"sections": sections_dump, "updated_at": now_iso()}},
        upsert=True,
    )
    await audit(current, "form_config.update", key, {"sections": len(sections_dump)})
    return await db.form_configs.find_one({"key": key}, {"_id": 0})


@router.post("/{key}/reset")
async def reset_form_config(key: str, current=Depends(require_roles("super_admin"))):
    if key not in FORM_KEYS:
        raise HTTPException(status_code=404, detail="Unknown form key")
    await db.form_configs.update_one(
        {"key": key},
        {"$set": {**_seed_for(key), "updated_at": now_iso()}},
        upsert=True,
    )
    await audit(current, "form_config.reset", key)
    return await db.form_configs.find_one({"key": key}, {"_id": 0})
