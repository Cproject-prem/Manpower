import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Plus, FileCheck, FileX } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import DynamicFormFields from "@/components/DynamicFormFields";

const COMPLIANCE_KEYS = ["esi", "pf", "msme", "gst"];
// Native (root-level) fields in the contractor doc; rest go into extra_fields
const NATIVE_KEYS = new Set(["name", "address", "contact_person", "phone", "email"]);

export default function Contractors() {
  const { user } = useAuth();
  const canManage = user?.role === "super_admin" || user?.role === "admin";
  const [list, setList] = useState([]);
  const [details, setDetails] = useState({});
  const [showNew, setShowNew] = useState(false);
  const [config, setConfig] = useState(null);
  const [values, setValues] = useState({});
  const [includeDisabled, setIncludeDisabled] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/contractors", { params: includeDisabled ? { include_disabled: true } : {} });
      setList(data);
      const results = await Promise.all(data.map((c) => api.get(`/contractors/${c.id}`).then((r) => r.data).catch(() => null)));
      const map = {};
      results.forEach((d, i) => { if (d) map[data[i].id] = d; });
      setDetails(map);
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  useEffect(() => {
    api.get("/form-configs/contractor").then((r) => setConfig(r.data)).catch(() => {});
  }, []);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [includeDisabled]);

  const onChange = (k, v) => setValues((p) => ({ ...p, [k]: v }));

  const create = async () => {
    if (!values.name) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      const payload = {};
      const extra = {};
      Object.entries(values).forEach(([k, v]) => {
        if (v === "" || v === null || v === undefined) return;
        if (NATIVE_KEYS.has(k)) payload[k] = v;
        else extra[k] = v;
      });
      if (Object.keys(extra).length) payload.extra_fields = extra;
      await api.post("/contractors", payload);
      toast.success("Contractor added");
      setShowNew(false);
      setValues({});
      load();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSaving(false); }
  };

  const toggleDisabled = async (c, e) => {
    e.preventDefault();
    e.stopPropagation();
    const next = !c.disabled;
    if (!window.confirm(next ? `Disable contractor "${c.name}"?` : `Re-enable contractor "${c.name}"?`)) return;
    try {
      await api.post(`/contractors/${c.id}/${next ? "disable" : "enable"}`);
      toast.success(next ? "Disabled" : "Re-enabled");
      load();
    } catch (err) { toast.error(formatApiError(err)); }
  };

  const docsFor = (cid) => details[cid]?.compliance_documents || [];
  const uploadedTypes = (cid) => new Set(docsFor(cid).map((d) => d.doc_type));

  return (
    <div className="space-y-6" data-testid="contractors-page">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Compliance</p>
          <h1 className="text-3xl tracking-tight font-semibold text-zinc-900" style={{ fontFamily: "Cabinet Grotesk" }}>
            Contractors
          </h1>
          <p className="text-sm text-zinc-600 mt-1">Manage contractor compliance: ESI, PF, MSME & GST documents.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-zinc-600 cursor-pointer">
            <input
              type="checkbox"
              checked={includeDisabled}
              onChange={(e) => setIncludeDisabled(e.target.checked)}
              data-testid="toggle-include-disabled"
            />
            <span>Show disabled</span>
          </label>
          {canManage && (
            <Dialog open={showNew} onOpenChange={(o) => { setShowNew(o); if (!o) setValues({}); }}>
              <DialogTrigger asChild>
                <Button className="bg-zinc-900 hover:bg-zinc-800 text-white" data-testid="new-contractor-btn">
                  <Plus size={14} className="mr-1.5" /> New Contractor
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" aria-describedby="new-contractor-desc">
                <DialogHeader>
                  <DialogTitle>New Contractor</DialogTitle>
                  <DialogDescription id="new-contractor-desc">
                    Fill in contractor details. Required fields are marked with *.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-5">
                  {config?.sections.map((sec, i) => (
                    <DynamicFormFields
                      key={i}
                      section={sec}
                      values={values}
                      onChange={onChange}
                      context={{ isAdmin: true, currentRole: user?.role }}
                    />
                  ))}
                </div>
                <DialogFooter>
                  <Button onClick={create} disabled={saving} className="bg-zinc-900 hover:bg-zinc-800 text-white" data-testid="contractor-save">
                    {saving ? "Saving…" : "Create"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="bg-white border border-zinc-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600">
            <tr>
              <th className="text-left py-2 px-4 font-medium">Name</th>
              <th className="text-left py-2 px-4 font-medium">Contact</th>
              <th className="text-left py-2 px-4 font-medium">Compliance Docs</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr><td colSpan={4} className="py-8 text-center text-zinc-500">No contractors found.</td></tr>
            )}
            {list.map((c) => {
              const uploaded = uploadedTypes(c.id);
              return (
                <tr key={c.id} className="border-b border-zinc-100 hover:bg-zinc-50" data-testid={`contractor-row-${c.id}`}>
                  <td className="py-3 px-4 font-medium text-zinc-900">
                    {c.name}
                    {c.disabled && <span className="ml-2 inline-block text-[10px] px-1.5 py-0.5 rounded bg-zinc-200 text-zinc-700" data-testid={`disabled-badge-${c.id}`}>disabled</span>}
                  </td>
                  <td className="py-3 px-4 text-zinc-700">
                    <div>{c.contact_person || "—"}</div>
                    <div className="text-xs text-zinc-500">{c.phone || c.email || ""}</div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex gap-1.5 flex-wrap">
                      {COMPLIANCE_KEYS.map((k) => (
                        <span
                          key={k}
                          className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${
                            uploaded.has(k)
                              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                              : "bg-zinc-50 border-zinc-200 text-zinc-500"
                          }`}
                          data-testid={`badge-${c.id}-${k}`}
                        >
                          {uploaded.has(k) ? <FileCheck size={10} /> : <FileX size={10} />}
                          {k.toUpperCase()}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right space-x-2">
                    <Link to={`/contractors/${c.id}`} data-testid={`view-${c.id}`}>
                      <Button size="sm" variant="outline">View</Button>
                    </Link>
                    {canManage && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => toggleDisabled(c, e)}
                        data-testid={`toggle-disabled-${c.id}`}
                        className={c.disabled ? "text-emerald-700" : "text-rose-700"}
                      >
                        {c.disabled ? "Enable" : "Disable"}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

