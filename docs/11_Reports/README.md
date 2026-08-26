# 11 - Reports & Analytics Engine

## Reporting Module Architecture

The reporting module (`backend/app/routes/reports.py`) provides real-time aggregation and structured data exports for compliance officer auditing.

---

## 1. Summary Aggregations (`/api/reports/summary`)
Returns multi-dimensional counts grouped by:
- **Contractor**: Worker totals per contractor.
- **Region**: Worker totals per region (enforcing user region scope).
- **Location / Site**: Site-specific manpower deployment counts.
- **Compliance Status**: Active, Expiring Soon (<30d), Expired, Renewal Pending.

---

## 2. CSV Data Export Engine (`/api/reports/export-csv`)
Generates structured CSV files for compliance reports containing the following fields:

```csv
manpower_id,full_name,contractor_id,assigned_member_id,region,location,designation,phone,medical_expiry_date,status,display_status,created_at
MEK-2026-000001,Prem Kumar,ACME Infra,Member Admin,South,Site A,Safety Lead,+919876543210,2027-01-15,active,Active,2026-06-26T14:38:05Z
```

### Security & Region Scope Enforcement
- CSV export applies `filter_for_user(user)` so regional admins can only export records belonging to their assigned region scope.
- CSV values are sanitized against CSV Injection vulnerabilities.
