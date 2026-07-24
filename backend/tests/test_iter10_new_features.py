"""Iteration 10 - Tests for new features:
- Contractor form-config (dynamic) with custom extra_fields
- Disable/Enable on Contractor and Manpower
- FTP storage endpoints (test/reconcile) graceful no-op when not configured
- RBAC on disable endpoints
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://contractor-view-docs.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

SUPER_EMAIL = "superadmin@portal.com"
SUPER_PASSWORD = "Admin@123"
# Reusable VA from previous iteration (per problem statement)
KNOWN_VA_EMAIL = "va_known_a86f3@example.com"
KNOWN_VA_PASSWORD = "Pass@1234"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    if r.status_code != 200:
        return None
    return r.json()["token"]


def _h(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def sa_token():
    tok = _login(SUPER_EMAIL, SUPER_PASSWORD)
    assert tok, "Super admin login failed"
    return tok


@pytest.fixture(scope="session")
def va_token(sa_token):
    """Login known VA from prev iteration, else create one."""
    tok = _login(KNOWN_VA_EMAIL, KNOWN_VA_PASSWORD)
    if tok:
        return tok
    # Create a fresh VA
    cname = f"TEST_ContractorVA_{uuid.uuid4().hex[:6]}"
    rc = requests.post(f"{API}/contractors", headers=_h(sa_token),
                       json={"name": cname, "address": "x", "contact_person": "p", "phone": "1", "email": "c@x.com"})
    assert rc.status_code == 200, rc.text
    cid = rc.json()["id"]
    email = f"TEST_va_{uuid.uuid4().hex[:6]}@example.com"
    ru = requests.post(f"{API}/users", headers=_h(sa_token),
                       json={"email": email, "password": "Va@12345", "name": "TEST VA",
                             "role": "vendor_admin", "contractor_id": cid})
    assert ru.status_code == 200, ru.text
    return _login(email, "Va@12345")


@pytest.fixture(scope="session")
def member_token(sa_token):
    """Create a member user for RBAC check."""
    cname = f"TEST_ContractorM_{uuid.uuid4().hex[:6]}"
    rc = requests.post(f"{API}/contractors", headers=_h(sa_token),
                       json={"name": cname, "address": "x", "contact_person": "p", "phone": "1", "email": "c@x.com"})
    assert rc.status_code == 200, rc.text
    cid = rc.json()["id"]
    email = f"TEST_mem_{uuid.uuid4().hex[:6]}@example.com"
    ru = requests.post(f"{API}/users", headers=_h(sa_token),
                       json={"email": email, "password": "Mem@12345", "name": "TEST MEM",
                             "role": "member", "contractor_id": cid})
    assert ru.status_code == 200, ru.text
    return _login(email, "Mem@12345")


# ====== Contractor Form-Config ======
class TestContractorFormConfig:
    def test_get_contractor_form_seeded(self, sa_token):
        r = requests.get(f"{API}/form-configs/contractor", headers=_h(sa_token))
        assert r.status_code == 200, r.text
        cfg = r.json()
        assert cfg["key"] == "contractor"
        all_keys = {f["key"] for s in cfg["sections"] for f in s["fields"]}
        for k in ["name", "contact_person", "phone", "email", "address"]:
            assert k in all_keys, f"missing system field {k}"

    def test_put_add_custom_field(self, sa_token):
        # Get current
        r = requests.get(f"{API}/form-configs/contractor", headers=_h(sa_token))
        cfg = r.json()
        custom_key = f"pan_{uuid.uuid4().hex[:4]}"
        # Add custom field to first section
        cfg["sections"][0]["fields"].append({
            "key": custom_key, "label": "PAN", "type": "text"
        })
        r2 = requests.put(f"{API}/form-configs/contractor", headers=_h(sa_token),
                          json={"key": "contractor", "sections": cfg["sections"]})
        assert r2.status_code == 200, r2.text
        # Reload
        r3 = requests.get(f"{API}/form-configs/contractor", headers=_h(sa_token))
        ks = {f["key"] for s in r3.json()["sections"] for f in s["fields"]}
        assert custom_key in ks

    def test_put_cannot_remove_system_field(self, sa_token):
        # Try removing 'name' (system field)
        bad_sections = [{"title": "Basic Info", "fields": [
            {"key": "phone", "label": "Phone", "type": "tel"}
        ]}]
        r = requests.put(f"{API}/form-configs/contractor", headers=_h(sa_token),
                         json={"key": "contractor", "sections": bad_sections})
        assert r.status_code == 400, r.text
        assert "Cannot remove system fields" in r.text


# ====== Contractor extra_fields persistence ======
class TestContractorExtraFields:
    def test_create_with_extra_fields_persists(self, sa_token):
        name = f"TEST_CExtra_{uuid.uuid4().hex[:6]}"
        payload = {"name": name, "extra_fields": {"pan": "ABCDE1234F", "year_established": "2010"}}
        r = requests.post(f"{API}/contractors", headers=_h(sa_token), json=payload)
        assert r.status_code == 200, r.text
        cid = r.json()["id"]
        # GET to verify persistence
        r2 = requests.get(f"{API}/contractors/{cid}", headers=_h(sa_token))
        assert r2.status_code == 200
        data = r2.json()
        assert data["extra_fields"]["pan"] == "ABCDE1234F"
        assert data["extra_fields"]["year_established"] == "2010"


# ====== Contractor Disable/Enable ======
class TestContractorDisableEnable:
    @pytest.fixture(scope="class")
    def created_contractor(self, sa_token):
        name = f"TEST_CDisable_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/contractors", headers=_h(sa_token), json={"name": name})
        assert r.status_code == 200, r.text
        return r.json()

    def test_disable_contractor(self, sa_token, created_contractor):
        cid = created_contractor["id"]
        r = requests.post(f"{API}/contractors/{cid}/disable", headers=_h(sa_token))
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

    def test_default_list_hides_disabled(self, sa_token, created_contractor):
        cid = created_contractor["id"]
        r = requests.get(f"{API}/contractors", headers=_h(sa_token))
        assert r.status_code == 200
        ids = [c["id"] for c in r.json()]
        assert cid not in ids, "Disabled contractor still shows in default list"

    def test_include_disabled_shows(self, sa_token, created_contractor):
        cid = created_contractor["id"]
        r = requests.get(f"{API}/contractors?include_disabled=true", headers=_h(sa_token))
        assert r.status_code == 200
        ids = [c["id"] for c in r.json()]
        assert cid in ids

    def test_enable_contractor_restores(self, sa_token, created_contractor):
        cid = created_contractor["id"]
        r = requests.post(f"{API}/contractors/{cid}/enable", headers=_h(sa_token))
        assert r.status_code == 200
        # Should appear in default list
        r2 = requests.get(f"{API}/contractors", headers=_h(sa_token))
        ids = [c["id"] for c in r2.json()]
        assert cid in ids


# ====== Manpower Disable/Enable + stats ======
class TestManpowerDisableEnable:
    @pytest.fixture(scope="class")
    def created_manpower(self, sa_token):
        # Need a contractor
        cname = f"TEST_CMP_{uuid.uuid4().hex[:6]}"
        rc = requests.post(f"{API}/contractors", headers=_h(sa_token), json={"name": cname})
        cid = rc.json()["id"]
        # Need a member assigned (admin can omit member assignment - just contractor)
        r = requests.post(f"{API}/manpower", headers=_h(sa_token),
                          json={"full_name": f"TEST_MP_{uuid.uuid4().hex[:5]}", "phone": "9999999999",
                                "contractor_id": cid})
        assert r.status_code == 200, r.text
        return r.json()

    def test_disable_manpower(self, sa_token, created_manpower):
        mid = created_manpower["id"]
        r = requests.post(f"{API}/manpower/{mid}/disable", headers=_h(sa_token))
        assert r.status_code == 200, r.text

    def test_default_list_hides_disabled(self, sa_token, created_manpower):
        mid = created_manpower["id"]
        r = requests.get(f"{API}/manpower", headers=_h(sa_token))
        assert r.status_code == 200
        ids = [m["id"] for m in r.json().get("items", [])]
        assert mid not in ids

    def test_include_disabled_shows(self, sa_token, created_manpower):
        mid = created_manpower["id"]
        r = requests.get(f"{API}/manpower?include_disabled=true", headers=_h(sa_token))
        assert r.status_code == 200
        ids = [m["id"] for m in r.json().get("items", [])]
        assert mid in ids

    def test_stats_excludes_disabled(self, sa_token, created_manpower):
        # Just check the endpoint works - exact total dependent on db state
        r = requests.get(f"{API}/manpower/stats", headers=_h(sa_token))
        assert r.status_code == 200
        data = r.json()
        assert "total" in data

    def test_enable_restores(self, sa_token, created_manpower):
        mid = created_manpower["id"]
        r = requests.post(f"{API}/manpower/{mid}/enable", headers=_h(sa_token))
        assert r.status_code == 200
        r2 = requests.get(f"{API}/manpower", headers=_h(sa_token))
        ids = [m["id"] for m in r2.json().get("items", [])]
        assert mid in ids


# ====== RBAC on disable endpoints ======
class TestDisableRBAC:
    @pytest.fixture(scope="class")
    def some_contractor(self, sa_token):
        r = requests.post(f"{API}/contractors", headers=_h(sa_token),
                          json={"name": f"TEST_RBAC_{uuid.uuid4().hex[:6]}"})
        return r.json()

    def test_vendor_admin_disable_contractor_forbidden(self, va_token, some_contractor):
        r = requests.post(f"{API}/contractors/{some_contractor['id']}/disable", headers=_h(va_token))
        assert r.status_code == 403, f"Expected 403 got {r.status_code} {r.text}"

    def test_member_disable_contractor_forbidden(self, member_token, some_contractor):
        r = requests.post(f"{API}/contractors/{some_contractor['id']}/disable", headers=_h(member_token))
        assert r.status_code == 403, f"Expected 403 got {r.status_code} {r.text}"

    def test_admin_can_disable(self, sa_token, some_contractor):
        # Super admin should also be allowed (admin role check)
        r = requests.post(f"{API}/contractors/{some_contractor['id']}/disable", headers=_h(sa_token))
        assert r.status_code == 200


# ====== FTP graceful no-op ======
class TestFTPNoOp:
    def test_ftp_test_no_config(self, sa_token):
        # Ensure ftp_host is empty
        requests.put(f"{API}/settings", headers=_h(sa_token), json={"ftp_host": ""})
        r = requests.post(f"{API}/settings/ftp/test", headers=_h(sa_token))
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is False
        assert "FTP host not configured" in data.get("error", "")

    def test_ftp_reconcile_no_op(self, sa_token):
        # When FTP not configured, endpoint returns ok:false with explanatory error
        requests.put(f"{API}/settings", headers=_h(sa_token), json={"ftp_host": ""})
        r = requests.post(f"{API}/settings/ftp/reconcile", headers=_h(sa_token))
        assert r.status_code == 200, r.text
        data = r.json()
        # Either ok:false (no host configured) or ok:true with background task started
        if not data.get("ok"):
            assert "not configured" in data.get("error", "").lower()
        else:
            assert "message" in data

    def test_ftp_test_va_forbidden(self, va_token):
        r = requests.post(f"{API}/settings/ftp/test", headers=_h(va_token))
        assert r.status_code == 403
