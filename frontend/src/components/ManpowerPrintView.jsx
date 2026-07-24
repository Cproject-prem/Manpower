import { API, docUrl } from "@/lib/api";

const IMAGE_EXT = /\.(jpe?g|png|gif|webp)$/i;
const PDF_EXT = /\.pdf$/i;

/**
 * Hidden on screen; shown only when printing. Renders manpower header,
 * all detail fields, custom fields, and every document slot — for image docs
 * the actual image is embedded inline; for PDFs, file name + uploaded status;
 * for missing docs, a "Missing" badge.
 */
export default function ManpowerPrintView({ manpower, docTypes, contractor, memberName, config, docBlobs }) {
  if (!manpower) return null;
  const m = manpower;
  const docsByType = {};
  (m.documents || []).forEach((d) => {
    if (!docsByType[d.doc_type]) docsByType[d.doc_type] = [];
    docsByType[d.doc_type].push(d);
  });

  return (
    <div className="print-only" data-testid="manpower-print-view" style={{ padding: "12px 16px", color: "#18181b" }}>
      {/* Header */}
      <div style={{ borderBottom: "2px solid #18181b", paddingBottom: 10, marginBottom: 14 }}>
        <div style={{ fontSize: 11, letterSpacing: 2, color: "#52525b", textTransform: "uppercase" }}>Manpower Profile</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
          <h1 style={{ fontSize: 24, margin: "4px 0", fontFamily: "Cabinet Grotesk, sans-serif" }}>{m.full_name}</h1>
          {m.manpower_id && <div className="mono" style={{ fontSize: 14 }}>{m.manpower_id}</div>}
        </div>
        <div style={{ fontSize: 12, color: "#52525b" }}>
          {contractor?.name || "No contractor"} · Member: {memberName || "—"} · Status: <strong>{m.display_status || m.status}</strong>
        </div>
      </div>

      {/* Details grid */}
      <Section title="Details">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", columnGap: 14, rowGap: 6, fontSize: 11 }}>
          <KV label="Phone" value={m.phone} />
          <KV label="Blood Group" value={m.blood_group} />
          <KV label="Reporting Mgr Email" value={m.reporting_manager_email} />
          <KV label="Medical Test Date" value={m.medical_test_date} />
          <KV label="Medical Expiry" value={m.medical_expiry_date} />
          <KV label="Height Work Expiry" value={m.height_work_expiry_date} />
          <KV label="Safety Belt Expiry" value={m.safety_belt_expiry_date} />
          <KV label="Company" value={m.company_name} />
          <KV label="Street" value={m.street_address} />
          <KV label="City" value={m.city} />
          <KV label="State" value={m.state} />
          <KV label="Postal Code" value={m.postal_code} />
          <KV label="Location" value={m.location} />
          <KV label="Cluster Mgr" value={m.reporting_cluster_manager} />
          <KV label="Work State" value={m.work_state} />
          <KV label="Subvendor" value={m.subvendor} />
          <KV label="Reference" value={m.reference} />
        </div>
      </Section>

      {/* Custom fields */}
      {config && m.extra_fields && Object.keys(m.extra_fields).length > 0 && (
        <Section title="Custom Fields">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", columnGap: 14, rowGap: 6, fontSize: 11 }}>
            {config.sections.flatMap((s) => s.fields).filter((f) => !f.system && m.extra_fields[f.key] != null).map((f) => (
              <KV key={f.key} label={f.label} value={m.extra_fields[f.key]} />
            ))}
          </div>
        </Section>
      )}

      {/* Documents */}
      <Section title="Documents">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {docTypes.map((dt) => {
            const docs = docsByType[dt.key] || [];
            const doc = docs[0];
            return (
              <div key={dt.key} className="print-doc-card" style={{ border: "1px solid #d4d4d8", borderRadius: 6, padding: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{dt.label}</div>
                  <div style={{ fontSize: 10, color: doc ? "#047857" : "#b45309" }}>
                    {doc ? "Uploaded" : "Missing"}
                  </div>
                </div>
                {doc ? (
                  <DocPreview doc={doc} blobUrl={docBlobs?.[doc.id]} />
                ) : (
                  <div style={{
                    height: 70,
                    border: "1px dashed #d4d4d8",
                    borderRadius: 4,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#a1a1aa",
                    fontSize: 10,
                  }}>
                    Not uploaded
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      <div style={{ marginTop: 16, fontSize: 9, color: "#71717a", textAlign: "right" }}>
        Generated: {new Date().toLocaleString()}
      </div>
    </div>
  );
}

function DocPreview({ doc, blobUrl }) {
  const isImage = IMAGE_EXT.test(doc.file_name || "");
  const isPdf = PDF_EXT.test(doc.file_name || "");
  if (isImage) {
    return (
      <img
        src={blobUrl || docUrl(doc.id)}
        alt={doc.file_name}
        className="print-img"
      />
    );
  }
  return (
    <div style={{
      border: "1px solid #e4e4e7",
      borderRadius: 4,
      padding: 10,
      fontSize: 11,
      color: "#3f3f46",
    }}>
      <div style={{ fontWeight: 500 }}>{isPdf ? "PDF Document" : "File"}: {doc.file_name}</div>
      <div style={{ fontSize: 9, color: "#71717a", marginTop: 4 }}>
        Uploaded: {doc.uploaded_at?.slice(0, 19).replace("T", " ")}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: 1.5,
        color: "#52525b",
        marginBottom: 6,
        borderBottom: "1px solid #e4e4e7",
        paddingBottom: 2,
      }}>{title}</div>
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
