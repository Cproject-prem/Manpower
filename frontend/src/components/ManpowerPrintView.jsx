import { API } from "@/lib/api";

const IMAGE_EXT = /\.(jpe?g|png|gif|webp)$/i;
const PDF_EXT   = /\.pdf$/i;

/**
 * Hidden on screen; shown only when printing.
 *
 * Page 1  : Profile details + document summary table
 * Page 2+ : One full page per uploaded document
 *           - Images → <img> (always prints)
 *           - PDFs   → rasterised by PDF.js → array of <img> pages (one page per print-page)
 * Last    : Missing document placeholders
 */
export default function ManpowerPrintView({ manpower, docTypes, contractor, memberName, docBlobs, pdfPages }) {
  if (!manpower) return null;
  const m = manpower;

  // Build lookup: doc_type → first uploaded doc
  const docByType = {};
  (m.documents || []).forEach((d) => {
    if (!docByType[d.doc_type]) docByType[d.doc_type] = d;
  });

  const uploaded = docTypes.filter((dt) => docByType[dt.key]);
  const missing  = docTypes.filter((dt) => !docByType[dt.key]);

  return (
    <div className="print-only" data-testid="manpower-print-view" style={{ color: "#18181b" }}>

      {/* ── PAGE 1: Profile + document summary ───────────────────────────── */}
      <div style={{ padding: "16px 20px", pageBreakAfter: "always" }}>
        {/* Header */}
        <div style={{ borderBottom: "2px solid #18181b", paddingBottom: 10, marginBottom: 14 }}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: "#52525b", textTransform: "uppercase" }}>Manpower Profile</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
            <h1 style={{ fontSize: 24, margin: "4px 0", fontFamily: "Cabinet Grotesk, sans-serif" }}>{m.full_name}</h1>
            {m.manpower_id && <div className="mono" style={{ fontSize: 14 }}>{m.manpower_id}</div>}
          </div>
          <div style={{ fontSize: 12, color: "#52525b" }}>
            {contractor?.name || "No contractor"} &middot; Member: {memberName || "—"} &middot; Status: <strong>{m.display_status || m.status}</strong>
          </div>
        </div>

        {/* Details grid */}
        <Section title="Details">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", columnGap: 14, rowGap: 6, fontSize: 11 }}>
            <KV label="Phone"               value={m.phone} />
            <KV label="Blood Group"         value={m.blood_group} />
            <KV label="Reporting Mgr Email" value={m.reporting_manager_email} />
            <KV label="Medical Test Date"   value={m.medical_test_date} />
            <KV label="Medical Expiry"      value={m.medical_expiry_date} />
            <KV label="Height Work Expiry"  value={m.height_work_expiry_date} />
            <KV label="Safety Belt Expiry"  value={m.safety_belt_expiry_date} />
            <KV label="Company"             value={m.company_name} />
            <KV label="Street"              value={m.street_address} />
            <KV label="City"                value={m.city} />
            <KV label="State"               value={m.state} />
            <KV label="Postal Code"         value={m.postal_code} />
            <KV label="Location"            value={m.location} />
            <KV label="Cluster Mgr"         value={m.reporting_cluster_manager} />
            <KV label="Work State"          value={m.work_state} />
            <KV label="Subvendor"           value={m.subvendor} />
            <KV label="Reference"           value={m.reference} />
          </div>
        </Section>

        {/* Document summary table */}
        <Section title="Documents">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #d4d4d8" }}>
                <th style={{ textAlign: "left", padding: "4px 6px", fontWeight: 600 }}>Document</th>
                <th style={{ textAlign: "left", padding: "4px 6px", fontWeight: 600 }}>Status</th>
                <th style={{ textAlign: "left", padding: "4px 6px", fontWeight: 600 }}>File Name</th>
              </tr>
            </thead>
            <tbody>
              {docTypes.map((dt) => {
                const doc = docByType[dt.key];
                return (
                  <tr key={dt.key} style={{ borderBottom: "1px solid #e4e4e7" }}>
                    <td style={{ padding: "4px 6px" }}>{dt.label}</td>
                    <td style={{ padding: "4px 6px", color: doc ? "#047857" : "#b45309", fontWeight: 500 }}>
                      {doc ? "Uploaded" : "Missing"}
                    </td>
                    <td style={{ padding: "4px 6px", color: "#52525b" }}>{doc ? doc.file_name : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>

        <div style={{ marginTop: 16, fontSize: 9, color: "#71717a", textAlign: "right" }}>
          Generated: {new Date().toLocaleString()}
        </div>
      </div>

      {/* ── PAGE 2+: One full page per uploaded document ─────────────────── */}
      {uploaded.map((dt) => {
        const doc     = docByType[dt.key];
        const blobUrl = docBlobs?.[doc.id];
        const isImage = IMAGE_EXT.test(doc.file_name || "");
        const isPdf   = PDF_EXT.test(doc.file_name || "");
        const pages   = pdfPages?.[doc.id]; // string[] of data-URL PNGs (one per PDF page)

        if (isPdf && pages && pages.length > 0) {
          // Render every PDF page as its own print page
          return pages.map((pageDataUrl, idx) => (
            <div
              key={`${dt.key}-page-${idx}`}
              style={{
                pageBreakBefore: "always",
                height: "100vh",
                display: "flex",
                flexDirection: "column",
                padding: "12px 16px",
                boxSizing: "border-box",
              }}
            >
              <DocHeader dt={dt} m={m} doc={doc} extra={pages.length > 1 ? ` (page ${idx + 1} of ${pages.length})` : ""} />
              <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
                <img
                  src={pageDataUrl}
                  alt={`${doc.file_name} page ${idx + 1}`}
                  style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                />
              </div>
            </div>
          ));
        }

        // Image or PDF without rasterised pages (fallback)
        return (
          <div
            key={dt.key}
            style={{
              pageBreakBefore: "always",
              height: "100vh",
              display: "flex",
              flexDirection: "column",
              padding: "12px 16px",
              boxSizing: "border-box",
            }}
          >
            <DocHeader dt={dt} m={m} doc={doc} />
            <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
              {isImage && (
                <img
                  src={blobUrl || `${API}/documents/${doc.id}`}
                  alt={doc.file_name}
                  style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                />
              )}
              {isPdf && !pages && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 8, color: "#52525b" }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>PDF: {doc.file_name}</div>
                  <div style={{ fontSize: 11, color: "#a1a1aa" }}>Preparing document…</div>
                </div>
              )}
              {!isImage && !isPdf && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 8, color: "#52525b" }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{doc.file_name}</div>
                  <div style={{ fontSize: 11 }}>Uploaded: {doc.uploaded_at?.slice(0, 10)}</div>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* ── LAST: Missing document placeholders ──────────────────────────── */}
      {missing.length > 0 && (
        <div style={{ pageBreakBefore: "always", padding: "16px 20px" }}>
          <Section title="Missing Documents">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {missing.map((dt) => (
                <div
                  key={dt.key}
                  style={{
                    border: "1px dashed #d4d4d8",
                    borderRadius: 6,
                    padding: "24px 12px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#3f3f46" }}>{dt.label}</div>
                  <div style={{ fontSize: 10, color: "#b45309", fontWeight: 500 }}>Not Uploaded</div>
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}

// Small header strip at top of each document page
function DocHeader({ dt, m, doc, extra = "" }) {
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "baseline",
      borderBottom: "1px solid #d4d4d8",
      paddingBottom: 6,
      marginBottom: 8,
      flexShrink: 0,
    }}>
      <div>
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.5, color: "#52525b" }}>
          {dt.label}{extra}
        </div>
        <div style={{ fontSize: 12, fontWeight: 600 }}>
          {m.full_name}{m.manpower_id ? ` · ${m.manpower_id}` : ""}
        </div>
      </div>
      <div style={{ fontSize: 10, color: "#52525b" }}>{doc.file_name}</div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.5, color: "#52525b", marginBottom: 6, borderBottom: "1px solid #e4e4e7", paddingBottom: 2 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function KV({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: "#71717a", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 11, color: "#18181b" }}>{value || "—"}</div>
    </div>
  );
}
