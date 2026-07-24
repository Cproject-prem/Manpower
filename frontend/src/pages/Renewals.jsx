import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";

function computeRenewalsNeeded(m) {
  const today = new Date();
  const checks = [
    { field: "medical_expiry_date", label: "Medical" },
    { field: "height_work_expiry_date", label: "Height Work" },
    { field: "safety_belt_expiry_date", label: "Safety Belt" },
    { field: "extension_rope_expiry_date", label: "Extension Rope" },
    { field: "ppe_register_expiry_date", label: "PPE Register" },
  ];
  const need = [];
  for (const c of checks) {
    const v = m[c.field];
    if (!v) continue;
    const exp = new Date(v);
    const days = Math.floor((exp - today) / (1000 * 60 * 60 * 24));
    if (days <= 30) need.push({ ...c, days, expiry: v });
  }
  return need;
}

export default function Renewals() {
  const [rows, setRows] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/manpower", { params: { page: 1, page_size: 200 } }).then((r) => {
      const out = [];
      r.data.items.forEach((m) => {
        const need = computeRenewalsNeeded(m);
        if (need.length || m.renewal_pending) out.push({ m, need });
      });
      setRows(out);
    });
  }, []);

  return (
    <div className="space-y-6" data-testid="renewals-page">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Compliance</p>
        <h1 className="text-3xl tracking-tight font-semibold text-zinc-900" style={{ fontFamily: "Cabinet Grotesk" }}>
          Renewal Required
        </h1>
        <p className="mt-1 text-sm text-zinc-600">Manpower with one or more certificates expiring within 30 days, already expired, or pending renewal approval.</p>
      </div>

      <div className="bg-white border border-zinc-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600">
            <tr>
              <th className="text-left py-2 px-4 font-medium">Manpower ID</th>
              <th className="text-left py-2 px-4 font-medium">Name</th>
              <th className="text-left py-2 px-4 font-medium">Renewal Required</th>
              <th className="text-left py-2 px-4 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={4} className="text-center py-12 text-zinc-500">No renewals needed.</td></tr>
            )}
            {rows.map(({ m, need }) => (
              <tr key={m.id} onClick={() => navigate(`/manpower/${m.id}`)}
                  data-testid={`renewal-row-${m.id}`}
                  className="border-b border-zinc-100 hover:bg-zinc-50 cursor-pointer">
                <td className="py-3 px-4"><span className="id-pill">{m.manpower_id || "—"}</span></td>
                <td className="py-3 px-4 text-zinc-900 font-medium">{m.full_name}</td>
                <td className="py-3 px-4">
                  <div className="flex flex-wrap gap-1.5">
                    {need.map((n) => (
                      <span
                        key={n.field}
                        data-testid={`needs-${m.id}-${n.field}`}
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${n.days < 0 ? "border-rose-200 bg-rose-50 text-rose-700" : "border-orange-200 bg-orange-50 text-orange-700"}`}
                      >
                        {n.label} · {n.days < 0 ? `expired ${-n.days}d ago` : `${n.days}d left`}
                      </span>
                    ))}
                    {m.renewal_pending && (
                      <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 text-blue-700 px-2 py-0.5 text-xs">
                        Awaiting Approval ({m.pending_renewal?.doc_type?.replace(/_/g, " ") || ""})
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-3 px-4"><StatusBadge status={m.display_status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

