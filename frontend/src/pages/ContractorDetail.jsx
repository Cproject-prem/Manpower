import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Upload, Download, ArrowLeft, Hash } from "lucide-react";
import { api, formatApiError, API } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ID_FORMAT_PRESETS = [
  { label: "MP-2026-000001 (default)", value: "MP-{year}-{seq:06d}" },
  { label: "ME-2026-000001", value: "ME-{year}-{seq:06d}" },
  { label: "MW-2026-000001", value: "MW-{year}-{seq:06d}" },
  { label: "MP/2026/000001", value: "MP/{year}/{seq:06d}" },
  { label: "EMP-2026-0001 (4-digit)", value: "EMP-{year}-{seq:04d}" },
  { label: "2026-000001 (year only)", value: "{year}-{seq:06d}" },
];

/**
 * Contractor detail page — shows ESI/PF/MSME/GST compliance docs and a metadata
 * form rendered from `compliance` form config (form-builder-driven).
 */
export default function ContractorDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [contractor, setContractor] = useState(null);
  const [config, setConfig] = useState(null);
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [uploadingKey, setUploadingKey] = useState(null);
  const [uploadsEnabled, setUploadsEnabled] = useState(true);
  const [idFormat, setIdFormat] = useState("");
  const [idFormatOff, setIdFormatOff] = useState("");
  const [savingIdFmt, setSavingIdFmt] = useState(false);

  const isSuperAdmin = user?.role === "super_admin";
  const isAdmin = user?.role === "super_admin" || user?.role === "admin";
  const canManage = user?.role === "super_admin" || user?.role === "admin" || (user?.role === "vendor_admin" && user?.contractor_id === id);

  const load = async () => {
    try {
      const [{ data: c }, { data: cfg }] = await Promise.all([
        api.get(`/contractors/${id}`),
        api.get(`/form-configs/compliance`),
      ]);
      setContractor(c);
      setConfig(cfg);
      setValues(c.compliance || {});
      setIdFormat(c.id_format || "");
      setIdFormatOff(c.id_format_offroll || "");
    } catch (e) {
      toast.error(formatApiError(e));
      navigate("/contractors");
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  useEffect(() => {
    api.get("/settings/document-controls")
      .then((r) => setUploadsEnabled(!!r.data.contractor_compliance_enabled))
      .catch(() => setUploadsEnabled(true));
  }, []);

  if (!contractor || !config) return <div className="text-zinc-500">Loading…</div>;

  const updateField = (k, v) => setValues((prev) => ({ ...prev, [k]: v }));

  const saveMetadata = async () => {
    setSaving(true);
    try {
      const { data } = await api.put(`/contractors/${id}/compliance`, { compliance: values });
      setContractor(data);
      setValues(data.compliance || {});
      toast.success("Compliance metadata saved");
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setSaving(false);
    }
  };

  const uploadDoc = async (docKey, file) => {
    if (!file) return;
    setUploadingKey(docKey);
    try {
      const fd = new FormData();
      fd.append("doc_type", docKey);
      fd.append("file", file);
      await api.post(`/contractors/${id}/compliance-documents`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(`${docKey.toUpperCase()} document uploaded`);
      load();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setUploadingKey(null);
    }
  };

  const docFor = (docKey) => (contractor.compliance_documents || []).find((d) => d.doc_type === docKey);

  const saveIdFormat = async () => {
    const isChangingOn = (idFormat || "") !== (contractor.id_format || "");
    const isChangingOff = (idFormatOff || "") !== (contractor.id_format_offroll || "");
    const willRenumber = (isChangingOn && idFormat) || (isChangingOff && idFormatOff);
    if (willRenumber && isSuperAdmin) {
      const parts = [];
      if (isChangingOn && idFormat) parts.push(`On-role → ${idFormat}`);
      if (isChangingOff && idFormatOff) parts.push(`Off-role → ${idFormatOff}`);
      const ok = window.confirm(
        `Change Manpower ID format(s) for "${contractor.name}":\n\n    ${parts.join("\n    ")}\n\n` +
        `All existing approved records matching each changed roll type will be RENUMBERED (their previous IDs will be kept in history).\n\nContinue?`
      );
      if (!ok) return;
    }
    setSavingIdFmt(true);
    try {
      const { data } = await api.put(`/contractors/${id}`, {
        name: contractor.name,
        address: contractor.address || "",
        contact_person: contractor.contact_person || "",
        phone: contractor.phone || "",
        email: contractor.email || "",
        id_format: idFormat || null,
        id_format_offroll: idFormatOff || null,
      });
      if (data._renumber && data._renumber.length > 0) {
        const total = data._renumber.reduce((s, r) => s + (r.updated || 0), 0);
        toast.success(`Format saved · ${total} record(s) renumbered`);
      } else {
        toast.success("ID format saved");
      }
      load();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setSavingIdFmt(false);
    }
  };

  const resetSequence = async (rollType) => {
    const year = new Date().getFullYear();
    const label = rollType === "off_role" ? "Off-role" : "On-role";
    const fmt = rollType === "off_role"
      ? (contractor.id_format_offroll || contractor.id_format || "MP-{year}-{seq:06d}")
      : (contractor.id_format || "MP-{year}-{seq:06d}");
    const example = fmt.replace("{year}", year).replace(/\{seq:0(\d+)d\}/, (_, w) => "1".padStart(parseInt(w, 10), "0")).replace("{seq}", "1");
    if (!window.confirm(`Reset ${label} sequence for "${contractor.name}" for year ${year}?\n\nNext ${label.toLowerCase()} approval will get: ${example}\n\nExisting IDs are NOT changed.`)) return;
    try {
      const { data } = await api.post(`/contractors/${id}/reset-sequence?roll_type=${rollType}`);
      toast.success(`${label} sequence reset — next ID will start at #${data.reset_to + 1}`);
      load();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const localPreview = (() => {
    if (!idFormat) return contractor.next_id_preview || "";
    const year = new Date().getFullYear();
    try {
      // Naive JS preview: support {year} and {seq:0Nd}
      const nextSeq = (contractor.id_format === idFormat)
        ? // Same format saved → use server preview number
          (contractor.next_id_preview?.match(/\d+$/)?.[0]
            ? parseInt(contractor.next_id_preview.match(/\d+$/)[0], 10)
            : 1)
        : 1; // New format → sequence starts at 1
      return idFormat
        .replace("{year}", year)
        .replace(/\{seq:0(\d+)d\}/, (_, w) => String(nextSeq).padStart(parseInt(w, 10), "0"))
        .replace("{seq}", String(nextSeq));
    } catch { return idFormat; }
  })();

  return (
    <div className="space-y-6" data-testid="contractor-detail-page">
      <div>
        <Button variant="ghost" onClick={() => navigate("/contractors")} className="mb-2 -ml-2" data-testid="back-btn">
          <ArrowLeft size={14} className="mr-1.5" /> All Contractors
        </Button>
        <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Compliance Profile</p>
        <h1 className="text-3xl tracking-tight font-semibold text-zinc-900" style={{ fontFamily: "Cabinet Grotesk" }}>
          {contractor.name}
        </h1>
        <p className="text-sm text-zinc-600 mt-1">
          {contractor.contact_person || "—"} · {contractor.phone || "—"} · {contractor.email || "—"}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {isAdmin && (
          <div className="bg-white border border-zinc-200 rounded-lg p-5 lg:col-span-2" data-testid="id-format-panel">
            <div className="flex items-center gap-3 mb-3">
              <div className="rounded-md bg-zinc-900 text-white p-2"><Hash className="h-4 w-4" /></div>
              <div>
                <h3 className="text-base font-medium text-zinc-900">Manpower ID Format</h3>
                <p className="text-xs text-zinc-500">Applied when a new manpower under this contractor is <b>approved</b>. Each contractor with a custom format gets its own sequence.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* ON-ROLE format */}
              <div className="space-y-3">
                <div>
                  <Label className="text-xs uppercase tracking-wide text-emerald-700">On-Role format</Label>
                  <p className="text-[11px] text-zinc-500">Used when a manpower is registered as On-Role.</p>
                </div>
                <Input
                  value={idFormat}
                  placeholder="Leave blank to use global default"
                  onChange={(e) => setIdFormat(e.target.value)}
                  className="font-mono text-xs"
                  data-testid="id-format-input"
                />
                <div className="h-9 px-3 rounded-md border border-emerald-100 bg-emerald-50/40 flex items-center font-mono text-sm text-emerald-900" data-testid="id-format-preview">
                  Next: {contractor.next_id_preview || "—"}
                </div>
                <div className="flex flex-wrap gap-2">
                  {ID_FORMAT_PRESETS.map((p) => (
                    <button
                      key={"on-" + p.value}
                      type="button"
                      onClick={() => setIdFormat(p.value)}
                      className={`text-[11px] px-2 py-1 rounded border font-mono ${
                        idFormat === p.value
                          ? "border-zinc-900 bg-zinc-900 text-white"
                          : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400"
                      }`}
                      data-testid={`id-preset-${p.value}`}
                    >
                      {p.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setIdFormat("")}
                    className="text-[11px] px-2 py-1 rounded border border-dashed border-zinc-300 text-zinc-600 hover:border-zinc-500"
                    data-testid="id-preset-default"
                  >
                    Use global default
                  </button>
                </div>
                {isSuperAdmin && contractor.id_format && (
                  <Button
                    variant="outline" size="sm"
                    onClick={() => resetSequence("on_role")}
                    className="text-rose-700 border-rose-200 hover:bg-rose-50"
                    data-testid="reset-seq-btn"
                  >
                    Reset on-role sequence
                  </Button>
                )}
              </div>

              {/* OFF-ROLE format */}
              <div className="space-y-3">
                <div>
                  <Label className="text-xs uppercase tracking-wide text-amber-700">Off-Role format (secondary)</Label>
                  <p className="text-[11px] text-zinc-500">Used when a manpower is registered as Off-Role. Falls back to On-Role format if blank.</p>
                </div>
                <Input
                  value={idFormatOff}
                  placeholder="Leave blank to reuse On-Role format"
                  onChange={(e) => setIdFormatOff(e.target.value)}
                  className="font-mono text-xs"
                  data-testid="id-format-offroll-input"
                />
                <div className="h-9 px-3 rounded-md border border-amber-100 bg-amber-50/40 flex items-center font-mono text-sm text-amber-900" data-testid="id-format-offroll-preview">
                  Next: {contractor.next_id_preview_offroll || "—"}
                </div>
                <div className="flex flex-wrap gap-2">
                  {ID_FORMAT_PRESETS.map((p) => (
                    <button
                      key={"off-" + p.value}
                      type="button"
                      onClick={() => setIdFormatOff(p.value)}
                      className={`text-[11px] px-2 py-1 rounded border font-mono ${
                        idFormatOff === p.value
                          ? "border-amber-700 bg-amber-700 text-white"
                          : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400"
                      }`}
                      data-testid={`id-preset-off-${p.value}`}
                    >
                      {p.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setIdFormatOff("")}
                    className="text-[11px] px-2 py-1 rounded border border-dashed border-zinc-300 text-zinc-600 hover:border-zinc-500"
                  >
                    Reuse On-Role
                  </button>
                </div>
                {isSuperAdmin && (
                  <Button
                    variant="outline" size="sm"
                    onClick={() => resetSequence("off_role")}
                    className="text-rose-700 border-rose-200 hover:bg-rose-50"
                    data-testid="reset-seq-off-btn"
                  >
                    Reset off-role sequence
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-4 flex justify-end pt-4 border-t border-zinc-100">
              <Button
                onClick={saveIdFormat}
                disabled={savingIdFmt ||
                  (idFormat === (contractor.id_format || "") &&
                   idFormatOff === (contractor.id_format_offroll || ""))}
                className="bg-zinc-900 hover:bg-zinc-800 text-white"
                data-testid="save-id-format-btn"
              >
                {savingIdFmt ? "Saving…" : "Save Formats"}
              </Button>
            </div>
          </div>
        )}
        {!uploadsEnabled && canManage && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800" data-testid="compliance-upload-disabled-banner">
            Contractor compliance uploads have been disabled by the administrator. Existing documents remain viewable — new uploads are blocked.
          </div>
        )}
        {config.sections.map((sec) => {
          const docKey = sec.doc_key;
          const doc = docKey ? docFor(docKey) : null;
          return (
            <div key={sec.title} className="bg-white border border-zinc-200 rounded-lg p-5" data-testid={`compliance-section-${docKey || sec.title}`}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-medium text-zinc-900">{sec.title}</h3>
                  {docKey && (
                    <p className="text-xs text-zinc-500">
                      Document status:{" "}
                      <span className={doc ? "text-emerald-700" : "text-amber-700"}>
                        {doc ? "Uploaded" : "Missing"}
                      </span>
                    </p>
                  )}
                </div>
                {docKey && doc && (
                  <a
                    href={`${API}/contractors/${id}/compliance-documents/${doc.id}`}
                    target="_blank"
                    rel="noreferrer"
                    data-testid={`download-${docKey}`}
                    className="text-xs text-zinc-700 hover:text-zinc-900 flex items-center gap-1"
                  >
                    <Download size={12} /> {doc.file_name}
                  </a>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3">
                {sec.fields.filter((f) => f.type !== "document").map((f) => (
                  <div key={f.key} className="space-y-1.5">
                    <Label className="text-xs text-zinc-700">{f.label}</Label>
                    <Input
                      type={f.type === "date" ? "date" : f.type === "number" ? "number" : "text"}
                      value={values[f.key] || ""}
                      onChange={(e) => updateField(f.key, e.target.value)}
                      disabled={!canManage}
                      data-testid={`compliance-field-${f.key}`}
                    />
                  </div>
                ))}
              </div>

              {docKey && canManage && uploadsEnabled && (
                <div className="mt-4 pt-4 border-t border-zinc-100">
                  <Label className="text-xs text-zinc-700 mb-1.5 block">
                    {doc ? "Replace document" : "Upload document"}
                  </Label>
                  <Input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    disabled={uploadingKey === docKey}
                    onChange={(e) => uploadDoc(docKey, e.target.files?.[0])}
                    data-testid={`upload-${docKey}`}
                  />
                  {uploadingKey === docKey && (
                    <div className="text-xs text-zinc-500 mt-1.5 flex items-center gap-1">
                      <Upload size={12} /> Uploading…
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {canManage && (
        <div className="flex justify-end">
          <Button onClick={saveMetadata} disabled={saving} className="bg-zinc-900 hover:bg-zinc-800 text-white" data-testid="save-compliance-btn">
            {saving ? "Saving…" : "Save Metadata"}
          </Button>
        </div>
      )}
    </div>
  );
}
