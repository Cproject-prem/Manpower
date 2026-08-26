# 16 - Security Architecture & Compliance

## Security Architecture Overview

The system implements defense-in-depth security controls spanning authentication, authorization, data isolation, and input sanitization.

---

## Key Security Measures

### 1. Authentication & JWT Tokens
- User passwords are encrypted using `bcrypt` password hashing with cost factor 12.
- Authentication tokens are issued as HMAC-SHA256 signed JSON Web Tokens (JWT).
- Support for token passing via `Authorization: Bearer` headers, HTTP-Only cookies, or tokenized query parameters for direct file viewing (`?token=...`).

### 2. Authorization & Role-Based Access Control (RBAC)
- Strict endpoint protection enforced via FastAPI dependency guards (`require_roles(...)`).
- Granular permission matrix preventing low-privilege users (`member`, `manpower`) from executing admin actions.

### 3. Region Data Isolation & Scope Enforcement
- Data access query filters are enforced via `filter_for_user(user)` on all database queries.
- Region admins are constrained strictly to records matching their assigned `region_scope`.

### 4. File Upload & Storage Security
- MIME type verification and extension whitelist (`.pdf`, `.png`, `.jpg`, `.jpeg`, `.webp`).
- 10 MB strict file size limit.
- Filename sanitization via `slugify()` to prevent path traversal attacks (`../`).

### 5. Audit Trail & Non-Repudiation
- Immutable audit logging (`audit_logs` collection) records `user_id`, `user_email`, `user_name`, `user_role`, IP/action details, target IDs, and timestamp.
