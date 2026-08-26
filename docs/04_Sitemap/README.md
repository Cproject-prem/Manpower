# 04 - Sitemap & Navigation Structure

## Application Route Map

```
/ (Root)
│
├── /login                         --> Authentication Page
│
├── /dashboard                     --> Executive & Compliance Dashboard
│
├── /manpower                      --> Manpower Listing & Management Table
│   ├── /new                       --> New Registration Form
│   └── /:id                       --> Manpower Profile Detail View
│
├── /contractors                   --> Contractor & Vendor Directory
│   └── /:id                       --> Contractor Compliance & ID Format Details
│
├── /documents                     --> Compliance Document Verification Center
│
├── /renewals                      --> Certificate Expiry & Renewal Queue
│
├── /reports                       --> Summary Aggregation & CSV Export Center
│
├── /vendor-evaluations            --> Contractor Performance & Scoring Matrix
│
├── /users                         --> User Management & Region Scope Config
│
├── /settings                      --> System Configuration & Dynamic Form Builder
│   ├── #forms                     --> Dynamic Form Fields Builder
│   ├── #regions                   --> Region Master Configuration
│   ├── #email                     --> SMTP & Email Notification Triggers
│   └── #controls                  --> System Maintenance & Global Toggles
│
└── /audit-logs                    --> Immutable Administrative Audit Trail
```

---

## Route Protection & Access Matrix

| Route | Minimum Required Role | Scoping Rules Applied |
| :--- | :--- | :--- |
| `/dashboard` | `manpower` | Region / Contractor / Member Scoped |
| `/manpower` | `manpower` | Filtered via `filter_for_user()` |
| `/manpower/new` | `member` | Auto-locks contractor for Vendor Admin / Member |
| `/manpower/:id` | `manpower` | Restricted to assigned/owned manpower |
| `/contractors` | `vendor_admin` | Scoped to own contractor for Vendor Admin |
| `/documents` | `manpower` | Region / Contractor Scoped |
| `/renewals` | `member` | Pending renewals filtered by access scope |
| `/reports` | `member` | Aggregates based on user region/contractor scope |
| `/vendor-evaluations`| `vendor_admin` | Viewable per contractor |
| `/users` | `vendor_admin` | Vendor Admins can manage member/manpower accounts |
| `/settings` | `super_admin` | System-wide administrative controls |
| `/audit-logs` | `super_admin` | Complete audit log access |
