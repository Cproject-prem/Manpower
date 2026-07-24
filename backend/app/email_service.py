"""Transactional email sending via aiosmtplib + Jinja2.

Settings and templates live in the `settings` collection under key='email'.
All send calls are fire-and-forget: exceptions are logged to `email_outbox`
but never bubble up so API responses stay fast and stable.

Supported events:
    - manpower_submitted        (new submission → pending_approval)
    - manpower_approved
    - manpower_rejected
    - manpower_updated          (record edited after being submitted)
    - renewal_submitted
    - renewal_approved
    - renewal_rejected
"""
import logging
from email.message import EmailMessage
from email.utils import formataddr
from typing import Iterable, Optional

import aiosmtplib
from jinja2 import Environment, BaseLoader, select_autoescape

from app.db import db
from app.utils import new_id, now_iso

logger = logging.getLogger("portal.email")

EVENT_KEYS = (
    "manpower_submitted",
    "manpower_approved",
    "manpower_rejected",
    "manpower_updated",
    "renewal_submitted",
    "renewal_approved",
    "renewal_rejected",
    "expiry_reminder",
)

EVENT_LABELS = {
    "manpower_submitted": "New Submission",
    "manpower_approved": "Approval",
    "manpower_rejected": "Rejection",
    "manpower_updated": "Update",
    "renewal_submitted": "Renewal Submitted",
    "renewal_approved": "Renewal Approved",
    "renewal_rejected": "Renewal Rejected",
    "expiry_reminder": "Expiry Reminder",
}

DEFAULT_TEMPLATES = {
    "manpower_submitted": {
        "subject": "[CMES] New Submission: {{ manpower_name }} ({{ manpower_id_display }})",
        "body": (
            "<p>A new manpower application has been submitted and is pending approval.</p>"
            "<ul>"
            "<li><b>Name:</b> {{ manpower_name }}</li>"
            "<li><b>Manpower ID:</b> {{ manpower_id_display }}</li>"
            "<li><b>Contractor:</b> {{ contractor }}</li>"
            "<li><b>Submitted by:</b> {{ actor_email }}</li>"
            "<li><b>Status:</b> {{ status }}</li>"
            "</ul>"
            "<p>Please review at <a href=\"{{ portal_url }}\">the portal</a>.</p>"
        ),
    },
    "manpower_approved": {
        "subject": "[CMES] Application Approved: {{ manpower_name }} ({{ manpower_id_display }})",
        "body": (
            "<p>Your manpower application has been <b>approved</b>.</p>"
            "<ul>"
            "<li><b>Name:</b> {{ manpower_name }}</li>"
            "<li><b>Manpower ID:</b> {{ manpower_id_display }}</li>"
            "<li><b>Approved by:</b> {{ actor_email }}</li>"
            "<li><b>Comments:</b> {{ admin_comments }}</li>"
            "</ul>"
        ),
    },
    "manpower_rejected": {
        "subject": "[CMES] Application Rejected: {{ manpower_name }}",
        "body": (
            "<p>The manpower application has been <b>rejected</b>.</p>"
            "<ul>"
            "<li><b>Name:</b> {{ manpower_name }}</li>"
            "<li><b>Rejected by:</b> {{ actor_email }}</li>"
            "<li><b>Reason:</b> {{ admin_comments }}</li>"
            "</ul>"
        ),
    },
    "manpower_updated": {
        "subject": "[CMES] Manpower Updated: {{ manpower_name }} ({{ manpower_id_display }})",
        "body": (
            "<p>A manpower record has been updated.</p>"
            "<ul>"
            "<li><b>Name:</b> {{ manpower_name }}</li>"
            "<li><b>Manpower ID:</b> {{ manpower_id_display }}</li>"
            "<li><b>Updated by:</b> {{ actor_email }}</li>"
            "<li><b>Status:</b> {{ status }}</li>"
            "</ul>"
        ),
    },
    "renewal_submitted": {
        "subject": "[CMES] Renewal Submitted: {{ manpower_name }} · {{ doc_type }}",
        "body": (
            "<p>A renewal request has been submitted for review.</p>"
            "<ul>"
            "<li><b>Name:</b> {{ manpower_name }}</li>"
            "<li><b>Manpower ID:</b> {{ manpower_id_display }}</li>"
            "<li><b>Document:</b> {{ doc_type }}</li>"
            "<li><b>Submitted by:</b> {{ actor_email }}</li>"
            "</ul>"
        ),
    },
    "renewal_approved": {
        "subject": "[CMES] Renewal Approved: {{ manpower_name }} · {{ doc_type }}",
        "body": (
            "<p>The renewal request has been <b>approved</b>.</p>"
            "<ul>"
            "<li><b>Name:</b> {{ manpower_name }}</li>"
            "<li><b>Manpower ID:</b> {{ manpower_id_display }}</li>"
            "<li><b>Document:</b> {{ doc_type }}</li>"
            "<li><b>New Expiry:</b> {{ new_expiry }}</li>"
            "<li><b>Approved by:</b> {{ actor_email }}</li>"
            "</ul>"
        ),
    },
    "renewal_rejected": {
        "subject": "[CMES] Renewal Rejected: {{ manpower_name }} · {{ doc_type }}",
        "body": (
            "<p>The renewal request has been <b>rejected</b>.</p>"
            "<ul>"
            "<li><b>Name:</b> {{ manpower_name }}</li>"
            "<li><b>Manpower ID:</b> {{ manpower_id_display }}</li>"
            "<li><b>Document:</b> {{ doc_type }}</li>"
            "<li><b>Rejected by:</b> {{ actor_email }}</li>"
            "<li><b>Reason:</b> {{ admin_comments }}</li>"
            "</ul>"
        ),
    },
    "expiry_reminder": {
        "subject": "[CMES] {{ doc_type }} expires in {{ days_left }} day(s) — {{ manpower_name }}",
        "body": (
            "<p>Reminder: a certificate is about to expire.</p>"
            "<ul>"
            "<li><b>Name:</b> {{ manpower_name }}</li>"
            "<li><b>Manpower ID:</b> {{ manpower_id_display }}</li>"
            "<li><b>Contractor:</b> {{ contractor }}</li>"
            "<li><b>Document:</b> {{ doc_type }}</li>"
            "<li><b>Expiry Date:</b> {{ new_expiry }}</li>"
            "<li><b>Days remaining:</b> {{ days_left }}</li>"
            "</ul>"
            "<p>Please renew before expiry at <a href=\"{{ portal_url }}\">the portal</a>.</p>"
        ),
    },
}

DEFAULT_EMAIL_SETTINGS = {
    "key": "email",
    "enabled": False,
    "smtp_host": "",
    "smtp_port": 587,
    "smtp_username": "",
    "smtp_password": "",
    "from_email": "",
    "from_name": "CMES Manpower Portal",
    "use_tls": False,          # 465 direct TLS
    "start_tls": True,         # 587 STARTTLS (recommended default)
    "extra_recipients": [],    # additional emails that receive every event
    "include_member_email": True,
    "include_manpower_email": True,
    "portal_url": "",
    "templates": DEFAULT_TEMPLATES,
    # Expiry reminder scheduler
    "reminder_enabled": False,
    "reminder_window_days": 30,     # send reminder when cert expires within N days
    "reminder_hour_utc": 2,         # daily run hour, 0-23
    "reminder_docs": ["medical", "height_work", "safety_belt"],  # which certs to watch
}

_jinja = Environment(loader=BaseLoader(), autoescape=select_autoescape(["html", "xml"]))


def _render(template_str: str, ctx: dict) -> str:
    try:
        return _jinja.from_string(template_str or "").render(**ctx)
    except Exception as e:
        logger.warning("Template render failed: %s", e)
        return template_str or ""


async def get_email_settings() -> dict:
    """Fetch merged email settings (defaults + stored overrides)."""
    stored = await db.settings.find_one({"key": "email"}, {"_id": 0}) or {}
    merged = {**DEFAULT_EMAIL_SETTINGS, **stored}
    # Merge templates: stored per-event overrides on top of defaults
    templates = {**DEFAULT_TEMPLATES}
    for ev, tpl in (stored.get("templates") or {}).items():
        if ev in DEFAULT_TEMPLATES:
            templates[ev] = {**DEFAULT_TEMPLATES[ev], **(tpl or {})}
    merged["templates"] = templates
    return merged


async def _resolve_recipients(cfg: dict, manpower: Optional[dict]) -> list[str]:
    """Build unique recipient list: extra + creator/member.email + manpower_user.email + reporting_manager."""
    recipients: list[str] = []

    for e in cfg.get("extra_recipients") or []:
        if isinstance(e, str) and e.strip():
            recipients.append(e.strip())

    if manpower:
        # Submitter / creator / assigned member email
        # "Include Member (creator) email" covers BOTH `created_by` (who submitted)
        # and `assigned_member_id` (who admin assigned) — either or both may be set.
        if cfg.get("include_member_email", True):
            for uid_field in ("created_by", "assigned_member_id"):
                uid = manpower.get(uid_field)
                if uid:
                    u = await db.users.find_one({"id": uid}, {"email": 1})
                    if u and u.get("email"):
                        recipients.append(u["email"])

        # Manpower own user email (if linked) OR reporting_manager_email fallback
        if cfg.get("include_manpower_email", True):
            uid = manpower.get("user_id")
            if uid:
                mp_user = await db.users.find_one({"id": uid}, {"email": 1})
                if mp_user and mp_user.get("email"):
                    recipients.append(mp_user["email"])
            # Fallback: reporting_manager_email set on record itself
            rme = manpower.get("reporting_manager_email")
            if rme:
                recipients.append(rme)

    # De-dupe, lowercase, drop empties
    seen: set[str] = set()
    unique: list[str] = []
    for r in recipients:
        rl = r.strip().lower()
        if rl and "@" in rl and rl not in seen:
            seen.add(rl)
            unique.append(rl)
    return unique


async def _smtp_send(cfg: dict, recipients: Iterable[str], subject: str, html_body: str):
    """Low-level SMTP send. Raises on failure."""
    msg = EmailMessage()
    msg["From"] = formataddr((cfg.get("from_name") or "", cfg.get("from_email") or cfg.get("smtp_username") or ""))
    msg["To"] = ", ".join(recipients)
    msg["Subject"] = subject
    msg.set_content("This message requires an HTML-capable email client.")
    msg.add_alternative(html_body, subtype="html")

    use_tls = bool(cfg.get("use_tls"))
    start_tls = bool(cfg.get("start_tls"))
    if use_tls and start_tls:
        # mutually exclusive; prefer explicit TLS on 465, STARTTLS otherwise
        start_tls = False

    await aiosmtplib.send(
        msg,
        hostname=cfg["smtp_host"],
        port=int(cfg.get("smtp_port") or 587),
        username=cfg.get("smtp_username") or None,
        password=cfg.get("smtp_password") or None,
        use_tls=use_tls,
        start_tls=start_tls,
        timeout=20,
    )


async def send_event_email(event: str, *, manpower: Optional[dict] = None, actor: Optional[dict] = None, extra_ctx: Optional[dict] = None):
    """Send an event email. Fire-and-forget: always safe to call.

    Records outcome in `email_outbox` collection.
    """
    if event not in EVENT_KEYS:
        logger.warning("Unknown email event: %s", event)
        return

    cfg = await get_email_settings()
    if not cfg.get("enabled"):
        return
    if not cfg.get("smtp_host"):
        # SMTP not configured; skip silently
        return

    tpl = (cfg.get("templates") or {}).get(event) or DEFAULT_TEMPLATES[event]
    if tpl.get("enabled") is False:
        return

    ctx = {
        "manpower_name": (manpower or {}).get("full_name", ""),
        "manpower_id_display": (manpower or {}).get("manpower_id") or (manpower or {}).get("id", ""),
        "manpower_id": (manpower or {}).get("id", ""),
        "status": (manpower or {}).get("status", ""),
        "contractor": (manpower or {}).get("company_name", ""),
        "actor_email": (actor or {}).get("email", "system"),
        "actor_name": (actor or {}).get("name", ""),
        "actor_role": (actor or {}).get("role", ""),
        "admin_comments": "",
        "doc_type": "",
        "new_expiry": "",
        "days_left": "",
        "portal_url": cfg.get("portal_url") or "",
        "event": event,
        "event_label": EVENT_LABELS.get(event, event),
    }
    if extra_ctx:
        ctx.update(extra_ctx)

    recipients = await _resolve_recipients(cfg, manpower)
    if not recipients:
        return

    subject = _render(tpl.get("subject", ""), ctx) or f"[CMES] {EVENT_LABELS.get(event, event)}"
    body = _render(tpl.get("body", ""), ctx)

    outbox_entry = {
        "id": new_id(),
        "event": event,
        "manpower_id": (manpower or {}).get("id"),
        "recipients": recipients,
        "subject": subject,
        "at": now_iso(),
    }
    try:
        await _smtp_send(cfg, recipients, subject, body)
        outbox_entry["status"] = "sent"
    except Exception as e:
        outbox_entry["status"] = "failed"
        outbox_entry["error"] = str(e)[:500]
        logger.warning("Email send failed for %s: %s", event, e)
    try:
        await db.email_outbox.insert_one(outbox_entry)
    except Exception:
        pass


async def send_test_email(to_email: str) -> dict:
    """Send a diagnostic email using current settings. Returns {ok, error?}."""
    cfg = await get_email_settings()
    if not cfg.get("smtp_host"):
        return {"ok": False, "error": "SMTP host not configured"}
    subject = "[CMES] Test email — SMTP configuration OK"
    body = (
        "<p>This is a test email from your CMES Manpower Portal.</p>"
        f"<p>Sender: <b>{cfg.get('from_name','')} &lt;{cfg.get('from_email','')}&gt;</b></p>"
        f"<p>Host: {cfg.get('smtp_host')}:{cfg.get('smtp_port')}</p>"
        f"<p>Timestamp: {now_iso()}</p>"
    )
    try:
        await _smtp_send(cfg, [to_email], subject, body)
        await db.email_outbox.insert_one({
            "id": new_id(), "event": "test", "recipients": [to_email],
            "subject": subject, "status": "sent", "at": now_iso(),
        })
        return {"ok": True}
    except Exception as e:
        await db.email_outbox.insert_one({
            "id": new_id(), "event": "test", "recipients": [to_email],
            "subject": subject, "status": "failed", "error": str(e)[:500], "at": now_iso(),
        })
        return {"ok": False, "error": str(e)[:500]}


def mask_settings(cfg: dict) -> dict:
    """Return a copy with password hidden (for GET responses)."""
    out = {**cfg}
    if out.get("smtp_password"):
        out["smtp_password"] = "********"
    return out
