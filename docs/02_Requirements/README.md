# 02 - System Requirements & Prerequisites

## Functional Requirements

### 1. Workforce & Registration Management
- Multi-step manpower onboarding (Draft -> Pending Approval -> Active).
- Dynamic custom form fields per site/tenant configured via admin UI.
- Auto-generation of unique Manpower IDs based on customizable per-contractor templates (e.g., `CME-2026-000001`, `MP-{year}-{seq:06d}`).
- Support for on-role and off-role employment classifications.

### 2. Document & Compliance Lifecycle
- Upload and validation of mandatory safety certificates:
  - Medical Certificate & Medical Test Expiry
  - Height Work Certificate
  - Safety Belt Certificate
  - Extension Rope Certificate
  - PPE Register
- Document renewal workflow with automatic document archiving upon renewal approval.
- Contractor level compliance management (ESI, PF, MSME, GST certificates).

### 3. Region Scoping & Access Control
- Fine-grained role hierarchy (`super_admin`, `admin`, `vendor_admin`, `member`, `manpower`).
- Region scoping for Admin accounts restricting record visibility and approval authorization to assigned regions.
- Vendor Admin lock restricting registration and management strictly to their assigned contractor.

---

## Technical & Infrastructure Requirements

### Backend Environment
- **Python Runtime**: Python 3.10 or higher.
- **ASGI Server**: Uvicorn / Gunicorn.
- **Database**: MongoDB 6.0+ (Community or Enterprise Edition).
- **Dependencies**: Listed in `backend/requirements.txt` (FastAPI, Motor, PyJWT, passlib, bcrypt, aiosmtplib, Jinja2, etc.).

### Frontend Environment
- **Node Environment**: Node.js 20+ (Yarn or npm package manager).
- **Build Tool**: Vite 6.
- **UI Framework**: React 19, Tailwind CSS, shadcn/ui components.

---

## Environment Setup Matrix

| Parameter | Recommended Value (Dev) | Production Value |
| :--- | :--- | :--- |
| `MONGO_URL` | `mongodb://localhost:27017` | Cluster Connection URI |
| `DB_NAME` | `cmes_mp_db` | `cmes_mp_prod_db` |
| `JWT_SECRET` | `dev-secret-key-change-in-prod` | Cryptographically generated 256-bit key |
| `SMTP_HOST` | `smtp.gmail.com` | Corporate Mail Gateway |
| `REACT_APP_BACKEND_URL` | `http://localhost:8001` | `https://api.manpower.cmes.com` |
