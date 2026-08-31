"""User management (CRUD, password reset)."""
from fastapi import APIRouter, Depends, HTTPException

from app.db import db
from app.deps import get_current_user, require_roles
from app.helpers import audit
from app.schemas import PasswordReset, UserCreate, UserUpdate
from app.utils import clean_doc, hash_password, new_id, now_iso

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/cluster-managers")
async def list_cluster_managers(current=Depends(get_current_user)):
    """Return all active Admin and Super Admin users to populate Cluster Manager dropdowns."""
    _ = current
    admins = await db.users.find(
        {"role": {"$in": ["super_admin", "admin"]}, "disabled": {"$ne": True}},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "role": 1, "region": 1, "region_scope": 1}
    ).to_list(500)
    return admins


@router.get("")
async def list_users(user=Depends(get_current_user)):
    if user["role"] == "super_admin":
        f = {}
    elif user["role"] == "admin":
        f = {"role": {"$in": ["vendor_admin", "member", "manpower"]}}
    elif user["role"] == "vendor_admin":
        cid = user.get("contractor_id")
        if not cid:
            f = {"_id": "__none__"}
        else:
            f = {"role": {"$in": ["member", "manpower"]}, "contractor_id": cid}
    elif user["role"] == "member":
        # Member's team of Manpower login accounts:
        #   • Those linked (via manpower.user_id) to entries they are assigned to
        #   • Those they created themselves via the Users page (created_by_id)
        # Never leaks other members' entries or their manpower logins.
        mids = await db.manpower.find({"assigned_member_id": user["id"]}, {"user_id": 1}).to_list(1000)
        linked_ids = [m.get("user_id") for m in mids if m.get("user_id")]
        f = {
            "role": "manpower",
            "$or": [
                {"id": {"$in": linked_ids}},
                {"created_by_id": user["id"]},
            ],
        }
        # If both linked_ids and created_by_id yield nothing, Mongo will just return nothing — that's fine.
    else:
        raise HTTPException(status_code=403, detail="Forbidden")
    items = await db.users.find(f, {"_id": 0, "password_hash": 0}).to_list(1000)
    return items


@router.post("")
async def create_user(payload: UserCreate, current=Depends(require_roles("super_admin", "admin", "vendor_admin", "member"))):
    if current["role"] == "admin" and payload.role not in ("vendor_admin", "member", "manpower"):
        raise HTTPException(status_code=403, detail="Admins can only create Vendor Admin, Member or Manpower users")
    if current["role"] == "vendor_admin":
        if payload.role not in ("member", "manpower"):
            raise HTTPException(status_code=403, detail="Vendor Admins can only create Member or Manpower users")
        if not current.get("contractor_id"):
            raise HTTPException(status_code=403, detail="Vendor Admin has no contractor assigned")
        payload.contractor_id = current["contractor_id"]
    if current["role"] == "member":
        # Members can create Manpower login accounts only, always tied to
        # their own contractor. We stamp created_by_id so the member can see
        # / edit them later even before a manpower record is linked.
        if payload.role != "manpower":
            raise HTTPException(status_code=403, detail="Members can only create Manpower users")
        payload.contractor_id = current.get("contractor_id")
    email = payload.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already exists")
    doc = {
        "id": new_id(),
        "email": email,
        "password_hash": hash_password(payload.password),
        "name": payload.name,
        "role": payload.role,
        "contractor_id": payload.contractor_id,
        "phone": payload.phone or "",
        "region": payload.region if payload.role == "admin" else None,
        "region_scope": payload.region_scope or ([payload.region] if payload.region else []) if payload.role == "admin" else None,
        "disabled": False,
        "created_at": now_iso(),
        "created_by_id": current["id"],
    }
    await db.users.insert_one(doc)
    await audit(current, "user.create", doc["id"], {"email": email, "role": payload.role})
    return clean_doc(doc)


@router.put("/{user_id}")
async def update_user(user_id: str, payload: UserUpdate, current=Depends(require_roles("super_admin", "admin", "vendor_admin", "member"))):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if current["role"] == "admin" and target["role"] not in ("vendor_admin", "member", "manpower"):
        raise HTTPException(status_code=403, detail="Admins can only edit Vendor Admin, Member or Manpower users")
    if current["role"] == "vendor_admin":
        if target["role"] not in ("member", "manpower"):
            raise HTTPException(status_code=403, detail="Vendor Admins can only edit Member or Manpower users")
        if target.get("contractor_id") != current.get("contractor_id"):
            raise HTTPException(status_code=403, detail="Not your contractor's user")
    if current["role"] == "member":
        # Members can edit only their own team's manpower accounts:
        # those they created OR that are linked to their assigned manpower.
        if target["role"] != "manpower":
            raise HTTPException(status_code=403, detail="Members can only edit Manpower users")
        linked = await db.manpower.find_one({"assigned_member_id": current["id"], "user_id": user_id})
        if target.get("created_by_id") != current["id"] and not linked:
            raise HTTPException(status_code=403, detail="Not your manpower user")
    upd = {k: v for k, v in payload.model_dump().items() if v is not None}
    if current["role"] == "admin" and upd.get("role") and upd["role"] not in ("vendor_admin", "member", "manpower"):
        raise HTTPException(status_code=403, detail="Admins cannot assign that role")
    if current["role"] == "vendor_admin":
        if upd.get("role") and upd["role"] not in ("member", "manpower"):
            raise HTTPException(status_code=403, detail="Vendor Admins cannot assign that role")
        upd["contractor_id"] = current.get("contractor_id")
    if current["role"] == "member":
        # Members can't change role or contractor via this endpoint.
        upd.pop("role", None)
        upd["contractor_id"] = current.get("contractor_id")
    if not upd:
        raise HTTPException(status_code=400, detail="No fields to update")
    await db.users.update_one({"id": user_id}, {"$set": upd})
    await audit(current, "user.update", user_id, upd)
    user = await db.users.find_one({"id": user_id})
    return clean_doc(user)


@router.post("/{user_id}/reset-password")
async def reset_password(user_id: str, payload: PasswordReset, current=Depends(get_current_user)):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if current["role"] == "super_admin":
        pass
    elif current["role"] == "admin":
        if target["role"] not in ("vendor_admin", "member", "manpower"):
            raise HTTPException(status_code=403, detail="Admins can only reset Vendor Admin/Member/Manpower passwords")
    elif current["role"] == "vendor_admin":
        if target["role"] not in ("member", "manpower"):
            raise HTTPException(status_code=403, detail="Vendor Admins can only reset Member/Manpower passwords")
        if target.get("contractor_id") != current.get("contractor_id"):
            raise HTTPException(status_code=403, detail="Not your contractor's user")
    elif current["role"] == "member":
        if target["role"] != "manpower":
            raise HTTPException(status_code=403, detail="Members can only reset Manpower passwords")
        # Member can reset password of manpower users they created OR that
        # are linked (via manpower.user_id) to entries they own.
        linked = await db.manpower.find_one({"assigned_member_id": current["id"], "user_id": user_id})
        if target.get("created_by_id") != current["id"] and not linked:
            raise HTTPException(status_code=403, detail="Not your manpower")
    else:
        raise HTTPException(status_code=403, detail="Forbidden")
    await db.users.update_one({"id": user_id}, {"$set": {"password_hash": hash_password(payload.new_password)}})
    await audit(current, "user.reset_password", user_id)
    return {"ok": True}


@router.delete("/{user_id}")
async def delete_user(user_id: str, current=Depends(require_roles("super_admin"))):
    if user_id == current["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    res = await db.users.delete_one({"id": user_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    await audit(current, "user.delete", user_id)
    return {"ok": True}
