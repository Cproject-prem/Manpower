# 15 - Version History & Change Log

## Release History

### v2.4.0 (2026-08-17) - Region Scope & Authentication Fixes
- **Feature**: Enforced strict region scope isolation for Admin users across approvals, list views, dashboards, and report exports.
- **Security**: Added `user_name` registration in all system audit logs.
- **Bug Fix**: Added `contractorDocUrl` helper with `?token=` authentication parameter to resolve `401 Unauthorized` errors when viewing contractor compliance documents in standard browser tabs.

### v2.3.0 (2026-08-05) - Dynamic Form & MongoDB Top-Level Mapping
- **Feature**: Added `designation` as a first-class field across schemas, backend models, frontend UI tables, and CSV exports.
- **Enhancement**: Enabled `ConfigDict(extra="allow")` in Pydantic models to automatically persist custom form fields directly to MongoDB.
- **Enhancement**: Filtered "Assigned Member" dropdown dynamically based on selected Contractor.

### v2.2.0 (2026-07-25) - Vendor ID Propagation & Compliance Workflow
- **Feature**: Automatic generation of `vendor_id` upon approval of all required contractor compliance documents (ESI, PF, MSME, GST).
- **Feature**: Auto-propagation of `vendor_id` to all associated manpower records in MongoDB.

### v2.1.0 (2026-07-20) - Per-Contractor ID Slabs & Renewal Archiving
- **Feature**: Per-contractor customizable ID formats for on-role and off-role workers.
- **Feature**: Document renewal workflow with automatic archiving of superseded certificates.

### v1.0.0 (2026-06-26) - Initial Portal Release
- Core Manpower registration, draft submission, admin approval, and JWT authentication.
