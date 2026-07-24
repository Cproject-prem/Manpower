"""Shared helpers: audit, notify, manpower status/filters, manpower id."""
import asyncio
from datetime import datetime, timezone, date
from typing import List, Optional

from app.db import db
from app.utils import now_iso, new_id


def fire_email(event: str, *, manpower: Optional[dict] = None, actor: Optional[dict] = None, extra_ctx: Optional[dict] = None):
    """Schedule an email send as a background task (never blocks caller)."""
    try:
        from app.email_service import send_event_email
        asyncio.create_task(send_event_email(event, manpower=manpower, actor=actor, extra_ctx=extra_ctx))
    except Exception:
        # Never let email issues break the API response
        pass


async def audit(user: dict, action: str, target: str = "", details: Optional[dict] = None):
    await db.audit_logs.insert_one({
        "id": new_id(),
        "user_id": user.get("id"),
        "user_email": user.get("email"),
        "user_role": user.get("role"),
        "action": action,
        "target": target,
        "details": details or {},
        "at": now_iso(),
    })


async def notify(user_ids: List[str], title: str, body: str, link: str = ""):
    docs = [{
        "id": new_id(),
        "user_id": uid,
        "title": title,
        "body": body,
        "link": link,
        "read": False,
        "at": now_iso(),
    } for uid in user_ids if uid]
    if docs:
        await db.notifications.insert_many(docs)


def compute_dynamic_status(m: dict) -> str:
    """Compute display status considering medical expiry for approved manpower."""
    base = m.get("status", "draft")
    if base != "active":
        return base
    expiry = m.get("medical_expiry_date")
    if not expiry:
        return base
    try:
        exp_date = datetime.fromisoformat(expiry).date() if "T" in expiry else date.fromisoformat(expiry)
    except Exception:
        return base
    today = datetime.now(timezone.utc).date()
    if m.get("renewal_pending"):
        return "renewal_pending"
    if exp_date < today:
        return "expired"
    if (exp_date - today).days <= 30:
        return "expiring_soon"
    return "active"


def doc_status(m: dict) -> str:
    required = {"aadhar_front", "aadhar_back", "medical_certificate", "photo"}
    have = {d.get("doc_type") for d in m.get("documents", [])}
    if m.get("renewal_pending"):
        return "renewal_pending"
    expiry = m.get("medical_expiry_date")
    if expiry:
        try:
            exp_date = date.fromisoformat(expiry) if "T" not in expiry else datetime.fromisoformat(expiry).date()
            if exp_date < datetime.now(timezone.utc).date():
                return "expired"
        except Exception:
            pass
    if required.issubset(have):
        return "complete"
    return "pending"


def serialize_manpower(m: dict) -> dict:
    m.pop("_id", None)
    m["display_status"] = compute_dynamic_status(m)
    m["document_status"] = doc_status(m)
    return m


async def filter_for_user(user: dict) -> dict:
    """Return MongoDB filter based on user role.

    - super_admin: sees everything.
    - admin: sees everything, unless `region_scope` is set (non-empty), in which
      case sees only manpower with `region` in that scope.
    - vendor_admin: sees own contractor's manpower.
    - member: sees only manpower they created / are assigned to.
    - manpower: sees only their own record.
    """
    if user["role"] == "super_admin":
        return {}
    if user["role"] == "admin":
        scope = user.get("region_scope") or []
        return {"region": {"$in": scope}} if scope else {}
    if user["role"] == "vendor_admin":
        cid = user.get("contractor_id")
        return {"contractor_id": cid} if cid else {"_id": "__none__"}
    if user["role"] == "member":
        # Members see ONLY manpower they created / are assigned to — no
        # visibility of teammates' entries even within the same contractor.
        return {"assigned_member_id": user["id"]}
    if user["role"] == "manpower":
        return {"user_id": user["id"]}
    return {"_id": "__none__"}


async def next_manpower_id(contractor_id: Optional[str] = None, roll_type: str = "on_role") -> str:
    """Generate the next Manpower ID.

    Per-contractor + per-roll-type sequence when a custom format is set for that
    roll_type. Off-role uses `id_format_offroll` (falls back to `id_format`
    then global default). Counters are keyed separately per roll_type so on-role
    and off-role numbering never collide.
    """
    year = datetime.now(timezone.utc).year
    fmt: Optional[str] = None
    counter_key = f"manpower_{year}"

    if contractor_id:
        contractor = await db.contractors.find_one(
            {"id": contractor_id}, {"id_format": 1, "id_format_offroll": 1}
        )
        if contractor:
            if roll_type == "off_role" and contractor.get("id_format_offroll"):
                fmt = contractor["id_format_offroll"]
                counter_key = f"manpower_{year}_{contractor_id}_off"
            elif contractor.get("id_format"):
                fmt = contractor["id_format"]
                counter_key = (
                    f"manpower_{year}_{contractor_id}_on" if roll_type == "on_role"
                    else f"manpower_{year}_{contractor_id}_off"
                )

    if not fmt:
        settings = await db.settings.find_one({"key": "system"}) or {}
        fmt = settings.get("id_format") or "MP-{year}-{seq:06d}"

    res = await db.counters.find_one_and_update(
        {"key": counter_key},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    if not res:
        res = await db.counters.find_one({"key": counter_key})
    seq = res["seq"] if res else 1
    try:
        return fmt.format(year=year, seq=seq)
    except Exception:
        return f"MP-{year}-{seq:06d}"


async def sync_company_name(payload_dict: dict) -> dict:
    """If contractor_id is present, force company_name to match the contractor's name."""
    cid = payload_dict.get("contractor_id")
    if cid:
        contractor = await db.contractors.find_one({"id": cid})
        if contractor:
            payload_dict["company_name"] = contractor.get("name", "")
    return payload_dict


def contractor_access(user: dict, contractor_id: str) -> bool:
    if user["role"] in ("super_admin", "admin"):
        return True
    if user["role"] == "vendor_admin" and user.get("contractor_id") == contractor_id:
        return True
    return False
