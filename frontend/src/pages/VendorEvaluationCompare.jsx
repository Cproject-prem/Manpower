import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Trophy, ArrowLeft, TrendingUp, Building2, Map } from "lucide-react";
import { api, formatApiError } from "@/lib/api";

export default function VendorEvaluationCompare() {
  const nav = useNavigate();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/vendor-evaluations/compare/scoreboard")
      .then((r) => setData(r.data))
      .catch((e) => toast.error(formatApiError(e)));
  }, []);

  if (!data) return <div className="p-6 text-zinc-500 text-sm">Loading scoreboard…</div>;

  const top = data.top_overall;

  return (
    <div className="space-y-8" data-testid="vendor-compare-page">
      <div>
        <button onClick={() => nav("/vendor-evaluations")} className="text-xs text-zinc-500 hover:text-zinc-900 flex items-center gap-1 mb-2">
          <ArrowLeft size={12} /> Back to Vendor Evaluations
        </button>
        <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Rewards & Recognition</p>
        <h1 className="text-3xl tracking-tight font-semibold text-zinc-900 mt-1" style={{ fontFamily: "Cabinet Grotesk" }}>
          Compare & Reward
        </h1>
        <p className="mt-1 text-sm text-zinc-600">Side-by-side scoreboard by region and by vendor. Best score wins.</p>
      </div>

      {/* Top overall banner */}
      {top && (
        <div className="bg-gradient-to-r from-amber-50 via-white to-white border border-amber-200 rounded-lg p-6 flex items-center justify-between" data-testid="top-overall-card">
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-amber-500 text-white p-3">
              <Trophy size={22} />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-amber-800">Portfolio Winner</div>
              <div className="text-2xl font-semibold text-zinc-900" style={{ fontFamily: "Cabinet Grotesk" }}>{top.name}</div>
              <div className="text-xs text-zinc-600">Region: {top.region || "—"} · {top.eval_count} evaluation{top.eval_count === 1 ? "" : "s"} · Latest: {top.latest_period || "—"}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-amber-800">Best Score</div>
            <div className="text-5xl font-semibold text-zinc-900 tabular-nums" style={{ fontFamily: "Cabinet Grotesk" }}>
              {top.best_score.toFixed(2)}
            </div>
            <div className="text-[10px] text-zinc-600">Avg: {top.avg_score.toFixed(2)}</div>
          </div>
        </div>
      )}

      {/* By Region */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Map size={16} className="text-zinc-700" />
          <h2 className="text-base font-medium text-zinc-900">By Region</h2>
          <span className="text-xs text-zinc-500">({data.by_region.length})</span>
        </div>
        {data.by_region.length === 0 ? (
          <div className="text-sm text-zinc-500 italic bg-white border border-zinc-200 rounded-lg p-6">No regions with evaluations yet.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {data.by_region.map((r) => (
              <div key={r.region} className="bg-white border border-zinc-200 rounded-lg overflow-hidden" data-testid={`region-card-${r.region}`}>
                <div className="px-4 py-3 border-b border-zinc-100 bg-zinc-50 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500">Region</div>
                    <div className="text-lg font-medium text-zinc-900">{r.region}</div>
                  </div>
                  {r.top && (
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wider text-amber-700">Winner</div>
                      <div className="text-sm font-medium text-zinc-900 flex items-center gap-1">
                        <Trophy size={12} className="text-amber-500" /> {r.top.name}
                      </div>
                    </div>
                  )}
                </div>
                <div className="divide-y divide-zinc-100">
                  {r.contractors.map((c, i) => (
                    <div key={c.contractor_id} className="px-4 py-2.5 flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-semibold ${
                          i === 0 ? "bg-amber-500 text-white" :
                          i === 1 ? "bg-zinc-300 text-zinc-800" :
                          i === 2 ? "bg-amber-800/60 text-white" : "bg-zinc-100 text-zinc-600"
                        }`}>{i + 1}</span>
                        <span className="text-zinc-800 truncate">{c.name}</span>
                        <span className="text-[10px] text-zinc-400 shrink-0">({c.eval_count})</span>
                      </div>
                      <div className="flex items-baseline gap-2 shrink-0">
                        <span className="text-lg font-semibold text-zinc-900 tabular-nums" style={{ fontFamily: "Cabinet Grotesk" }}>{c.best_score.toFixed(2)}</span>
                        <span className="text-[10px] text-zinc-500 tabular-nums">avg {c.avg_score.toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* By Contractor (full scoreboard) */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Building2 size={16} className="text-zinc-700" />
          <h2 className="text-base font-medium text-zinc-900">All Vendors — Full Scoreboard</h2>
          <span className="text-xs text-zinc-500">({data.by_contractor.length})</span>
        </div>
        <div className="bg-white border border-zinc-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left py-2 px-4 font-medium w-12">Rank</th>
                <th className="text-left py-2 px-4 font-medium">Vendor</th>
                <th className="text-left py-2 px-4 font-medium">Region</th>
                <th className="text-right py-2 px-4 font-medium">Evaluations</th>
                <th className="text-right py-2 px-4 font-medium">Latest Period</th>
                <th className="text-right py-2 px-4 font-medium">Avg Score</th>
                <th className="text-right py-2 px-4 font-medium">Best Score</th>
              </tr>
            </thead>
            <tbody>
              {data.by_contractor.length === 0 && (
                <tr><td colSpan={7} className="text-center py-12 text-zinc-500">No evaluations yet.</td></tr>
              )}
              {data.by_contractor.map((c, i) => (
                <tr
                  key={c.contractor_id}
                  className={`border-b border-zinc-100 ${i === 0 ? "bg-amber-50/40" : "hover:bg-zinc-50"} cursor-pointer`}
                  onClick={() => c.evaluations[0] && nav(`/vendor-evaluations/${c.evaluations[0].id}`)}
                  data-testid={`compare-row-${c.contractor_id}`}
                >
                  <td className="py-3 px-4">
                    <span className={`text-[10px] w-6 h-6 rounded-full inline-flex items-center justify-center font-semibold ${
                      i === 0 ? "bg-amber-500 text-white" :
                      i === 1 ? "bg-zinc-300 text-zinc-800" :
                      i === 2 ? "bg-amber-800/60 text-white" : "bg-zinc-100 text-zinc-600"
                    }`}>{i + 1}</span>
                  </td>
                  <td className="py-3 px-4 font-medium text-zinc-900 flex items-center gap-1.5">
                    {i === 0 && <Trophy size={12} className="text-amber-500" />}
                    {c.name}
                  </td>
                  <td className="py-3 px-4 text-zinc-600">{c.region || "—"}</td>
                  <td className="py-3 px-4 text-right text-zinc-700 tabular-nums">{c.eval_count}</td>
                  <td className="py-3 px-4 text-right text-zinc-500 text-xs">{c.latest_period || "—"}</td>
                  <td className="py-3 px-4 text-right text-zinc-700 tabular-nums">{c.avg_score.toFixed(2)}</td>
                  <td className="py-3 px-4 text-right text-zinc-900 tabular-nums font-semibold">{c.best_score.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-vendor detail history */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={16} className="text-zinc-700" />
          <h2 className="text-base font-medium text-zinc-900">Evaluation History per Vendor</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.by_contractor.map((c) => (
            <div key={c.contractor_id} className="bg-white border border-zinc-200 rounded-lg p-4">
              <div className="flex items-baseline justify-between mb-2">
                <div className="font-medium text-zinc-900">{c.name}</div>
                <div className="text-[11px] text-zinc-500">{c.region || "—"}</div>
              </div>
              <div className="space-y-1">
                {c.evaluations.map((e) => (
                  <div key={e.id} className="flex items-center justify-between text-xs py-1 border-b border-zinc-50 last:border-b-0">
                    <div className="text-zinc-600 truncate flex-1">
                      <span className="text-zinc-800">{e.title}</span>
                      <span className="text-zinc-400 ml-2">{e.period || "—"}</span>
                    </div>
                    <div className="tabular-nums font-medium text-zinc-900">{Number(e.grand_total || 0).toFixed(2)}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

