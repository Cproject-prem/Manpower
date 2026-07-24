# 🎛️ Central Configuration

**All app-wide settings live in ONE file:**

```
/app/backend/.env
```

Edit this file → run `bash /app/apply-config.sh` → done. Everything (login credentials, storage path, database, JWT secret) updates automatically.

---

## Current `.env` contents & what each variable controls

| Variable | Purpose | Effect when changed |
|---|---|---|
| `MONGO_URL` | MongoDB connection string | Switches the entire database the app talks to |
| `DB_NAME` | MongoDB database name | All collections (users, manpower, documents…) move to the new DB |
| `CORS_ORIGINS` | Comma-separated allowed origins (or `*`) | Controls which frontends can call the API |
| `JWT_SECRET` | Secret used to sign auth tokens | Rotating this logs everyone out (forces re-login) |
| `ADMIN_EMAIL` | Super Admin login email | On next restart, the existing Super Admin's email is **renamed** to this |
| `ADMIN_PASSWORD` | Super Admin login password | On next restart, password is reset to this value |
| `UPLOAD_DIR` | Where uploaded documents are saved | All new uploads go to this folder. Existing files stay where they were unless you move them. |

> Note: `MONGO_URL`, `DB_NAME`, and `REACT_APP_BACKEND_URL` (in `/app/frontend/.env`) are platform-protected — change only if you know what you're doing.

---

## How to change a value (e.g., Super Admin password)

1. Open `/app/backend/.env` in any editor:
   ```bash
   nano /app/backend/.env
   ```

2. Change the value, e.g.:
   ```
   ADMIN_PASSWORD="MyNewStr0ngPass!"
   ADMIN_EMAIL="boss@mycompany.com"
   ```

3. Apply:
   ```bash
   bash /app/apply-config.sh
   ```

4. Log in at `/login` with the new email/password.

---

## Where data is physically stored

| Data type | Location | Source of truth |
|---|---|---|
| **Uploaded documents (files)** | `${UPLOAD_DIR}/<Contractor>/<Year>/<Month>/<MP-ID>/` | `.env` → `UPLOAD_DIR` |
| **Manpower profiles, users, contractors, notifications, audit logs, settings** | MongoDB DB `${DB_NAME}` (collections: `users`, `manpower`, `contractors`, `notifications`, `audit_logs`, `settings`, `counters`) | `.env` → `MONGO_URL` + `DB_NAME` |
| **Document metadata** (filename, type, path, uploader) | Inside each `manpower` document's `documents[]` array in MongoDB | Same as above |
| **Frontend → backend URL** | `/app/frontend/.env` → `REACT_APP_BACKEND_URL` | Don't change unless deploying to a new domain |

---

## Quick inspection

```bash
# See current config
cat /app/backend/.env

# See uploaded files
ls -R /app/backend/uploads/

# See manpower records in DB
mongosh "$(grep MONGO_URL /app/backend/.env | cut -d'"' -f2)" \
  --eval 'db.getSiblingDB("'"$(grep DB_NAME /app/backend/.env | cut -d\" -f2)"'").manpower.find({}, {full_name:1, manpower_id:1, status:1}).pretty()'
```

---

## Frontend `.env` (separate)

`/app/frontend/.env` holds frontend-only vars:

| Variable | Purpose |
|---|---|
| `REACT_APP_BACKEND_URL` | Where the React app sends API calls. Locked to your preview URL. |
| `WDS_SOCKET_PORT` | Dev-server websocket port (don't touch) |
| `ENABLE_HEALTH_CHECK` | Platform internal flag (don't touch) |
