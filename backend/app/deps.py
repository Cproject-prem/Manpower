"""Auth dependencies (current_user + role guard)."""
import jwt
from fastapi import Depends, HTTPException, Request

from app.db import db
from app.utils import clean_doc, decode_token


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        # Allow ?token=... for GET requests that can't set headers (e.g. <img>, <a>)
        token = request.query_params.get("token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = decode_token(token)
        user = await db.users.find_one({"id": payload["sub"]})
        if not user or user.get("disabled"):
            raise HTTPException(status_code=401, detail="User not found or disabled")
        return clean_doc(user)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def require_roles(*roles):
    async def _checker(user=Depends(get_current_user)):
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Forbidden")
        return user
    return _checker
