"""Default form-config seed for Contractor entity (dynamic builder)."""

DEFAULT_CONTRACTOR_FORM = {
    "key": "contractor",
    "sections": [
        {"title": "Basic Info", "fields": [
            {"key": "name", "label": "Name", "type": "text", "required": True, "system": True},
            {"key": "contact_person", "label": "Contact Person", "type": "text", "system": True},
            {"key": "phone", "label": "Phone", "type": "tel", "system": True},
            {"key": "email", "label": "Email", "type": "email", "system": True},
            {"key": "address", "label": "Address", "type": "textarea", "system": True},
        ]},
    ],
}
