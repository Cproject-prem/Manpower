import { useEffect, useState, useCallback } from "react";
import { Download, Filter, X, ChevronDown } from "lucide-react";
import { api, API } from "@/lib/api";
import { Button } from "@/components/ui/button";

/* ─────────────────────────────────────────────
   Helper: build query-string from filter state
───────────────────────────────────────────── */
function buildQS(filters) {
  const p = new URLSearchParams();
  if (filters.contractor_id) p.set("contractor_id", filters.contractor_id);
  if (filters.member_id)     p.set("member_id",     filters.member_id);
  if (filters.location)      p.set("location",       filters.location);
  if (filters.region)        p.set("region",         filters.region);
  return p.toString();
}

const EMPTY_FILTERS = { contractor_id: "", member_id: "", location: "", region: "" };

/* ─────────────────────────────────────────────
   Main page
───────────────────────────────────────────── */
export default function Reports() {
  const [summary,     setSummary]     = useState(null);
  const [contractors, setContractors] = useState([]);
  const [members,     setMembers]     = useState([]);
  const [filters,     setFilters]     = useState(EMPTY_FILTERS);
  const [pending,     setPending]     = useState(EMPTY_FILTERS); // uncommitted UI state
  const [loading,     setLoading]     = useState(false);
  const [filterOpts,  setFilterOpts]  = useState({ locations: [], regions: [] });

  // Load static lookup lists once
  useEffect(() => {
    api.get("/contractors").then((r) => setContractors(r.data)).catch(() => {});
    api.get("/users").then((r) => setMembers(r.data)).catch(() => {});
  }, []);

  // Fetch summary whenever committed filters change
  const fetchSummary = useCallback((f) => {
    setLoading(true);
    const qs = buildQS(f);
    api.get(`/reports/summary${qs ? `?${qs}` : ""}`)
      .then((r) => {
        setSummary(r.data);
        if (r.data.filter_options) setFilterOpts(r.data.filter_options);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchSummary(filters); }, [filters, fetchSummary]);

  const name     = (list, id) => list.find((x) => x.id === id)?.name || id;
  const activeCount = Object.values(filters).filter(Boolean).length;

  const applyFilters = () => setFilters({ ...pending });
  const clearFilters = () => { setPending(EMPTY_FILTERS); setFilters(EMPTY_FILTERS); };

  const exportUrl = `${API}/reports/export?format=csv&${buildQS(filters)}`;

  return (
    <div className="space-y-6" data-testid="reports-page">
      {/* ── Header ── */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Analytics</p>
          <h1
            className="text-3xl tracking-tight font-semibold text-zinc-900"
            style={{ fontFamily: "Cabinet Grotesk" }}
          >
            Workforce Deployment
          </h1>
        </div>
        <Button asChild className="bg-zinc-900 hover:bg-zinc-800 text-white" data-testid="export-csv-btn">
          <a href={exportUrl} target="_blank" rel="noreferrer">
            <Download size={14} className="mr-1.5" /> Export CSV
          </a>
        </Button>
      </div>

      {/* ── Filter bar ── */}
      <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={15} className="text-zinc-500" />
          <span className="text-sm font-semibold text-zinc-700">Filter</span>
          {activeCount > 0 && (
            <span className="ml-1 inline-flex items-center justify-center rounded-full bg-indigo-600 text-white text-[10px] font-bold w-4 h-4">
              {activeCount}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Contractor */}
          <FilterSelect
            label="Contractor"
            value={pending.contractor_id}
            onChange={(v) => setPending((p) => ({ ...p, contractor_id: v }))}
            options={contractors.map((c) => ({ value: c.id, label: c.name }))}
            placeholder="All contractors"
          />

          {/* Member */}
          <FilterSelect
            label="Member"
            value={pending.member_id}
            onChange={(v) => setPending((p) => ({ ...p, member_id: v }))}
            options={members
              .filter((u) => u.role === "member")
              .map((u) => ({ value: u.id, label: u.name || u.email }))}
            placeholder="All members"
          />

          {/* Location */}
          <FilterSelect
            label="Location"
            value={pending.location}
            onChange={(v) => setPending((p) => ({ ...p, location: v }))}
            options={filterOpts.locations.map((l) => ({ value: l, label: l }))}
            placeholder="All locations"
          />

          {/* Region */}
          <FilterSelect
            label="Region"
            value={pending.region}
            onChange={(v) => setPending((p) => ({ ...p, region: v }))}
            options={filterOpts.regions.map((r) => ({ value: r, label: r }))}
            placeholder="All regions"
          />
        </div>

        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-zinc-100">
          <button
            onClick={applyFilters}
            className="px-4 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-700 text-white text-sm font-medium transition-colors"
          >
            Apply Filters
          </button>
          {activeCount > 0 && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-zinc-200 hover:bg-zinc-50 text-zinc-600 text-sm transition-colors"
            >
              <X size={13} /> Clear
            </button>
          )}
          {loading && <span className="text-xs text-zinc-400 ml-1 animate-pulse">Loading…</span>}
        </div>

        {/* Active filter chips */}
        {activeCount > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {filters.contractor_id && (
              <Chip
                label={`Contractor: ${name(contractors, filters.contractor_id)}`}
                onRemove={() => { setPending((p) => ({ ...p, contractor_id: "" })); setFilters((f) => ({ ...f, contractor_id: "" })); }}
              />
            )}
            {filters.member_id && (
              <Chip
                label={`Member: ${name(members, filters.member_id)}`}
                onRemove={() => { setPending((p) => ({ ...p, member_id: "" })); setFilters((f) => ({ ...f, member_id: "" })); }}
              />
            )}
            {filters.location && (
              <Chip
                label={`Location: ${filters.location}`}
                onRemove={() => { setPending((p) => ({ ...p, location: "" })); setFilters((f) => ({ ...f, location: "" })); }}
              />
            )}
            {filters.region && (
              <Chip
                label={`Region: ${filters.region}`}
                onRemove={() => { setPending((p) => ({ ...p, region: "" })); setFilters((f) => ({ ...f, region: "" })); }}
              />
            )}
          </div>
        )}
      </div>

      {/* ── Tables ── */}
      {summary && (
        <div className="space-y-5">
          <ReportTable
            title="By Contractor"
            data={summary.by_contractor}
            resolveName={(id) => (id === "Unassigned" ? "Unassigned" : name(contractors, id))}
          />
          <ReportTable
            title="By Member"
            data={summary.by_member}
            resolveName={(id) => (id === "Unassigned" ? "Unassigned" : name(members, id))}
          />
          <ReportTable
            title="By Location"
            data={summary.by_location}
            resolveName={(id) => id}
          />
          <ReportTable
            title="By Region"
            data={summary.by_region}
            resolveName={(id) => id}
          />
        </div>
      )}

      {!summary && !loading && (
        <div className="text-center py-16 text-zinc-400 text-sm">No data available.</div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Sub-components
───────────────────────────────────────────── */
function FilterSelect({ label, value, onChange, options, placeholder }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-800 bg-zinc-50 hover:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors pr-8"
        >
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
      </div>
    </div>
  );
}

function Chip({ label, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-medium">
      {label}
      <button onClick={onRemove} className="hover:text-indigo-900 transition-colors">
        <X size={11} />
      </button>
    </span>
  );
}

const STATUS_COLS = [
  { key: "total",            label: "Total Deployed", cls: "text-zinc-800 font-semibold" },
  { key: "active",           label: "Active",         cls: "text-emerald-700" },
  { key: "expiring_soon",    label: "Expiring Soon",  cls: "text-orange-600" },
  { key: "expired",          label: "Expired Docs",   cls: "text-rose-700" },
  { key: "renewal_pending",  label: "Renewal Pending",cls: "text-blue-700" },
];

function ReportTable({ title, data, resolveName }) {
  const entries = Object.entries(data || {});

  // Totals row
  const totals = STATUS_COLS.reduce((acc, { key }) => {
    acc[key] = entries.reduce((s, [, v]) => s + (v[key] || 0), 0);
    return acc;
  }, {});

  return (
    <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm">
      <div className="px-5 py-3.5 border-b border-zinc-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-800">{title}</h2>
        <span className="text-xs text-zinc-400">{entries.length} row{entries.length !== 1 ? "s" : ""}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-50 border-b border-zinc-100">
              <th className="text-left py-2.5 px-5 font-medium text-zinc-500 text-xs uppercase tracking-wide">Name</th>
              {STATUS_COLS.map(({ label }) => (
                <th key={label} className="text-right py-2.5 px-4 font-medium text-zinc-500 text-xs uppercase tracking-wide">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-10 text-zinc-400 text-sm">
                  No data for current filters.
                </td>
              </tr>
            )}
            {entries.map(([k, v]) => (
              <tr key={k} className="border-b border-zinc-50 hover:bg-zinc-50/60 transition-colors">
                <td className="py-3 px-5 text-zinc-800 font-medium">{resolveName(k)}</td>
                {STATUS_COLS.map(({ key, cls }) => (
                  <td key={key} className={`py-3 px-4 text-right tabular-nums ${cls}`}>
                    {v[key] ?? 0}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {entries.length > 1 && (
            <tfoot>
              <tr className="bg-zinc-50 border-t border-zinc-200">
                <td className="py-2.5 px-5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Total</td>
                {STATUS_COLS.map(({ key, cls }) => (
                  <td key={key} className={`py-2.5 px-4 text-right text-xs font-bold tabular-nums ${cls}`}>
                    {totals[key]}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
