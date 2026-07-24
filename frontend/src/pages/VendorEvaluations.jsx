import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, ClipboardList } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export default function VendorEvaluationsList() {
  const { user } = useAuth();
  const nav = useNavigate();
  const canEdit = user?.role === "super_admin" || user?.role === "admin";
  const [items, setItems] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [regions, setRegions] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState({ title: "", period: "", contractor_id: "", region: "" });

  const load = () => {
    api.get("/vendor-evaluations").then((r) => setItems(r.data));
    api.get("/contractors").then((r) => setContractors(r.data));
    api.get("/settings/regions").then((r) => setRegions(r.data.regions || [])).catch(() => setRegions([]));
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!draft.title || !draft.contractor_id) {
      toast.error("Title and Contractor are required");
      return;
    }
    try {
      const { data } = await api.post("/vendor-evaluations", draft);
      toast.success("Evaluation created");
      setShowNew(false);
      setDraft({ title: "", period: "", contractor_id: "", region: "" });
      nav(`/vendor-evaluations/${data.id}`);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const grand = items.reduce((s, e) => s + (e.grand_total || 0), 0);

  return (
    <div className="space-y-6" data-testid="vendor-evaluations-page">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Vendors</p>
          <h1 className="text-3xl tracking-tight font-semibold text-zinc-900 mt-1" style={{ fontFamily: "Cabinet Grotesk" }}>
            Vendor Evaluations
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Import an Excel sheet, map weightage / actual / max score columns, and get a Grand Total automatically.
          </p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => nav("/vendor-evaluations/compare")} data-testid="open-compare-btn">
              Compare & Reward
            </Button>
            <Button
              onClick={() => setShowNew(true)}
              className="bg-zinc-900 hover:bg-zinc-800 text-white"
              data-testid="new-evaluation-btn"
            >
              <Plus size={14} className="mr-1.5" /> New evaluation
            </Button>
          </div>
        )}
        {!canEdit && (
          <Button variant="outline" onClick={() => nav("/vendor-evaluations/compare")} data-testid="open-compare-btn">
            Compare & Reward
          </Button>
        )}
      </div>

      {/* Grand total banner */}
      <div className="bg-white border border-zinc-200 rounded-lg p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-zinc-900 text-white p-2"><ClipboardList size={16} /></div>
          <div>
            <div className="text-xs uppercase tracking-wider text-zinc-500">Portfolio Grand Total</div>
            <div className="text-3xl font-semibold text-zinc-900 tabular-nums" style={{ fontFamily: "Cabinet Grotesk" }}>
              {grand.toFixed(2)}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wider text-zinc-500">Evaluations</div>
          <div className="text-3xl font-semibold text-zinc-900 tabular-nums" style={{ fontFamily: "Cabinet Grotesk" }}>
            {items.length}
          </div>
        </div>
      </div>

      <div className="bg-white border border-zinc-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600">
            <tr>
              <th className="text-left py-2 px-4 font-medium">Title</th>
              <th className="text-left py-2 px-4 font-medium">Contractor</th>
              <th className="text-left py-2 px-4 font-medium">Region</th>
              <th className="text-left py-2 px-4 font-medium">Period</th>
              <th className="text-right py-2 px-4 font-medium">Rows</th>
              <th className="text-right py-2 px-4 font-medium">Total Weight</th>
              <th className="text-right py-2 px-4 font-medium">Grand Total</th>
              <th className="text-left py-2 px-4 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={8} className="text-center py-12 text-zinc-500">No evaluations yet.</td></tr>
            )}
            {items.map((e) => (
              <tr
                key={e.id}
                onClick={() => nav(`/vendor-evaluations/${e.id}`)}
                className="border-b border-zinc-100 hover:bg-zinc-50 cursor-pointer"
                data-testid={`eval-row-${e.id}`}
              >
                <td className="py-3 px-4 font-medium text-zinc-900">{e.title}</td>
                <td className="py-3 px-4 text-zinc-600">{e.contractor_name}</td>
                <td className="py-3 px-4 text-zinc-600">{e.region || "—"}</td>
                <td className="py-3 px-4 text-zinc-600">{e.period || "—"}</td>
                <td className="py-3 px-4 text-right text-zinc-700 tabular-nums">{e.row_count}</td>
                <td className="py-3 px-4 text-right text-zinc-700 tabular-nums">{Number(e.total_weight || 0).toFixed(2)}</td>
                <td className="py-3 px-4 text-right text-zinc-900 tabular-nums font-medium">{Number(e.grand_total || 0).toFixed(2)}</td>
                <td className="py-3 px-4 text-zinc-500 text-xs">{e.updated_at?.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Vendor Evaluation</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Title</Label>
              <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="e.g. Q1 2026 Performance Review" data-testid="new-eval-title" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Period</Label>
              <Input value={draft.period} onChange={(e) => setDraft({ ...draft, period: e.target.value })} placeholder="Q1 2026" data-testid="new-eval-period" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Contractor</Label>
              <Select value={draft.contractor_id} onValueChange={(v) => setDraft({ ...draft, contractor_id: v })}>
                <SelectTrigger data-testid="new-eval-contractor"><SelectValue placeholder="Select contractor" /></SelectTrigger>
                <SelectContent>
                  {contractors.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {regions.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Region</Label>
                <Select value={draft.region || "__none__"} onValueChange={(v) => setDraft({ ...draft, region: v === "__none__" ? "" : v })}>
                  <SelectTrigger data-testid="new-eval-region"><SelectValue placeholder="Select region" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— none —</SelectItem>
                    {regions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button onClick={create} className="bg-zinc-900 hover:bg-zinc-800 text-white" data-testid="new-eval-create-btn">Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

