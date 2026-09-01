"""Manpower CRUD + submit/approve/reject + renewal flow + reassign + link-user."""
import json
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from app.db import db
from app.deps import get_current_user, require_roles
from app.helpers import (
    audit, check_region_scope, compute_dynamic_status, fire_email, filter_for_user, next_manpower_id,
    notify, serialize_manpower, sync_company_name,
)
from app.schemas import ApprovalAction, ManpowerIn, ReassignIn, RenewalSubmitIn
from app.utils import new_id, now_iso

router = APIRouter(prefix="/manpower", tags=["manpower"])


@router.get("")
async def list_manpower(
    user=Depends(get_current_user),
    q: Optional[str] = None,
    status: Optional[str] = None,
    contractor_id: Optional[str] = None,
    assigned_member_id: Optional[str] = None,
    location: Optional[str] = None,
    region: Optional[str] = None,   # Comma-separated list of regions
    include_disabled: bool = False,
    filters: Optional[str] = None,  # JSON string {field: value}
    page: int = 1, page_size: int = 50,
):
    f = await filter_for_user(user)
    if not include_disabled:
        f["disabled"] = {"$ne": True}
    if q:
        f["$or"] = [
            {"full_name": {"$regex": q, "$options": "i"}},
            {"manpower_id": {"$regex": q, "$options": "i"}},
            {"phone": {"$regex": q, "$options": "i"}},
            {"city": {"$regex": q, "$options": "i"}},
        ]
    if status:
        if status == "disabled":
            f["disabled"] = True
        elif status == "expired":
            from datetime import datetime, timezone
            from app.helpers import EXPIRY_KEYS
            today_str = datetime.now(timezone.utc).date().isoformat()
            cond = {"$or": [{k: {"$lt": today_str, "$ne": "", "$exists": True}} for k in EXPIRY_KEYS]}
            if "$or" in f:
                f["$and"] = [{"$or": f.pop("$or")}, cond]
            else:
                f.update(cond)
        elif status == "expiring_soon":
            from datetime import datetime, timezone, timedelta
            from app.helpers import EXPIRY_KEYS
            today_str = datetime.now(timezone.utc).date().isoformat()
            thirty_days_str = (datetime.now(timezone.utc).date() + timedelta(days=30)).isoformat()
            cond = {"$or": [{k: {"$gte": today_str, "$lte": thirty_days_str, "$ne": "", "$exists": True}} for k in EXPIRY_KEYS]}
            if "$or" in f:
                f["$and"] = [{"$or": f.pop("$or")}, cond]
            else:
                f.update(cond)
        elif status == "renewal_pending":
            f["renewal_pending"] = True
        else:
            f["status"] = status
    if contractor_id:
        f["contractor_id"] = contractor_id
    if assigned_member_id:
        f["assigned_member_id"] = assigned_member_id
    if location:
        f["location"] = {"$regex": location, "$options": "i"}
    if region:
        wanted = [r.strip() for r in region.split(",") if r.strip()]
        if wanted:
            # Intersect with any existing region filter coming from filter_for_user
            existing = f.get("region")
            if isinstance(existing, dict) and "$in" in existing:
                allowed = [r for r in wanted if r in existing["$in"]]
                f["region"] = {"$in": allowed} if allowed else {"$in": ["__none__"]}
            else:
                f["region"] = {"$in": wanted}

    # Dynamic column filters (from the "Column Filters" panel on the frontend).
    # filters is a JSON string like {"blood_group": "A+", "extra_fields.dept": "IT"}.
    # We only accept fields that exist on the manpower form config (native + extra_fields),
    # and use case-insensitive regex for text / exact for others.
    if filters:
        try:
            requested = json.loads(filters)
        except Exception:
            requested = {}
        if isinstance(requested, dict) and requested:
            # Build a whitelist from the current manpower form config
            cfg = await db.form_configs.find_one({"key": "manpower"}, {"_id": 0}) or {}
            allowed_keys = set()
            field_types = {}
            for sec in cfg.get("sections", []) or []:
                for fld in sec.get("fields", []) or []:
                    fkey = fld.get("key")
                    if not fkey:
                        continue
                    if fld.get("system"):
                        allowed_keys.add(fkey)
                        field_types[fkey] = fld.get("type", "text")
                    else:
                        # Custom field lives under extra_fields
                        allowed_keys.add(f"extra_fields.{fkey}")
                        field_types[f"extra_fields.{fkey}"] = fld.get("type", "text")
            # Always allow a few implicit native columns
            for k in ("manpower_id", "region", "roll_type", "display_status", "status", "medical_expiry_date"):
                allowed_keys.add(k)
                field_types.setdefault(k, "text")

            for raw_key, raw_val in requested.items():
                if raw_key not in allowed_keys:
                    continue
                if raw_val is None or (isinstance(raw_val, str) and not raw_val.strip()):
                    continue
                ftype = field_types.get(raw_key, "text")
                # Fields where regex substring matching feels natural
                if ftype in ("text", "textarea", "email", "tel"):
                    f[raw_key] = {"$regex": str(raw_val), "$options": "i"}
                else:
                    # date, number, select, contractor, member — exact match
                    f[raw_key] = raw_val

    total = await db.manpower.count_documents(f)
    skip = (page - 1) * page_size
    docs = await db.manpower.find(f, {"_id": 0}).sort("updated_at", -1).skip(skip).limit(page_size).to_list(page_size)
    return {"total": total, "items": [serialize_manpower(d) for d in docs]}


@router.get("/stats")
async def manpower_stats(user=Depends(get_current_user), region: Optional[str] = None):
    f = await filter_for_user(user)
    f["disabled"] = {"$ne": True}  # Disabled excluded from stats
    if region:
        wanted = [r.strip() for r in region.split(",") if r.strip()]
        if wanted:
            existing = f.get("region")
            if isinstance(existing, dict) and "$in" in existing:
                allowed = [r for r in wanted if r in existing["$in"]]
                f["region"] = {"$in": allowed} if allowed else {"$in": ["__none__"]}
            else:
                f["region"] = {"$in": wanted}
    items = await db.manpower.find(f, {"_id": 0}).to_list(5000)
    counts = {"total": len(items), "pending_approval": 0, "active": 0, "expiring_soon": 0, "expired": 0, "renewal_pending": 0, "rejected": 0, "draft": 0, "approved": 0}
    for it in items:
        from app.helpers import doc_status
        s = compute_dynamic_status(it)
        d_s = doc_status(it)
        
        # Count workflow status
        if s in ["active", "draft", "rejected", "pending_approval", "approved"]:
            counts[s] += 1
            
        # Count expiry/renewal statuses from document status
        if d_s in ["expired", "expiring_soon", "renewal_pending"]:
            counts[d_s] += 1
            
        # Also ensure pending_approval counts raw status if not already counted
        if it.get("status") == "pending_approval" and s != "pending_approval":
            counts["pending_approval"] += 1
    return counts


@router.get("/org-summary")
async def org_summary(user=Depends(get_current_user)):
    """Scoped organisation tree: contractor(s) → members → active manpower counts."""
    role = user["role"]
    if role == "manpower":
        return {"role": role, "contractors": []}

    # Determine which contractors this user can see
    if role in ("super_admin", "admin"):
        contractor_docs = await db.contractors.find({"disabled": {"$ne": True}}, {"_id": 0}).to_list(500)
    elif role == "vendor_admin":
        cid = user.get("contractor_id")
        contractor_docs = await db.contractors.find({"id": cid}, {"_id": 0}).to_list(1) if cid else []
    elif role == "member":
        cid = user.get("contractor_id")
        contractor_docs = await db.contractors.find({"id": cid}, {"_id": 0}).to_list(1) if cid else []
    else:
        contractor_docs = []

    contractor_ids = [c["id"] for c in contractor_docs]
    if not contractor_ids:
        return {"role": role, "contractors": []}

    # Members grouped by contractor
    members = await db.users.find(
        {"role": "member", "contractor_id": {"$in": contractor_ids}, "disabled": {"$ne": True}},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "contractor_id": 1},
    ).to_list(2000)

    # Active manpower counts per (contractor_id, assigned_member_id) — honoring admin region_scope
    mp_filter: dict = {"contractor_id": {"$in": contractor_ids}, "status": "active", "disabled": {"$ne": True}}
    if role == "admin":
        scope = user.get("region_scope") or []
        if scope:
            mp_filter["region"] = {"$in": scope}
    if role == "member":
        mp_filter["assigned_member_id"] = user["id"]
    pipeline = [
        {"$match": mp_filter},
        {"$group": {"_id": {"c": "$contractor_id", "m": "$assigned_member_id"}, "n": {"$sum": 1}}},
    ]
    agg = await db.manpower.aggregate(pipeline).to_list(5000)
    per_pair: dict[tuple, int] = {}
    per_contractor: dict[str, int] = {}
    for row in agg:
        cid = row["_id"].get("c")
        mid = row["_id"].get("m")
        n = row["n"]
        per_pair[(cid, mid)] = n
        per_contractor[cid] = per_contractor.get(cid, 0) + n

    # For member role, hide other members
    if role == "member":
        members = [m for m in members if m["id"] == user["id"]]

    contractors_out = []
    for c in contractor_docs:
        cid = c["id"]
        c_members = [m for m in members if m.get("contractor_id") == cid]
        contractors_out.append({
            "id": cid,
            "name": c.get("name"),
            "id_format": c.get("id_format") or None,
            "active_manpower": per_contractor.get(cid, 0),
            "member_count": len(c_members),
            "members": [
                {
                    "id": m["id"],
                    "name": m.get("name") or m.get("email"),
                    "email": m.get("email"),
                    "active_manpower": per_pair.get((cid, m["id"]), 0),
                }
                for m in c_members
            ],
        })
    # Sort by active_manpower desc for admin overview
    contractors_out.sort(key=lambda x: x["active_manpower"], reverse=True)
    return {"role": role, "contractors": contractors_out}


@router.get("/{mid}")
async def get_manpower(mid: str, user=Depends(get_current_user)):
    f = await filter_for_user(user)
    f["id"] = mid
    doc = await db.manpower.find_one(f, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return serialize_manpower(doc)


@router.post("")
async def create_manpower(payload: ManpowerIn, current=Depends(require_roles("super_admin", "admin", "vendor_admin", "member"))):
    assigned = payload.assigned_member_id
    contractor_id = payload.contractor_id
    if current["role"] == "member":
        assigned = current["id"]
        contractor_id = current.get("contractor_id")
    elif current["role"] == "vendor_admin":
        if not current.get("contractor_id"):
            raise HTTPException(status_code=403, detail="Vendor Admin has no contractor assigned")
        contractor_id = current["contractor_id"]
    doc = {
        "id": new_id(),
        "manpower_id": None,
        "status": "draft",
        "renewal_pending": False,
        "disabled": False,
        "documents": [],
        "approval_history": [],
        "renewal_history": [],
        "admin_comments": [],
        "user_id": None,
        "created_by": current["id"],
        "created_at": now_iso(),
        "updated_at": now_iso(),
        **payload.model_dump(),
        "assigned_member_id": assigned,
        "contractor_id": contractor_id,
    }
    await sync_company_name(doc)
    await db.manpower.insert_one(doc)
    await audit(current, "manpower.create", doc["id"], {"full_name": payload.full_name})
    doc.pop("_id", None)
    return serialize_manpower(doc)


@router.put("/{mid}")
async def update_manpower(mid: str, payload: ManpowerIn, current=Depends(get_current_user)):
    f = await filter_for_user(current)
    f["id"] = mid
    existing = await db.manpower.find_one(f)
    if not existing:
        raise HTTPException(status_code=404, detail="Not found")
    if current["role"] in ("member", "manpower") and existing["status"] not in ("draft", "rejected"):
        raise HTTPException(status_code=403, detail="Cannot edit submitted manpower")
    upd = {k: v for k, v in payload.model_dump().items() if v is not None}
    upd["updated_at"] = now_iso()
    cid = upd.get("contractor_id") or existing.get("contractor_id")
    if cid:
        contractor = await db.contractors.find_one({"id": cid})
        if contractor:
            upd["company_name"] = contractor.get("name", "")
            if contractor.get("vendor_id"):
                upd["vendor_id"] = contractor.get("vendor_id")
    await db.manpower.update_one({"id": mid}, {"$set": upd})
    await audit(current, "manpower.update", mid, upd)
    doc = await db.manpower.find_one({"id": mid}, {"_id": 0})
    # Email alert on updates to already-submitted or active records
    if existing.get("status") in ("pending_approval", "active", "rejected"):
        fire_email("manpower_updated", manpower=doc, actor=current)
    return serialize_manpower(doc)


@router.post("/{mid}/submit")
async def submit_manpower(mid: str, current=Depends(get_current_user)):
    f = await filter_for_user(current)
    f["id"] = mid
    m = await db.manpower.find_one(f)
    if not m:
        raise HTTPException(status_code=404, detail="Not found")
    if m["status"] not in ("draft", "rejected"):
        raise HTTPException(status_code=400, detail="Can only submit drafts or rejected")
    await db.manpower.update_one({"id": mid}, {"$set": {"status": "pending_approval", "updated_at": now_iso()}})
    # Notify Cluster Manager + Admins from the same region + Super Admins
    import re
    notify_user_ids = set()
    super_admins = await db.users.find({"role": "super_admin", "disabled": {"$ne": True}}, {"id": 1}).to_list(50)
    for sa in super_admins:
        notify_user_ids.add(sa["id"])

    # Selected Cluster Manager
    cm_val = m.get("reporting_cluster_manager") or (m.get("extra_fields") or {}).get("reporting_cluster_manager")
    if cm_val and isinstance(cm_val, str):
        cm_u = await db.users.find_one({
            "$or": [
                {"name": {"$regex": f"^{re.escape(cm_val.strip())}$", "$options": "i"}},
                {"email": cm_val.strip().lower()},
                {"id": cm_val.strip()},
            ],
            "disabled": {"$ne": True}
        }, {"id": 1})
        if cm_u:
            notify_user_ids.add(cm_u["id"])

    # Admins from the same region
    mp_reg = m.get("region")
    admin_filter = {"role": "admin", "disabled": {"$ne": True}}
    if mp_reg:
        admin_filter["$or"] = [
            {"region": mp_reg},
            {"region_scope": mp_reg},
            {"region": {"$in": ["", None]}, "region_scope": {"$in": [[], None]}}
        ]
    reg_admins = await db.users.find(admin_filter, {"id": 1}).to_list(100)
    for ra in reg_admins:
        notify_user_ids.add(ra["id"])

    await notify(list(notify_user_ids), "New Application Submitted", f"{m['full_name']} ({mp_reg or 'Unassigned'}) application pending approval", f"/manpower/{mid}")
    await audit(current, "manpower.submit", mid)
    updated = await db.manpower.find_one({"id": mid}, {"_id": 0})
    fire_email("manpower_submitted", manpower=updated, actor=current)
    return {"ok": True}


@router.post("/{mid}/approve")
async def approve_manpower(mid: str, payload: ApprovalAction, current=Depends(require_roles("super_admin", "admin"))):
    m = await db.manpower.find_one({"id": mid})
    if not m:
        raise HTTPException(status_code=404, detail="Not found")
    if m["status"] != "pending_approval":
        raise HTTPException(status_code=400, detail="Not pending approval")
    check_region_scope(current, m.get("region"))
    actor_name = current.get("name") or current.get("full_name") or current["email"]
    manpower_id = m.get("manpower_id") or await next_manpower_id(m.get("contractor_id"), m.get("roll_type") or "on_role")
    entry = {"action": "approved", "by": actor_name, "by_email": current["email"], "by_id": current["id"], "at": now_iso(), "comment": payload.comment or ""}
    await db.manpower.update_one(
        {"id": mid},
        {"$set": {"status": "active", "manpower_id": manpower_id, "updated_at": now_iso()},
         "$push": {"approval_history": entry}},
    )
    targets = [m.get("assigned_member_id"), m.get("user_id")]
    await notify([t for t in targets if t], "Application Approved", f"{m['full_name']} approved as {manpower_id}", f"/manpower/{mid}")
    await audit(current, "manpower.approve", mid, {"manpower_id": manpower_id, "approved_by": actor_name, "region": m.get("region")})
    updated = await db.manpower.find_one({"id": mid}, {"_id": 0})
    fire_email("manpower_approved", manpower=updated, actor=current,
               extra_ctx={"admin_comments": payload.comment or ""})
    return {"ok": True, "manpower_id": manpower_id}


@router.post("/{mid}/reject")
async def reject_manpower(mid: str, payload: Optional[ApprovalAction] = None, current=Depends(require_roles("super_admin", "admin"))):
    payload = payload or ApprovalAction()
    m = await db.manpower.find_one({"id": mid})
    if not m:
        raise HTTPException(status_code=404, detail="Not found")
    if m["status"] not in ("pending_approval",):
        raise HTTPException(status_code=400, detail="Not pending approval")
    check_region_scope(current, m.get("region"))
    actor_name = current.get("name") or current.get("full_name") or current["email"]
    entry = {"action": "rejected", "by": actor_name, "by_email": current["email"], "by_id": current["id"], "at": now_iso(), "comment": payload.comment or ""}
    await db.manpower.update_one(
        {"id": mid},
        {"$set": {"status": "rejected", "updated_at": now_iso()},
         "$push": {"approval_history": entry, "admin_comments": entry}},
    )
    targets = [m.get("assigned_member_id"), m.get("user_id")]
    await notify([t for t in targets if t], "Application Rejected", f"{m['full_name']}: {payload.comment}", f"/manpower/{mid}")
    await audit(current, "manpower.reject", mid, {"comment": payload.comment, "rejected_by": actor_name, "region": m.get("region")})
    updated = await db.manpower.find_one({"id": mid}, {"_id": 0})
    fire_email("manpower_rejected", manpower=updated, actor=current,
               extra_ctx={"admin_comments": payload.comment or ""})
    return {"ok": True}


@router.post("/{mid}/reassign")
async def reassign(mid: str, payload: ReassignIn, current=Depends(require_roles("super_admin"))):
    member = await db.users.find_one({"id": payload.assigned_member_id, "role": "member"})
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    await db.manpower.update_one(
        {"id": mid},
        {"$set": {"assigned_member_id": payload.assigned_member_id,
                  "contractor_id": member.get("contractor_id"),
                  "updated_at": now_iso()}},
    )
    await audit(current, "manpower.reassign", mid, {"to": payload.assigned_member_id})
    return {"ok": True}


@router.post("/{mid}/link-user")
async def link_user(mid: str, payload: dict, current=Depends(require_roles("super_admin", "admin", "vendor_admin"))):
    target_user_id = payload.get("user_id")
    m = await db.manpower.find_one({"id": mid})
    if not m:
        raise HTTPException(status_code=404, detail="Manpower not found")

    # Allow unlinking if user_id is empty/None
    if not target_user_id:
        await db.manpower.update_one({"id": mid}, {"$unset": {"user_id": ""}, "$set": {"updated_at": now_iso()}})
        await audit(current, "manpower.unlink_user", mid)
        return {"ok": True, "unlinked": True}

    # Allow linking manpower or member users from the same contractor
    target_user = await db.users.find_one({"id": target_user_id, "role": {"$in": ["manpower", "member"]}})
    if not target_user:
        raise HTTPException(status_code=404, detail="User account not found")

    # Verify same contractor / company
    if m.get("contractor_id") and target_user.get("contractor_id"):
        if target_user["contractor_id"] != m["contractor_id"]:
            raise HTTPException(status_code=400, detail="User account belongs to a different contractor/company")

    res = await db.manpower.update_one({"id": mid}, {"$set": {"user_id": target_user_id, "updated_at": now_iso()}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Manpower not found")
    await audit(current, "manpower.link_user", mid, {"user_id": target_user_id, "user_email": target_user.get("email")})
    return {"ok": True}


@router.post("/{mid}/disable")
async def disable_manpower(mid: str, current=Depends(require_roles("super_admin", "admin"))):
    res = await db.manpower.update_one({"id": mid}, {"$set": {"disabled": True, "updated_at": now_iso()}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    await audit(current, "manpower.disable", mid)
    return {"ok": True}


@router.post("/{mid}/enable")
async def enable_manpower(mid: str, current=Depends(require_roles("super_admin", "admin"))):
    res = await db.manpower.update_one({"id": mid}, {"$set": {"disabled": False, "updated_at": now_iso()}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    await audit(current, "manpower.enable", mid)
    return {"ok": True}


@router.delete("/{mid}")
async def delete_manpower(mid: str, current=Depends(get_current_user)):
    f = await filter_for_user(current)
    f["id"] = mid
    m = await db.manpower.find_one(f)
    if not m:
        raise HTTPException(status_code=404, detail="Manpower record not found")

    # Strict requirement: Can delete if it is in draft or rejected status AND manpower_id has not been generated
    if m.get("manpower_id") or m.get("status") not in ("draft", "rejected"):
        raise HTTPException(
            status_code=400,
            detail="Cannot delete manpower once ID is generated or record is not in draft/rejected state"
        )

    # Delete any uploaded document files from disk
    from app.config import UPLOAD_DIR
    import os
    for doc in m.get("documents", []) or []:
        fp = doc.get("file_path")
        if fp:
            full_path = UPLOAD_DIR / fp
            if full_path.exists():
                try:
                    os.remove(full_path)
                except Exception:
                    pass

    await db.manpower.delete_one({"id": mid})
    status_label = m.get("status", "draft")
    await audit(current, "manpower.delete", mid, {"full_name": m.get("full_name"), "status": status_label})
    return {"status": "ok", "message": f"{status_label.capitalize()} manpower deleted successfully"}




@router.post("/{mid}/renewal/submit")
async def submit_renewal(mid: str, payload: RenewalSubmitIn, current=Depends(get_current_user)):
    f = await filter_for_user(current)
    f["id"] = mid
    m = await db.manpower.find_one(f)
    if not m:
        raise HTTPException(status_code=404, detail="Not found")
    if m["status"] != "active":
        raise HTTPException(status_code=400, detail="Only active manpower can renew")
    renewal_doc_type = f"{payload.doc_type}_renewal"
    has_new = any(d.get("doc_type") == renewal_doc_type and not d.get("processed") for d in m.get("documents", []))
    if not has_new:
        raise HTTPException(status_code=400, detail=f"Upload new {payload.doc_type.replace('_', ' ')} first")
    pending = {
        "doc_type": payload.doc_type,
        "expiry_date": payload.expiry_date,
        "test_date": payload.test_date,
        "submitted_by": current["email"],
        "submitted_at": now_iso(),
    }
    await db.manpower.update_one(
        {"id": mid},
        {"$set": {"renewal_pending": True, "pending_renewal": pending, "updated_at": now_iso()}},
    )
    admins = await db.users.find({"role": {"$in": ["admin", "super_admin"]}}, {"id": 1}).to_list(100)
    await notify([a["id"] for a in admins], "Renewal Submitted", f"{payload.doc_type.replace('_', ' ')} renewal for {m['full_name']}", f"/manpower/{mid}")
    await audit(current, "manpower.renewal.submit", mid, {"doc_type": payload.doc_type})
    updated = await db.manpower.find_one({"id": mid}, {"_id": 0})
    fire_email("renewal_submitted", manpower=updated, actor=current,
               extra_ctx={"doc_type": payload.doc_type.replace('_', ' ').title()})
    return {"ok": True}


@router.post("/{mid}/renewal/approve")
async def approve_renewal(mid: str, payload: Optional[ApprovalAction] = None, current=Depends(require_roles("super_admin", "admin"))):
    payload = payload or ApprovalAction()
    m = await db.manpower.find_one({"id": mid})
    if not m or not m.get("renewal_pending"):
        raise HTTPException(status_code=400, detail="No pending renewal")
    check_region_scope(current, m.get("region"))
    actor_name = current.get("name") or current.get("full_name") or current["email"]
    pending = m.get("pending_renewal") or {}
    doc_type = pending.get("doc_type") or "medical_certificate"
    new_expiry = pending.get("expiry_date") or (datetime.now(timezone.utc).date() + timedelta(days=365)).isoformat()
    new_test = pending.get("test_date")

    renewal_doc_type = f"{doc_type}_renewal"
    new_docs = []
    for d in m.get("documents", []):
        if d.get("doc_type") == doc_type:
            d = {**d, "doc_type": f"{doc_type}_archived"}
        if d.get("doc_type") == renewal_doc_type and not d.get("processed"):
            d = {**d, "doc_type": doc_type, "processed": True}
        new_docs.append(d)

    field_updates = {"documents": new_docs, "renewal_pending": False, "pending_renewal": None, "updated_at": now_iso()}
    expiry_field_map = {
        "medical_certificate": "medical_expiry_date",
        "height_work_expiry_date": "height_work_expiry_date",
        "safety_belt_certificate": "safety_belt_expiry_date",
        "extension_rope_certificate": "extension_rope_expiry_date",
        "ppe_register": "ppe_register_expiry_date",
    }
    if doc_type in expiry_field_map:
        field_updates[expiry_field_map[doc_type]] = new_expiry
    if doc_type == "medical_certificate" and new_test:
        field_updates["medical_test_date"] = new_test

    entry = {"at": now_iso(), "by": actor_name, "by_email": current["email"], "action": "approved", "comment": payload.comment or "",
             "doc_type": doc_type, "new_expiry": new_expiry, "new_test_date": new_test}
    await db.manpower.update_one(
        {"id": mid},
        {"$set": field_updates, "$push": {"renewal_history": entry}},
    )
    targets = [m.get("assigned_member_id"), m.get("user_id")]
    await notify([t for t in targets if t], "Renewal Approved", f"{m['full_name']} · {doc_type.replace('_', ' ')} renewed until {new_expiry}", f"/manpower/{mid}")
    await audit(current, "manpower.renewal.approve", mid, {"doc_type": doc_type, "new_expiry": new_expiry, "approved_by": actor_name, "region": m.get("region")})
    updated = await db.manpower.find_one({"id": mid}, {"_id": 0})
    fire_email("renewal_approved", manpower=updated, actor=current,
               extra_ctx={"doc_type": doc_type.replace('_', ' ').title(), "new_expiry": new_expiry,
                          "admin_comments": payload.comment or ""})
    return {"ok": True, "doc_type": doc_type, "new_expiry": new_expiry, "new_test_date": new_test}


@router.post("/{mid}/renewal/reject")
async def reject_renewal(mid: str, payload: Optional[ApprovalAction] = None, current=Depends(require_roles("super_admin", "admin"))):
    payload = payload or ApprovalAction()
    m = await db.manpower.find_one({"id": mid})
    if not m or not m.get("renewal_pending"):
        raise HTTPException(status_code=400, detail="No pending renewal")
    check_region_scope(current, m.get("region"))
    actor_name = current.get("name") or current.get("full_name") or current["email"]
    entry = {"at": now_iso(), "by": actor_name, "by_email": current["email"], "action": "rejected", "comment": payload.comment or ""}
    await db.manpower.update_one(
        {"id": mid},
        {"$set": {"renewal_pending": False, "pending_renewal": None, "updated_at": now_iso()},
         "$push": {"renewal_history": entry, "admin_comments": entry}},
    )
    targets = [m.get("assigned_member_id"), m.get("user_id")]
    await notify([t for t in targets if t], "Renewal Rejected", f"{m['full_name']}: {payload.comment}", f"/manpower/{mid}")
    await audit(current, "manpower.renewal.reject", mid, {"rejected_by": actor_name, "region": m.get("region")})
    updated = await db.manpower.find_one({"id": mid}, {"_id": 0})
    pending = m.get("pending_renewal") or {}
    fire_email("renewal_rejected", manpower=updated, actor=current,
               extra_ctx={"doc_type": (pending.get("doc_type") or "").replace('_', ' ').title(),
                          "admin_comments": payload.comment or ""})
    return {"ok": True}
