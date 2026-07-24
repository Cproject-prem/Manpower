"""Audit log read endpoint."""
from fastapi import APIRouter, Depends

from app.db import db
from app.deps import require_roles

router = APIRouter(prefix="/audit-logs", tags=["audit"])


@router.get("")
async def get_audit_logs(user=Depends(require_roles("super_admin")), limit: int = 100):
    items = await db.audit_logs.find({}, {"_id": 0}).sort("at", -1).limit(limit).to_list(limit)
    return items
