import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Upload, FileText, Loader2, RefreshCw, Clock, Trash2, PlayCircle } from "lucide-react";
import { api, getToken, formatApiError, API } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

/**
 * Backup & Migration panel — Settings tab.
 * - Download button hits `/api/settings/backup` and saves the ZIP locally.
 * - Restore accepts a ZIP + confirmation dialog before wiping data.
 * - Auto-backup: enable + hour + retention count + timeline of stored ZIPs.
 * - "Show migration guide" opens the server-hosted markdown reference.
 */
export default function BackupPanel() {
  const [downloading, setDownloading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreFile, setRestoreFile] = useState(null);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [confirmStoredId, setConfirmStoredId] = useState(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideText, setGuideText] = useState("");
  const [guideLoading, setGuideLoading] = useState(false);

  const [autoCfg, setAutoCfg] = useState({ enabled: false, hour_utc: 2, retention: 7, last_run_at: null, last_status: null });
  const [savingAuto, setSavingAuto] = useState(false);
  const [runningNow, setRunningNow] = useState(false);
  const [stored, setStored] = useState([]);
  const restoreInputRef = useRef(null);

  const loadAuto = () => {
    api.get("/settings/auto-backup").then((r) => setAutoCfg((c) => ({ ...c, ...r.data }))).catch(() => {});
    api.get("/settings/backups").then((r) => setStored(r.data || [])).catch(() => setStored([]));
  };

  useEffect(() => { loadAuto(); }, []);

  useEffect(() => {
    if (guideOpen && !guideText) {
      setGuideLoading(true);
      api.get("/settings/migration-guide", { responseType: "text" })
        .then((r) => setGuideText(r.data))
        .catch((e) => toast.error(formatApiError(e)))
        .finally(() => setGuideLoading(false));
    }
  }, [guideOpen, guideText]);

  const download = async () => {
    setDownloading(true);
    try {
      const token = getToken();
      const url = `${API}/settings/backup`;
      const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") || "";
      const match = /filename="?([^"]+)"?/.exec(cd);
      const filename = match ? match[1] : `manpower-portal-backup-${Date.now()}.zip`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success("Backup downloaded");
    } catch (e) {
      toast.error(e.message || "Backup failed");
    } finally {
      setDownloading(false);
    }
  };

  const doRestore = async () => {
    if (!restoreFile) return;
    setRestoring(true);
    try {
      const fd = new FormData();
      fd.append("file", restoreFile);
      const { data } = await api.post("/settings/restore", fd);
      const totalDocs = Object.values(data.stats.collections || {}).reduce((a, b) => a + b, 0);
      toast.success(`Restored ${totalDocs} records + ${data.stats.files} files`);
      setConfirmRestore(false);
      setRestoreFile(null);
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setRestoring(false);
    }
  };

  const doRestoreStored = async (id) => {
    setRestoring(true);
    try {
      const { data } = await api.post(`/settings/backups/${id}/restore`);
      const totalDocs = Object.values(data.stats.collections || {}).reduce((a, b) => a + b, 0);
      toast.success(`Restored ${totalDocs} records + ${data.stats.files} files`);
      setConfirmStoredId(null);
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setRestoring(false);
    }
  };

  const saveAuto = async (next) => {
    // Guard against non-integer / out-of-range values sneaking in via onBlur
    const hour = Number(next.hour_utc);
    const retention = Number(next.retention);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      toast.error("Hour must be an integer 0–23");
      return;
    }
    if (!Number.isInteger(retention) || retention < 1 || retention > 60) {
      toast.error("Retention must be an integer 1–60");
      return;
    }
    // Skip identical writes so blur-out-of-input doesn't spam the API
    if (
      autoCfg.enabled === !!next.enabled &&
      autoCfg.hour_utc === hour &&
      autoCfg.retention === retention
    ) return;
    setSavingAuto(true);
    try {
      const { data } = await api.put("/settings/auto-backup", { enabled: !!next.enabled, hour_utc: hour, retention });
      setAutoCfg((c) => ({ ...c, ...data }));
      toast.success("Auto-backup updated");
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSavingAuto(false); }
  };

  const runNow = async () => {
    setRunningNow(true);
    try {
      const { data } = await api.post("/settings/auto-backup/run");
      toast.success(`Backup #${data.record.id.slice(0, 6)} created${data.pruned ? ` · pruned ${data.pruned}` : ""}`);
      loadAuto();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setRunningNow(false); }
  };

  const downloadStored = async (row) => {
    try {
      const token = getToken();
      const url = `${API}/settings/backups/${row.id}/download`;
      const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = row.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success("Downloaded");
    } catch (e) { toast.error(e.message || "Download failed"); }
  };

  const deleteStored = async (row) => {
    if (!window.confirm(`Delete backup ${row.filename}?`)) return;
    try {
      await api.delete(`/settings/backups/${row.id}`);
      toast.success("Backup deleted");
      loadAuto();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const fmtBytes = (b) => {
    if (!b) return "—";
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1024 / 1024).toFixed(2)} MB`;
  };
  const fmtWhen = (iso) => (iso ? iso.slice(0, 19).replace("T", " ") + " UTC" : "—");

  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-6 space-y-6" data-testid="backup-panel">
      <div>
        <h2 className="text-base font-medium text-zinc-900">Backup, Restore & Migration</h2>
        <p className="text-xs text-zinc-500">
          Download or upload a complete ZIP snapshot, schedule daily automatic backups, and view the Linux/Windows/Docker migration guide.
        </p>
      </div>

      {/* Manual */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border border-zinc-200 rounded-md p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Download size={16} className="text-zinc-700" />
            <div className="text-sm font-medium text-zinc-900">Download Backup</div>
          </div>
          <p className="text-xs text-zinc-500">
            Streams a ZIP containing <span className="mono">manifest.json</span>, every <span className="mono">db/*.json</span> collection, and <span className="mono">uploads/</span>.
          </p>
          <Button onClick={download} disabled={downloading} className="bg-zinc-900 hover:bg-zinc-800 text-white" data-testid="backup-download-btn">
            {downloading ? <Loader2 className="mr-2 animate-spin" size={14} /> : <Download size={14} className="mr-2" />}
            {downloading ? "Preparing ZIP…" : "Download Backup"}
          </Button>
        </div>
        <div className="border border-zinc-200 rounded-md p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Upload size={16} className="text-rose-700" />
            <div className="text-sm font-medium text-zinc-900">Restore from Backup</div>
          </div>
          <p className="text-xs text-zinc-500">
            <span className="text-rose-700 font-medium">This overwrites current data.</span> Your Super Admin login stays valid.
          </p>
          <input
            ref={restoreInputRef}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            data-testid="restore-file-input"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) { setRestoreFile(f); setConfirmRestore(true); } }}
          />
          <Button onClick={() => restoreInputRef.current?.click()} variant="outline" disabled={restoring} data-testid="restore-pick-btn">
            <Upload size={14} className="mr-2" />
            Choose ZIP to Restore…
          </Button>
        </div>
      </div>

      {/* Auto-backup config */}
      <div className="border border-zinc-200 rounded-md p-4 space-y-4" data-testid="auto-backup-config">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-zinc-700" />
              <div className="text-sm font-medium text-zinc-900">Automatic Daily Backup</div>
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              Runs once a day at the configured UTC hour, stored on-server, and auto-prunes to keep only the newest N backups.
            </p>
          </div>
          <Switch
            checked={!!autoCfg.enabled}
            disabled={savingAuto}
            onCheckedChange={(v) => saveAuto({ ...autoCfg, enabled: v })}
            data-testid="toggle-auto-backup"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-700">Hour of day (UTC, 0–23)</Label>
            <Input
              type="number"
              min={0}
              max={23}
              value={autoCfg.hour_utc}
              onChange={(e) => setAutoCfg({ ...autoCfg, hour_utc: Number(e.target.value) })}
              onBlur={() => saveAuto(autoCfg)}
              disabled={savingAuto}
              data-testid="auto-backup-hour"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-700">Retention (1–60)</Label>
            <Input
              type="number"
              min={1}
              max={60}
              value={autoCfg.retention}
              onChange={(e) => setAutoCfg({ ...autoCfg, retention: Number(e.target.value) })}
              onBlur={() => saveAuto(autoCfg)}
              disabled={savingAuto}
              data-testid="auto-backup-retention"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-700">Last run</Label>
            <div className="text-xs text-zinc-600 pt-1.5 mono">{fmtWhen(autoCfg.last_run_at)}</div>
            {autoCfg.last_status && <div className="text-[10px] text-zinc-400 mono">{autoCfg.last_status}</div>}
          </div>
        </div>
        <div>
          <Button variant="outline" onClick={runNow} disabled={runningNow} data-testid="run-backup-now-btn">
            {runningNow ? <Loader2 className="mr-2 animate-spin" size={14} /> : <PlayCircle size={14} className="mr-2" />}
            Run Backup Now
          </Button>
        </div>
      </div>

      {/* Timeline */}
      <div className="border border-zinc-200 rounded-md" data-testid="backup-timeline">
        <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-zinc-900">Recent Backups</div>
            <div className="text-xs text-zinc-500">Stored on this server. Auto-pruned to the newest <span className="mono">{autoCfg.retention}</span>.</div>
          </div>
          <Button size="sm" variant="ghost" onClick={loadAuto} data-testid="refresh-backups-btn">
            <RefreshCw size={12} className="mr-1.5" /> Refresh
          </Button>
        </div>
        <div className="overflow-hidden">
          {stored.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-zinc-500">No stored backups yet. Enable auto-backup or hit "Run Backup Now".</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600">
                <tr>
                  <th className="text-left py-2 px-4 font-medium">When</th>
                  <th className="text-left py-2 px-4 font-medium">Size</th>
                  <th className="text-left py-2 px-4 font-medium">Files</th>
                  <th className="text-left py-2 px-4 font-medium">Source</th>
                  <th className="text-left py-2 px-4 font-medium">By</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {stored.map((r) => (
                  <tr key={r.id} className="border-b border-zinc-100 hover:bg-zinc-50" data-testid={`backup-row-${r.id}`}>
                    <td className="py-2.5 px-4 text-xs text-zinc-700 mono">{fmtWhen(r.created_at)}</td>
                    <td className="py-2.5 px-4 text-xs text-zinc-700 mono">{fmtBytes(r.size)}</td>
                    <td className="py-2.5 px-4 text-xs text-zinc-700 mono">{r.files_count}</td>
                    <td className="py-2.5 px-4">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${r.auto ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-zinc-200 bg-zinc-100 text-zinc-700"}`}>
                        {r.auto ? "auto" : "manual"}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-xs text-zinc-600 truncate max-w-[220px]">{r.created_by}</td>
                    <td className="py-2.5 px-4 text-right space-x-1.5">
                      <Button size="sm" variant="outline" onClick={() => downloadStored(r)} data-testid={`download-${r.id}`}>
                        <Download size={12} />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setConfirmStoredId(r.id)} data-testid={`restore-stored-${r.id}`}>
                        <RefreshCw size={12} className="mr-1" />Restore
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => deleteStored(r)} className="text-rose-700" data-testid={`delete-${r.id}`}>
                        <Trash2 size={12} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Migration guide */}
      <div className="border border-zinc-200 rounded-md p-4 space-y-3">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-zinc-700" />
          <div className="text-sm font-medium text-zinc-900">Migration Guide (Linux · Windows · Docker)</div>
        </div>
        <p className="text-xs text-zinc-500">
          Step-by-step scripts to move backend, frontend, nginx reverse-proxy and MongoDB between hosts. Includes a ready-to-copy <span className="mono">docker-compose.yml</span>.
        </p>
        <Button variant="outline" onClick={() => setGuideOpen(true)} data-testid="show-migration-guide-btn">
          <FileText size={14} className="mr-2" />
          Show Migration Guide
        </Button>
      </div>

      {/* Confirm restore (uploaded file) */}
      <Dialog open={confirmRestore} onOpenChange={(o) => { if (!o) { setConfirmRestore(false); setRestoreFile(null); } }}>
        <DialogContent data-testid="restore-confirm-dialog">
          <DialogHeader><DialogTitle>Restore from backup?</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm text-zinc-700">
            <p>You are about to restore <span className="mono">{restoreFile?.name}</span> ({restoreFile ? Math.round(restoreFile.size / 1024) : 0} KB).</p>
            <p className="text-rose-700 font-medium">Every current record and uploaded file will be replaced. This cannot be undone.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConfirmRestore(false); setRestoreFile(null); }} disabled={restoring}>Cancel</Button>
            <Button onClick={doRestore} disabled={restoring} className="bg-rose-700 hover:bg-rose-800 text-white" data-testid="restore-confirm-btn">
              {restoring ? <Loader2 className="mr-2 animate-spin" size={14} /> : <RefreshCw size={14} className="mr-2" />}
              {restoring ? "Restoring…" : "Yes, restore"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm restore (stored backup) */}
      <Dialog open={!!confirmStoredId} onOpenChange={(o) => { if (!o) setConfirmStoredId(null); }}>
        <DialogContent data-testid="restore-stored-confirm-dialog">
          <DialogHeader><DialogTitle>Restore this stored backup?</DialogTitle></DialogHeader>
          <p className="text-sm text-rose-700 font-medium">
            Every current record and uploaded file will be replaced with the contents of this archive.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmStoredId(null)} disabled={restoring}>Cancel</Button>
            <Button onClick={() => doRestoreStored(confirmStoredId)} disabled={restoring} className="bg-rose-700 hover:bg-rose-800 text-white" data-testid="restore-stored-confirm-btn">
              {restoring ? <Loader2 className="mr-2 animate-spin" size={14} /> : <RefreshCw size={14} className="mr-2" />}
              {restoring ? "Restoring…" : "Yes, restore"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Migration guide dialog */}
      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col" data-testid="migration-guide-dialog">
          <DialogHeader><DialogTitle>Migration Guide</DialogTitle></DialogHeader>
          <div className="overflow-y-auto flex-1 -mx-6 px-6">
            {guideLoading ? (
              <div className="flex items-center justify-center py-10 text-zinc-500 text-sm">
                <Loader2 className="animate-spin mr-2" size={16} /> Loading…
              </div>
            ) : (
              <pre className="text-xs text-zinc-800 whitespace-pre-wrap font-mono leading-relaxed">{guideText}</pre>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
