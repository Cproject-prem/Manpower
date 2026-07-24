"""Backend tests for deferred features:
- Form Builder API (form-configs/manpower, form-configs/compliance)
- vendor_admin role: scoping for users/contractors
- Contractor compliance (metadata + ESI/PF/MSME/GST docs)
- extra_fields persistence on manpower
"""
import os
import io
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://contractor-view-docs.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

SUPER_EMAIL = "superadmin@portal.com"
SUPER_PASSWORD = "Admin@123"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    return r.json()["token"]


def _h(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def sa_token():
    return _login(SUPER_EMAIL, SUPER_PASSWORD)


@pytest.fixture(scope="session")
def test_contractor(sa_token):
    name = f"TEST_Contractor_{uuid.uuid4().hex[:6]}"
    r = requests.post(f"{API}/contractors", headers=_h(sa_token),
                      json={"name": name, "address": "addr", "contact_person": "p", "phone": "1", "email": "c@x.com"})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="session")
def other_contractor(sa_token):
    name = f"TEST_OtherContractor_{uuid.uuid4().hex[:6]}"
    r = requests.post(f"{API}/contractors", headers=_h(sa_token),
                      json={"name": name, "address": "a", "contact_person": "", "phone": "", "email": ""})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="session")
def vendor_admin_user(sa_token, test_contractor):
    email = f"TEST_va_{uuid.uuid4().hex[:6]}@example.com"
    payload = {"email": email, "password": "Va@12345", "name": "TEST VA",
               "role": "vendor_admin", "contractor_id": test_contractor["id"]}
    r = requests.post(f"{API}/users", headers=_h(sa_token), json=payload)
    assert r.status_code == 200, r.text
    return {"email": email, "password": "Va@12345", "id": r.json()["id"], "contractor_id": test_contractor["id"]}


@pytest.fixture(scope="session")
def va_token(vendor_admin_user):
    return _login(vendor_admin_user["email"], vendor_admin_user["password"])


# ---- Auth & seed ----
class TestAuth:
    def test_super_admin_login(self, sa_token):
        assert isinstance(sa_token, str) and len(sa_token) > 10

    def test_me(self, sa_token):
        r = requests.get(f"{API}/auth/me", headers=_h(sa_token))
        assert r.status_code == 200
        assert r.json()["role"] == "super_admin"


# ---- Form Builder ----
class TestFormBuilder:
    def test_get_manpower_form(self, sa_token):
        r = requests.get(f"{API}/form-configs/manpower", headers=_h(sa_token))
        assert r.status_code == 200
        cfg = r.json()
        assert cfg["key"] == "manpower"
        assert any(f["key"] == "full_name" and f.get("system") for s in cfg["sections"] for f in s["fields"])

    def test_get_compliance_form(self, sa_token):
        r = requests.get(f"{API}/form-configs/compliance", headers=_h(sa_token))
        assert r.status_code == 200
        cfg = r.json()
        keys = [s.get("doc_key") for s in cfg["sections"]]
        assert set(keys) == {"esi", "pf", "msme", "gst"}

    def test_add_custom_field_and_persist(self, sa_token):
        r = requests.get(f"{API}/form-configs/manpower", headers=_h(sa_token))
        cfg = r.json()
        # Add custom field 'aadhar_number' to last section (if not already)
        sections = cfg["sections"]
        first = sections[0]
        existing_keys = {f["key"] for s in sections for f in s["fields"]}
        if "test_aadhar_number" not in existing_keys:
            first["fields"].append({
                "key": "test_aadhar_number", "label": "Aadhar Number",
                "type": "text", "required": False, "system": False
            })
        body = {"sections": sections}
        r2 = requests.put(f"{API}/form-configs/manpower", headers=_h(sa_token), json=body)
        assert r2.status_code == 200, r2.text
        # Reload and check
        r3 = requests.get(f"{API}/form-configs/manpower", headers=_h(sa_token))
        cfg2 = r3.json()
        all_keys = {f["key"] for s in cfg2["sections"] for f in s["fields"]}
        assert "test_aadhar_number" in all_keys

    def test_cannot_remove_system_field(self, sa_token):
        r = requests.get(f"{API}/form-configs/manpower", headers=_h(sa_token))
        cfg = r.json()
        # Drop the 'full_name' field
        new_sections = []
        for s in cfg["sections"]:
            new_sections.append({
                "title": s["title"],
                "fields": [f for f in s["fields"] if f["key"] != "full_name"],
            })
        r2 = requests.put(f"{API}/form-configs/manpower", headers=_h(sa_token), json={"sections": new_sections})
        assert r2.status_code == 400, f"Should reject system removal, got {r2.status_code}: {r2.text}"

    def test_vendor_admin_cannot_edit_form(self, va_token, sa_token):
        r = requests.get(f"{API}/form-configs/manpower", headers=_h(sa_token))
        cfg = r.json()
        r2 = requests.put(f"{API}/form-configs/manpower", headers=_h(va_token),
                          json={"sections": cfg["sections"]})
        assert r2.status_code == 403


# ---- Manpower extra_fields ----
class TestManpowerExtraFields:
    def test_create_manpower_with_extra_fields(self, sa_token, test_contractor):
        body = {
            "full_name": "TEST_DynamicField",
            "contractor_id": test_contractor["id"],
            "extra_fields": {"test_aadhar_number": "1234-5678-9012"},
        }
        r = requests.post(f"{API}/manpower", headers=_h(sa_token), json=body)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["extra_fields"]["test_aadhar_number"] == "1234-5678-9012"
        mid = data["id"]
        # GET to verify persisted
        r2 = requests.get(f"{API}/manpower/{mid}", headers=_h(sa_token))
        assert r2.status_code == 200
        assert r2.json().get("extra_fields", {}).get("test_aadhar_number") == "1234-5678-9012"


# ---- Vendor Admin scoping ----
class TestVendorAdminScoping:
    def test_va_contractors_scoped(self, va_token, vendor_admin_user, other_contractor):
        r = requests.get(f"{API}/contractors", headers=_h(va_token))
        assert r.status_code == 200
        ids = [c["id"] for c in r.json()]
        assert ids == [vendor_admin_user["contractor_id"]], f"VA should see only own contractor: {ids}"
        assert other_contractor["id"] not in ids

    def test_va_users_scoped_initially_empty(self, va_token):
        r = requests.get(f"{API}/users", headers=_h(va_token))
        assert r.status_code == 200
        # Should not include the VA themselves or super admin
        items = r.json()
        roles = [u["role"] for u in items]
        for role in roles:
            assert role in ("member", "manpower"), f"VA listing got unexpected role {role}"

    def test_va_can_create_member(self, va_token, vendor_admin_user):
        email = f"TEST_member_{uuid.uuid4().hex[:6]}@example.com"
        r = requests.post(f"{API}/users", headers=_h(va_token), json={
            "email": email, "password": "Mem@12345", "name": "TEST Member",
            "role": "member", "contractor_id": vendor_admin_user["contractor_id"],
        })
        assert r.status_code == 200, r.text
        assert r.json()["role"] == "member"
        assert r.json()["contractor_id"] == vendor_admin_user["contractor_id"]

    def test_va_cannot_create_admin(self, va_token):
        email = f"TEST_admin_{uuid.uuid4().hex[:6]}@example.com"
        r = requests.post(f"{API}/users", headers=_h(va_token), json={
            "email": email, "password": "Adm@12345", "name": "X",
            "role": "admin",
        })
        assert r.status_code == 403

    def test_va_cannot_create_vendor_admin(self, va_token):
        email = f"TEST_va2_{uuid.uuid4().hex[:6]}@example.com"
        r = requests.post(f"{API}/users", headers=_h(va_token), json={
            "email": email, "password": "Va2@12345", "name": "X",
            "role": "vendor_admin",
        })
        assert r.status_code == 403

    def test_va_cannot_access_other_contractor(self, va_token, other_contractor):
        r = requests.get(f"{API}/contractors/{other_contractor['id']}", headers=_h(va_token))
        assert r.status_code == 403


# ---- Contractor compliance ----
class TestContractorCompliance:
    def test_va_upload_esi_doc(self, va_token, vendor_admin_user):
        cid = vendor_admin_user["contractor_id"]
        files = {"file": ("esi_doc.pdf", io.BytesIO(b"%PDF-1.4 test"), "application/pdf")}
        data = {"doc_type": "esi"}
        r = requests.post(f"{API}/contractors/{cid}/compliance-documents",
                          headers=_h(va_token), files=files, data=data)
        assert r.status_code == 200, r.text
        assert r.json()["doc_type"] == "esi"

    def test_all_four_compliance_doctypes(self, sa_token, test_contractor):
        cid = test_contractor["id"]
        for dt in ("pf", "msme", "gst"):
            files = {"file": (f"{dt}.pdf", io.BytesIO(b"%PDF-1.4 test"), "application/pdf")}
            data = {"doc_type": dt}
            r = requests.post(f"{API}/contractors/{cid}/compliance-documents",
                              headers=_h(sa_token), files=files, data=data)
            assert r.status_code == 200, f"{dt}: {r.text}"
        # Verify all docs present
        r2 = requests.get(f"{API}/contractors/{cid}", headers=_h(sa_token))
        assert r2.status_code == 200
        doc_types = {d["doc_type"] for d in r2.json().get("compliance_documents", [])}
        assert {"pf", "msme", "gst"}.issubset(doc_types)

    def test_va_save_compliance_metadata(self, va_token, vendor_admin_user):
        cid = vendor_admin_user["contractor_id"]
        meta = {"compliance": {"esi_number": "ESI123", "esi_expiry_date": "2026-12-31",
                                "gst_number": "GST9999"}}
        r = requests.put(f"{API}/contractors/{cid}/compliance", headers=_h(va_token), json=meta)
        assert r.status_code == 200, r.text
        assert r.json()["compliance"]["esi_number"] == "ESI123"
        # Reload
        r2 = requests.get(f"{API}/contractors/{cid}", headers=_h(va_token))
        assert r2.json()["compliance"]["esi_number"] == "ESI123"
        assert r2.json()["compliance"]["gst_number"] == "GST9999"

    def test_va_cannot_upload_to_other_contractor(self, va_token, other_contractor):
        files = {"file": ("x.pdf", io.BytesIO(b"%PDF"), "application/pdf")}
        r = requests.post(f"{API}/contractors/{other_contractor['id']}/compliance-documents",
                          headers=_h(va_token), files=files, data={"doc_type": "esi"})
        assert r.status_code == 403

    def test_invalid_doctype_rejected(self, sa_token, test_contractor):
        files = {"file": ("x.pdf", io.BytesIO(b"%PDF"), "application/pdf")}
        r = requests.post(f"{API}/contractors/{test_contractor['id']}/compliance-documents",
                          headers=_h(sa_token), files=files, data={"doc_type": "invalid_type"})
        assert r.status_code == 400


# ---- Admin can edit form & users ----
class TestAdminPermissions:
    def test_admin_can_update_form_config(self, sa_token):
        # Create an admin user
        email = f"TEST_admin_{uuid.uuid4().hex[:6]}@example.com"
        r = requests.post(f"{API}/users", headers=_h(sa_token), json={
            "email": email, "password": "Adm@12345", "name": "TEST Admin", "role": "admin",
        })
        assert r.status_code == 200, r.text
        admin_token = _login(email, "Adm@12345")
        cfg = requests.get(f"{API}/form-configs/manpower", headers=_h(admin_token)).json()
        r2 = requests.put(f"{API}/form-configs/manpower", headers=_h(admin_token),
                          json={"sections": cfg["sections"]})
        assert r2.status_code == 200, r2.text
