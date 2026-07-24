import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Upload, Plus, Trash2, Save, Layers, Download } from "lucide-react";
import { api, formatApiError, API, getToken } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// Simple client-side uuid replacement (avoids extra dep)
const uid = () => `r-${Math.random().toString(36).slice(2, 10)}`;

export default function VendorEvaluationDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const canEdit = user?.role === "super_admin" || user?.role === "admin";
  const canDelete = user?.role === "super_admin";
  const fileRef = useRef(null);
  const [ev, setEv] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () => {
    api.get(`/vendor-evaluations/${id}`).then((r) => { setEv(r.data); setDirty(false); })
      .catch((e) => toast.error(formatApiError(e)));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  if (!ev) return <div className="p-6 text-zinc-500 text-sm">Loading…</div>;

  // ---------- Excel upload ----------
  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".xlsx")) {
      toast.error("Please choose a .xlsx file");
      return;
    }
    const form = new FormData();
    form.append("file", f);
    try {
      const { data } = await api.post(`/vendor-evaluations/${id}/import`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setEv(data);
      setDirty(false);
      toast.success(`Imported ${data.rows.length} rows · ${data.columns.length} columns. Now map columns below.`);
    } catch (err) { toast.error(formatApiError(err)); }
  };

  // ---------- Mapping ----------
  const setMapping = async (patch) => {
    const next = { ...(ev.column_mapping || {}), ...patch };
    try {
      const { data } = await api.put(`/vendor-evaluations/${id}/mapping`, next);
      setEv(data);
      toast.success("Column mapping updated");
    } catch (e) { toast.error(formatApiError(e)); }
  };

  // ---------- Local edits (rows/cells/columns) — saved via Save button ----------
  const patch = (nextEv) => { setEv(nextEv); setDirty(true); };

  const addColumn = () => {
    const key = `c${ev.columns.length}_${Math.random().toString(36).slice(2, 6)}`;
    patch({ ...ev, columns: [...ev.columns, { key, label: `Column ${ev.columns.length + 1}` }] });
  };
  const renameColumn = (idx, label) => {
    const cols = [...ev.columns];
    cols[idx] = { ...cols[idx], label };
    patch({ ...ev, columns: cols });
  };
  const removeColumn = (idx) => {
    if (!window.confirm("Remove this column? All cell values in it will be lost.")) return;
    const col = ev.columns[idx];
    const cols = ev.columns.filter((_, i) => i !== idx);
    const strip = (rows) => rows.map((r) => ({
      ...r,
      cells: Object.fromEntries(Object.entries(r.cells || {}).filter(([k]) => k !== col.key)),
      sub_rows: r.sub_rows ? strip(r.sub_rows) : [],
    }));
    // Also clear from mapping
    const cm = { ...(ev.column_mapping || {}) };
    ["weightage_col", "actual_col", "max_col"].forEach((k) => { if (cm[k] === col.key) delete cm[k]; });
    patch({ ...ev, columns: cols, rows: strip(ev.rows || []), column_mapping: cm });
  };

  const addRow = (parentPath = null) => {
    const newRow = { id: uid(), is_section: false, label: "", cells: {}, sub_rows: [], weighted_score: null };
    if (!parentPath) {
      patch({ ...ev, rows: [...(ev.rows || []), newRow] });
      return;
    }
    const rows = structuredClone(ev.rows);
    let cursor = rows[parentPath[0]];
    for (let i = 1; i < parentPath.length; i++) cursor = cursor.sub_rows[parentPath[i]];
    cursor.sub_rows = [...(cursor.sub_rows || []), newRow];
    patch({ ...ev, rows });
  };
  const addSection = () => {
    patch({
      ...ev,
      rows: [...(ev.rows || []), {
        id: uid(), is_section: true, label: "Section total", cells: {}, sub_rows: [], weighted_score: null,
      }],
    });
  };
  const setCell = (rowPath, colKey, value) => {
    const rows = structuredClone(ev.rows);
    let target = rows[rowPath[0]];
    for (let i = 1; i < rowPath.length; i++) target = target.sub_rows[rowPath[i]];
    target.cells = { ...(target.cells || {}), [colKey]: value };
    patch({ ...ev, rows });
  };
  const setRowLabel = (rowPath, label) => {
    const rows = structuredClone(ev.rows);
    let target = rows[rowPath[0]];
    for (let i = 1; i < rowPath.length; i++) target = target.sub_rows[rowPath[i]];
    target.label = label;
    patch({ ...ev, rows });
  };
  const removeRow = (rowPath) => {
    if (!window.confirm("Delete this row?")) return;
    const rows = structuredClone(ev.rows);
    if (rowPath.length === 1) {
      rows.splice(rowPath[0], 1);
    } else {
      let parent = rows[rowPath[0]];
      for (let i = 1; i < rowPath.length - 1; i++) parent = parent.sub_rows[rowPath[i]];
      parent.sub_rows.splice(rowPath[rowPath.length - 1], 1);
    }
    patch({ ...ev, rows });
  };

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.put(`/vendor-evaluations/${id}`, {
        title: ev.title,
        period: ev.period,
        columns: ev.columns,
        rows: ev.rows,
      });
      setEv(data);
      setDirty(false);
      toast.success(`Saved. Grand total: ${Number(data.grand_total || 0).toFixed(2)}`);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    if (!window.confirm("Delete this evaluation permanently?")) return;
    try {
      await api.delete(`/vendor-evaluations/${id}`);
      toast.success("Deleted");
      nav("/vendor-evaluations");
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const mapping = ev.column_mapping || {};

  return (
    <div className="space-y-6" data-testid="vendor-eval-detail-page">
      <div className="flex items-start justify-between gap-4">
        <div>
          <button onClick={() => nav("/vendor-evaluations")} className="text-xs text-zinc-500 hover:text-zinc-900 flex items-center gap-1 mb-2">
            <ArrowLeft size={12} /> Back to Vendor Evaluations
          </button>
          <h1 className="text-2xl font-semibold text-zinc-900" style={{ fontFamily: "Cabinet Grotesk" }}>{ev.title}</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {ev.contractor_name} · {ev.period || "no period"} · {(ev.rows || []).length} rows
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">Grand Total</div>
            <div className="text-3xl font-semibold text-zinc-900 tabular-nums" style={{ fontFamily: "Cabinet Grotesk" }} data-testid="grand-total">
              {Number(ev.grand_total || 0).toFixed(2)}
            </div>
            <div className="text-[10px] text-zinc-500 tabular-nums">Weight: {Number(ev.total_weight || 0).toFixed(2)}</div>
          </div>
        </div>
      </div>

      {canEdit && (
        <div className="bg-white border border-zinc-200 rounded-lg p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={onFile} data-testid="eval-file-input" />
            <Button variant="outline" onClick={() => fileRef.current?.click()} data-testid="import-xlsx-btn">
              <Upload size={14} className="mr-1.5" /> Import Excel (.xlsx)
            </Button>
            <Button variant="outline" onClick={addColumn} data-testid="add-column-btn"><Plus size={14} className="mr-1.5" /> Column</Button>
            <Button variant="outline" onClick={() => addRow(null)} data-testid="add-row-btn"><Plus size={14} className="mr-1.5" /> Row</Button>
            <Button variant="outline" onClick={addSection} data-testid="add-section-btn"><Layers size={14} className="mr-1.5" /> Section</Button>
            <a
              href={`${API}/vendor-evaluations/${id}/export.xlsx?token=${encodeURIComponent(getToken() || "")}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center h-9 px-3 rounded-md border border-zinc-200 text-sm text-zinc-800 hover:bg-zinc-50"
              data-testid="export-xlsx-btn"
            >
              <Download size={14} className="mr-1.5" /> Export .xlsx
            </a>
            <div className="flex-1" />
            {canDelete && <Button variant="outline" onClick={remove} className="text-rose-700 border-rose-200 hover:bg-rose-50" data-testid="delete-eval-btn"><Trash2 size={14} className="mr-1.5" /> Delete</Button>}
            <Button
              onClick={save}
              disabled={!dirty || saving}
              className="bg-zinc-900 hover:bg-zinc-800 text-white"
              data-testid="save-eval-btn"
            >
              <Save size={14} className="mr-1.5" /> {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
            </Button>
          </div>

          {/* Column mapping */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-zinc-100">
            <MappingSelector label="Weightage column" columns={ev.columns} value={mapping.weightage_col} onChange={(v) => setMapping({ weightage_col: v })} testId="map-weightage" />
            <MappingSelector label="Actual-score column" columns={ev.columns} value={mapping.actual_col} onChange={(v) => setMapping({ actual_col: v })} testId="map-actual" />
            <MappingSelector label="Max/Total-score column" columns={ev.columns} value={mapping.max_col} onChange={(v) => setMapping({ max_col: v })} testId="map-max" />
          </div>
          <p className="text-[11px] text-zinc-500">
            Formula per row: <code>weighted_score = (actual / max) × weightage</code>. Sections roll their children up.
            Cells starting with <code>=</code> are formulas — supported:
            <code>=A2*B2</code>, <code>=(A2/B2)*C2</code>, <code>=SUM(A)</code>, <code>=SUM(A2:A10)</code>,
            <code>=AVG(A)</code>, <code>=MAX(A)</code>, <code>=MIN(A)</code>. Letters are column indices (A=1st, B=2nd, …), numbers are 1-based leaf-row indices.
          </p>
        </div>
      )}

      {/* Grid */}
      <div className="bg-white border border-zinc-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left py-2 px-3 font-medium w-64">Description</th>
              {ev.columns.map((c, idx) => (
                <ColumnHeader
                  key={c.key}
                  col={c}
                  idx={idx}
                  role={
                    mapping.weightage_col === c.key ? "weight"
                    : mapping.actual_col === c.key ? "actual"
                    : mapping.max_col === c.key ? "max" : null
                  }
                  editable={canEdit}
                  onRename={(label) => renameColumn(idx, label)}
                  onRemove={() => removeColumn(idx)}
                />
              ))}
              <th className="text-right py-2 px-3 font-medium bg-zinc-100">Weighted Score</th>
              {canEdit && <th className="w-10"></th>}
            </tr>
          </thead>
          <tbody>
            {(ev.rows || []).length === 0 && (
              <tr><td colSpan={ev.columns.length + 3} className="text-center py-12 text-zinc-500">No rows. Import an Excel file or add rows manually.</td></tr>
            )}
            {(ev.rows || []).map((r, i) => (
              <RowNode
                key={r.id}
                row={r}
                path={[i]}
                depth={0}
                columns={ev.columns}
                canEdit={canEdit}
                onCell={setCell}
                onLabel={setRowLabel}
                onAddSub={addRow}
                onRemove={removeRow}
              />
            ))}
          </tbody>
          <tfoot className="bg-zinc-100 border-t-2 border-zinc-300">
            <tr>
              <td className="py-3 px-3 font-medium text-zinc-900 uppercase text-xs tracking-wider">Grand Total</td>
              <td colSpan={ev.columns.length} className="py-3 px-3 text-right text-zinc-500 text-xs">
                Sum of leaf-row weighted scores
              </td>
              <td className="py-3 px-3 text-right text-lg font-semibold text-zinc-900 tabular-nums bg-zinc-200/50" data-testid="grid-grand-total">
                {Number(ev.grand_total || 0).toFixed(2)}
              </td>
              {canEdit && <td></td>}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function ColumnHeader({ col, idx, role, editable, onRename, onRemove }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(col.label);
  useEffect(() => setLabel(col.label), [col.label]);
  const roleColor = { weight: "bg-amber-100 text-amber-800", actual: "bg-emerald-100 text-emerald-800", max: "bg-blue-100 text-blue-800" }[role];
  return (
    <th className="text-left py-2 px-3 font-medium border-l border-zinc-100 min-w-[120px]" data-testid={`col-${col.key}`}>
      <div className="flex items-center gap-1">
        {editing && editable ? (
          <input
            className="h-6 text-xs border border-zinc-200 rounded px-1.5 w-full"
            value={label}
            autoFocus
            onChange={(e) => setLabel(e.target.value)}
            onBlur={() => { setEditing(false); if (label !== col.label) onRename(label); }}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          />
        ) : (
          <button className="text-left flex-1" onClick={() => editable && setEditing(true)} title={editable ? "Click to rename" : ""}>
            {col.label}
          </button>
        )}
        {role && <span className={`text-[9px] px-1 py-0.5 rounded ${roleColor}`}>{role}</span>}
        {editable && (
          <button onClick={onRemove} className="text-zinc-400 hover:text-rose-600 text-sm leading-none px-1" title="Remove column">×</button>
        )}
      </div>
    </th>
  );
}

function MappingSelector({ label, columns, value, onChange, testId }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-zinc-700">{label}</Label>
      <Select value={value || "__none__"} onValueChange={(v) => onChange(v === "__none__" ? null : v)}>
        <SelectTrigger data-testid={testId}><SelectValue placeholder="— none —" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— none —</SelectItem>
          {columns.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function RowNode({ row, path, depth, columns, canEdit, onCell, onLabel, onAddSub, onRemove }) {
  const bg = row.is_section ? "bg-zinc-50/70" : "bg-white";
  return (
    <>
      <tr className={`border-b border-zinc-100 ${bg}`} data-testid={`eval-row-${row.id}`}>
        <td className="py-1.5 px-3">
          <div className="flex items-center gap-1.5" style={{ paddingLeft: depth * 16 }}>
            {row.is_section && <Layers size={12} className="text-zinc-500" />}
            {canEdit ? (
              <input
                className={`h-7 text-sm w-full bg-transparent border-0 focus:ring-1 focus:ring-zinc-300 rounded px-1 ${row.is_section ? "font-medium text-zinc-800" : "text-zinc-800"}`}
                value={row.label || ""}
                placeholder={row.is_section ? "Section label" : "Row label / description"}
                onChange={(e) => onLabel(path, e.target.value)}
              />
            ) : (
              <span className={row.is_section ? "font-medium text-zinc-800" : "text-zinc-800"}>{row.label || <span className="text-zinc-400">—</span>}</span>
            )}
          </div>
        </td>
        {columns.map((c) => {
          const raw = row.cells?.[c.key] ?? "";
          const computed = row.computed_cells?.[c.key];
          const isFormula = typeof raw === "string" && raw.startsWith("=");
          return (
            <td key={c.key} className="py-1.5 px-2 border-l border-zinc-50">
              {row.is_section ? <span className="text-zinc-400 text-xs">—</span> : canEdit ? (
                <div className="relative">
                  <input
                    className={`h-7 text-sm w-full bg-transparent border-0 focus:ring-1 focus:ring-zinc-300 rounded px-1 ${isFormula ? "font-mono text-[11px] text-blue-700" : ""}`}
                    value={raw}
                    onChange={(e) => onCell(path, c.key, e.target.value)}
                    data-testid={`cell-${row.id}-${c.key}`}
                  />
                  {isFormula && computed != null && (
                    <span className="absolute right-1 top-0.5 text-[9px] px-1 rounded bg-blue-50 text-blue-700 tabular-nums pointer-events-none">
                      = {Number(computed).toFixed(2)}
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-zinc-700 tabular-nums">
                  {isFormula && computed != null ? Number(computed).toFixed(2) : raw}
                </span>
              )}
            </td>
          );
        })}
        <td className="py-1.5 px-3 text-right tabular-nums font-medium text-zinc-900 bg-zinc-50/60">
          {row.weighted_score == null ? "—" : Number(row.weighted_score).toFixed(2)}
        </td>
        {canEdit && (
          <td className="py-1.5 px-1 text-right whitespace-nowrap">
            {row.is_section && (
              <button onClick={() => onAddSub(path)} className="text-zinc-400 hover:text-zinc-900 text-xs px-1" title="Add sub-row">+</button>
            )}
            <button onClick={() => onRemove(path)} className="text-zinc-400 hover:text-rose-600 text-sm leading-none px-1" title="Remove row">×</button>
          </td>
        )}
      </tr>
      {(row.sub_rows || []).map((sr, i) => (
        <RowNode
          key={sr.id}
          row={sr}
          path={[...path, i]}
          depth={depth + 1}
          columns={columns}
          canEdit={canEdit}
          onCell={onCell}
          onLabel={onLabel}
          onAddSub={onAddSub}
          onRemove={onRemove}
        />
      ))}
    </>
  );
}
