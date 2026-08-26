import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import StatusBadge from "@/components/StatusBadge";
import ColumnFilterPanel from "@/components/ColumnFilterPanel";

export default function ManpowerList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [contractor, setContractor] = useState("all");
  const [contractors, setContractors] = useState([]);
  const [members, setMembers] = useState([]);
  const [member, setMember] = useState("all");
  const [region, setRegion] = useState("all");
  const [regions, setRegions] = useState([]);
  const [page, setPage] = useState(1);
  const [includeDisabled, setIncludeDisabled] = useState(false);
  const [columnFilters, setColumnFilters] = useState(() => {
    // Hydrate from URL ?filters=<json>
    try {
      const s = new URLSearchParams(window.location.search).get("filters");
      return s ? JSON.parse(s) : {};
    } catch {
      return {};
    }
  });
  const pageSize = 25;

  const load = async () => {
    const params = { page, page_size: pageSize };
    if (q) params.q = q;
    if (status !== "all") params.status = status;
    if (contractor !== "all") params.contractor_id = contractor;
    if (member !== "all") params.assigned_member_id = member;
    if (region !== "all") params.region = region;
    if (includeDisabled) params.include_disabled = true;
    if (columnFilters && Object.keys(columnFilters).length > 0) {
      params.filters = JSON.stringify(columnFilters);
    }
    const { data } = await api.get("/manpower", { params });
    setItems(data.items);
    setTotal(data.total);
  };

  useEffect(() => {
    api.get("/contractors").then((r) => setContractors(r.data));
    api.get("/settings/regions").then((r) => {
      const all = r.data.regions || [];
      const scope = user?.region_scope || [];
      setRegions(scope.length > 0 ? all.filter((x) => scope.includes(x)) : all);
    }).catch(() => setRegions([]));
    if (user?.role === "super_admin" || user?.role === "admin") {
      api.get("/users").then((r) => setMembers(r.data.filter((u) => u.role === "member")));
    }
  }, [user]);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page, status, contractor, member, region, includeDisabled, columnFilters]);

  // Sync columnFilters -> URL query params so the state is shareable / reloadable
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (columnFilters && Object.keys(columnFilters).length > 0) {
      next.set("filters", JSON.stringify(columnFilters));
    } else {
      next.delete("filters");
    }
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line
  }, [columnFilters]);

  const memberName = (id) => members.find((m) => m.id === id)?.name || id || "—";
  const contractorName = (id) => contractors.find((c) => c.id === id)?.name || "—";

  return (
    <div className="space-y-6" data-testid="manpower-list-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Workforce</p>
          <h1 className="text-3xl tracking-tight font-semibold text-zinc-900" style={{ fontFamily: "Cabinet Grotesk" }}>
            Manpower
          </h1>
        </div>
        {(user?.role === "super_admin" || user?.role === "admin" || user?.role === "member") && (
          <Button onClick={() => navigate("/manpower/new")} data-testid="new-registration-btn" className="bg-zinc-900 hover:bg-zinc-800 text-white">
            <Plus size={16} className="mr-1.5" /> New Registration
          </Button>
        )}
      </div>

      <div className="bg-white border border-zinc-200 rounded-lg p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="relative md:col-span-2">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <Input
            placeholder="Search name, ID, phone, city…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (setPage(1), load())}
            data-testid="search-input"
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger data-testid="filter-status"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="pending_approval">Pending Approval</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Select value={contractor} onValueChange={(v) => { setContractor(v); setPage(1); }}>
          <SelectTrigger data-testid="filter-contractor"><SelectValue placeholder="Contractor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All contractors</SelectItem>
            {contractors.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {regions.length > 0 && (
          <Select value={region} onValueChange={(v) => { setRegion(v); setPage(1); }}>
            <SelectTrigger data-testid="filter-region"><SelectValue placeholder="Region" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All regions</SelectItem>
              {regions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <ColumnFilterPanel
          formKey="manpower"
          value={columnFilters}
          onApply={(next) => { setColumnFilters(next); setPage(1); }}
        />
        <label className="flex items-center gap-2 text-xs text-zinc-600 cursor-pointer">
          <input
            type="checkbox"
            checked={includeDisabled}
            onChange={(e) => { setIncludeDisabled(e.target.checked); setPage(1); }}
            data-testid="toggle-include-disabled"
          />
          <span>Show disabled</span>
        </label>
      </div>

      {Object.keys(columnFilters).length > 0 && (
        <div className="flex flex-wrap items-center gap-2 -mt-3" data-testid="active-filter-chips">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">Active filters:</span>
          {Object.entries(columnFilters).map(([k, v]) => (
            <span
              key={k}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-zinc-200 bg-zinc-100 text-zinc-700"
              data-testid={`chip-${k}`}
            >
              <span className="mono">{k.replace("extra_fields.", "")}</span>
              <span className="text-zinc-400">=</span>
              <span className="truncate max-w-[140px]">{String(v)}</span>
              <button
                type="button"
                onClick={() => {
                  const nxt = { ...columnFilters };
                  delete nxt[k];
                  setColumnFilters(nxt);
                  setPage(1);
                }}
                className="text-zinc-400 hover:text-rose-600 ml-0.5"
                aria-label={`Remove ${k}`}
                data-testid={`chip-remove-${k}`}
              >
                ×
              </button>
            </span>
          ))}
          <button
            type="button"
            className="text-[11px] text-zinc-500 hover:text-zinc-900 underline"
            onClick={() => { setColumnFilters({}); setPage(1); }}
            data-testid="clear-all-filters"
          >
            Clear all
          </button>
        </div>
      )}

      <div className="bg-white border border-zinc-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600">
            <tr>
              <th className="text-left py-2 px-4 font-medium">Manpower ID</th>
              <th className="text-left py-2 px-4 font-medium">Name</th>
              <th className="text-left py-2 px-4 font-medium">Contractor</th>
              <th className="text-left py-2 px-4 font-medium">Region</th>
              <th className="text-left py-2 px-4 font-medium">Location</th>
              <th className="text-left py-2 px-4 font-medium">Designation</th>
              <th className="text-left py-2 px-4 font-medium">MC Expiry</th>
              <th className="text-left py-2 px-4 font-medium">Docs</th>
              <th className="text-left py-2 px-4 font-medium">Status</th>
              <th className="text-left py-2 px-4 font-medium">Member</th>
              <th className="text-left py-2 px-4 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={10} className="text-center py-12 text-zinc-500">No manpower found.</td></tr>
            )}
            {items.map((m) => (
              <tr
                key={m.id}
                onClick={() => navigate(`/manpower/${m.id}`)}
                data-testid={`manpower-row-${m.id}`}
                className="border-b border-zinc-100 hover:bg-zinc-50 cursor-pointer"
              >
                <td className="py-3 px-4"><span className="id-pill">{m.manpower_id || "—"}</span></td>
                <td className="py-3 px-4 font-medium text-zinc-900">
                  {m.full_name}
                  {m.disabled && <span className="ml-2 inline-block text-[10px] px-1.5 py-0.5 rounded bg-zinc-200 text-zinc-700">disabled</span>}
                </td>
                <td className="py-3 px-4 text-zinc-600">
                  <span>{contractorName(m.contractor_id)}</span>
                  {(() => { const c = contractors.find((c) => c.id === m.contractor_id); return c?.vendor_id ? (
                    <span className="ml-1.5 font-mono text-[11px] px-1.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">{c.vendor_id}</span>
                  ) : null; })()}
                </td>
                <td className="py-3 px-4 text-zinc-600">{m.region || "—"}</td>
                <td className="py-3 px-4 text-zinc-600">{m.location || "—"}</td>
                <td className="py-3 px-4 text-zinc-600">{m.designation || "—"}</td>
                <td className="py-3 px-4 text-zinc-600">{m.medical_expiry_date || "—"}</td>
                <td className="py-3 px-4"><StatusBadge status={m.document_status} /></td>
                <td className="py-3 px-4"><StatusBadge status={m.display_status} /></td>
                <td className="py-3 px-4 text-zinc-600">{memberName(m.assigned_member_id)}</td>
                <td className="py-3 px-4 text-zinc-500 text-xs">{m.updated_at?.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-200">
          <span className="text-xs text-zinc-500">{total} total · page {page}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)} data-testid="prev-page">Prev</Button>
            <Button size="sm" variant="outline" disabled={page * pageSize >= total} onClick={() => setPage(page + 1)} data-testid="next-page">Next</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

