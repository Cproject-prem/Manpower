"""All Pydantic request/response models."""
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: Literal["admin", "vendor_admin", "member", "manpower"]
    contractor_id: Optional[str] = None
    phone: Optional[str] = None
    region: Optional[str] = None              # Assigned Region dropdown for Admin users
    region_scope: Optional[List[str]] = None  # For role="admin": empty/None = all regions


class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[Literal["admin", "vendor_admin", "member", "manpower"]] = None
    contractor_id: Optional[str] = None
    phone: Optional[str] = None
    disabled: Optional[bool] = None
    region: Optional[str] = None
    region_scope: Optional[List[str]] = None


class PasswordReset(BaseModel):
    new_password: str


class ContractorIn(BaseModel):
    name: str
    address: Optional[str] = ""
    contact_person: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    id_format: Optional[str] = None            # On-role ID template
    id_format_offroll: Optional[str] = None    # Off-role ID template
    vendor_id_format: Optional[str] = None     # Vendor ID template e.g. "ABC2026" or leave blank for auto
    extra_fields: Optional[dict] = None


class ManpowerIn(BaseModel):
    model_config = ConfigDict(extra="allow")
    full_name: str
    medical_test_date: Optional[str] = None
    medical_expiry_date: Optional[str] = None
    height_work_expiry_date: Optional[str] = None
    safety_belt_expiry_date: Optional[str] = None
    extension_rope_expiry_date: Optional[str] = None
    ppe_register_expiry_date: Optional[str] = None
    company_name: Optional[str] = ""
    street_address: Optional[str] = ""
    city: Optional[str] = ""
    state: Optional[str] = ""
    postal_code: Optional[str] = ""
    phone: Optional[str] = ""
    blood_group: Optional[str] = ""
    reporting_cluster_manager: Optional[str] = ""
    work_state: Optional[str] = ""
    designation: Optional[str] = ""
    subvendor: Optional[str] = ""
    reporting_manager_email: Optional[str] = ""
    reference: Optional[str] = ""
    location: Optional[str] = ""
    region: Optional[str] = ""
    roll_type: Optional[Literal["on_role", "off_role"]] = "on_role"
    contractor_id: Optional[str] = None
    assigned_member_id: Optional[str] = None
    user_id: Optional[str] = None
    extra_fields: Optional[dict] = None


class RenewalSubmitIn(BaseModel):
    doc_type: Literal[
        "medical_certificate", "height_work_certificate",
        "safety_belt_certificate", "extension_rope_certificate", "ppe_register",
    ]
    expiry_date: str
    test_date: Optional[str] = None


class ApprovalAction(BaseModel):
    comment: Optional[str] = ""


class ReassignIn(BaseModel):
    assigned_member_id: str


class SettingsIn(BaseModel):
    id_format: Optional[str] = None
    ftp_host: Optional[str] = None
    ftp_user: Optional[str] = None
    ftp_password: Optional[str] = None
    ftp_path: Optional[str] = None


class FormFieldIn(BaseModel):
    model_config = ConfigDict(extra="allow")
    key: str
    label: str
    type: str  # Allows 'cluster_manager', 'select', 'text', 'location', 'region', 'member', 'contractor', 'date', etc.
    required: Optional[bool] = False
    options: Optional[List[str]] = None
    system: Optional[bool] = False
    readonly: Optional[bool] = False
    admin_only: Optional[bool] = False


class FormSectionIn(BaseModel):
    title: str
    doc_key: Optional[str] = None
    fields: List[FormFieldIn]


class FormConfigIn(BaseModel):
    sections: List[FormSectionIn]


class ContractorComplianceUpdate(BaseModel):
    compliance: dict


# ==================== Email Alerts ====================

class EmailTemplateIn(BaseModel):
    subject: Optional[str] = None
    body: Optional[str] = None
    enabled: Optional[bool] = True


class EmailSettingsIn(BaseModel):
    enabled: Optional[bool] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    from_email: Optional[str] = None
    from_name: Optional[str] = None
    use_tls: Optional[bool] = None
    start_tls: Optional[bool] = None
    extra_recipients: Optional[List[str]] = None
    include_member_email: Optional[bool] = None
    include_manpower_email: Optional[bool] = None
    portal_url: Optional[str] = None
    templates: Optional[dict] = None  # {event_key: {subject, body, enabled}}
    # Expiry reminder scheduler
    reminder_enabled: Optional[bool] = None
    reminder_window_days: Optional[int] = None
    reminder_hour_utc: Optional[int] = None
    reminder_docs: Optional[List[str]] = None


class EmailTestIn(BaseModel):
    to_email: EmailStr


# ==================== Regions ====================

class RegionsIn(BaseModel):
    regions: List[str]


# ==================== Vendor Evaluations ====================

class VendorEvalCreate(BaseModel):
    title: str
    period: Optional[str] = ""
    contractor_id: str
    region: Optional[str] = None


class VendorEvalMapping(BaseModel):
    weightage_col: Optional[str] = None   # column key
    actual_col: Optional[str] = None
    max_col: Optional[str] = None
    description_cols: Optional[List[str]] = None


class VendorEvalUpdate(BaseModel):
    title: Optional[str] = None
    period: Optional[str] = None
    contractor_id: Optional[str] = None
    region: Optional[str] = None
    columns: Optional[List[dict]] = None    # [{key, label}]
    rows: Optional[List[dict]] = None       # nested rows with sub_rows
    column_mapping: Optional[dict] = None
