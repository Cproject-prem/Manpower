import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { api, API, docUrl } from "@/lib/api";

export default function Documents() {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    api.get("/manpower", { params: { page: 1, page_size: 500 } }).then((r) => {
      const out = [];
      r.data.items.forEach((m) => {
        (m.documents || []).forEach((d) => {
          out.push({ ...d, manpower_id: m.manpower_id, manpower_name: m.full_name, mid: m.id });
        });
      });
      setRows(out);
    });
  }, []);

  return (
    <div className="space-y-6" data-testid="documents-page">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Files</p>
        <h1 className="text-3xl tracking-tight font-semibold text-zinc-900" style={{ fontFamily: "Cabinet Grotesk" }}>
          Documents
        </h1>
        <p className="mt-1 text-sm text-zinc-600">All uploaded files across your visible manpower.</p>
      </div>

      <div className="bg-white border border-zinc-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600">
            <tr>
              <th className="text-left py-2 px-4 font-medium">Manpower</th>
              <th className="text-left py-2 px-4 font-medium">Doc Type</th>
              <th className="text-left py-2 px-4 font-medium">File</th>
              <th className="text-left py-2 px-4 font-medium">Uploaded</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} className="text-center py-12 text-zinc-500">No documents.</td></tr>
            )}
            {rows.map((d) => (
              <tr key={d.id} className="border-b border-zinc-100 hover:bg-zinc-50" data-testid={`doc-row-${d.id}`}>
                <td className="py-3 px-4">
                  <div className="font-medium text-zinc-900">{d.manpower_name}</div>
                  <div className="text-xs"><span className="id-pill">{d.manpower_id || "—"}</span></div>
                </td>
                <td className="py-3 px-4 text-zinc-700">{d.doc_type}</td>
                <td className="py-3 px-4 text-zinc-600 truncate max-w-[20ch]">{d.file_name}</td>
                <td className="py-3 px-4 text-zinc-500 text-xs">{d.uploaded_at?.slice(0, 16).replace("T", " ")}</td>
                <td className="py-3 px-4 text-right">
                  <a href={docUrl(d.id)} target="_blank" rel="noreferrer"
                     data-testid={`doc-download-${d.id}`}
                     className="text-zinc-600 hover:text-zinc-900 inline-flex items-center gap-1 text-xs">
                    <Download size={12} /> Open
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

