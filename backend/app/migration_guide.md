# Backup, Restore & Migration Guide

The portal ships everything you need to move between machines: MongoDB data,
uploaded documents and the source code. Choose the section that matches your
environment.

---

## 1. In-App One-Click Backup / Restore (fastest)

**Super Admin → Settings → Backup & Migration**

- **Download Backup** — produces a single ZIP file containing:
  - `manifest.json` — schema version and timestamp
  - `db/*.json` — every MongoDB collection (users, contractors, manpower, settings, form_configs, vendor_evaluations, audit_logs, sequences)
  - `uploads/…` — every uploaded document (photos, certificates, PDFs)
- **Restore from Backup** — upload a ZIP produced above. It wipes the current
  data and imports the archive. The Super Admin who initiates the restore is
  kept logged in.

Use this for periodic snapshots and for moving between two live portals.

---

## 2. Manual Backup — Linux

Assumes the app is running under systemd or supervisor, MongoDB is local, and
the app root is `/app`.

```bash
# 1. MongoDB dump
mongodump --uri "mongodb://localhost:27017" --db=cmes_mp_db --out=/tmp/mp_dump

# 2. Uploads
tar -czf /tmp/mp_uploads.tgz -C /app/backend uploads

# 3. Bundle everything (dump + uploads + .env files)
tar -czf /tmp/manpower-portal-backup-$(date +%F).tgz \
    -C /tmp mp_dump mp_uploads.tgz \
    -C /app backend/.env frontend/.env
```

### Restore on a Linux host

```bash
tar -xzf manpower-portal-backup-YYYY-MM-DD.tgz -C /tmp
mongorestore --uri "mongodb://localhost:27017" --drop /tmp/mp_dump
tar -xzf /tmp/mp_uploads.tgz -C /app/backend
sudo supervisorctl restart backend frontend
```

---

## 3. Manual Backup — Windows (PowerShell)

Assumes MongoDB is at `C:\Program Files\MongoDB\Server\7.0\bin` and the app is
at `C:\manpower-portal`.

```powershell
# 1. MongoDB dump
& "C:\Program Files\MongoDB\Server\7.0\bin\mongodump.exe" `
    --uri "mongodb://localhost:27017" --db cmes_mp_db --out C:\backup\mp_dump

# 2. Uploads folder
Compress-Archive -Path C:\manpower-portal\backend\uploads -DestinationPath C:\backup\mp_uploads.zip

# 3. Combined archive
Compress-Archive -Path C:\backup\mp_dump, C:\backup\mp_uploads.zip, C:\manpower-portal\backend\.env `
    -DestinationPath ("C:\backup\manpower-portal-backup-" + (Get-Date -Format yyyy-MM-dd) + ".zip")
```

### Restore on Windows

```powershell
Expand-Archive manpower-portal-backup-YYYY-MM-DD.zip -DestinationPath C:\restore
& "C:\Program Files\MongoDB\Server\7.0\bin\mongorestore.exe" `
    --uri "mongodb://localhost:27017" --drop C:\restore\mp_dump
Expand-Archive C:\restore\mp_uploads.zip -DestinationPath C:\manpower-portal\backend
# Restart your dev servers / services
```

---

## 4. Docker Compose — Full Stack

The recommended production topology is four containers: `backend`, `frontend`,
`nginx` (reverse proxy + TLS) and `mongo`.

**`docker-compose.yml`** (put next to your app directory):

```yaml
version: "3.9"

services:
  mongo:
    image: mongo:7
    restart: unless-stopped
    volumes:
      - mongo_data:/data/db
    environment:
      - MONGO_INITDB_DATABASE=cmes_mp_db

  backend:
    build: ./backend          # Dockerfile that installs requirements.txt then `uvicorn server:app --host 0.0.0.0 --port 8001`
    restart: unless-stopped
    depends_on: [mongo]
    environment:
      - MONGO_URL=mongodb://mongo:27017
      - DB_NAME=cmes_mp_db
      - CORS_ORIGINS=*
      - JWT_SECRET=change-me-in-production
      - ADMIN_EMAIL=superadmin@portal.com
      - ADMIN_PASSWORD=Admin@123
    volumes:
      - uploads_data:/app/backend/uploads

  frontend:
    build: ./frontend         # Dockerfile that runs `yarn build` and serves via `serve -s build -l 3000`
    restart: unless-stopped
    environment:
      - REACT_APP_BACKEND_URL=https://api.yourdomain.com

  nginx:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - ./certs:/etc/nginx/certs:ro
    depends_on: [backend, frontend]

volumes:
  mongo_data:
  uploads_data:
```

**`nginx.conf`** (minimal reverse proxy):

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate     /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;

    # Frontend
    location / {
        proxy_pass http://frontend:3000;
        proxy_set_header Host $host;
    }

    # Backend API
    location /api/ {
        client_max_body_size 25m;   # upload docs
        proxy_pass http://backend:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**Backup a running Docker stack:**

```bash
# 1. Dump MongoDB from inside the mongo container
docker exec -it $(docker-compose ps -q mongo) \
    mongodump --uri mongodb://localhost:27017 --db cmes_mp_db --archive > mp_db.archive

# 2. Copy the uploads volume out to a local tarball
docker run --rm -v manpower-portal_uploads_data:/data -v $(pwd):/backup \
    alpine tar -czf /backup/mp_uploads.tgz -C /data .
```

**Restore into a running Docker stack:**

```bash
# 1. Import the DB archive
cat mp_db.archive | docker exec -i $(docker-compose ps -q mongo) \
    mongorestore --uri mongodb://localhost:27017 --drop --archive

# 2. Repopulate the uploads volume
docker run --rm -v manpower-portal_uploads_data:/data -v $(pwd):/backup \
    alpine sh -c "cd /data && tar -xzf /backup/mp_uploads.tgz"

# 3. Restart services so caches clear
docker-compose restart backend frontend
```

---

## 5. Moving to a New Host — Full Checklist

1. **Take a backup** using either §1 (in-app) or §2/§3 (mongodump).
2. Copy the app source (`backend/`, `frontend/`, `docker-compose.yml`) to the new host.
3. On the new host, adjust these environment variables:
   - `backend/.env` → `MONGO_URL`, `DB_NAME`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `CORS_ORIGINS`
   - `frontend/.env` → `REACT_APP_BACKEND_URL` (public URL of the backend)
4. Install dependencies:
   - Linux/Windows bare-metal: `pip install -r backend/requirements.txt && cd frontend && yarn install`
   - Docker: `docker-compose build`
5. Start services:
   - Linux: `sudo supervisorctl restart backend frontend` (or systemd units)
   - Windows: `uvicorn server:app --host 0.0.0.0 --port 8001` + `yarn start`
   - Docker: `docker-compose up -d`
6. Restore the backup via §1 (Settings → Restore) or via mongorestore.
7. Log in as super_admin → Settings → verify every tab (Manpower Form, Uploads, Email Alerts, Regions) shows the migrated data.

---

## 6. Retention Recommendation

- Daily automated ZIP via the in-app endpoint, kept for 7 days
- Weekly full-stack `mongodump` copied off-host, kept for 4 weeks
- Monthly cold copy to object storage (S3 / Backblaze B2), kept for 12 months
