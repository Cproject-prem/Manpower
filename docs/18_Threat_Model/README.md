# 18 - Threat Model & Vulnerability Analysis

## STRIDE Threat Risk Matrix

| Threat Category | Potential Risk | Mitigation Controls Implemented |
| :--- | :--- | :--- |
| **Spoofing** | Unauthorized token forgery or session hijacking | JWT token signed with strong 256-bit secret key; bcrypt password hashing; HTTP-only cookie support. |
| **Tampering** | Parameter manipulation to access records outside region | Server-side validation via `filter_for_user()` and `check_region_scope()` on every API request. |
| **Repudiation** | Denying approval or document modification actions | Immutable audit log collection (`audit_logs`) recording user ID, full name, email, IP action, and timestamp. |
| **Information Disclosure** | Leakage of worker personal details or certificates | Document access protected by JWT authentication token; path traversal prevented via filename slugification. |
| **Denial of Service** | Resource exhaustion via large file uploads | Strict 10 MB payload limits enforced by FastAPI middleware and server configuration. |
| **Elevation of Privilege** | Member user attempting to execute Admin approvals | Role verification guards (`require_roles("super_admin", "admin")`) enforced on FastAPI backend endpoints. |
