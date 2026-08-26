# 10 - Static Assets & Document File Hierarchy

## Document Upload Strategy

All uploaded files (Manpower photos, medical certificates, height work certificates, contractor ESI/PF/MSME/GST documents) are saved into organized filesystem directories with sanitization and mirrored to optional FTP backup targets.

---

## Directory Organization Structure

```
backend/uploads/
├── {contractor_slug}/
│   └── {year}/
│       └── {month:02d}/
│           ├── {manpower_id_or_uuid}/
│           │   ├── photo_1782484694.jpeg
│           │   ├── medical_certificate_1782484700.pdf
│           │   ├── height_work_certificate_1782484710.pdf
│           │   └── medical_certificate_archived_1782484700.pdf
│           └── contractor_compliance/
│               ├── esi_certificate_1782485000.pdf
│               └── pf_certificate_1782485010.pdf
```

---

## File Upload Rules & Validation
- **Allowed File Extensions**: `.pdf`, `.png`, `.jpg`, `.jpeg`, `.webp`.
- **Maximum File Size**: 10 MB per file.
- **Sanitisation**: Filenames are sanitized via `slugify()` to eliminate special characters and path traversal risks (`../`).
- **File Access Security**: Files are served through authenticated streaming routes (`/api/documents/{doc_id}`) verifying JWT token via `?token=` parameter or `Authorization` header.
