# Manpower Management Portal (CMES_MP)

A full-stack, multi-tenant portal for contractor workforce management —
manpower registration, medical-certificate lifecycle, compliance documents,
per-contractor ID slabs, and transactional email alerts.

Built to replace fragmented JotForm + spreadsheet workflows with a single
system that stays honest under multiple contractors and thousands of records.

- **Frontend:** Vite 6 · React 19 · Tailwind · shadcn/ui · lucide-react · sonner
- **Backend:** FastAPI (Python 3.10+) · Motor (async MongoDB) · aiosmtplib · Jinja2
- **Storage:** MongoDB + local filesystem uploads (optional FTP mirror)
- **Auth:** JWT (cookie + Authorization header) · bcrypt password hashes

---

## Table of contents

1. [Quick start](#quick-start-local-development)
2. [What's inside — feature tour](#whats-inside--feature-tour)
3. [Roles & permissions](#roles--permissions)
4. [Repository layout](#repository-layout)
5. [Environment variables](#environment-variables)
6. [API surface (cheat sheet)](#api-surface-cheat-sheet)
7. [Email alerts & nightly reminders](#email-alerts--nightly-reminders)
8. [Per-contractor Manpower ID formats](#per-contractor-manpower-id-formats)
9. [Deployment notes](#deployment-notes)
10. [Troubleshooting](#troubleshooting)

---

## Quick start (local development)

### 1. Prerequisites

- **Node.js 20+** with `yarn` (npm works but the repo is developed with yarn)
- **Python 3.10+**
- **MongoDB** running locally on `mongodb://localhost:27017` (Community Edition)

### 2. Configure environment

```bash
git clone https://github.com/prem20097-lab/CMES_MP.git
cd CMES_MP

# Backend env
cp backend/.env.example backend/.env
# Optional: edit DB name, admin email/password, JWT secret

# Frontend env
cp frontend/.env.example frontend/.env
# REACT_APP_BACKEND_URL must point to your backend URL
```

### 3. Install dependencies

```bash
# Backend
cd backend
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Frontend (in another terminal)
cd frontend
yarn install
```

### 4. Run

```bash
# Backend
cd backend
uvicorn server:app --reload --host 0.0.0.0 --port 8001

# Frontend
cd frontend
yarn start           # runs Vite on :3000
```

On first startup the backend seeds a Super Admin from the values in
`backend/.env`. Default credentials are:

- **Email:** `superadmin@portal.com`
- **Password:** `Admin@123`

Change these in `.env` **before deploying**.

---

## What's inside — feature tour

### Manpower lifecycle
- **Draft → Pending approval → Active** with a per-contractor Manpower ID
  (e.g. `MP-2026-000001`) stamped on approval.
- **Renewal workflow** per document type (medical certificate, height-work
  certificate, safety-belt certificate, extension-rope, PPE register) —
  members upload the new document, admins approve, expiry is bumped and
  the previous document archived.
- **Dynamic form builder** (Settings → Forms) — admins can add/remove/reorder
  fields on the manpower, contractor, and compliance forms without a
  redeploy. Anything not native to the schema flows into `extra_fields`.

### Compliance for contractors
- Per-contractor ESI / PF / MSME / GST documents with expiry dates.
- Documents are stored locally and (optionally) mirrored to an FTP host.
- Compliance metadata is editable via the form builder.

### Multi-tenant scoping
- `super_admin` and `admin` see everything.
- `vendor_admin` sees only their own contractor + members + manpower.
- `member` sees only their own submissions — even other members of the
  same contractor cannot see them.
- `manpower` sees only their own linked record and can submit renewals.

Attempts to create/read/update outside one's scope return 404 or 403.

### Dashboard
- Six KPI cards (total, pending, active, expiring soon, expired, renewal
  pending) with role-scoped counts.
- **Organisation widget** — collapsible tree of contractors → members →
  active manpower counts. Each contractor row shows its custom ID format
  (if any). For super_admin/admin it's the top 5; for vendor_admin/member
  it's their own tenant only.
- Recent Manpower table with quick status badges.

### Notifications
- In-app notification bell (poll every 30s).
- Email alerts on 7 lifecycle events + nightly expiry reminders (see below).

### File uploads
- Multi-file upload per manpower with type classification (photo, id_proof,
  medical_certificate, safety_belt_certificate, height_work_certificate,
  extension_rope, ppe_register, other).
- 10MB max per file, `.pdf .jpg .jpeg .png` allowed.
- Optional FTP mirror on every upload (configured under Settings → System).

---

## Roles & permissions

| Ability                                | super_admin | admin | vendor_admin | member | manpower |
| -------------------------------------- | :---------: | :---: | :----------: | :----: | :------: |
| See all manpower                       |      ✅     |   ✅ |              |        |          |
| See own contractor's manpower          |      ✅     |   ✅ |      ✅      |        |          |
| See own submissions only               |             |       |              |   ✅    |          |
| See own record only                    |             |       |              |        |    ✅     |
| Approve / Reject                       |      ✅      |   ✅   |              |        |          |
| Renewal approval                       |      ✅      |   ✅   |              |        |          |
| Create contractors                     |      ✅      |   ✅   |              |        |          |
| Set / change per-contractor ID format  |      ✅      |   ✅   |              |        |          |
| Retroactive renumber existing manpower |      ✅      |       |              |        |          |
| Reset sequence counter                 |      ✅      |       |              |        |          |
| Create members / manpower users        |      ✅      |   ✅   |      ✅       |        |          |
| Configure email alerts                 |      ✅      |       |              |        |          |
| Configure FTP                          |      ✅      |       |              |        |          |
| View audit log                         |      ✅      |       |              |        |          |

---

## Repository layout

```
/app
├── backend/
│   ├── server.py              # FastAPI entrypoint (wires routes + startup)
│   ├── requirements.txt
│   └── app/
│       ├── config.py          # UPLOAD_DIR, allowed extensions, doc keys
│       ├── db.py              # Motor client
│       ├── deps.py            # get_current_user / require_roles
│       ├── helpers.py         # audit, notify, filter_for_user, next_manpower_id, fire_email
│       ├── email_service.py   # SMTP send + Jinja2 templates + outbox
│       ├── scheduler.py       # Nightly expiry-reminder background task
│       ├── schemas.py         # All Pydantic models
│       ├── startup.py         # Idempotent super_admin seed + scheduler bootstrap
│       ├── storage.py         # FTP mirror helper
│       ├── utils.py           # id / password / datetime / JWT helpers
│       └── routes/
│           ├── auth.py        # /auth/login, /auth/logout, /auth/me
│           ├── users.py       # user CRUD + password reset
│           ├── contractors.py # contractor CRUD + compliance docs + reset-sequence
│           ├── manpower.py    # manpower CRUD + submit/approve/reject + renewal + org-summary
│           ├── documents.py   # per-manpower file uploads + downloads
│           ├── form_configs.py # dynamic form definitions
│           ├── notifications.py
│           ├── settings.py    # /settings, /settings/email, /settings/ftp
│           ├── reports.py     # Workforce Deployment
│           └── audit_logs.py
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── App.js             # Router + route guards
│       ├── contexts/          # AuthContext
│       ├── lib/               # api client, formatters
│       ├── components/
│       │   ├── Layout.jsx     # Sidebar + header (with contractor pill)
│       │   ├── DynamicFormFields.jsx
│       │   ├── EmailAlertsSettings.jsx
│       │   ├── FormBuilder.jsx
│       │   ├── ManpowerPrintView.jsx
│       │   └── ui/            # shadcn primitives
│       └── pages/
│           ├── Login.jsx
│           ├── Dashboard.jsx        # KPIs + Org widget + Recent table
│           ├── ManpowerList.jsx
│           ├── ManpowerProfile.jsx  # profile + docs + renewal + approval history
│           ├── NewRegistration.jsx  # locks contractor for vendor_admin/member
│           ├── Renewals.jsx
│           ├── Documents.jsx
│           ├── Contractors.jsx
│           ├── ContractorDetail.jsx # per-contractor ID format + compliance
│           ├── Reports.jsx          # Workforce Deployment
│           ├── Users.jsx
│           └── Settings.jsx         # System, Forms, FTP, Email, Audit
└── memory/
    ├── PRD.md                 # Living record of iterations
    └── test_credentials.md
```

---

## Environment variables

### `backend/.env`

| Key              | Purpose                                                | Example                          |
| ---------------- | ------------------------------------------------------ | -------------------------------- |
| `MONGO_URL`      | Motor connection string                                | `mongodb://localhost:27017`      |
| `DB_NAME`        | Database name                                          | `cmes_mp_db`                     |
| `CORS_ORIGINS`   | Comma-separated allowed origins                        | `*` (dev) / `https://your.site`  |
| `JWT_SECRET`     | Signing key for auth tokens (rotate in production!)    | random 32+ char string           |
| `ADMIN_EMAIL`    | Seeded super_admin email (idempotent)                  | `superadmin@portal.com`          |
| `ADMIN_PASSWORD` | Seeded super_admin password (idempotent)               | `Admin@123`                      |

### `frontend/.env`

| Key                     | Purpose                                              |
| ----------------------- | ---------------------------------------------------- |
| `REACT_APP_BACKEND_URL` | Base URL the frontend calls. Must be reachable from users' browsers. |

---

## API surface (cheat sheet)

All routes are prefixed with `/api`.

### Auth
- `POST /api/auth/login` — `{ email, password }` → `{ token, user }` (user includes `contractor_name` when set)
- `POST /api/auth/logout`
- `GET /api/auth/me`

### Users
- `GET /api/users` — scoped by role
- `POST /api/users` — admin+ (vendor_admin restricted to `member` and `manpower` roles under their contractor)
- `PUT /api/users/{id}`
- `POST /api/users/{id}/reset-password`
- `DELETE /api/users/{id}` — super_admin only

### Contractors
- `GET /api/contractors` — scoped
- `POST /api/contractors` — admin+
- `GET /api/contractors/{cid}` — includes `id_format_effective` and `next_id_preview`
- `PUT /api/contractors/{cid}` — admin+; if `id_format` changes, existing manpower is renumbered
- `POST /api/contractors/{cid}/disable` / `enable`
- `POST /api/contractors/{cid}/reset-sequence` — super_admin only
- `POST /api/contractors/{cid}/compliance-documents` — multipart upload

### Manpower
- `GET /api/manpower` — paginated, scoped
- `GET /api/manpower/stats` — KPI counts
- `GET /api/manpower/org-summary` — Organisation widget data
- `POST /api/manpower`
- `PUT /api/manpower/{id}`
- `POST /api/manpower/{id}/submit`
- `POST /api/manpower/{id}/approve` — assigns next Manpower ID from contractor's format
- `POST /api/manpower/{id}/reject`
- `POST /api/manpower/{id}/renewal/submit` / `approve` / `reject`
- `POST /api/manpower/{id}/reassign`
- `POST /api/manpower/{id}/link-user`
- `POST /api/manpower/{id}/disable` / `enable`

### Documents
- `POST /api/manpower/{id}/documents` — multipart
- `GET /api/manpower/{id}/documents/{doc_id}` — download

### Form configs (Settings → Forms)
- `GET /api/form-configs/{key}` (`manpower` · `contractor` · `compliance`)
- `PUT /api/form-configs/{key}`

### Settings
- `GET /api/settings` / `PUT /api/settings` — id_format, FTP host/user/pass/path
- `GET /api/settings/email` / `PUT /api/settings/email` — SMTP + templates + toggles
- `POST /api/settings/email/test` — dry-run one message
- `POST /api/settings/email/reset-templates`
- `GET /api/settings/email/outbox?limit=50`
- `POST /api/settings/email/reminders/run` — trigger nightly job manually
- `POST /api/settings/ftp/reconcile` — mirror local files missing on FTP

### Audit / notifications
- `GET /api/audit-logs?limit=50`
- `GET /api/notifications`, `POST /api/notifications/read-all`

---

## Email alerts & nightly reminders

Configure at **Settings → Email Alerts** (super_admin only).

### 7 lifecycle events
| Event                | Fires when                                             |
| -------------------- | ------------------------------------------------------ |
| `manpower_submitted` | Draft is submitted for approval                        |
| `manpower_approved`  | Application approved (Manpower ID stamped)             |
| `manpower_rejected`  | Application rejected                                   |
| `manpower_updated`   | Already-submitted record is edited                     |
| `renewal_submitted`  | Renewal request submitted for any certificate          |
| `renewal_approved`   | Renewal approved (expiry bumped)                       |
| `renewal_rejected`   | Renewal rejected                                       |

### Nightly expiry reminder
- One asyncio background task started on FastAPI startup, ticks every 60s.
- When UTC hour equals `reminder_hour_utc` and today hasn't run yet, scans
  every `active` non-disabled manpower and sends `expiry_reminder` for any
  cert expiring within `reminder_window_days` (default 30).
- Dedup marker `manpower.reminders_sent[<cert>:<expiry_iso>]` — the same
  reminder never sends twice. When the cert is renewed the expiry changes
  → new key → fresh reminder becomes eligible.
- Manual "Save & Run now" button + `POST /api/settings/email/reminders/run`
  for on-demand testing.

### Templates
- Per-event editable **subject + HTML body** with Jinja2 placeholders:
  `{{ manpower_name }}`, `{{ manpower_id_display }}`, `{{ contractor }}`,
  `{{ actor_email }}`, `{{ status }}`, `{{ doc_type }}`, `{{ new_expiry }}`,
  `{{ days_left }}`, `{{ admin_comments }}`, `{{ portal_url }}`.
- Per-event enable toggle (disable a single event without turning off the master).
- "Reset defaults" button.

### Recipients
For every event the resolver produces the union of:
1. `extra_recipients` (comma/newline list in Settings)
2. The **submitter** (`manpower.created_by` → user email)
3. The **assigned member** (`manpower.assigned_member_id` → user email)
4. The **linked manpower user** (`manpower.user_id` → user email)
5. `manpower.reporting_manager_email` (a free-text field on the record)

Emails to invalid addresses are dropped; every send outcome (sent/failed)
is written to `email_outbox` for troubleshooting.

### SMTP config
- Host / port / username / password / from-email / from-name
- STARTTLS (port 587) vs Direct TLS (port 465) toggles
- Password is masked as `********` in `GET /settings/email`; sending the
  mask back preserves the stored password.

---

## Per-contractor Manpower ID formats

Each contractor can define its own template for the Manpower ID stamped at
approval time. This uses Python's `str.format` grammar with two placeholders:

- `{year}` — 4-digit year
- `{seq:0Nd}` — zero-padded sequence number (`N` digits)

### Presets shipped with the UI

| Preset              | Template                    | Example         |
| ------------------- | --------------------------- | --------------- |
| Default             | `MP-{year}-{seq:06d}`       | `MP-2026-000001` |
| Medical Emergency   | `ME-{year}-{seq:06d}`       | `ME-2026-000001` |
| Manpower Worker     | `MW-{year}-{seq:06d}`       | `MW-2026-000001` |
| Slashed             | `MP/{year}/{seq:06d}`       | `MP/2026/000001` |
| 4-digit             | `EMP-{year}-{seq:04d}`      | `EMP-2026-0001`  |
| Year only           | `{year}-{seq:06d}`          | `2026-000001`    |

You can also type any template that matches the two-placeholder grammar.

### Sequence isolation
Each contractor with a custom format gets its own counter
`counters.manpower_{year}_{contractor_id}`. Contractors without a custom
format share the global counter `counters.manpower_{year}` and the
global default from Settings → System.

### Retroactive renumber
When super_admin changes a contractor's format, **all existing approved
manpower under that contractor are automatically renumbered** to match
the new format:

- Iterates records in `created_at` ascending order (creation order preserved).
- Resets the per-year counters so IDs are dense and contiguous per year.
- Preserves the previous ID in `manpower.manpower_id_history: [{old_id, new_id, at}]`.
- New approvals after the rename continue from the last sequence used.

Clearing the format back to blank does **not** retroactively rename
existing IDs (safety guard). Use "Reset sequence" (super_admin only) if
you need to restart numbering from `#1` for a fresh year.

---

## Deployment notes

- Frontend and backend can live behind the same reverse proxy. Backend
  routes are all prefixed with `/api`.
- Set `JWT_SECRET` to a strong random string per environment.
- Rotate `ADMIN_PASSWORD` before exposing the portal publicly.
- Restrict `CORS_ORIGINS` to your production domain(s).
- Persist the `uploads/` folder (or configure FTP + `POST /settings/ftp/reconcile`).
- MongoDB requires an index on `manpower.contractor_id`, `manpower.status`,
  and `manpower.assigned_member_id` for scale — the app will still work
  without them, but list endpoints slow down past ~10k records.

Recommended stack: MongoDB Atlas M10+, backend on a small Python container
(`uvicorn server:app --workers 2`), frontend built with `yarn build` and
served as static files behind Nginx / Cloudfront.

---

## Troubleshooting

**Login fails with correct credentials**
- Confirm `superadmin@portal.com` matches your `backend/.env` value.
- Restart backend after changing `.env` — the seeder only runs on startup.

**"No module named aiosmtplib" or "jinja2"**
- New backend deps for email. Run `pip install -r requirements.txt`.

**Test email fails: `[Errno -2] Name or service not known`**
- SMTP host is wrong or unreachable. `smtp.gmail.com:587` with STARTTLS +
  a Gmail App Password is the safest default.

**Frontend shows "Loading..." forever after login**
- Check that `REACT_APP_BACKEND_URL` in `frontend/.env` is reachable from
  your browser and returns 200 on `GET /api/auth/me` when logged in.
- Vite serves the value at build time; restart `yarn start` after editing.

**Vendor admin sees other contractors**
- Confirm the vendor_admin's user document has `contractor_id` set. Look
  in `db.users.findOne({email: "..."})`. Reassign via the Users page or
  directly in Mongo.

**IDs don't match the format I set**
- Approval endpoint stamps the ID; the format is read from the contractor
  at that moment. Change the contractor's `id_format` before approving,
  or trigger a save (super_admin) to renumber existing records.

**Nightly reminder didn't fire**
- Check `db.email_outbox` — every attempt is logged.
- The scheduler only fires when `enabled=true`, `reminder_enabled=true`,
  and `smtp_host` is set. It also skips if today already ran; use
  `POST /api/settings/email/reminders/run` to test on-demand.

---

## License

Proprietary — internal use only unless otherwise agreed.
