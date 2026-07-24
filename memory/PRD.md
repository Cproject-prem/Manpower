# Manpower Management & Medical Certificate Approval Portal — PRD

## Original Problem Statement
Replace existing JotForm process with a production-ready web app for managing manpower registration, document uploads, approvals, and annual medical certificate renewals across contractors and members.

## Stack (constraint-adjusted)
- Frontend: **Vite 6 + React 19** + Tailwind + shadcn/ui (Cabinet Grotesk + IBM Plex Sans). Migrated from CRA/CRACO in iter-11 — `yarn dev` / `yarn build` now run cleanly on Node 20+. Path alias `@ → src` and env-var compatibility (`REACT_APP_*` via `process.env`) preserved.
- Backend: FastAPI (Python) on port 8001, all routes under `/api`. Modular under `backend/app/`.
- Database: MongoDB (Motor async driver)
- File storage: Local disk (primary) with optional FTP mirror (`backend/app/storage.py`) under `/app/backend/uploads/<Contractor>/<Year>/<Month>/<MP-ID>/`
- Auth: JWT in httpOnly cookies + Bearer header fallback, bcrypt password hashing

## Roles & Permissions
| Role | Capabilities |
|---|---|
| **Super Admin** | Everything: users, contractors, settings, form builder, reports, audit logs, reassign manpower |
| **Admin** | Approve/reject manpower, manage users (incl. vendor_admin), view all, link manpower users, edit, manage form builder + settings |
| **Vendor Admin** (NEW) | Scoped to one contractor: create/manage Members & Manpower users; view/upload compliance docs (ESI/PF/MSME/GST) for own contractor. No settings/form-builder/other-contractor access. |
| **Member** | Create/edit own manpower (until approval), upload docs, submit, monitor |
| **Manpower** | View only own record; upload each doc once; re-upload MC only within 30 days of expiry |

## Implemented (initial release)
- ✅ JWT cookie auth + bcrypt + seeded Super Admin (`superadmin@portal.com / Admin@123`)
- ✅ User CRUD (Super Admin), password reset, enable/disable
- ✅ Contractor CRUD
- ✅ Manpower CRUD with status workflow (draft → pending_approval → active/rejected)
- ✅ Auto-generated permanent Manpower ID `MP-YYYY-000001` (configurable format)
- ✅ Document upload to disk (PDF/JPG/JPEG/PNG, 10MB max) with folder structure
- ✅ Approve / Reject with comments; admin_comments history
- ✅ Annual Medical Certificate renewal flow
- ✅ Manpower-role upload restrictions: once-per-doc-type; renewal allowed only within 30 days of expiry
- ✅ Dashboard with KPI cards
- ✅ Searchable / filterable manpower table with sort, pagination
- ✅ In-app notifications
- ✅ Reports: summary by contractor/member/location + CSV export
- ✅ Settings + Audit logs

## Implemented (deferred-features release, Jan 2026)
- ✅ **Dynamic Form Builder** — Admin/Super Admin can add/remove/reorder custom fields (text, email, tel, date, number, textarea, select) for the Manpower form via Settings → Form Builder tab. System fields are locked & cannot be removed. Custom field values persisted in `extra_fields` map on each manpower record; displayed in Profile Details tab and editable via Edit dialog.
- ✅ **Contractors / Compliance page** — `/contractors` lists all contractors with ESI/PF/MSME/GST status badges. Detail page `/contractors/:id` allows uploading 4 doc slots + metadata (registration number, expiry date) for each compliance type. Compliance form is also editable via Form Builder (Settings → Compliance Form tab) but with locked section structure.
- ✅ **vendor_admin role** — scoped to a single contractor; can create/manage Members & Manpower users for that contractor + upload/manage compliance docs for that contractor; cannot access Settings, Form Builder, or other contractors.

## Implemented (iteration 18 — Cross-origin auth + Print/PDF fix, Jan 2026)
- ✅ **Bearer token + localStorage** — login response is now stored in `localStorage.cmes_token`; an axios request interceptor attaches `Authorization: Bearer <token>` to every API call. Fixes the `/auth/me` 401 users saw when running frontend on `:3000` and backend on `:8001` locally (SameSite=Lax cookies aren't sent cross-port from XHR).
- ✅ **401 → auto-clear** — response interceptor clears the stale token so ProtectedRoute bounces the user cleanly to /login.
- ✅ **Signed-URL query param** for `<img>` / `<a>` — backend `get_current_user` now also accepts `?token=<jwt>` (in addition to cookie + Authorization header). Frontend `lib/api.docUrl(id)` builds the URL with the current token. This is what makes `<img>` documents load cross-origin (localhost) without pre-loading blobs.
- ✅ **Print / Save PDF** — image documents in the print view now use `docUrl()` (with token) as their `src`. `handlePrint()` still preloads them and waits for `img.complete` before calling `window.print()`.
- ✅ Reload keeps the user logged in in dev (verified: token survives a full page reload).

## Implemented (iteration 17 — Retroactive renumber on format change, Jan 2026)
- ✅ **Format change now retroactively renumbers existing manpower** under that contractor (super_admin only). `PUT /api/contractors/{cid}` detects a changed `id_format`, resets the per-contractor+year counter, iterates approved manpower in `created_at` ascending order, stamps new IDs, and preserves the old ID in `manpower.manpower_id_history[]` for audit.
- ✅ New approvals continue the sequence from where the renumber left off (verified: after renumbering 3 records to MW-2026-0001..3, the next approval produced MW-2026-0004).
- ✅ Idempotent: saving the same format does not trigger renumbering. Clearing back to global default (empty format) also does NOT retroactively rename existing IDs (safety guard).
- ✅ Frontend confirm-dialog on the "Save Format" button warns about the mass-rename; toast reports `N records renumbered`.
- ✅ Response includes `_renumber: {updated, total_considered, mapping[]}` for UI feedback.

## Implemented (iteration 16 — Reset sequence + header context, Jan 2026)
- ✅ **Reset sequence action** (`POST /api/contractors/{cid}/reset-sequence`, super_admin only). Resets `counters.manpower_{year}_{cid}` to 0 so the next approval starts back at `#000001`. Existing manpower IDs are untouched. Visible as a red "Reset sequence" button on the Contractor detail → Manpower ID Format panel, only when the contractor has a custom `id_format` and the caller is super_admin. Includes a confirm dialog with a rendered preview of the next ID.
- ✅ **Header now shows contractor + role** for every user. `/api/auth/login` and `/api/auth/me` now enrich the user with `contractor_name` (looked up from `contractor_id`). Layout header renders "<Name>" + subtitle "<Contractor> · <Role>" (or just "<Role>" for super_admin). Dropdown menu also shows the contractor line with a building icon.
- ✅ **Confirmed member-level isolation** (no code changes needed — backend already correct): Alice (member of Acme) and Bob (member of Acme) can only see their own submissions; direct cross-access `GET /manpower/{other-member-id}` returns 404. Vendor_admin sees both, super_admin sees all.

## Implemented (iteration 15 — Per-contractor ID formats + Dashboard Org widget, Jan 2026)
- ✅ **Per-contractor Manpower ID formats**: `contractor.id_format` (optional Python-style template) with **per-contractor+year sequence counter** (`counters.manpower_{year}_{cid}`). Falls back to global counter + global format when unset. Verified 3 contractors coexisting with different formats and independent sequences (`ME-2026-000001..3`, `MW-2026-0001..2`, `MP-2026-000001`).
- ✅ **Contractor detail → "Manpower ID Format" panel** (super_admin/admin only) with editable template, live "Next ID will be" preview, 6 preset chips (MP/ME/MW/slashed/4-digit/year-only) + "Use global default" reset. Save persists via `PUT /api/contractors/{cid}`.
- ✅ **GET /api/contractors/{cid}** now returns `next_id_preview` and `id_format_effective` so the UI can render an accurate preview against the current counter.
- ✅ **Dashboard "Organisation" widget** (all roles except manpower). New endpoint `GET /api/manpower/org-summary` returns scoped `{contractors: [{name, id_format, active_manpower, member_count, members[]}]}`. For super_admin/admin shows top 5 by active count with expandable rows; for vendor_admin/member shows only their own tenant. Each contractor row shows an amber pill with its custom `id_format` (if any) so the format is discoverable at a glance.

## Implemented (iteration 14 — Vendor Admin scoping polish, Jan 2026)
- ✅ **New Registration** now auto-preselects the vendor_admin's (and member's) own contractor, locks the `contractor_id` and `company_name` fields (`disabled=true`), and shows an amber banner "Registering under: <Acme Contractors> — this cannot be changed."
- ✅ Verified via UI screenshot + API tests: a vendor_admin cannot list, view or register under any other contractor. Any attempt to POST `manpower` with a different `contractor_id` is server-side overridden to the vendor_admin's own contractor.
- ✅ **Submitter email fix**: recipient resolver now also looks up `manpower.created_by` (the actual submitter) — previously only `assigned_member_id` was checked, which is often null.

## Implemented (iteration 13 — Nightly Expiry-Reminder Scheduler, Jan 2026)
- ✅ **Background scheduler** (`backend/app/scheduler.py`) started on FastAPI `on_startup`. Ticks every 60s; when UTC hour == `reminder_hour_utc` and today hasn't run yet, executes `run_expiry_reminders()`. Uses `asyncio.create_task`, single instance guarded.
- ✅ **New event `expiry_reminder`** wired into the existing email pipeline (aiosmtplib + Jinja2). Uses full context including new `days_left` placeholder.
- ✅ **Idempotent per (manpower, cert, expiry)** — after sending, marker stored in `manpower.reminders_sent[<cert>:<expiry_iso>]`. When the certificate is renewed (expiry changes), key changes → fresh reminder becomes eligible. Verified: 2nd run correctly skips already-sent; renewal of medical_expiry causes only medical to re-fire, other cert stays deduped.
- ✅ **Watched certificates configurable**: medical / height_work / safety_belt / extension_rope / ppe_register. Only `active` non-disabled manpower are scanned.
- ✅ **Manual "Run now"** endpoint `POST /api/settings/email/reminders/run` (super_admin) — bypasses hour+dedup schedule and returns `{inspected, sent, skipped_dedup, window_days, watched}` for troubleshooting.
- ✅ **Settings → Email Alerts → Nightly Expiry Reminders** UI section with: Enabled toggle, window (days), daily hour (UTC), per-cert switches, "Save & Run now" button. `expiry_reminder` template appears as the 8th tab in the Templates editor and honours the same `{{ manpower_name }} · {{ doc_type }} · {{ new_expiry }} · {{ days_left }}` placeholders.
- ✅ **Verified end-to-end** against a local debug SMTP server: 3 seeded manpower (10 days / 200 days / -5 days) → exactly the 10-day (medical) + 5-day (height_work) reminders sent to `assigned_member + manpower_user + reporting_manager_email + extra_recipients`.

## Implemented (iteration 12 — SMTP Email Alerts, Jan 2026)
- ✅ **Configurable email alerts** on manpower lifecycle events. Backend uses `aiosmtplib` + `Jinja2`. Fire-and-forget (`asyncio.create_task`); failures logged to `email_outbox` collection but never block API responses.
- ✅ **Events wired**: `manpower_submitted`, `manpower_approved`, `manpower_rejected`, `manpower_updated`, `renewal_submitted`, `renewal_approved`, `renewal_rejected`.
- ✅ **Settings → Email Alerts tab** (super_admin only) exposes: master enable toggle, SMTP host/port/username/password/from-email/from-name, TLS vs STARTTLS switches, extra-recipients list, include-member / include-manpower toggles, portal URL, per-event editable subject + HTML body (with placeholders), per-event enable toggle, save + "Send test email" + "Reset defaults" actions.
- ✅ **Recipients per event**: extra_recipients ∪ manpower.assigned_member.email ∪ manpower.user.email ∪ manpower.reporting_manager_email (dedup'd, lowercased, validated).
- ✅ **Placeholders in templates** (Jinja2): `{{ manpower_name }} {{ manpower_id_display }} {{ contractor }} {{ actor_email }} {{ status }} {{ doc_type }} {{ new_expiry }} {{ admin_comments }} {{ portal_url }}`.
- ✅ **Endpoints** (super_admin unless noted): `GET /api/settings/email`, `PUT /api/settings/email`, `POST /api/settings/email/test`, `POST /api/settings/email/reset-templates`, `GET /api/settings/email/outbox` (super_admin+admin).
- ✅ Password masked as `********` in GET; PUT preserves stored password when mask is echoed back.
- ✅ Added `aiosmtplib`, `Jinja2` to backend requirements.

## Implemented (iteration 10 — FTP + disable + dynamic contractor)
- ✅ **FTP storage adapter** (`backend/app/storage.py`): local disk remains primary; if FTP credentials are set in Settings → System, each new upload is mirrored to FTP via background-safe `asyncio.to_thread`. On app startup, a best-effort `reconcile_on_startup()` walks the local UPLOAD_DIR and uploads any files missing on FTP. Failures are logged but never block API responses. New endpoints: `POST /api/settings/ftp/test`, `POST /api/settings/ftp/reconcile` (super_admin only). UI: "Test FTP Connection" + "Reconcile to FTP" buttons added to Settings → System tab.
- ✅ **Disable / Re-enable** on Contractor and Manpower (admin/super_admin). Endpoints `POST /{contractors|manpower}/{id}/{disable|enable}`. Lists hide disabled by default; query param `?include_disabled=true` reveals them. Manpower `/stats` excludes disabled. UI: "Show disabled" checkbox + "disabled" badge + per-row Disable/Enable button on both list pages, plus a header toggle on ManpowerProfile.
- ✅ **Dynamic Contractor form** (third form-config key alongside `manpower` and `compliance`). System fields locked: name, contact_person, phone, email, address. Custom fields persist in `extra_fields` on each contractor. UI: new "Contractor Form" tab in Settings; Contractors → New Contractor dialog renders fields dynamically.

## Backend API additions (iteration 10)
- `POST /api/contractors/{cid}/disable` & `/enable` (super_admin/admin)
- `POST /api/manpower/{mid}/disable` & `/enable` (super_admin/admin)
- `POST /api/settings/ftp/test` (super_admin)
- `POST /api/settings/ftp/reconcile` (super_admin)
- `GET/PUT/POST(reset) /api/form-configs/contractor` (super_admin/admin)
- `GET /api/contractors?include_disabled=true` and `GET /api/manpower?include_disabled=true`

## Backend API additions (deferred-features release)
- `GET/PUT /api/form-configs/{key}` (key ∈ {manpower, compliance})
- `POST /api/form-configs/{key}/reset` (super_admin)
- `GET /api/contractors/{id}` (incl. compliance + compliance_documents)
- `PUT /api/contractors/{id}/compliance` (vendor_admin only for own contractor)
- `POST /api/contractors/{id}/compliance-documents` (doc_type ∈ esi/pf/msme/gst)
- `GET /api/contractors/{id}/compliance-documents/{doc_id}` (download)

## Test credentials
See `/app/memory/test_credentials.md`.

## Architecture
- **FastAPI backend modularised** (Jan 2026 refactor): `server.py` is now a 60-line entrypoint that wires routers from `backend/app/`:
  - `app/config.py` env + constants + default form-config seeds
  - `app/db.py` Mongo client + db handle
  - `app/utils.py` password/token + small helpers
  - `app/deps.py` auth dependencies (`get_current_user`, `require_roles`)
  - `app/schemas.py` Pydantic request models
  - `app/helpers.py` audit, notify, status, filter, manpower-id, contractor-access
  - `app/startup.py` idempotent seeding
  - `app/routes/{auth,users,contractors,manpower,documents,notifications,reports,settings,audit_logs,form_configs}.py`
- MongoDB collections: `users`, `contractors`, `manpower`, `counters`, `notifications`, `audit_logs`, `settings`, `form_configs`
- React Router with role-based ProtectedRoute and shared Layout
- Centralized API client `lib/api.js` with `withCredentials: true`

## Backlog (P0 → P2)
- **P1** Refactor `server.py` (1280 lines) into modules — ✅ done in earlier iter
- **P1** Email notifications (SMTP) — ✅ done in iter-12
- **P1** PDF export of reports (currently CSV)
- **P1** FTP storage adapter — ✅ done in iter-10
- **P2** Forgot/Reset password flow for non-admin users
- **P2** Encrypted-at-rest SMTP password (currently plaintext in settings collection, consistent with FTP creds)
- **P2** Retry / durable queue for email sends (currently BackgroundTasks-style fire-and-forget)
- **P2** Additional document categories with their own expiry workflow
- **P2** Excel export
- **P2** Bulk import via CSV
- **P2** Dynamic Form Builder UI improvements: drag-and-drop reordering; per-role field visibility

## Next Actions
- Point Settings → Email Alerts at a real SMTP provider (Gmail/O365/SendGrid SMTP), send test, then toggle **Enabled** ON.
- (Optional) Toggle **Nightly Expiry Reminders → Enabled** and confirm at least one manpower has a `medical_expiry_date` within the window; use "Save & Run now" to verify without waiting for the scheduled hour.
