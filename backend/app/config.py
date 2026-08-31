"""Environment-driven configuration and shared constants."""
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / '.env')

# Env-driven
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ['JWT_SECRET']
ADMIN_EMAIL = os.environ.get('ADMIN_EMAIL', 'superadmin@portal.com').lower()
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'Admin@123')
UPLOAD_DIR = Path(os.environ.get('UPLOAD_DIR', str(ROOT_DIR / 'uploads')))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
CORS_ORIGINS = os.environ.get('CORS_ORIGINS', '*').split(',')

JWT_ALGORITHM = "HS256"
ROLES = ("super_admin", "admin", "vendor_admin", "member", "manpower")
ALLOWED_EXT = {".pdf", ".jpg", ".jpeg", ".png"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
COMPLIANCE_DOC_KEYS = ("esi", "pf", "msme", "gst")

# Default form config seeds
DEFAULT_MANPOWER_FORM = {
    "key": "manpower",
    "sections": [
        {"title": "Personal", "fields": [
            {"key": "full_name", "label": "Full Name", "type": "text", "required": True, "system": True},
            {"key": "phone", "label": "Phone Number", "type": "tel", "system": True},
            {"key": "blood_group", "label": "Blood Group", "type": "select", "system": True,
             "options": ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]},
            {"key": "reporting_manager_email", "label": "Reporting Manager Email", "type": "email", "system": True},
        ]},
        {"title": "Medical", "fields": [
            {"key": "medical_test_date", "label": "Medical Test Date", "type": "date", "system": True},
            {"key": "medical_expiry_date", "label": "Medical Expiry Date", "type": "date", "system": True},
            {"key": "height_work_expiry_date", "label": "Height Work Certificate Expiry", "type": "date", "system": True},
            {"key": "safety_belt_expiry_date", "label": "Safety Belt Certificate Expiry", "type": "date", "system": True},
        ]},
        {"title": "Address", "fields": [
            {"key": "company_name", "label": "Company Name (auto from Contractor)", "type": "text", "system": True, "readonly": True},
            {"key": "street_address", "label": "Street Address", "type": "text", "system": True},
            {"key": "city", "label": "City", "type": "text", "system": True},
            {"key": "state", "label": "State", "type": "text", "system": True},
            {"key": "postal_code", "label": "Postal Code", "type": "text", "system": True},
            {"key": "location", "label": "Location (Site)", "type": "text", "system": True},
        ]},
        {"title": "Work", "fields": [
            {"key": "reporting_cluster_manager", "label": "Reporting Cluster Manager", "type": "cluster_manager", "system": True},
            {"key": "work_state", "label": "Work State", "type": "text", "system": True},
            {"key": "designation", "label": "Designation", "type": "text", "system": True},
            {"key": "subvendor", "label": "Subvendor", "type": "text", "system": True},
            {"key": "reference", "label": "Reference", "type": "text", "system": True},
            {"key": "contractor_id", "label": "Contractor", "type": "contractor", "system": True},
            {"key": "assigned_member_id", "label": "Assigned Member", "type": "member", "system": True, "admin_only": True},
        ]},
    ],
}

DEFAULT_COMPLIANCE_FORM = {
    "key": "compliance",
    "sections": [
        {"title": "ESI", "doc_key": "esi", "fields": [
            {"key": "esi_number", "label": "ESI Registration Number", "type": "text", "system": True},
            {"key": "esi_expiry_date", "label": "ESI Expiry Date", "type": "date", "system": True},
        ]},
        {"title": "PF", "doc_key": "pf", "fields": [
            {"key": "pf_number", "label": "PF Establishment Code", "type": "text", "system": True},
            {"key": "pf_expiry_date", "label": "PF Expiry Date", "type": "date", "system": True},
        ]},
        {"title": "MSME", "doc_key": "msme", "fields": [
            {"key": "msme_number", "label": "MSME / Udyam Number", "type": "text", "system": True},
            {"key": "msme_expiry_date", "label": "MSME Expiry Date", "type": "date", "system": True},
        ]},
        {"title": "GST", "doc_key": "gst", "fields": [
            {"key": "gst_number", "label": "GSTIN", "type": "text", "system": True},
            {"key": "gst_expiry_date", "label": "Filing Valid Till", "type": "date", "system": True},
        ]},
    ],
}

# Contractor form lives in its own module to keep this file lean
from app.forms_contractor import DEFAULT_CONTRACTOR_FORM  # noqa: E402,F401

FORM_KEYS = ("manpower", "compliance", "contractor")
