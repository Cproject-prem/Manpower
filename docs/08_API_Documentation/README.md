# 08 - API Documentation & Endpoint Reference

## Authentication & Authorization
All API endpoints require a JWT Bearer Token provided either via:
- `Authorization: Bearer <token>` HTTP Header.
- `access_token` HTTP-Only Cookie.
- `?token=<token>` Query Parameter (for document links / `<iframe>` / `<a>` downloads).

---

## Endpoint Reference Matrix

### Authentication Routes (`/api/auth`)
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Authenticate user & return JWT token | Public |
| `GET` | `/api/auth/me` | Return current authenticated user profile | Authenticated |
| `POST` | `/api/auth/logout` | Clear session cookie | Authenticated |

### Manpower Routes (`/api/manpower`)
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/manpower` | List manpower (supports query filters, region scope) | Authenticated |
| `GET` | `/api/manpower/stats` | Dashboard aggregated statistics | Authenticated |
| `GET` | `/api/manpower/:id` | Get manpower profile detail | Authenticated |
| `POST` | `/api/manpower` | Create new manpower registration draft | Member+ |
| `PUT` | `/api/manpower/:id` | Update manpower details / draft | Author / Admin |
| `POST` | `/api/manpower/:id/submit` | Transition draft to `pending_approval` | Author |
| `POST` | `/api/manpower/:id/approve` | Approve application & generate Manpower ID | Region Admin+ |
| `POST` | `/api/manpower/:id/reject` | Reject application with comment | Region Admin+ |
| `POST` | `/api/manpower/:id/renewal/submit`| Submit certificate renewal request | Member+ |
| `POST` | `/api/manpower/:id/renewal/approve`| Approve renewal, bump expiry & archive doc | Region Admin+ |
| `POST` | `/api/manpower/:id/renewal/reject` | Reject renewal request | Region Admin+ |

### Contractor Routes (`/api/contractors`)
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/contractors` | List contractors | Vendor Admin+ |
| `POST` | `/api/contractors` | Create contractor record | Admin+ |
| `PUT` | `/api/contractors/:id` | Update contractor details & ID format template | Admin+ |
| `POST` | `/api/contractors/:id/compliance-documents` | Upload compliance doc (ESI/PF/MSME/GST) | Vendor Admin+ |
| `GET` | `/api/contractors/:id/compliance-documents/:doc_id` | Download/View compliance document | Authenticated |
| `POST` | `/api/contractors/:id/compliance-documents/:doc_id/approve` | Approve compliance doc (triggers Vendor ID) | Region Admin+ |

### Reports & System (`/api/reports`, `/api/audit-logs`)
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/reports/summary` | Generate aggregated report summary | Member+ |
| `GET` | `/api/reports/export-csv` | Download CSV report export | Member+ |
| `GET` | `/api/audit-logs` | Retrieve system audit log history | Super Admin |
