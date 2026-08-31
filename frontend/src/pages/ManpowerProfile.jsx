import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Upload, Send, Check, X, Download, RefreshCw, Eye, Trash2 } from "lucide-react";
import { api, formatApiError, API, docUrl } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { DocumentViewerDialog } from "@/components/DocumentViewerDialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import StatusBadge from "@/components/StatusBadge";
import ManpowerPrintView from "@/components/ManpowerPrintView";

const DOC_TYPES = [
  { key: "photo", label: "Passport Photo" },
  { key: "safety_belt_certificate", label: "Safety Belt Certificate" },
  { key: "aadhar_front", label: "Aadhar Front" },
  { key: "aadhar_back", label: "Aadhar Back" },
  { key: "medical_certificate", label: "Medical Fitness Certificate" },
  { key: "height_work_certificate", label: "Height Work Certificate" },
  { key: "esic", label: "ESIC / WCP / Insurance" },
  { key: "pf_uan", label: "PF / UAN Card" },
  { key: "extension_rope_certificate", label: "Extension Rope Certificate" },
  { key: "ppe_register", label: "PPE Register" },
];

const RENEWABLE = [
  { key: "medical_certificate", label: "Medical Fitness Certificate", needsTestDate: true, expiryField: "medical_expiry_date" },
  { key: "height_work_certificate", label: "Height Work Certificate", needsTestDate: false, expiryField: "height_work_expiry_date" },
  { key: "safety_belt_certificate", label: "Safety Belt Certificate", needsTestDate: false, expiryField: "safety_belt_expiry_date" },
  { key: "extension_rope_certificate", label: "Extension Rope Certificate", needsTestDate: false, expiryField: "extension_rope_expiry_date" },
  { key: "ppe_register", label: "PPE Register", needsTestDate: false, expiryField: "ppe_register_expiry_date" },
];

export default function ManpowerProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [m, setM] = useState(null);
  const [config, setConfig] = useState(null);
  const [contractors, setContractors] = useState([]);
  const [regions, setRegions] = useState([]);
  const [viewerDoc, setViewerDoc] = useState(null);
  const [members, setMembers] = useState([]);
  const [clusterManagers, setClusterManagers] = useState([]);
  const [comment, setComment] = useState("");
  const [showApprove, setShowApprove] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showRenewal, setShowRenewal] = useState(false);
  const [renewalForm, setRenewalForm] = useState({ doc_type: "medical_certificate", expiry_date: "", test_date: "", file: null });
  const [editForm, setEditForm] = useState({});
  const [linkUserId, setLinkUserId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [docBlobs, setDocBlobs] = useState({});
  const [pdfPages, setPdfPages] = useState({});
  const [uploadsEnabled, setUploadsEnabled] = useState(true);

  // Revoke blob URLs on unmount to free memory
  useEffect(() => {
    return () => {
      Object.values(docBlobs).forEach((url) => {
        try { URL.revokeObjectURL(url); } catch {}
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async () => {
    try {
      const { data } = await api.get(`/manpower/${id}`);
      setM(data);
    } catch (e) {
      toast.error(formatApiError(e));
      navigate("/manpower");
    }
  };

  const deleteDraft = async () => {
    if (!window.confirm("Are you sure you want to delete this draft manpower record? This action cannot be undone.")) return;
    try {
      await api.delete(`/manpower/${m.id}`);
      toast.success("Draft manpower deleted successfully");
      navigate("/manpower");
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  useEffect(() => {
    load();
    api.get("/contractors").then((r) => setContractors(r.data));
    api.get("/settings/regions").then((r) => setRegions(r.data.regions || [])).catch(() => setRegions([]));
    api.get("/form-configs/manpower").then((r) => setConfig(r.data)).catch(() => {});
    api.get("/settings/document-controls").then((r) => setUploadsEnabled(!!r.data.manpower_documents_enabled)).catch(() => setUploadsEnabled(true));
    if (user?.role === "super_admin" || user?.role === "admin" || user?.role === "vendor_admin") {
      api.get("/users").then((r) => setMembers(r.data));
    }
    api.get("/users/cluster-managers").then((r) => setClusterManagers(r.data.filter((u) => u.role !== "super_admin"))).catch(() => {
      api.get("/users").then((r) => setClusterManagers(r.data.filter((u) => u.role === "admin"))).catch(() => {});
    });
    // eslint-disable-next-line
  }, [id]);

  if (!m) return <div className="text-zinc-500">Loading…</div>;

  const isAdmin = user.role === "super_admin" || user.role === "admin";
  const contractor = contractors.find((c) => c.id === m.contractor_id);
  const memberName = members.find((u) => u.id === m.assigned_member_id)?.name || "—";

  const upload = async (docType, file) => {
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("doc_type", docType);
    fd.append("file", file);
    try {
      await api.post(`/manpower/${m.id}/documents`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Uploaded");
      await load();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setUploading(false);
    }
  };

  const deleteDoc = async (docId) => {
    if (!window.confirm("Are you sure you want to delete this document?")) return;
    try {
      await api.delete(`/manpower/${m.id}/documents/${docId}`);
      toast.success("Document deleted");
      await load();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const submit = async () => {
    try {
      await api.post(`/manpower/${m.id}/submit`);
      toast.success("Submitted for approval");
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const approve = async () => {
    try {
      const { data } = await api.post(`/manpower/${m.id}/approve`, { comment });
      toast.success(`Approved · ID ${data.manpower_id}`);
      setShowApprove(false); setComment(""); load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const reject = async () => {
    try {
      await api.post(`/manpower/${m.id}/reject`, { comment });
      toast.success("Rejected");
      setShowReject(false); setComment(""); load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const renewApprove = async () => {
    try {
      const { data } = await api.post(`/manpower/${m.id}/renewal/approve`, { comment });
      toast.success(`Renewed until ${data.new_expiry}`);
      setComment(""); load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const linkUser = async () => {
    try {
      await api.post(`/manpower/${m.id}/link-user`, { user_id: linkUserId || null });
      toast.success(linkUserId ? "Login linked successfully" : "Login unlinked");
      setShowLink(false); setLinkUserId(""); load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const unlinkUser = async () => {
    if (!window.confirm("Unlink this login user from this manpower profile?")) return;
    try {
      await api.post(`/manpower/${m.id}/link-user`, { user_id: null });
      toast.success("Login unlinked");
      setShowLink(false); setLinkUserId(""); load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const openEdit = () => {
    const { id: _id, documents, approval_history, renewal_history, admin_comments, status, manpower_id, display_status, document_status, ...editable } = m;
    // Flatten extra_fields into form for editing
    const flat = { ...editable, ...(editable.extra_fields || {}) };
    delete flat.extra_fields;
    setEditForm(flat);
    setShowEdit(true);
  };

  const saveEdit = async () => {
    try {
      // Split native vs extra_fields based on form config
      const nativeKeys = new Set();
      if (config) {
        config.sections.forEach((s) => s.fields.forEach((f) => {
          if (f.system) nativeKeys.add(f.key);
        }));
      }
      // Also include manpower native fields not in config (safety net)
      ["full_name","phone","blood_group","reporting_manager_email","medical_test_date","medical_expiry_date","height_work_expiry_date","safety_belt_expiry_date","extension_rope_expiry_date","ppe_register_expiry_date","company_name","street_address","city","state","postal_code","reporting_cluster_manager","work_state","designation","subvendor","reference","location","region","contractor_id","assigned_member_id"].forEach((k) => nativeKeys.add(k));
      const payload = {};
      const extra = {};
      Object.entries(editForm).forEach(([k, v]) => {
        if (v === "" || v === null || v === undefined) return;
        payload[k] = v;
        if (!nativeKeys.has(k)) extra[k] = v;
      });
      if (Object.keys(extra).length > 0) payload.extra_fields = extra;
      await api.put(`/manpower/${m.id}`, payload);
      toast.success("Updated");
      setShowEdit(false); load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const openRenewal = (docType) => {
    const def = RENEWABLE.find((r) => r.key === docType) || RENEWABLE[0];
    setRenewalForm({ doc_type: def.key, expiry_date: "", test_date: "", file: null });
    setShowRenewal(true);
  };

  const submitRenewal = async () => {
    if (!renewalForm.file) { toast.error("Select a file"); return; }
    if (!renewalForm.expiry_date) { toast.error("Enter expiry date"); return; }
    const renewalKey = `${renewalForm.doc_type}_renewal`;
    setUploading(true);
    try {
      // Upload renewal document first
      const fd = new FormData();
      fd.append("doc_type", renewalKey);
      fd.append("file", renewalForm.file);
      await api.post(`/manpower/${m.id}/documents`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      // Then submit renewal with proposed dates
      await api.post(`/manpower/${m.id}/renewal/submit`, {
        doc_type: renewalForm.doc_type,
        expiry_date: renewalForm.expiry_date,
        test_date: renewalForm.test_date || null,
      });
      toast.success("Renewal submitted for approval");
      setShowRenewal(false);
      load();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setUploading(false); }
  };

  const handlePrint = async () => {
    // Step 1: Fetch all documents as authenticated blob URLs
    const allDocs = m.documents || [];
    const newMap = { ...docBlobs };
    try {
      await Promise.all(
        allDocs.map(async (d) => {
          if (newMap[d.id]) return;
          try {
            const res = await api.get(`/documents/${d.id}`, { responseType: "blob" });
            newMap[d.id] = URL.createObjectURL(res.data);
          } catch { /* ignore */ }
        })
      );
      setDocBlobs(newMap);
    } catch {}

    // Step 2: Rasterise PDFs to images using PDF.js from CDN
    // (browsers cannot print <embed> PDF content, but <img> always works)
    const pdfDocs = allDocs.filter((d) => /\.pdf$/i.test(d.file_name || ""));
    const newPdfPages = { ...pdfPages };
    if (pdfDocs.length > 0) {
      try {
        await new Promise((resolve, reject) => {
          if (window.pdfjsLib) return resolve();
          const script = document.createElement("script");
          script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
          script.onload = () => {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
            resolve();
          };
          script.onerror = reject;
          document.head.appendChild(script);
        });

        await Promise.all(
          pdfDocs.map(async (d) => {
            if (newPdfPages[d.id]) return;
            const blobUrl = newMap[d.id];
            if (!blobUrl) return;
            try {
              const pdf = await window.pdfjsLib.getDocument(blobUrl).promise;
              const pages = [];
              for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 2.0 });
                const canvas = document.createElement("canvas");
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
                pages.push(canvas.toDataURL("image/png"));
              }
              newPdfPages[d.id] = pages;
            } catch { /* ignore individual failures */ }
          })
        );
        setPdfPages(newPdfPages);
      } catch { /* pdfjs not available */ }
    }

    // Step 3: Wait for images to load then print
    await new Promise((res) => setTimeout(res, 150));
    const printRoot = document.querySelector('[data-testid="manpower-print-view"]');
    if (printRoot) {
      const imgs = Array.from(printRoot.querySelectorAll("img"));
      await Promise.all(
        imgs.map((img) => {
          if (img.complete && img.naturalWidth > 0) return Promise.resolve();
          return new Promise((resolve) => {
            img.addEventListener("load", resolve, { once: true });
            img.addEventListener("error", resolve, { once: true });
          });
        })
      );
    }
    window.print();
  };

  const toggleDisabled = async () => {
    const next = !m.disabled;
    if (!window.confirm(next ? "Disable this manpower record?" : "Re-enable this manpower record?")) return;
    try {
      await api.post(`/manpower/${m.id}/${next ? "disable" : "enable"}`);
      toast.success(next ? "Manpower disabled" : "Manpower re-enabled");
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  // Filter users for linking: must belong to the same contractor/company (matching m.contractor_id)
  const linkableUsers = members.filter((u) => {
    if (u.role !== "manpower" && u.role !== "member") return false;
    if (m.contractor_id) {
      return u.contractor_id === m.contractor_id;
    }
    return true;
  });
  const linkedUser = members.find((u) => u.id === m.user_id);
  const photoDoc = (m.documents || []).find((d) => d.doc_type === "photo");
  const isMember = user.role === "member";
  const isManpower = user.role === "manpower";
  const canEditDetails = isAdmin || ((isMember || isManpower) && (m.status === "draft" || m.status === "rejected"));
  const canUploadInitial = uploadsEnabled && (isAdmin || ((isMember || isManpower) && (m.status === "draft" || m.status === "rejected")));
  const canLinkUser = isAdmin || user.role === "vendor_admin";

  return (
    <div className="space-y-6" data-testid="manpower-profile-page">
      <ManpowerPrintView
        manpower={m}
        docTypes={DOC_TYPES}
        contractor={contractor}
        memberName={memberName}
        config={config}
        docBlobs={docBlobs}
        pdfPages={pdfPages}
      />
      <div className="no-print space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex gap-4 items-start">
          {photoDoc ? (
            <img
              src={docUrl(photoDoc.id)}
              alt="Passport"
              data-testid="passport-photo"
              className="w-24 h-32 object-cover rounded-md border border-zinc-200 shrink-0"
            />
          ) : (
            <div className="w-24 h-32 rounded-md border border-dashed border-zinc-300 flex items-center justify-center text-[10px] text-zinc-400 shrink-0">
              No Photo
            </div>
          )}
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Manpower Profile</p>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <h1 className="text-3xl tracking-tight font-semibold text-zinc-900" style={{ fontFamily: "Cabinet Grotesk" }}>
                {m.full_name}
              </h1>
              {m.manpower_id && <span className="id-pill">{m.manpower_id}</span>}
              <StatusBadge status={m.display_status} />
            </div>
            <p className="mt-1 text-sm text-zinc-600 flex items-center flex-wrap gap-x-2 gap-y-1">
              <span>{contractor?.name || "No contractor"}</span>
              {contractor?.vendor_id && (
                <span className="inline-flex items-center gap-1 font-mono text-xs px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">
                  {contractor.vendor_id}
                </span>
              )}
              <span className="text-zinc-400">·</span>
              <span>Member: {memberName}</span>
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canEditDetails && (
            <Button variant="outline" onClick={openEdit} data-testid="edit-btn">Edit Details</Button>
          )}
          <Button variant="outline" onClick={handlePrint} data-testid="print-pdf-btn">Print / Save PDF</Button>
          {m.status === "draft" || m.status === "rejected" ? (
            <Button onClick={submit} className="bg-zinc-900 hover:bg-zinc-800 text-white" data-testid="submit-btn">
              <Send size={14} className="mr-1.5" /> Submit for Approval
            </Button>
          ) : null}
          {isAdmin && m.status === "pending_approval" && (
            <>
              <Button variant="outline" onClick={() => setShowReject(true)} data-testid="reject-btn">
                <X size={14} className="mr-1.5" /> Reject
              </Button>
              <Button onClick={() => setShowApprove(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="approve-btn">
                <Check size={14} className="mr-1.5" /> Approve
              </Button>
            </>
          )}
          {m.status === "active" && !m.renewal_pending && (
            <Button variant="outline" onClick={() => openRenewal("medical_certificate")} data-testid="renew-submit-btn">
              <RefreshCw size={14} className="mr-1.5" /> Submit Renewal
            </Button>
          )}
          {isAdmin && m.renewal_pending && (
            <Button onClick={renewApprove} className="bg-blue-600 hover:bg-blue-700 text-white" data-testid="renew-approve-btn">
              <Check size={14} className="mr-1.5" /> Approve Renewal
            </Button>
          )}
          {canLinkUser && (
            <Button
              variant="outline"
              onClick={() => {
                setLinkUserId(m.user_id || "");
                setShowLink(true);
              }}
              data-testid="link-user-btn"
              className={m.user_id ? "border-emerald-300 text-emerald-700 bg-emerald-50/40" : ""}
            >
              {m.user_id ? `Linked: ${linkedUser?.name || "User"}` : "Link Login"}
            </Button>
          )}
          {m.status === "draft" && (
            !m.manpower_id ? (
              <Button
                variant="outline"
                onClick={deleteDraft}
                data-testid="delete-draft-btn"
                className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
              >
                <Trash2 size={14} className="mr-1.5" /> Delete Draft
              </Button>
            ) : (
              <Button
                variant="outline"
                disabled
                data-testid="delete-disabled-btn"
                className="text-zinc-400 opacity-40 cursor-not-allowed"
                title="Delete option is disabled once ID is generated"
              >
                <Trash2 size={14} className="mr-1.5" /> Delete (Disabled)
              </Button>
            )
          )}
          {isAdmin && (
            <Button
              variant="outline"
              onClick={toggleDisabled}
              data-testid="toggle-disabled-btn"
              className={m.disabled ? "text-emerald-700" : "text-rose-700"}
            >
              {m.disabled ? "Re-enable" : "Disable"}
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="details" className="w-full">
        <TabsList>
          <TabsTrigger value="details" data-testid="tab-details">Details</TabsTrigger>
          <TabsTrigger value="documents" data-testid="tab-documents">Documents</TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="bg-white border border-zinc-200 rounded-lg p-6 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3 text-sm">
            <Detail label="Manpower ID" value={m.manpower_id || "—"} mono />
            <Detail label="Phone" value={m.phone} />
            <Detail label="Blood Group" value={m.blood_group} />
            <Detail label="Medical Test Date" value={m.medical_test_date} />
            <Detail label="Medical Expiry" value={m.medical_expiry_date} />
            <Detail label="Height Work Expiry" value={m.height_work_expiry_date} />
            <Detail label="Safety Belt Expiry" value={m.safety_belt_expiry_date} />
            <Detail label="Reporting Manager Email" value={m.reporting_manager_email} />
            <Detail label="Company Name" value={m.company_name} />
            <Detail label="Employment Type" value={m.roll_type === "off_role" ? "Off-Role" : "On-Role"} />
            <Detail label="Region" value={m.region} />
            <Detail label="Street" value={m.street_address} />
            <Detail label="City" value={m.city} />
            <Detail label="State" value={m.state} />
            <Detail label="Postal Code" value={m.postal_code} />
            <Detail label="Location" value={m.location} />
            <Detail label="Cluster Manager" value={m.reporting_cluster_manager} />
            <Detail label="Work State" value={m.work_state} />
            <Detail label="Designation" value={m.designation} />
            <Detail label="Subvendor" value={m.subvendor} />
            <Detail label="Reference" value={m.reference} />
          </div>
          {config && m.extra_fields && Object.keys(m.extra_fields).length > 0 && (
            <div className="mt-6 pt-6 border-t border-zinc-200">
              <div className="text-xs uppercase tracking-[0.12em] text-zinc-500 mb-3">Custom Fields</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3 text-sm" data-testid="extra-fields-section">
                {config.sections.flatMap((s) => s.fields).filter((f) => !f.system && f.type !== "document" && m.extra_fields[f.key] != null).map((f) => (
                  <Detail key={f.key} label={f.label} value={m.extra_fields[f.key]} />
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="documents" className="mt-4 space-y-4">
          {!uploadsEnabled && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800" data-testid="upload-disabled-banner">
              Document uploads have been disabled by the administrator. Existing documents remain viewable — new uploads and renewals are blocked.
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(() => {
              // Merge native DOC_TYPES with any custom "document"-typed fields defined in Form Builder.
              const customDocs = [];
              (config?.sections || []).forEach((sec) => {
                (sec.fields || []).forEach((fld) => {
                  if (fld.type === "document" && !fld.system) {
                    customDocs.push({ key: fld.key, label: fld.label || fld.key });
                  }
                });
              });
              const seen = new Set(DOC_TYPES.map((d) => d.key));
              const merged = [...DOC_TYPES, ...customDocs.filter((d) => !seen.has(d.key))];
              return merged;
            })().map((dt) => {
              const docs = (m.documents || []).filter((d) => d.doc_type === dt.key);
              const hasDoc = docs.length > 0;
              const showUploadInput = canUploadInitial && !hasDoc;
              return (
                <div key={dt.key} className="bg-white border border-zinc-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm font-medium">{dt.label}</Label>
                    <span className={`text-xs ${hasDoc ? "text-emerald-700" : "text-amber-700"}`}>
                      {hasDoc ? "Uploaded" : "Missing"}
                    </span>
                  </div>
                  {docs.map((d) => (
                    <div key={d.id} className="flex items-center justify-between text-xs text-zinc-700 hover:text-zinc-900 mb-1 group">
                      <button
                        onClick={() => setViewerDoc({ url: docUrl(d.id), name: d.file_name })}
                        data-testid={`doc-link-${d.id}`}
                        className="flex items-center gap-1.5 truncate flex-1 text-left"
                      >
                        <Eye size={12} className="text-zinc-500" />
                        <span className="truncate hover:underline">{d.file_name}</span>
                      </button>
                      {canEditDetails && (
                        <button
                          onClick={() => deleteDoc(d.id)}
                          className="p-1 text-zinc-400 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Delete document"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                  {showUploadInput && (
                    <Input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      disabled={uploading}
                      onChange={(e) => upload(dt.key, e.target.files?.[0])}
                      data-testid={`upload-${dt.key}`}
                      className="mt-2 text-xs"
                    />
                  )}
                  {isAdmin && hasDoc && uploadsEnabled && (
                    <Input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      disabled={uploading}
                      onChange={(e) => upload(dt.key, e.target.files?.[0])}
                      data-testid={`replace-${dt.key}`}
                      className="mt-2 text-xs"
                    />
                  )}
                </div>
              );
            })}
            <div className="bg-white border border-zinc-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium">Submit a Renewal</Label>
                <Upload size={14} className="text-zinc-400" />
              </div>
              <p className="text-xs text-zinc-500 mb-3">Renewals are available for Medical Certificate, Height Work Certificate, and Safety Belt Certificate. Each has its own expiry date.</p>
              <div className="flex flex-wrap gap-2">
                {RENEWABLE.map((r) => (
                  <Button
                    key={r.key}
                    size="sm"
                    variant="outline"
                    disabled={!uploadsEnabled || m.status !== "active" || m.renewal_pending}
                    onClick={() => openRenewal(r.key)}
                    data-testid={`renew-${r.key}-btn`}
                  >
                    <RefreshCw size={12} className="mr-1.5" /> {r.label}
                  </Button>
                ))}
              </div>
              {m.renewal_pending && (
                <p className="text-xs text-blue-700 mt-2">A renewal is pending approval ({m.pending_renewal?.doc_type?.replace(/_/g, ' ')}).</p>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="history" className="bg-white border border-zinc-200 rounded-lg p-6 mt-4 space-y-6">
          <HistoryList title="Approval History" items={m.approval_history} />
          <HistoryList title="Renewal History" items={m.renewal_history} />
          <HistoryList title="Admin Comments" items={m.admin_comments} />
        </TabsContent>
      </Tabs>

      <DocumentViewerDialog
        open={!!viewerDoc}
        onOpenChange={(open) => !open && setViewerDoc(null)}
        docUrl={viewerDoc?.url}
        docName={viewerDoc?.name}
      />

      {/* Approve dialog */}
      <Dialog open={showApprove} onOpenChange={setShowApprove}>
        <DialogContent>
          <DialogHeader><DialogTitle>Approve Manpower</DialogTitle></DialogHeader>
          <p className="text-sm text-zinc-600">A permanent Manpower ID will be generated.</p>
          <Textarea placeholder="Optional comment" value={comment} onChange={(e) => setComment(e.target.value)} data-testid="approve-comment" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApprove(false)}>Cancel</Button>
            <Button onClick={approve} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="confirm-approve">Approve</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={showReject} onOpenChange={setShowReject}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject Manpower</DialogTitle></DialogHeader>
          <Textarea placeholder="Reason for rejection" value={comment} onChange={(e) => setComment(e.target.value)} data-testid="reject-comment" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReject(false)}>Cancel</Button>
            <Button onClick={reject} className="bg-rose-600 hover:bg-rose-700 text-white" data-testid="confirm-reject">Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link user dialog */}
      <Dialog open={showLink} onOpenChange={setShowLink}>
        <DialogContent>
          <DialogHeader><DialogTitle>Link Login Account</DialogTitle></DialogHeader>
          <p className="text-sm text-zinc-600">
            Pick a user account from <b>{contractor?.name || "the same contractor/company"}</b> to link to this manpower profile.
          </p>
          {m.user_id && linkedUser && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-md text-xs text-emerald-800 flex items-center justify-between">
              <span>Currently linked: <b>{linkedUser.name}</b> ({linkedUser.email})</span>
              <button
                type="button"
                onClick={unlinkUser}
                className="text-xs text-rose-600 hover:underline font-medium ml-2"
                data-testid="unlink-user-btn"
              >
                Unlink
              </button>
            </div>
          )}
          {linkableUsers.length === 0 ? (
            <div className="p-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md">
              No login users found for contractor <b>{contractor?.name || "this contractor"}</b>. Create a user under this contractor in Administration → Users first.
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-xs text-zinc-700 font-medium">Select Member / User from {contractor?.name || "Contractor"}:</label>
              <select
                value={linkUserId}
                onChange={(e) => setLinkUserId(e.target.value)}
                data-testid="link-user-select"
                className="w-full h-9 rounded-md border border-zinc-300 px-3 text-sm bg-white"
              >
                <option value="">— Select user from {contractor?.name || "contractor"} —</option>
                {linkableUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.email}) — {u.role === "member" ? "Member" : "Manpower"}
                  </option>
                ))}
              </select>
            </div>
          )}
          <DialogFooter className="flex justify-between items-center sm:justify-between">
            {m.user_id ? (
              <Button type="button" variant="outline" onClick={unlinkUser} className="text-rose-600 border-rose-200 hover:bg-rose-50">
                Unlink
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowLink(false)}>Cancel</Button>
              <Button onClick={linkUser} disabled={!linkUserId || linkableUsers.length === 0} className="bg-zinc-900 hover:bg-zinc-800 text-white" data-testid="confirm-link-user">Save Link</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Manpower Details</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <EditField k="full_name" label="Full Name" form={editForm} setForm={setEditForm} />
            <EditField k="phone" label="Phone" form={editForm} setForm={setEditForm} />
            <EditField k="blood_group" label="Blood Group" form={editForm} setForm={setEditForm} />
            <EditField k="reporting_manager_email" label="Reporting Manager Email" form={editForm} setForm={setEditForm} />
            <EditField k="medical_test_date" label="Medical Test Date" type="date" form={editForm} setForm={setEditForm} />
            <EditField k="medical_expiry_date" label="Medical Expiry" type="date" form={editForm} setForm={setEditForm} />
            <EditField k="height_work_expiry_date" label="Height Work Expiry" type="date" form={editForm} setForm={setEditForm} />
            <EditField k="safety_belt_expiry_date" label="Safety Belt Expiry" type="date" form={editForm} setForm={setEditForm} />
            <EditField k="company_name" label="Company Name (auto from Contractor)" form={editForm} setForm={setEditForm} readOnly />
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-700">Employment Type</Label>
              <div className="flex gap-2">
                {[
                  { v: "on_role", label: "On-Role" },
                  { v: "off_role", label: "Off-Role" },
                ].map((opt) => {
                  const on = (editForm.roll_type || "on_role") === opt.v;
                  return (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setEditForm({ ...editForm, roll_type: opt.v })}
                      className={`text-sm px-3 h-9 rounded-md border transition-colors ${
                        on ? "bg-zinc-900 text-white border-zinc-900" : "bg-white text-zinc-700 border-zinc-200 hover:border-zinc-400"
                      }`}
                      data-testid={`edit-roll-type-${opt.v}`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-zinc-500">Note: the Manpower ID was stamped at approval time from the type then. Changing this here does not renumber existing IDs.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-700">Region</Label>
              <select
                value={editForm.region || ""}
                onChange={(e) => setEditForm({ ...editForm, region: e.target.value })}
                data-testid="edit-region"
                className="w-full h-9 rounded-md border border-zinc-300 px-3 text-sm bg-white"
              >
                <option value="">— Select region —</option>
                {(regions || []).map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="space-y-1.5 col-span-1 sm:col-span-2">
              <Label className="text-xs text-zinc-700">Contractor (also sets Company Name)</Label>
              <select
                value={editForm.contractor_id || ""}
                onChange={(e) => {
                  const cid = e.target.value;
                  const cname = contractors.find((c) => c.id === cid)?.name || "";
                  setEditForm({ ...editForm, contractor_id: cid, company_name: cname });
                }}
                data-testid="edit-contractor_id"
                className="w-full h-9 rounded-md border border-zinc-300 px-3 text-sm"
              >
                <option value="">Select contractor…</option>
                {contractors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <EditField k="street_address" label="Street Address" form={editForm} setForm={setEditForm} />
            <EditField k="city" label="City" form={editForm} setForm={setEditForm} />
            <EditField k="state" label="State" form={editForm} setForm={setEditForm} />
            <EditField k="postal_code" label="Postal Code" form={editForm} setForm={setEditForm} />
            <EditField k="location" label="Location" form={editForm} setForm={setEditForm} />
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-700">Cluster Manager</Label>
              <select
                value={editForm.reporting_cluster_manager || ""}
                onChange={(e) => setEditForm({ ...editForm, reporting_cluster_manager: e.target.value })}
                data-testid="edit-cluster-manager"
                className="w-full h-9 rounded-md border border-zinc-300 px-3 text-sm bg-white"
              >
                <option value="">— Select cluster manager —</option>
                {clusterManagers
                  .filter((cm) => {
                    if (cm.role === "super_admin") return false;
                    if (!editForm.region) return true;
                    if (cm.region && cm.region.toLowerCase() === editForm.region.toLowerCase()) return true;
                    if (Array.isArray(cm.region_scope) && cm.region_scope.length > 0) {
                      return cm.region_scope.some((r) => r.toLowerCase() === editForm.region.toLowerCase());
                    }
                    return !cm.region && (!cm.region_scope || cm.region_scope.length === 0);
                  })
                  .map((cm) => (
                    <option key={cm.id || cm.name} value={cm.name}>
                      {cm.name}{cm.region ? ` (${cm.region})` : ""}
                    </option>
                  ))}
              </select>
            </div>
            <EditField k="work_state" label="Work State" form={editForm} setForm={setEditForm} />
            <EditField k="designation" label="Designation" form={editForm} setForm={setEditForm} />
            <EditField k="subvendor" label="Subvendor" form={editForm} setForm={setEditForm} />
            <EditField k="reference" label="Reference" form={editForm} setForm={setEditForm} />
          </div>
          {config && (
            <div className="mt-4 space-y-3" data-testid="edit-custom-fields">
              {config.sections.flatMap((s) => s.fields).filter((f) => !f.system && f.type !== "document").length > 0 && (
                <div className="text-xs uppercase tracking-[0.12em] text-zinc-500">Custom Fields</div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {config.sections.flatMap((s) => s.fields).filter((f) => !f.system && f.type !== "document").map((f) => (
                  <EditField key={f.key} k={f.key} label={f.label} type={f.type === "date" ? "date" : f.type === "number" ? "number" : "text"} form={editForm} setForm={setEditForm} />
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button onClick={saveEdit} className="bg-zinc-900 hover:bg-zinc-800 text-white" data-testid="confirm-edit">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Renewal dialog */}
      <Dialog open={showRenewal} onOpenChange={setShowRenewal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Submit Renewal</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-700">Document Type</Label>
              <select
                value={renewalForm.doc_type}
                onChange={(e) => setRenewalForm({ ...renewalForm, doc_type: e.target.value })}
                data-testid="renewal-doc-type"
                className="w-full h-9 rounded-md border border-zinc-300 px-3 text-sm"
              >
                {RENEWABLE.map((r) => (
                  <option key={r.key} value={r.key}>{r.label}</option>
                ))}
              </select>
            </div>
            {renewalForm.doc_type === "medical_certificate" && (
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-700">New Medical Test Date</Label>
                <Input type="date" value={renewalForm.test_date} onChange={(e) => setRenewalForm({ ...renewalForm, test_date: e.target.value })} data-testid="renewal-test-date" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-700">New Expiry Date *</Label>
              <Input type="date" value={renewalForm.expiry_date} onChange={(e) => setRenewalForm({ ...renewalForm, expiry_date: e.target.value })} data-testid="renewal-expiry-date" required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-700">Certificate File *</Label>
              <Input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setRenewalForm({ ...renewalForm, file: e.target.files?.[0] })} data-testid="renewal-file" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRenewal(false)}>Cancel</Button>
            <Button onClick={submitRenewal} disabled={uploading} className="bg-zinc-900 hover:bg-zinc-800 text-white" data-testid="confirm-renewal">
              {uploading ? "Uploading…" : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}

function Detail({ label, value, mono }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`${mono ? "mono" : ""} text-sm text-zinc-900 mt-0.5`}>{value || "—"}</div>
    </div>
  );
}

function HistoryList({ title, items }) {
  if (!items || items.length === 0) {
    return (
      <div>
        <h3 className="text-sm font-medium text-zinc-900 mb-2">{title}</h3>
        <p className="text-xs text-zinc-500">No entries.</p>
      </div>
    );
  }
  return (
    <div>
      <h3 className="text-sm font-medium text-zinc-900 mb-2">{title}</h3>
      <div className="space-y-2">
        {items.map((h, i) => (
          <div key={i} className="border-l-2 border-zinc-200 pl-3 py-1">
            <div className="text-xs text-zinc-500">{h.at?.slice(0, 19).replace("T", " ")} · {h.by}</div>
            <div className="text-sm text-zinc-900">
              <StatusBadge status={h.action === "approved" ? "approved" : "rejected"} /> {h.comment || ""}
              {h.doc_type && <span className="ml-2 text-xs text-zinc-600">[{h.doc_type.replace(/_/g, " ")}]</span>}
              {h.new_expiry && <span className="ml-2 text-xs text-zinc-600">→ until {h.new_expiry}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EditField({ k, label, type, form, setForm, readOnly }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-zinc-700">{label}</Label>
      <Input
        type={type || "text"}
        value={form[k] || ""}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
        data-testid={`edit-${k}`}
        disabled={readOnly}
      />
    </div>
  );
}
