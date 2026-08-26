# 07 - Database Schema & Data Models

## MongoDB Collections Overview

The system uses MongoDB as its primary data store. Below are the key collections and schemas.

---

## 1. `manpower` Collection

Stores worker profiles, status lifecycle, certificate expiry dates, and history.

```json
{
  "_id": ObjectId("6a3e8ecdb3098ecc769359a9"),
  "id": "cd40f29d-1652-4134-85e1-255e8347224c",
  "manpower_id": "CME-2026-000001",
  "full_name": "Prem Kumar",
  "status": "active",
  "roll_type": "on_role",
  "company_name": "ACME Infrastructure",
  "contractor_id": "b6b81d80-c2fb-4eb4-9b86-96f00a57a7eb",
  "vendor_id": "ACM2026",
  "region": "South",
  "location": "Site A",
  "designation": "Safety Officer",
  "phone": "+919876543210",
  "medical_test_date": "2026-01-15",
  "medical_expiry_date": "2027-01-15",
  "height_work_expiry_date": "2027-01-15",
  "safety_belt_expiry_date": "2027-01-15",
  "extension_rope_expiry_date": "2027-01-15",
  "ppe_register_expiry_date": "2027-01-15",
  "assigned_member_id": "85aada99-e810-4f66-a1c8-d80837b2c278",
  "documents": [
    {
      "id": "b3602c2f-aa77-4432-8a1a-f1a842e4fac5",
      "doc_type": "medical_certificate",
      "file_name": "medical_cert.pdf",
      "file_path": "ACME/2026/06/cd40f29d.../medical_1782484694.pdf",
      "uploaded_by": "85aada99...",
      "uploaded_at": "2026-06-26T14:38:14.078Z",
      "size": 53226
    }
  ],
  "approval_history": [
    {
      "action": "approved",
      "by": "Admin User",
      "by_email": "admin@cmes.com",
      "by_id": "admin_uuid",
      "at": "2026-06-26T14:38:35.656Z",
      "comment": "Approved following document verification"
    }
  ],
  "extra_fields": {
    "shoe_size": "10",
    "emergency_contact": "9876543210"
  },
  "disabled": false,
  "created_at": "2026-06-26T14:38:05.800Z",
  "updated_at": "2026-07-17T05:08:15.238Z"
}
```

---

## 2. `contractors` Collection

Stores vendor metadata, ID sequence formats, and compliance documents.

```json
{
  "_id": ObjectId("..."),
  "id": "b6b81d80-c2fb-4eb4-9b86-96f00a57a7eb",
  "name": "ACME Infrastructure",
  "vendor_id": "ACM2026",
  "vendor_id_format": "ACM{year}",
  "id_format": "CME-{year}-{seq:06d}",
  "id_format_offroll": "CMEOFF-{year}-{seq:06d}",
  "region": "South",
  "contact_person": "Rahul Sharma",
  "phone": "+919876543211",
  "email": "contact@acme.com",
  "compliance_documents": [
    {
      "id": "doc_uuid_1",
      "doc_type": "esi_certificate",
      "file_name": "esi.pdf",
      "status": "approved",
      "approved_by": "Super Admin",
      "approved_at": "2026-07-01T10:00:00Z"
    }
  ]
}
```

---

## 3. `users` Collection

```json
{
  "id": "admin_uuid",
  "email": "admin.south@cmes.com",
  "password_hash": "$2b$12$...",
  "name": "South Region Admin",
  "role": "admin",
  "region_scope": ["South"],
  "disabled": false
}
```

---

## 4. `audit_logs` Collection

```json
{
  "id": "audit_uuid",
  "user_id": "admin_uuid",
  "user_email": "admin.south@cmes.com",
  "user_name": "South Region Admin",
  "user_role": "admin",
  "action": "manpower.approve",
  "target": "cd40f29d-1652-4134-85e1-255e8347224c",
  "details": {
    "manpower_id": "CME-2026-000001",
    "region": "South"
  },
  "at": "2026-06-26T14:38:35.656Z"
}
```
