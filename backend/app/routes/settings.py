"""System settings (id format, FTP placeholders, email alerts)."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import EmailStr

from app.db import db
from app.deps import get_current_user, require_roles
from app.email_service import (
    DEFAULT_EMAIL_SETTINGS, EVENT_KEYS, EVENT_LABELS,
    get_email_settings, mask_settings, send_test_email,
)
from app.helpers import audit
from app.schemas import EmailSettingsIn, EmailTestIn, RegionsIn, SettingsIn
from app.utils import now_iso

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("")
async def get_settings(user=Depends(require_roles("super_admin"))):
    s = await db.settings.find_one({"key": "system"}, {"_id": 0}) or {}
    return s


@router.put("")
async def update_settings(payload: SettingsIn, current=Depends(require_roles("super_admin"))):
    upd = {k: v for k, v in payload.model_dump().items() if v is not None}
    upd["updated_at"] = now_iso()
    await db.settings.update_one({"key": "system"}, {"$set": upd}, upsert=True)
    await audit(current, "settings.update", "system", upd)
    return await db.settings.find_one({"key": "system"}, {"_id": 0})


@router.post("/ftp/test")
async def test_ftp(current=Depends(require_roles("super_admin"))):
    from app.storage import test_connection
    result = await test_connection()
    await audit(current, "settings.ftp_test", "system", {"ok": result.get("ok")})
    return result


@router.post("/ftp/reconcile")
async def reconcile_ftp(current=Depends(require_roles("super_admin"))):
    """Manually trigger uploading any local files missing from FTP."""
    from app.storage import _ftp_settings, reconcile_on_startup
    import asyncio
    cfg = await _ftp_settings()
    if not cfg:
        return {"ok": False, "error": "FTP host not configured"}
    asyncio.create_task(reconcile_on_startup())
    await audit(current, "settings.ftp_reconcile", "system")
    return {"ok": True, "message": "Reconcile started in background"}


# ==================== EMAIL ALERTS ====================

@router.get("/email")
async def get_email_config(current=Depends(require_roles("super_admin", "admin"))):
    cfg = await get_email_settings()
    cfg["available_events"] = [{"key": k, "label": EVENT_LABELS[k]} for k in EVENT_KEYS]
    cfg["available_placeholders"] = [
        "manpower_name", "manpower_id_display", "contractor",
        "actor_email", "actor_name", "actor_role", "status",
        "admin_comments", "doc_type", "new_expiry", "portal_url",
    ]
    return mask_settings(cfg)


@router.put("/email")
async def update_email_config(payload: EmailSettingsIn, current=Depends(require_roles("super_admin"))):
    stored = await db.settings.find_one({"key": "email"}) or {}
    data = payload.model_dump(exclude_unset=True)

    # Preserve password if masked
    if "smtp_password" in data and data["smtp_password"] == "********":
        data.pop("smtp_password", None)

    # Validate templates dict shape (only keep known events)
    if "templates" in data and isinstance(data["templates"], dict):
        cleaned = {}
        for k, v in data["templates"].items():
            if k in EVENT_KEYS and isinstance(v, dict):
                cleaned[k] = {
                    "subject": str(v.get("subject", ""))[:500],
                    "body": str(v.get("body", ""))[:20000],
                    "enabled": bool(v.get("enabled", True)),
                }
        data["templates"] = cleaned

    data["updated_at"] = now_iso()
    await db.settings.update_one({"key": "email"}, {"$set": {**data, "key": "email"}}, upsert=True)
    await audit(current, "settings.email.update", "email", {"enabled": data.get("enabled"), "keys_changed": list(data.keys())})
    cfg = await get_email_settings()
    return mask_settings(cfg)


@router.post("/email/test")
async def test_email_endpoint(payload: EmailTestIn, current=Depends(require_roles("super_admin"))):
    if not payload.to_email:
        raise HTTPException(status_code=400, detail="to_email required")
    result = await send_test_email(payload.to_email)
    await audit(current, "settings.email.test", "email", {"to": payload.to_email, "ok": result.get("ok")})
    return result


@router.post("/email/reset-templates")
async def reset_email_templates(current=Depends(require_roles("super_admin"))):
    await db.settings.update_one(
        {"key": "email"},
        {"$unset": {"templates": ""}, "$set": {"updated_at": now_iso()}},
        upsert=True,
    )
    await audit(current, "settings.email.reset_templates", "email")
    cfg = await get_email_settings()
    return mask_settings(cfg)


@router.get("/email/outbox")
async def get_email_outbox(current=Depends(require_roles("super_admin", "admin")), limit: int = 50):
    docs = await db.email_outbox.find({}, {"_id": 0}).sort("at", -1).limit(limit).to_list(limit)
    return docs


# ==================== REGIONS ====================

@router.get("/regions")
async def get_regions(current=Depends(get_current_user)):
    """Return the master list of regions. Available to every authenticated user."""
    _ = current  # any authenticated user can read
    doc = await db.settings.find_one({"key": "regions"}, {"_id": 0}) or {}
    items = doc.get("items") or []
    # Guard against duplicates / non-strings
    items = [str(x).strip() for x in items if str(x).strip()]
    return {"regions": items}


@router.put("/regions")
async def put_regions(payload: RegionsIn, current=Depends(require_roles("super_admin"))):
    # Dedupe + trim
    cleaned = []
    seen = set()
    for r in payload.regions:
        v = (r or "").strip()
        if v and v.lower() not in seen:
            seen.add(v.lower())
            cleaned.append(v)
    await db.settings.update_one(
        {"key": "regions"},
        {"$set": {"items": cleaned, "updated_at": now_iso(), "key": "regions"}},
        upsert=True,
    )
    await audit(current, "settings.regions.update", "regions", {"count": len(cleaned)})
    return {"regions": cleaned}


# ==================== DOCUMENT UPLOAD CONTROLS ====================

DEFAULT_UPLOAD_CONTROLS = {
    "manpower_documents_enabled": True,
    "contractor_compliance_enabled": True,
}


async def get_upload_controls() -> dict:
    """Return current upload controls, applying defaults for missing keys."""
    doc = await db.settings.find_one({"key": "document_upload_controls"}, {"_id": 0}) or {}
    return {
        "manpower_documents_enabled": bool(doc.get("manpower_documents_enabled", True)),
        "contractor_compliance_enabled": bool(doc.get("contractor_compliance_enabled", True)),
    }


@router.get("/document-controls")
async def get_document_controls(current=Depends(get_current_user)):
    """Every authenticated user can read (frontend needs it to render UI)."""
    _ = current
    return await get_upload_controls()


@router.put("/document-controls")
async def put_document_controls(payload: dict, current=Depends(require_roles("super_admin"))):
    cleaned = {
        "manpower_documents_enabled": bool(payload.get("manpower_documents_enabled", True)),
        "contractor_compliance_enabled": bool(payload.get("contractor_compliance_enabled", True)),
        "updated_at": now_iso(),
        "key": "document_upload_controls",
    }
    await db.settings.update_one(
        {"key": "document_upload_controls"},
        {"$set": cleaned},
        upsert=True,
    )
    await audit(current, "settings.document_controls.update", "document_upload_controls", cleaned)
    return await get_upload_controls()


@router.post("/email/reminders/run")
async def run_reminders_now(current=Depends(require_roles("super_admin"))):
    """Manually trigger the expiry-reminder scan (bypasses schedule window)."""
    from app.scheduler import run_expiry_reminders
    result = await run_expiry_reminders(forced=True)
    await audit(current, "settings.email.reminders_run", "email", result)
    return result
