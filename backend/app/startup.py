"""Startup seeding (indexes, super admin, default settings, default form configs)."""
import logging

from app.config import (
    ADMIN_EMAIL, ADMIN_PASSWORD,
    DEFAULT_MANPOWER_FORM, DEFAULT_COMPLIANCE_FORM, DEFAULT_CONTRACTOR_FORM,
)
from app.db import db
from app.storage import reconcile_on_startup
from app.utils import hash_password, new_id, now_iso, verify_password

logger = logging.getLogger("portal")


async def run_startup():
    """Idempotent: indexes + seed super admin + default settings + default form configs."""
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.contractors.create_index("id", unique=True)
    await db.manpower.create_index("id", unique=True)
    await db.manpower.create_index("manpower_id", sparse=True)
    await db.counters.create_index("key", unique=True)

    # Super Admin (single source of truth = .env). Marker `is_seeded_admin`
    # lets us track the seeded SA across email changes.
    existing = await db.users.find_one({"is_seeded_admin": True})
    if existing is None:
        existing = await db.users.find_one({"email": ADMIN_EMAIL, "role": "super_admin"})
    if not existing:
        await db.users.insert_one({
            "id": new_id(),
            "email": ADMIN_EMAIL,
            "password_hash": hash_password(ADMIN_PASSWORD),
            "name": "Super Admin",
            "role": "super_admin",
            "contractor_id": None,
            "phone": "",
            "disabled": False,
            "is_seeded_admin": True,
            "created_at": now_iso(),
        })
        logger.info("Seeded super admin: %s", ADMIN_EMAIL)
    else:
        update = {"is_seeded_admin": True, "role": "super_admin", "disabled": False}
        if existing.get("email") != ADMIN_EMAIL:
            update["email"] = ADMIN_EMAIL
            logger.info("Super admin email updated to: %s", ADMIN_EMAIL)
        if not verify_password(ADMIN_PASSWORD, existing["password_hash"]):
            update["password_hash"] = hash_password(ADMIN_PASSWORD)
            logger.info("Super admin password updated from .env")
        await db.users.update_one({"id": existing["id"]}, {"$set": update})

    # Default system settings
    if not await db.settings.find_one({"key": "system"}):
        await db.settings.insert_one({
            "key": "system",
            "id_format": "MP-{year}-{seq:06d}",
            "ftp_host": "", "ftp_user": "", "ftp_password": "", "ftp_path": "",
            "updated_at": now_iso(),
        })

    # Default form configs (idempotent)
    if not await db.form_configs.find_one({"key": "manpower"}):
        await db.form_configs.insert_one({**DEFAULT_MANPOWER_FORM, "updated_at": now_iso()})
        logger.info("Seeded default Manpower form config")
    if not await db.form_configs.find_one({"key": "compliance"}):
        await db.form_configs.insert_one({**DEFAULT_COMPLIANCE_FORM, "updated_at": now_iso()})
        logger.info("Seeded default Compliance form config")
    if not await db.form_configs.find_one({"key": "contractor"}):
        await db.form_configs.insert_one({**DEFAULT_CONTRACTOR_FORM, "updated_at": now_iso()})
        logger.info("Seeded default Contractor form config")

    # Best-effort FTP backfill (no-op if FTP not configured)
    try:
        import asyncio
        asyncio.create_task(reconcile_on_startup())
    except Exception as e:
        logger.warning("FTP reconcile task spawn failed: %s", e)

    # Start nightly expiry-reminder scheduler
    try:
        from app.scheduler import start_scheduler
        start_scheduler()
    except Exception as e:
        logger.warning("Scheduler start failed: %s", e)
