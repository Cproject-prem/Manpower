"""FastAPI entrypoint. Wires routers, middleware, startup/shutdown.

Implementation is organised under the `app/` package:
- app/config.py      env + constants + default form-config seeds
- app/db.py          mongo client + db
- app/utils.py       password/token + small helpers
- app/deps.py        auth dependencies (current_user, require_roles)
- app/schemas.py     pydantic request models
- app/helpers.py     audit, notify, status, filter, manpower-id, contractor-access
- app/startup.py     idempotent seeding (super admin, settings, form configs)
- app/routes/*       per-domain APIRouters
"""
import logging

from fastapi import APIRouter, FastAPI
from starlette.middleware.cors import CORSMiddleware

from app.config import CORS_ORIGINS
from app.db import client
from app.startup import run_startup
from app.routes import (
    audit_logs, auth, backup, contractors, documents, form_configs,
    manpower, notifications, reports, settings, users, vendor_evaluations,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("portal")

app = FastAPI(title="Manpower Management Portal")

api = APIRouter(prefix="/api")
api.include_router(auth.router)
api.include_router(users.router)
api.include_router(contractors.router)
api.include_router(manpower.router)
api.include_router(documents.router)
api.include_router(notifications.router)
api.include_router(reports.router)
api.include_router(settings.router)
api.include_router(audit_logs.router)
api.include_router(form_configs.router)
api.include_router(vendor_evaluations.router)
api.include_router(backup.router)
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    # NOTE: frontend uses Bearer tokens (localStorage), not cookies, so we
    # keep credentials disabled here — this lets us safely echo `*` and
    # avoids mobile Safari / Chrome Android rejecting the login response.
    allow_credentials=False,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    await run_startup()


@app.on_event("shutdown")
async def on_shutdown():
    client.close()
