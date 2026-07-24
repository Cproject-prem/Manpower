import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, FileClock, BadgeCheck, Clock, AlertTriangle, RefreshCw, Building2, User } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";

const KPI = [
  { key: "total", label: "Total Manpower", icon: Users, color: "text-zinc-900" },
  { key: "pending_approval", label: "Pending Approvals", icon: FileClock, color: "text-amber-700" },
  { key: "active", label: "Active", icon: BadgeCheck, color: "text-emerald-700" },
  { key: "expiring_soon", label: "Expiring Soon", icon: Clock, color: "text-orange-700" },
  { key: "expired", label: "Expired", icon: AlertTriangle, color: "text-rose-700" },
  { key: "renewal_pending", label: "Renewal Pending", icon: RefreshCw, color: "text-blue-700" },
];

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [mine, setMine] = useState(null);
  const [org, setOrg] = useState(null);
  const [regions, setRegions] = useState([]);
  const [selectedRegions, setSelectedRegions] = useState([]);
  const [regionMenuOpen, setRegionMenuOpen] = useState(false);
  const navigate = useNavigate();

  // Regions available to this user: super_admin/admin see all configured;
  // if admin has region_scope, restrict to that scope.
  useEffect(() => {
    if (user?.role === "manpower") return;
    api.get("/settings/regions").then((r) => {
      const all = r.data.regions || [];
      const scope = user?.region_scope || [];
      setRegions(scope.length > 0 ? all.filter((x) => scope.includes(x)) : all);
    }).catch(() => setRegions([]));
  }, [user]);

  useEffect(() => {
    if (user?.role === "manpower") {
      api.get("/manpower", { params: { page: 1, page_size: 1 } }).then((r) => {
        setMine(r.data.items?.[0] || null);
      });
    } else {
      const params = {};
      if (selectedRegions.length > 0) params.region = selectedRegions.join(",");
      api.get("/manpower/stats", { params }).then((r) => setStats(r.data));
      api.get("/manpower", { params: { page: 1, page_size: 6, ...params } }).then((r) => setRecent(r.data.items));
      api.get("/manpower/org-summary").then((r) => setOrg(r.data)).catch(() => setOrg({ contractors: [] }));
    }
  }, [user, selectedRegions]);

  const toggleRegion = (r) => {
    setSelectedRegions((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));
  };
  const clearRegions = () => setSelectedRegions([]);

  // Manpower-specific dashboard
  if (user?.role === "manpower") {
    return (
      <div className="space-y-6 max-w-3xl" data-testid="manpower-dashboard-page">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">My Account</p>
          <h1 className="text-3xl tracking-tight font-semibold text-zinc-900" style={{ fontFamily: "Cabinet Grotesk" }}>
            Hi, {user.name?.split(" ")[0]}
          </h1>
          <p className="mt-1 text-sm text-zinc-600">View your record, manage documents and submit medical certificate renewals.</p>
        </div>

        {!mine && (
          <div className="bg-white border border-zinc-200 rounded-lg p-8 text-center">
            <p className="text-sm text-zinc-600">No manpower record linked to your account yet. Please contact your member or admin.</p>
          </div>
        )}

        {mine && (
          <div className="bg-white border border-zinc-200 rounded-lg p-6 space-y-4">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold text-zinc-900">{mine.full_name}</h2>
                  {mine.manpower_id && <span className="id-pill">{mine.manpower_id}</span>}
                </div>
                <div className="mt-2 flex gap-2 flex-wrap">
                  <StatusBadge status={mine.display_status} />
                  <StatusBadge status={mine.document_status} />
                </div>
              </div>
              <Button onClick={() => navigate(`/manpower/${mine.id}`)} data-testid="my-profile-btn" className="bg-zinc-900 hover:bg-zinc-800 text-white">
                Open my profile
              </Button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-zinc-200 text-sm">
              <Info label="MC Expiry" value={mine.medical_expiry_date || "—"} />
              <Info label="Phone" value={mine.phone || "—"} />
              <Info label="Location" value={mine.location || "—"} />
              <Info label="Docs Uploaded" value={(mine.documents || []).length} />
            </div>
            {mine.display_status === "expiring_soon" && (
              <div className="border border-orange-200 bg-orange-50 text-orange-800 text-sm rounded-md p-3" data-testid="expiring-notice">
                Your medical certificate expires soon. Please upload a renewal.
              </div>
            )}
            {mine.display_status === "expired" && (
              <div className="border border-rose-200 bg-rose-50 text-rose-800 text-sm rounded-md p-3" data-testid="expired-notice">
                Your medical certificate has expired. Upload a new one to renew.
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Admin / Member / Super Admin dashboard
  return (
    <div className="space-y-8" data-testid="dashboard-page">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Overview</p>
          <h1 className="text-3xl sm:text-4xl tracking-tight font-semibold text-zinc-900 mt-1" style={{ fontFamily: "Cabinet Grotesk" }}>
            Welcome back, {user?.name?.split(" ")[0] || "there"}.
          </h1>
          <p className="mt-1 text-sm text-zinc-600">Snapshot of your workforce operations.</p>
        </div>
        {regions.length > 0 && (
          <div className="relative" data-testid="region-filter">
            <button
              type="button"
              onClick={() => setRegionMenuOpen((o) => !o)}
              className="h-9 px-3 rounded-md border border-zinc-200 bg-white text-sm text-zinc-800 hover:border-zinc-400 flex items-center gap-2"
              data-testid="region-filter-btn"
            >
              <span className="uppercase text-[10px] tracking-wide text-zinc-500">Region</span>
              <span className="font-medium">
                {selectedRegions.length === 0
                  ? "All"
                  : selectedRegions.length === 1
                    ? selectedRegions[0]
                    : `${selectedRegions.length} selected`}
              </span>
              <span className="text-zinc-400 text-xs">▾</span>
            </button>
            {regionMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setRegionMenuOpen(false)} />
                <div className="absolute right-0 mt-1 z-20 w-56 bg-white border border-zinc-200 rounded-md shadow-lg p-2" data-testid="region-filter-menu">
                  <div className="flex items-center justify-between px-1 pb-2 border-b border-zinc-100 mb-1">
                    <span className="text-[11px] uppercase tracking-wide text-zinc-500">Filter by region</span>
                    {selectedRegions.length > 0 && (
                      <button onClick={clearRegions} className="text-[11px] text-zinc-600 hover:text-zinc-900" data-testid="region-filter-clear">Clear</button>
                    )}
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {regions.map((r) => (
                      <label
                        key={r}
                        className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-50 cursor-pointer text-sm"
                        data-testid={`region-filter-opt-${r}`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedRegions.includes(r)}
                          onChange={() => toggleRegion(r)}
                          className="h-3.5 w-3.5 accent-zinc-900"
                        />
                        <span className="text-zinc-800">{r}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {KPI.map((k) => {
          const Icon = k.icon;
          return (
            <div
              key={k.key}
              data-testid={`kpi-${k.key}`}
              className="bg-white border border-zinc-200 rounded-lg p-4 hover:border-zinc-300 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-zinc-500">{k.label}</span>
                <Icon size={16} strokeWidth={1.75} className={k.color} />
              </div>
              <div className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900" style={{ fontFamily: "Cabinet Grotesk" }}>
                {stats ? stats[k.key] ?? 0 : "—"}
              </div>
            </div>
          );
        })}
      </div>

      {org && org.contractors && org.contractors.length > 0 && (
        <OrgWidget org={org} navigate={navigate} />
      )}

      <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200">
          <h2 className="text-base font-medium text-zinc-900">Recent Manpower</h2>
          <button
            data-testid="view-all-manpower-btn"
            onClick={() => navigate("/manpower")}
            className="text-xs text-zinc-600 hover:text-zinc-900"
          >
            View all →
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600">
              <tr>
                <th className="text-left py-2 px-4 font-medium whitespace-nowrap">Manpower ID</th>
                <th className="text-left py-2 px-4 font-medium whitespace-nowrap">Name</th>
                <th className="text-left py-2 px-4 font-medium whitespace-nowrap">Location</th>
                <th className="text-left py-2 px-4 font-medium whitespace-nowrap">MC Expiry</th>
                <th className="text-left py-2 px-4 font-medium whitespace-nowrap">Status</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 && (
                <tr><td colSpan={5} className="text-center py-8 text-zinc-500">No manpower yet.</td></tr>
              )}
              {recent.map((m) => (
                <tr
                key={m.id}
                onClick={() => navigate(`/manpower/${m.id}`)}
                data-testid={`recent-row-${m.id}`}
                className="border-b border-zinc-100 hover:bg-zinc-50 cursor-pointer"
              >
                <td className="py-3 px-4"><span className="id-pill">{m.manpower_id || "—"}</span></td>
                <td className="py-3 px-4 text-zinc-900">{m.full_name}</td>
                <td className="py-3 px-4 text-zinc-600">{m.location || "—"}</td>
                <td className="py-3 px-4 text-zinc-600">{m.medical_expiry_date || "—"}</td>
                <td className="py-3 px-4"><StatusBadge status={m.display_status} /></td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-0.5 text-sm text-zinc-900">{value}</div>
    </div>
  );
}

function OrgWidget({ org, navigate }) {
  const [expanded, setExpanded] = useState(new Set());
  const toggle = (id) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpanded(next);
  };
  const showAll = org.role !== "super_admin" && org.role !== "admin";
  const contractors = showAll ? org.contractors : org.contractors.slice(0, 5);

  return (
    <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden" data-testid="org-widget">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200">
        <div className="flex items-center gap-2">
          <Building2 size={16} className="text-zinc-700" strokeWidth={1.75} />
          <h2 className="text-base font-medium text-zinc-900">Organisation</h2>
          <span className="text-xs text-zinc-500 ml-1">
            {showAll
              ? `Your team${contractors.length ? " · " + contractors[0].name : ""}`
              : `Top ${contractors.length} of ${org.contractors.length}`}
          </span>
        </div>
        {(org.role === "super_admin" || org.role === "admin") && (
          <button
            data-testid="org-widget-view-all"
            onClick={() => navigate("/contractors")}
            className="text-xs text-zinc-600 hover:text-zinc-900"
          >
            All contractors →
          </button>
        )}
      </div>
      <div className="divide-y divide-zinc-100">
        {contractors.map((c) => {
          const open = expanded.has(c.id);
          return (
            <div key={c.id} data-testid={`org-contractor-${c.id}`}>
              <button
                type="button"
                onClick={() => toggle(c.id)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-50 text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-md bg-zinc-100 text-zinc-800 p-1.5">
                    <Building2 size={14} strokeWidth={1.75} />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-zinc-900">{c.name}</div>
                    <div className="text-xs text-zinc-500">
                      {c.member_count} member{c.member_count === 1 ? "" : "s"} · {c.active_manpower} active manpower
                      {c.id_format && (
                        <span className="ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                          {c.id_format}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-semibold text-zinc-900 tabular-nums" style={{ fontFamily: "Cabinet Grotesk" }}>
                    {c.active_manpower}
                  </span>
                  <span className="text-xs text-zinc-400">{open ? "▾" : "▸"}</span>
                </div>
              </button>
              {open && c.members.length > 0 && (
                <div className="bg-zinc-50/60 px-6 pb-3 pt-1">
                  <ul className="space-y-1">
                    {c.members.map((m) => (
                      <li key={m.id} className="flex items-center justify-between text-xs py-1" data-testid={`org-member-${m.id}`}>
                        <div className="flex items-center gap-2">
                          <User size={12} className="text-zinc-500" strokeWidth={1.75} />
                          <span className="text-zinc-800">{m.name}</span>
                          <span className="text-zinc-400 font-mono">{m.email}</span>
                        </div>
                        <span className="text-zinc-700 tabular-nums">{m.active_manpower} active</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {open && c.members.length === 0 && (
                <div className="bg-zinc-50/60 px-6 pb-3 pt-1 text-xs text-zinc-500 italic">No members yet.</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
