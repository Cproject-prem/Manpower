import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import FormBuilder from "@/components/FormBuilder";
import EmailAlertsSettings from "@/components/EmailAlertsSettings";
import BackupPanel from "@/components/BackupPanel";

export default function Settings() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const [settings, setSettings] = useState({ id_format: "MP-{year}-{seq:06d}", ftp_host: "", ftp_user: "", ftp_password: "", ftp_path: "" });
  const [logs, setLogs] = useState([]);
  const [regions, setRegions] = useState([]);
  const [newRegion, setNewRegion] = useState("");
  const [uploadControls, setUploadControls] = useState({ manpower_documents_enabled: true, contractor_compliance_enabled: true });
  const [savingControls, setSavingControls] = useState(false);

  useEffect(() => {
    if (isSuperAdmin) {
      api.get("/settings").then((r) => setSettings((s) => ({ ...s, ...r.data })));
      api.get("/audit-logs", { params: { limit: 50 } }).then((r) => setLogs(r.data));
      api.get("/settings/regions").then((r) => setRegions(r.data.regions || []));
      api.get("/settings/document-controls").then((r) => setUploadControls(r.data));
    }
  }, [isSuperAdmin]);

  const saveUploadControls = async (next) => {
    setSavingControls(true);
    try {
      const { data } = await api.put("/settings/document-controls", next);
      setUploadControls(data);
      toast.success("Upload controls updated");
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSavingControls(false); }
  };

  const saveRegions = async (next) => {
    try {
      const { data } = await api.put("/settings/regions", { regions: next });
      setRegions(data.regions || []);
      toast.success("Regions updated");
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const addRegion = () => {
    const v = newRegion.trim();
    if (!v) return;
    if (regions.some((r) => r.toLowerCase() === v.toLowerCase())) {
      toast.error("Region already exists");
      return;
    }
    saveRegions([...regions, v]);
    setNewRegion("");
  };

  const removeRegion = (r) => {
    if (!window.confirm(`Remove region "${r}"? Existing manpower keeping this value will still show it until edited.`)) return;
    saveRegions(regions.filter((x) => x !== r));
  };

  const save = async () => {
    try {
      await api.put("/settings", settings);
      toast.success("Settings saved");
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const testFtp = async () => {
    try {
      await api.put("/settings", settings); // persist before test
      const { data } = await api.post("/settings/ftp/test");
      if (data.ok) toast.success(`FTP OK · ${data.host}`);
      else toast.error(`FTP failed: ${data.error}`);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const reconcileFtp = async () => {
    try {
      await api.post("/settings/ftp/reconcile");
      toast.success("Reconcile started in background");
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="space-y-6 max-w-5xl" data-testid="settings-page">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">System</p>
        <h1 className="text-3xl tracking-tight font-semibold text-zinc-900" style={{ fontFamily: "Cabinet Grotesk" }}>
          Settings
        </h1>
      </div>

      <Tabs defaultValue="form-builder" className="w-full">
        <TabsList>
          <TabsTrigger value="form-builder" data-testid="tab-form-builder">Manpower Form</TabsTrigger>
          <TabsTrigger value="contractor-builder" data-testid="tab-contractor-builder">Contractor Form</TabsTrigger>
          <TabsTrigger value="compliance-builder" data-testid="tab-compliance-builder">Compliance Form</TabsTrigger>
          {isSuperAdmin && <TabsTrigger value="system" data-testid="tab-system">System</TabsTrigger>}
          {isSuperAdmin && <TabsTrigger value="uploads" data-testid="tab-uploads">Uploads</TabsTrigger>}
          {isSuperAdmin && <TabsTrigger value="email" data-testid="tab-email">Email Alerts</TabsTrigger>}
          {isSuperAdmin && <TabsTrigger value="backup" data-testid="tab-backup">Backup & Migration</TabsTrigger>}
          {isSuperAdmin && <TabsTrigger value="audit" data-testid="tab-audit">Audit Logs</TabsTrigger>}
        </TabsList>

        <TabsContent value="form-builder" className="mt-4">
          <FormBuilder formKey="manpower" title="Manpower Registration Form" />
        </TabsContent>

        <TabsContent value="contractor-builder" className="mt-4">
          <FormBuilder formKey="contractor" title="Contractor Form" />
        </TabsContent>

        <TabsContent value="compliance-builder" className="mt-4">
          <FormBuilder formKey="compliance" title="Contractor Compliance Form (ESI/PF/MSME/GST)" hideAddSection />
        </TabsContent>

        {isSuperAdmin && (
        <TabsContent value="system" className="mt-4 space-y-6">
          <div className="bg-white border border-zinc-200 rounded-lg p-6 space-y-4" data-testid="regions-panel">
            <div>
              <h2 className="text-base font-medium text-zinc-900">Regions</h2>
              <p className="text-xs text-zinc-500">Master list of regions. Assign one to each manpower record, restrict Admins to selected regions, and filter the dashboard by region.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {regions.length === 0 && <span className="text-xs text-zinc-500 italic">No regions yet. Add one below.</span>}
              {regions.map((r) => (
                <span
                  key={r}
                  className="inline-flex items-center gap-2 text-sm px-3 py-1 rounded-full border border-zinc-200 bg-zinc-50 text-zinc-800"
                  data-testid={`region-pill-${r}`}
                >
                  {r}
                  <button
                    type="button"
                    onClick={() => removeRegion(r)}
                    className="text-zinc-400 hover:text-rose-600 text-base leading-none"
                    aria-label={`Remove ${r}`}
                    data-testid={`region-remove-${r}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2 items-end pt-2 border-t border-zinc-100">
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs text-zinc-700">Add region</Label>
                <Input
                  value={newRegion}
                  onChange={(e) => setNewRegion(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addRegion()}
                  placeholder="e.g. North, South, EMEA-1"
                  data-testid="new-region-input"
                />
              </div>
              <Button onClick={addRegion} variant="outline" data-testid="add-region-btn">Add</Button>
            </div>
          </div>

          <div className="bg-white border border-zinc-200 rounded-lg p-6 space-y-4">
            <div>
              <h2 className="text-base font-medium text-zinc-900">Manpower ID Format</h2>
              <p className="text-xs text-zinc-500">Use <span className="mono">{"{year}"}</span> and <span className="mono">{"{seq:06d}"}</span> tokens.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-700">Format string</Label>
              <Input value={settings.id_format || ""} onChange={(e) => setSettings({ ...settings, id_format: e.target.value })} data-testid="id-format-input" />
            </div>
          </div>

          <div className="bg-white border border-zinc-200 rounded-lg p-6 space-y-4">
            <div>
              <h2 className="text-base font-medium text-zinc-900">FTP Configuration</h2>
              <p className="text-xs text-zinc-500">Configure FTP credentials (storage handler can connect later). Currently files store locally.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-700">FTP Host</Label>
                <Input value={settings.ftp_host || ""} onChange={(e) => setSettings({ ...settings, ftp_host: e.target.value })} data-testid="ftp-host" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-700">FTP User</Label>
                <Input value={settings.ftp_user || ""} onChange={(e) => setSettings({ ...settings, ftp_user: e.target.value })} data-testid="ftp-user" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-700">FTP Password</Label>
                <Input type="password" value={settings.ftp_password || ""} onChange={(e) => setSettings({ ...settings, ftp_password: e.target.value })} data-testid="ftp-password" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-700">FTP Base Path</Label>
                <Input value={settings.ftp_path || ""} onChange={(e) => setSettings({ ...settings, ftp_path: e.target.value })} data-testid="ftp-path" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={testFtp} data-testid="ftp-test-btn">Test FTP Connection</Button>
              <Button variant="outline" onClick={reconcileFtp} data-testid="ftp-reconcile-btn">Reconcile to FTP</Button>
              <Button onClick={save} className="bg-zinc-900 hover:bg-zinc-800 text-white" data-testid="save-settings-btn">Save Settings</Button>
            </div>
          </div>
        </TabsContent>
        )}

        {isSuperAdmin && (
        <TabsContent value="uploads" className="mt-4 space-y-6">
          <div className="bg-white border border-zinc-200 rounded-lg p-6 space-y-5" data-testid="upload-controls-panel">
            <div>
              <h2 className="text-base font-medium text-zinc-900">Document Upload Controls</h2>
              <p className="text-xs text-zinc-500">Turn off to hide the <span className="font-medium">Add / Upload document</span> inputs across the portal. Existing documents remain viewable and downloadable — only new uploads are blocked.</p>
            </div>

            <div className="flex items-center justify-between py-3 border-t border-zinc-100">
              <div className="pr-4">
                <div className="text-sm font-medium text-zinc-900">Manpower documents</div>
                <div className="text-xs text-zinc-500">Controls the "Add Document" inputs on each Manpower profile → Documents tab.</div>
              </div>
              <Switch
                checked={!!uploadControls.manpower_documents_enabled}
                disabled={savingControls}
                onCheckedChange={(v) => saveUploadControls({ ...uploadControls, manpower_documents_enabled: v })}
                data-testid="toggle-manpower-documents"
              />
            </div>

            <div className="flex items-center justify-between py-3 border-t border-zinc-100">
              <div className="pr-4">
                <div className="text-sm font-medium text-zinc-900">Contractor compliance documents</div>
                <div className="text-xs text-zinc-500">Controls the "Upload document" inputs inside Contractor → Compliance (ESI, PF, MSME, GST).</div>
              </div>
              <Switch
                checked={!!uploadControls.contractor_compliance_enabled}
                disabled={savingControls}
                onCheckedChange={(v) => saveUploadControls({ ...uploadControls, contractor_compliance_enabled: v })}
                data-testid="toggle-contractor-compliance"
              />
            </div>
          </div>
        </TabsContent>
        )}

        {isSuperAdmin && (
        <TabsContent value="email" className="mt-4">
          <EmailAlertsSettings />
        </TabsContent>
        )}

        {isSuperAdmin && (
        <TabsContent value="backup" className="mt-4">
          <BackupPanel />
        </TabsContent>
        )}

        {isSuperAdmin && (
        <TabsContent value="audit" className="mt-4">
          <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-200">
              <h2 className="text-base font-medium text-zinc-900">Audit Logs</h2>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600">
                <tr>
                  <th className="text-left py-2 px-4 font-medium">When</th>
                  <th className="text-left py-2 px-4 font-medium">Who</th>
                  <th className="text-left py-2 px-4 font-medium">Action</th>
                  <th className="text-left py-2 px-4 font-medium">Target</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 && <tr><td colSpan={4} className="text-center py-8 text-zinc-500">No audit entries.</td></tr>}
                {logs.map((l) => (
                  <tr key={l.id} className="border-b border-zinc-100" data-testid={`audit-${l.id}`}>
                    <td className="py-3 px-4 text-zinc-500 text-xs mono">{l.at?.slice(0, 19).replace("T", " ")}</td>
                    <td className="py-3 px-4 text-zinc-700 text-xs">{l.user_email}</td>
                    <td className="py-3 px-4"><span className="id-pill">{l.action}</span></td>
                    <td className="py-3 px-4 text-zinc-500 text-xs mono">{l.target}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
