"""Backup / Restore / Auto-Backup / Migration guide endpoints.

Super-admin only. Emits a single ZIP archive containing:
  - manifest.json      — schema-version + timestamp metadata
  - db/<collection>.json  — one JSON file per MongoDB collection (extended JSON)
  - uploads/<...>      — mirrors the on-disk UPLOAD_DIR tree

Restore accepts a ZIP produced by this endpoint, drops every current collection
and imports the archived one, then wipes UPLOAD_DIR and unpacks archived files.

Auto-backup:
  - Optionally runs once per day at a configured UTC hour.
  - Stored ZIPs live under `UPLOAD_DIR/_backups/` and are tracked in the
    Mongo collection `backup_archives`.
  - Rolling retention: after each auto-backup the oldest ones are pruned so
    only `retention` (default 7) remain.
"""
import io
import json
import shutil
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from bson import json_util
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, PlainTextResponse, StreamingResponse

from app.config import UPLOAD_DIR
from app.db import db
from app.deps import get_current_user, require_roles
from app.helpers import audit
from app.utils import new_id, now_iso

router = APIRouter(prefix="/settings", tags=["backup"])

BACKUP_VERSION = 1
BACKUPS_DIR = UPLOAD_DIR / "_backups"
BACKUPS_DIR.mkdir(parents=True, exist_ok=True)


# ============ shared writer ============

async def _write_archive_bytes(actor: Optional[dict] = None) -> tuple[bytes, dict, int]:
    """Build the backup ZIP in memory. Returns (bytes, manifest, uploads_count)."""
    buf = io.BytesIO()
    ts = datetime.now(timezone.utc).isoformat()
    collections = await db.list_collection_names()
    # Exclude the backup_archives metadata itself from the archive to avoid
    # self-reference issues on restore.
    collections = [c for c in collections if c != "backup_archives"]
    uploads_count = 0

    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name in sorted(collections):
            docs = await db[name].find({}).to_list(length=None)
            zf.writestr(f"db/{name}.json", json_util.dumps(docs, indent=2))

        if UPLOAD_DIR.exists():
            for fp in UPLOAD_DIR.rglob("*"):
                # Skip the _backups directory — we don't archive backups inside backups.
                try:
                    if BACKUPS_DIR in fp.parents or fp == BACKUPS_DIR:
                        continue
                except Exception:
                    pass
                if fp.is_file():
                    rel = fp.relative_to(UPLOAD_DIR)
                    zf.write(fp, f"uploads/{rel.as_posix()}")
                    uploads_count += 1

        manifest = {
            "backup_version": BACKUP_VERSION,
            "created_at": ts,
            "created_by": (actor or {}).get("email"),
            "collections": sorted(collections),
        }
        # Manifest is written LAST so that created_by lands inside the zip
        zf.writestr("manifest.json", json.dumps(manifest, indent=2))

    return buf.getvalue(), manifest, uploads_count


# ============ manual download / upload ============

@router.get("/backup")
async def create_backup(current=Depends(require_roles("super_admin"))):
    """Stream a fresh ZIP right now."""
    data, manifest, _ = await _write_archive_bytes(actor=current)
    await audit(current, "backup.create", "archive", {"collections": len(manifest["collections"])})
    filename = f"manpower-portal-backup-{manifest['created_at'].replace(':', '-')}.zip"
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


async def _restore_from_bytes(zip_bytes: bytes, current: dict) -> dict:
    try:
        zf = zipfile.ZipFile(io.BytesIO(zip_bytes), mode="r")
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid ZIP archive")

    names = zf.namelist()
    if "manifest.json" not in names:
        raise HTTPException(status_code=400, detail="Archive is missing manifest.json — is it a portal backup?")

    manifest = json.loads(zf.read("manifest.json"))
    if manifest.get("backup_version") != BACKUP_VERSION:
        raise HTTPException(
            status_code=400,
            detail=f"Incompatible backup version {manifest.get('backup_version')} (this server expects {BACKUP_VERSION})",
        )

    self_email = current.get("email")
    stats = {"collections": {}, "files": 0}

    for coll_name in manifest.get("collections", []):
        entry = f"db/{coll_name}.json"
        if entry not in names:
            continue
        docs = json_util.loads(zf.read(entry).decode("utf-8")) or []
        await db[coll_name].drop()
        if docs:
            await db[coll_name].insert_many(docs)
        stats["collections"][coll_name] = len(docs)

    if self_email:
        exists = await db.users.find_one({"email": self_email})
        if not exists:
            await db.users.insert_one({
                "id": current["id"],
                "email": current["email"],
                "password_hash": current["password_hash"],
                "name": current.get("name") or "Super Admin",
                "role": "super_admin",
                "disabled": False,
                "restored_at": now_iso(),
            })

    # Restore uploads (wipe, then unpack). Preserve _backups/ so historical
    # archives remain available after a restore.
    preserved: dict[str, bytes] = {}
    if BACKUPS_DIR.exists():
        for fp in BACKUPS_DIR.glob("*"):
            if fp.is_file():
                preserved[fp.name] = fp.read_bytes()

    if UPLOAD_DIR.exists():
        shutil.rmtree(UPLOAD_DIR, ignore_errors=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    BACKUPS_DIR.mkdir(parents=True, exist_ok=True)
    for name, blob in preserved.items():
        (BACKUPS_DIR / name).write_bytes(blob)

    for entry in names:
        if not entry.startswith("uploads/") or entry.endswith("/"):
            continue
        rel = entry[len("uploads/"):]
        target = UPLOAD_DIR / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("wb") as out:
            out.write(zf.read(entry))
        stats["files"] += 1

    await audit(current, "backup.restore", "archive", stats)
    return {"ok": True, "stats": stats, "manifest": manifest}


@router.post("/restore")
async def restore_backup(
    file: UploadFile = File(...),
    current=Depends(require_roles("super_admin")),
):
    contents = await file.read()
    return await _restore_from_bytes(contents, current)


# ============ auto-backup config ============

DEFAULT_AUTO_BACKUP = {
    "enabled": False,
    "hour_utc": 2,       # 02:00 UTC by default
    "retention": 7,      # keep last 7 backups
    "last_run_at": None,
    "last_status": None,
}


async def get_auto_backup_settings() -> dict:
    doc = await db.settings.find_one({"key": "auto_backup"}, {"_id": 0}) or {}
    return {**DEFAULT_AUTO_BACKUP, **{k: v for k, v in doc.items() if k in DEFAULT_AUTO_BACKUP}}


@router.get("/auto-backup")
async def get_auto_backup(current=Depends(get_current_user)):
    _ = current
    return await get_auto_backup_settings()


@router.put("/auto-backup")
async def put_auto_backup(payload: dict, current=Depends(require_roles("super_admin"))):
    try:
        hour = int(payload.get("hour_utc", DEFAULT_AUTO_BACKUP["hour_utc"]))
        retention = int(payload.get("retention", DEFAULT_AUTO_BACKUP["retention"]))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="hour_utc and retention must be integers")
    if hour < 0 or hour > 23:
        raise HTTPException(status_code=400, detail="hour_utc must be 0–23")
    if retention < 1 or retention > 60:
        raise HTTPException(status_code=400, detail="retention must be 1–60")
    upd = {
        "key": "auto_backup",
        "enabled": bool(payload.get("enabled", False)),
        "hour_utc": hour,
        "retention": retention,
        "updated_at": now_iso(),
    }
    await db.settings.update_one({"key": "auto_backup"}, {"$set": upd}, upsert=True)
    await audit(current, "settings.auto_backup.update", "auto_backup", upd)
    return await get_auto_backup_settings()


# ============ scheduled runner + retention ============

async def _prune_old_backups(retention: int):
    """Keep only the newest `retention` records, delete older ones from disk + DB.

    Delete DB row FIRST so the invariant `row exists ⇒ file exists` is
    preserved even if the disk unlink fails afterwards.
    """
    old = await db.backup_archives.find({}, {"_id": 0}).sort("created_at", -1).to_list(length=None)
    if len(old) <= retention:
        return 0
    to_delete = old[retention:]
    removed = 0
    for row in to_delete:
        await db.backup_archives.delete_one({"id": row["id"]})
        fp = BACKUPS_DIR / row["filename"]
        try:
            if fp.exists():
                fp.unlink()
        except Exception:
            pass
        removed += 1
    return removed


async def run_auto_backup(actor: Optional[dict] = None) -> dict:
    """Create a backup on disk and register it in `backup_archives`.

    Called by the scheduler and by the manual 'Run now' endpoint.
    """
    data, manifest, uploads_count = await _write_archive_bytes(actor=actor)
    ts = manifest["created_at"]
    filename = f"backup-{ts.replace(':', '-').replace('.', '-')}.zip"
    path = BACKUPS_DIR / filename
    path.write_bytes(data)

    record = {
        "id": new_id(),
        "filename": filename,
        "created_at": ts,
        "size": len(data),
        "collections": manifest["collections"],
        "files_count": uploads_count,
        "created_by": (actor or {}).get("email") or "scheduler",
        "auto": (actor is None) or (actor.get("role") == "system"),
    }
    await db.backup_archives.insert_one(record)
    record.pop("_id", None)

    cfg = await get_auto_backup_settings()
    removed = await _prune_old_backups(int(cfg.get("retention", 7)))

    await db.settings.update_one(
        {"key": "auto_backup"},
        {"$set": {"last_run_at": ts, "last_status": f"ok · pruned {removed}"}},
        upsert=True,
    )

    return {"ok": True, "record": record, "pruned": removed}


@router.post("/auto-backup/run")
async def trigger_auto_backup(current=Depends(require_roles("super_admin"))):
    result = await run_auto_backup(current)
    await audit(current, "backup.auto.run", result["record"]["id"], {"pruned": result["pruned"]})
    return result


# ============ stored backup timeline ============

@router.get("/backups")
async def list_backups(current=Depends(require_roles("super_admin"))):
    _ = current
    rows = await db.backup_archives.find({}, {"_id": 0}).sort("created_at", -1).to_list(length=None)
    return rows


@router.get("/backups/{backup_id}/download")
async def download_stored_backup(backup_id: str, current=Depends(require_roles("super_admin"))):
    row = await db.backup_archives.find_one({"id": backup_id}, {"_id": 0})
    if not row:
        raise HTTPException(status_code=404, detail="Backup not found")
    path = BACKUPS_DIR / row["filename"]
    if not path.exists():
        raise HTTPException(status_code=410, detail="Archive file no longer exists on disk")
    await audit(current, "backup.download", backup_id, {"filename": row["filename"]})
    return FileResponse(str(path), media_type="application/zip", filename=row["filename"])


@router.post("/backups/{backup_id}/restore")
async def restore_stored_backup(backup_id: str, current=Depends(require_roles("super_admin"))):
    row = await db.backup_archives.find_one({"id": backup_id}, {"_id": 0})
    if not row:
        raise HTTPException(status_code=404, detail="Backup not found")
    path = BACKUPS_DIR / row["filename"]
    if not path.exists():
        raise HTTPException(status_code=410, detail="Archive file no longer exists on disk")
    return await _restore_from_bytes(path.read_bytes(), current)


@router.delete("/backups/{backup_id}")
async def delete_stored_backup(backup_id: str, current=Depends(require_roles("super_admin"))):
    row = await db.backup_archives.find_one({"id": backup_id}, {"_id": 0})
    if not row:
        raise HTTPException(status_code=404, detail="Backup not found")
    path = BACKUPS_DIR / row["filename"]
    if path.exists():
        try:
            path.unlink()
        except Exception:
            pass
    await db.backup_archives.delete_one({"id": backup_id})
    await audit(current, "backup.delete", backup_id, {"filename": row["filename"]})
    return {"ok": True}


# ============ migration guide ============

@router.get("/migration-guide", response_class=PlainTextResponse)
async def migration_guide(current=Depends(require_roles("super_admin"))):
    _ = current
    path = Path(__file__).resolve().parents[1] / "migration_guide.md"
    if not path.exists():
        raise HTTPException(status_code=500, detail="Migration guide is missing on server")
    return path.read_text(encoding="utf-8")
