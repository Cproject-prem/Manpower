"""Authentication: login / logout / me."""
from fastapi import APIRouter, Depends, HTTPException, Response

from app.db import db
from app.deps import get_current_user
from app.schemas import LoginIn
from app.utils import clean_doc, create_token, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


async def _enrich(user_doc: dict) -> dict:
    """Attach contractor_name to a user dict when contractor_id is set."""
    if user_doc.get("contractor_id"):
        c = await db.contractors.find_one({"id": user_doc["contractor_id"]}, {"name": 1})
        if c:
            user_doc["contractor_name"] = c.get("name") or ""
    return user_doc


@router.post("/login")
async def login(payload: LoginIn, response: Response):
    user = await db.users.find_one({"email": payload.email.lower()})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if user.get("disabled"):
        raise HTTPException(status_code=403, detail="Account disabled")
    token = create_token(user["id"])
    response.set_cookie(
        key="access_token", value=token, httponly=True, secure=False,
        samesite="lax", max_age=60 * 60 * 24, path="/",
    )
    return {"token": token, "user": await _enrich(clean_doc(user))}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@router.get("/me")
async def me(user=Depends(get_current_user)):
    return await _enrich(dict(user))
