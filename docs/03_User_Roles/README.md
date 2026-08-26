# 03 - User Roles & Access Control Matrix

## Role Definitions & Hierarchy

```
       [ Super Admin ]
              │
         [ Admin ]  (Optional Region Scope)
              │
     [ Vendor Admin ] (Scoped to Contractor)
              │
        [ Member ]   (Field Registration Staff)
              │
       [ Manpower ]   (Worker Portal / Self View)
```

---

## Capabilities & Permissions Matrix

| Feature / Action | Super Admin | Admin | Vendor Admin | Member | Manpower |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Manage Users & System Settings** | ✅ Full | ❌ | ❌ | ❌ | ❌ |
| **Manage Form Builder & Regions** | ✅ Full | ❌ | ❌ | ❌ | ❌ |
| **Approve / Reject Registrations** | ✅ All Regions | ✅ Assigned Region Scope | ❌ | ❌ | ❌ |
| **Approve / Reject Document Renewals** | ✅ All Regions | ✅ Assigned Region Scope | ❌ | ❌ | ❌ |
| **Approve Contractor Compliance Docs** | ✅ All Regions | ✅ Assigned Region Scope | ❌ | ❌ | ❌ |
| **Create Manpower Registrations** | ✅ | ✅ | ✅ Own Contractor | ✅ Assigned Contractor | ❌ |
| **Edit Draft / Rejected Manpower** | ✅ | ✅ | ✅ Own Contractor | ✅ Created / Assigned | ❌ |
| **Upload Compliance Certificates** | ✅ | ✅ | ✅ Own Contractor | ✅ Created / Assigned | ❌ |
| **View Reports & Export CSV** | ✅ Global | ✅ Region Scoped | ✅ Own Contractor | ✅ Assigned Only | ❌ |
| **View Self Profile & Status** | ✅ | ✅ | ✅ | ✅ | ✅ Own Record |

---

## Region Scope Enforcement Logic
- **Super Admin**: Bypasses all region scope restrictions; has global administrative override.
- **Admin**: If `region_scope` is populated (e.g. `["South", "West"]`), the system filters all list views, reports, dashboards, and approval endpoints to records matching those regions. Attempting to approve a record outside the assigned scope returns `HTTP 403 Forbidden`.
- **Vendor Admin**: Locked strictly to `contractor_id`. Can manage manpower and upload compliance documents for their assigned contractor.
- **Member**: Can only view and edit manpower records created by or assigned to their account ID.
