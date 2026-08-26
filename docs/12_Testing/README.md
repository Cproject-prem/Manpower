# 12 - Testing & Quality Assurance Strategy

## Automated Test Suites

The project maintains test coverage across backend API routes, authentication workflows, region scoping, and frontend component builds.

---

## 1. Backend Integration Tests (`pytest`)
Tests are located in `backend/tests/` or executed via standalone pytest runners.

### Running Backend Tests
```bash
cd backend
pytest -v
```

### Test Scenarios Covered
- **Auth & JWT**: Valid login, bad credentials, token expiry, role enforcement.
- **Region Scoping**: Verifying that an admin with `region_scope = ["South"]` cannot access or approve records in `"North"`.
- **Manpower Lifecycle**: Creation, draft submission, admin approval, auto ID generation.
- **Contractor Compliance**: Vendor ID generation trigger upon approval of all compliance documents.
- **Audit Logging**: Confirming that approval and rejection events log `user_name` accurately.

---

## 2. Frontend Build & Type Validation
```bash
cd frontend
yarn build    # Runs Vite production bundling and syntax checks
```

---

## Manual QA Verification Checklists
- [x] Login with Super Admin credentials (`superadmin@portal.com`).
- [x] Create a new Admin user with assigned `region_scope = ["South"]`.
- [x] Login as South Admin and verify inability to see or approve North region records.
- [x] Register new Manpower record and verify Vendor ID propagation.
- [x] Upload, view, and renew medical certificates.
- [x] Export CSV report and verify exported data fields.
