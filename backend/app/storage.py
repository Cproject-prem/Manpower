"""FTP storage adapter — mirrors locally-saved files up to a remote FTP server.

Strategy:
- Local disk is the **primary** store (always written first).
- FTP is a **mirror**: if `ftp_host` is configured in settings, each upload is also
  pushed to FTP. Errors are logged but never block the request — local is the
  source of truth.
- On startup, a background reconciliation pass uploads any local file that's
  missing on the remote (so manually-set-up FTP retroactively catches up).

The adapter reads FTP credentials *lazily* from the `settings` collection each
time so updates via Settings → System take effect without a restart.
"""
import asyncio
import ftplib
import logging
import socket
from pathlib import Path
from typing import Optional

from app.config import UPLOAD_DIR
from app.db import db

logger = logging.getLogger("portal.ftp")
_FTP_TIMEOUT = 10  # seconds


async def _ftp_settings() -> Optional[dict]:
    s = await db.settings.find_one({"key": "system"}) or {}
    host = (s.get("ftp_host") or "").strip()
    if not host:
        return None
    return {
        "host": host,
        "user": (s.get("ftp_user") or "").strip(),
        "password": s.get("ftp_password") or "",
        "base_path": (s.get("ftp_path") or "/").strip() or "/",
    }


def _connect_sync(cfg: dict) -> ftplib.FTP:
    ftp = ftplib.FTP(timeout=_FTP_TIMEOUT)
    ftp.connect(cfg["host"])
    if cfg["user"]:
        ftp.login(cfg["user"], cfg["password"])
    else:
        ftp.login()
    return ftp


def _ensure_dir(ftp: ftplib.FTP, remote_dir: str):
    """Create remote dir tree relative to current dir, one segment at a time."""
    if not remote_dir or remote_dir in ("/", "."):
        return
    parts = [p for p in remote_dir.strip("/").split("/") if p]
    for part in parts:
        try:
            ftp.cwd(part)
        except ftplib.error_perm:
            try:
                ftp.mkd(part)
                ftp.cwd(part)
            except ftplib.error_perm as e:
                logger.warning("Failed to create FTP dir %s: %s", part, e)
                return


def _upload_sync(local_path: Path, remote_relative: str, cfg: dict) -> bool:
    """Synchronous FTP upload. Returns True on success."""
    try:
        ftp = _connect_sync(cfg)
    except (socket.error, ftplib.all_errors) as e:
        logger.error("FTP connect failed (%s): %s", cfg["host"], e)
        return False
    try:
        # Walk into base path
        base = cfg["base_path"].strip("/")
        if base:
            _ensure_dir(ftp, base)
        # Ensure sub-folders for the relative path
        rel = Path(remote_relative)
        parent = str(rel.parent).replace("\\", "/")
        if parent and parent != ".":
            _ensure_dir(ftp, parent)
        with open(local_path, "rb") as f:
            ftp.storbinary(f"STOR {rel.name}", f)
        return True
    except ftplib.all_errors as e:
        logger.error("FTP upload failed for %s: %s", remote_relative, e)
        return False
    finally:
        try:
            ftp.quit()
        except ftplib.all_errors:
            try:
                ftp.close()
            except Exception:
                pass


async def mirror_to_ftp(local_path: Path, remote_relative: str) -> bool:
    """Best-effort mirror of an already-saved local file to FTP. Never raises."""
    cfg = await _ftp_settings()
    if not cfg:
        return False
    try:
        return await asyncio.to_thread(_upload_sync, local_path, remote_relative, cfg)
    except Exception as e:  # defensive — never let storage break the API call
        logger.error("FTP mirror unexpected error: %s", e)
        return False


async def test_connection() -> dict:
    """Used by Settings → 'Test FTP' button."""
    cfg = await _ftp_settings()
    if not cfg:
        return {"ok": False, "error": "FTP host not configured"}
    try:
        ftp = await asyncio.to_thread(_connect_sync, cfg)
    except Exception as e:
        return {"ok": False, "error": f"Connect failed: {e}"}
    try:
        try:
            welcome = ftp.getwelcome()
        except Exception:
            welcome = "Connected"
        return {"ok": True, "host": cfg["host"], "user": cfg["user"], "base_path": cfg["base_path"], "welcome": welcome}
    finally:
        try:
            ftp.quit()
        except Exception:
            try:
                ftp.close()
            except Exception:
                pass


async def reconcile_on_startup():
    """Best-effort: upload local files that are missing on FTP. Runs on app startup."""
    cfg = await _ftp_settings()
    if not cfg:
        return
    if not UPLOAD_DIR.exists():
        return
    files = [p for p in UPLOAD_DIR.rglob("*") if p.is_file()]
    if not files:
        return
    logger.info("FTP reconcile: scanning %d files for upload", len(files))
    uploaded = 0
    for fp in files:
        rel = str(fp.relative_to(UPLOAD_DIR))
        if await mirror_to_ftp(fp, rel):
            uploaded += 1
    logger.info("FTP reconcile: %d uploaded / %d total", uploaded, len(files))
