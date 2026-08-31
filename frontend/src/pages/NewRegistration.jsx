import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import DynamicFormFields from "@/components/DynamicFormFields";

// Manpower fields that are first-class (saved at root of doc).
// Anything not in this set will be saved into extra_fields.
const NATIVE_KEYS = new Set([
  "full_name", "phone", "blood_group", "reporting_manager_email",
  "medical_test_date", "medical_expiry_date", "height_work_expiry_date",
  "safety_belt_expiry_date", "extension_rope_expiry_date", "ppe_register_expiry_date",
  "company_name", "street_address", "city", "state", "postal_code", "phone",
  "reporting_cluster_manager", "work_state", "designation", "subvendor", "reference", "location",
  "region", "roll_type", "contractor_id", "assigned_member_id",
]);

export default function NewRegistration() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [config, setConfig] = useState(null);
  const [contractors, setContractors] = useState([]);
  const [members, setMembers] = useState([]);
  const [clusterManagers, setClusterManagers] = useState([]);
  const [regions, setRegions] = useState([]);
  const [masterData, setMasterData] = useState({ regions: [], states: [], locations: [], all_states: [] });
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);

  const isAdmin = user?.role === "super_admin" || user?.role === "admin";
  const isVendorAdmin = user?.role === "vendor_admin";
  const isMember = user?.role === "member";
  // vendor_admin and member are always scoped to their own contractor — the field
  // is auto-filled and locked so they can only create for their own vendor.
  const contractorLocked = isVendorAdmin || isMember;

  useEffect(() => {
    api.get("/form-configs/manpower").then((r) => setConfig(r.data));
    api.get("/contractors").then((r) => {
      setContractors(r.data);
      // Auto-select own contractor for scoped roles
      if (contractorLocked) {
        const own = user?.contractor_id
          ? r.data.find((c) => c.id === user.contractor_id)
          : r.data[0];
        if (own) {
          setValues((prev) => ({
            ...prev,
            contractor_id: own.id,
            company_name: own.name,
          }));
        }
      }
    });
    if (isAdmin || isVendorAdmin) {
      api.get("/users").then((r) => setMembers(r.data.filter((u) => u.role === "member")));
    }
    api.get("/users/cluster-managers").then((r) => setClusterManagers(r.data.filter((u) => u.role !== "super_admin"))).catch(() => {
      api.get("/users").then((r) => setClusterManagers(r.data.filter((u) => u.role === "admin"))).catch(() => {});
    });
    api.get("/settings/regions").then((r) => setRegions(r.data.regions || [])).catch(() => setRegions([]));
    api.get("/master-data/options").then((r) => {
      setMasterData(r.data);
      if (r.data.regions && r.data.regions.length > 0) setRegions(r.data.regions);
    }).catch(() => {});
    // eslint-disable-next-line
  }, [user]);

  // Auto-set company_name, filter assigned_member, and validate cluster_manager when region changes
  const onChange = (k, v) => {
    setValues((prev) => {
      const next = { ...prev, [k]: v };
      if (k === "contractor_id") {
        const cName = contractors.find((c) => c.id === v)?.name || "";
        next.company_name = cName;
        if (prev.assigned_member_id) {
          const currentMember = members.find((m) => m.id === prev.assigned_member_id);
          if (currentMember && currentMember.contractor_id && currentMember.contractor_id !== v) {
            next.assigned_member_id = "";
          }
        }
      }
      if (k === "region") {
        if (prev.reporting_cluster_manager) {
          const currentCm = clusterManagers.find((cm) => cm.name === prev.reporting_cluster_manager);
          if (currentCm && currentCm.region && v && currentCm.region.toLowerCase() !== v.toLowerCase()) {
            // Reset cluster manager if it belongs to a different region
            next.reporting_cluster_manager = "";
          }
        }
      }
      return next;
    });
  };


  // Re-fetch master data options filtered when region changes
  useEffect(() => {
    const params = {};
    if (values.region) params.region = values.region;
    api.get("/master-data/options", { params }).then((r) => {
      setMasterData(r.data);
    }).catch(() => {});
  }, [values.region]);

  const companyName = useMemo(() => contractors.find((c) => c.id === values.contractor_id)?.name || "", [contractors, values.contractor_id]);

  const onSubmit = async (e) => {
    e.preventDefault();
    // Validate dynamic required fields configured in form builder
    if (config?.sections) {
      for (const sec of config.sections) {
        for (const f of sec.fields || []) {
          if (f.required && !f.readonly && f.type !== "document") {
            const val = values[f.key];
            if (val === undefined || val === null || (typeof val === "string" && !val.trim())) {
              toast.error(`${f.label || f.key} is required`);
              return;
            }
          }
        }
      }
    } else if (!values.full_name) {
      toast.error("Full Name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {};
      const extra = {};
      Object.entries(values).forEach(([k, v]) => {
        if (v === "" || v === null || v === undefined) return;
        payload[k] = v;
        if (!NATIVE_KEYS.has(k)) extra[k] = v;
      });
      if (Object.keys(extra).length > 0) payload.extra_fields = extra;
      if (!payload.contractor_id) delete payload.contractor_id;
      if (!payload.assigned_member_id) delete payload.assigned_member_id;
      if (companyName) payload.company_name = companyName;
      const { data } = await api.post("/manpower", payload);
      toast.success("Manpower created as draft");
      navigate(`/manpower/${data.id}`);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  if (!config) return <div className="text-zinc-500">Loading form…</div>;

  // Inject runtime values that are computed (company_name from contractor lookup)
  const displayValues = { ...values, company_name: companyName || values.company_name || "" };

  return (
    <div className="space-y-6 max-w-4xl" data-testid="new-registration-page">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Registration</p>
        <h1 className="text-3xl tracking-tight font-semibold text-zinc-900" style={{ fontFamily: "Cabinet Grotesk" }}>
          New Manpower
        </h1>
        <p className="mt-1 text-sm text-zinc-600">Fill in the details. Documents can be uploaded after creating the record.</p>
      </div>

      <form onSubmit={onSubmit} className="bg-white border border-zinc-200 rounded-lg p-6 space-y-6">
        {contractorLocked && (
          <div className="text-xs text-zinc-600 bg-amber-50 border border-amber-200 rounded px-3 py-2" data-testid="scoped-vendor-notice">
            Registering under: <b>{companyName || "your organisation"}</b> — this cannot be changed.
          </div>
        )}

        <div className="flex flex-wrap gap-6">
          <div className="space-y-1.5" data-testid="roll-type-field">
            <label className="text-xs text-zinc-700 uppercase tracking-wide">Employment Type</label>
            <div className="flex gap-2">
              {[
                { v: "on_role", label: "On-Role" },
                { v: "off_role", label: "Off-Role" },
              ].map((opt) => {
                const on = (values.roll_type || "on_role") === opt.v;
                return (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => onChange("roll_type", opt.v)}
                    className={`text-sm px-3 h-9 rounded-md border transition-colors ${
                      on ? "bg-zinc-900 text-white border-zinc-900" : "bg-white text-zinc-700 border-zinc-200 hover:border-zinc-400"
                    }`}
                    data-testid={`roll-type-${opt.v}`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {regions.length > 0 && (
            <div className="space-y-1.5 flex-1 min-w-[220px]" data-testid="region-field">
              <label className="text-xs text-zinc-700 uppercase tracking-wide">Region</label>
              <select
                value={values.region || ""}
                onChange={(e) => onChange("region", e.target.value)}
                className="block w-full sm:max-w-xs h-9 rounded-md border border-zinc-200 px-3 text-sm bg-white"
                data-testid="region-select"
              >
                <option value="">— Select region —</option>
                {regions.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          )}
        </div>
        {config.sections.map((section, i) => (
          <DynamicFormFields
            key={i}
            section={section}
            values={displayValues}
            onChange={onChange}
            context={{ contractors, members, clusterManagers, isAdmin, currentRole: user?.role }}
            disabledKeys={contractorLocked ? new Set(["contractor_id", "company_name"]) : undefined}
          />
        ))}

        <div className="flex justify-end gap-2 border-t border-zinc-200 pt-4">
          <Button type="button" variant="outline" onClick={() => navigate("/manpower")} data-testid="cancel-btn">Cancel</Button>
          <Button type="submit" disabled={saving} className="bg-zinc-900 hover:bg-zinc-800 text-white" data-testid="save-draft-btn">
            {saving ? "Saving…" : "Save as Draft"}
          </Button>
        </div>
      </form>
    </div>
  );
}
