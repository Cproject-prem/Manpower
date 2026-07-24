"""Nightly scheduler for expiry-reminder emails.

Runs as a single background asyncio task started at app startup.
Every minute it checks: is it time (UTC hour == reminder_hour_utc) and haven't we
already run today? If so, execute `run_expiry_reminders()`.

Reuses the same email pipeline as event emails (aiosmtplib + Jinja2 templates).
Deduplication: for each (manpower_id, doc_key, expiry_date) tuple we mark
`reminders_sent` on the manpower doc so the same reminder is not sent twice.
When the cert is renewed (expiry_date changes) it becomes eligible again.
"""
import asyncio
import logging
from datetime import date, datetime, timezone
from typing import Optional

from app.db import db
from app.email_service import get_email_settings, send_event_email
from app.utils import now_iso

logger = logging.getLogger("portal.scheduler")

# Which cert fields correspond to which "doc_key" for reminders + labels
CERT_FIELDS = {
    "medical": ("medical_expiry_date", "Medical Certificate"),
    "height_work": ("height_work_expiry_date", "Height Work Certificate"),
    "safety_belt": ("safety_belt_expiry_date", "Safety Belt Certificate"),
    "extension_rope": ("extension_rope_expiry_date", "Extension Rope Certificate"),
    "ppe_register": ("ppe_register_expiry_date", "PPE Register"),
}

_task: Optional[asyncio.Task] = None
_last_run_date: Optional[str] = None  # ISO date string of last successful reminders run
_last_backup_date: Optional[str] = None  # ISO date string of last successful auto-backup


def _parse_date(v) -> Optional[date]:
    if not v:
        return None
    try:
        if isinstance(v, date) and not isinstance(v, datetime):
            return v
        s = str(v)
        return datetime.fromisoformat(s).date() if "T" in s else date.fromisoformat(s)
    except Exception:
        return None


async def run_expiry_reminders(*, forced: bool = False) -> dict:
    """Scan active manpower and fire `expiry_reminder` emails for certs
    expiring within `reminder_window_days`. Idempotent per (mid, doc, expiry)."""
    cfg = await get_email_settings()
    if not forced:
        if not cfg.get("enabled") or not cfg.get("reminder_enabled"):
            return {"skipped": True, "reason": "reminders disabled"}
        if not cfg.get("smtp_host"):
            return {"skipped": True, "reason": "smtp not configured"}

    window = int(cfg.get("reminder_window_days") or 30)
    watched = [d for d in (cfg.get("reminder_docs") or []) if d in CERT_FIELDS]
    if not watched:
        watched = list(CERT_FIELDS.keys())

    today = datetime.now(timezone.utc).date()
    fields_needed = {"id", "manpower_id", "full_name", "status", "assigned_member_id",
                     "user_id", "reporting_manager_email", "company_name",
                     "reminders_sent", "disabled"}
    for k in watched:
        fields_needed.add(CERT_FIELDS[k][0])

    projection = {f: 1 for f in fields_needed}
    projection["_id"] = 0

    cursor = db.manpower.find({"status": "active", "disabled": {"$ne": True}}, projection)
    sent = 0
    skipped_dedup = 0
    inspected = 0
    async for m in cursor:
        inspected += 1
        sent_map = m.get("reminders_sent") or {}
        for doc_key in watched:
            field, label = CERT_FIELDS[doc_key]
            expiry = _parse_date(m.get(field))
            if not expiry:
                continue
            days_left = (expiry - today).days
            if days_left < 0 or days_left > window:
                continue
            key = f"{doc_key}:{expiry.isoformat()}"
            if sent_map.get(key):
                skipped_dedup += 1
                continue

            # Fire email (blocks briefly but scheduler runs in its own task)
            try:
                await send_event_email(
                    "expiry_reminder",
                    manpower=m,
                    actor={"email": "scheduler@system", "name": "Expiry Scheduler", "role": "system"},
                    extra_ctx={
                        "doc_type": label,
                        "new_expiry": expiry.isoformat(),
                        "days_left": str(days_left),
                    },
                )
                sent_map[key] = now_iso()
                await db.manpower.update_one(
                    {"id": m["id"]},
                    {"$set": {"reminders_sent": sent_map}},
                )
                sent += 1
            except Exception as e:
                logger.warning("expiry reminder send failed for %s / %s: %s", m.get("id"), doc_key, e)

    result = {"ok": True, "inspected": inspected, "sent": sent, "skipped_dedup": skipped_dedup,
              "window_days": window, "watched": watched, "at": now_iso()}
    logger.info("Expiry reminder run: %s", result)
    return result


async def _loop():
    """Background loop: every 60s, check both expiry-reminders and auto-backup."""
    global _last_run_date, _last_backup_date
    logger.info("Expiry reminder scheduler started")
    # Initial short delay so startup logs settle
    await asyncio.sleep(15)
    while True:
        try:
            cfg = await get_email_settings()
            target_hour = int(cfg.get("reminder_hour_utc") or 2)
            now = datetime.now(timezone.utc)
            today_iso = now.date().isoformat()
            if (cfg.get("enabled") and cfg.get("reminder_enabled")
                    and cfg.get("smtp_host")
                    and now.hour == target_hour
                    and _last_run_date != today_iso):
                logger.info("Scheduler tick — running expiry reminders (hour=%s)", target_hour)
                await run_expiry_reminders()
                _last_run_date = today_iso

            # Auto-backup: independent daily schedule
            try:
                from app.routes.backup import get_auto_backup_settings, run_auto_backup
                bcfg = await get_auto_backup_settings()
                if (bcfg.get("enabled")
                        and now.hour == int(bcfg.get("hour_utc") or 2)
                        and _last_backup_date != today_iso):
                    logger.info("Scheduler tick — running auto-backup (hour=%s)", bcfg.get("hour_utc"))
                    await run_auto_backup(actor={"email": "scheduler@system", "role": "system"})
                    _last_backup_date = today_iso
            except Exception as e:
                logger.warning("Auto-backup tick failed: %s", e)
        except Exception as e:
            logger.warning("Scheduler tick failed: %s", e)
        await asyncio.sleep(60)


def start_scheduler():
    """Start the background scheduler task if not already running."""
    global _task
    if _task and not _task.done():
        return
    try:
        _task = asyncio.create_task(_loop())
    except RuntimeError:
        # No running event loop yet (should not happen inside FastAPI startup)
        logger.warning("Could not start scheduler: no running event loop")
