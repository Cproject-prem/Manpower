"""In-app notifications + polling / WebSocket endpoints."""
import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from app.db import db
from app.deps import get_current_user
from app.utils import decode_token

logger = logging.getLogger("portal.notifications")

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
async def list_notifications(user=Depends(get_current_user)):
    items = await db.notifications.find({"user_id": user["id"]}, {"_id": 0}).sort("at", -1).limit(50).to_list(50)
    unread = await db.notifications.count_documents({"user_id": user["id"], "read": False})
    return {"items": items, "unread": unread}


@router.get("/unread-count")
async def unread_count(user=Depends(get_current_user)):
    count = await db.notifications.count_documents({"user_id": user["id"], "read": False})
    return {"count": count}


@router.post("/{nid}/read")
async def mark_read(nid: str, user=Depends(get_current_user)):
    await db.notifications.update_one({"id": nid, "user_id": user["id"]}, {"$set": {"read": True}})
    return {"ok": True}


@router.post("/read-all")
async def mark_all_read(user=Depends(get_current_user)):
    await db.notifications.update_many({"user_id": user["id"]}, {"$set": {"read": True}})
    return {"ok": True}


# ---------- WebSocket ----------

async def _resolve_ws_user(token: Optional[str]) -> Optional[dict]:
    if not token:
        return None
    try:
        payload = decode_token(token)
    except Exception:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    return await db.users.find_one({"id": user_id})


@router.websocket("/ws")
async def notifications_ws(websocket: WebSocket, token: Optional[str] = None):
    user = await _resolve_ws_user(token)
    if not user or user.get("disabled"):
        # Accept first, THEN close with 1008 so browser doesn't reconnect-loop
        await websocket.accept()
        await websocket.close(code=1008)
        return

    await websocket.accept()
    try:
        while True:
            count = await db.notifications.count_documents({"user_id": user["id"], "read": False})
            await websocket.send_json({"type": "unread_count", "count": count})
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=30)
            except asyncio.TimeoutError:
                pass
    except WebSocketDisconnect:
        return
    except Exception as e:
        logger.warning("notifications_ws error for %s: %s", user.get("email"), e)
        try:
            await websocket.close(code=1011)
        except Exception:
            pass