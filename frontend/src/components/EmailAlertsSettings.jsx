import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Mail, Send, RotateCcw, CheckCircle2, Clock } from "lucide-react";

const PLACEHOLDER_HINTS = [
  "{{ manpower_name }}",
  "{{ manpower_id_display }}",
  "{{ contractor }}",
  "{{ actor_email }}",
  "{{ status }}",
  "{{ doc_type }}",
  "{{ new_expiry }}",
  "{{ days_left }}",
  "{{ admin_comments }}",
  "{{ portal_url }}",
];

export default function EmailAlertsSettings() {
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);
  const [activeEvent, setActiveEvent] = useState("manpower_submitted");
  const [runningReminders, setRunningReminders] = useState(false);
  const [lastReminderRun, setLastReminderRun] = useState(null);

  const load = () => {
    api.get("/settings/email").then((r) => {
      setCfg(r.data);
      if (r.data?.available_events?.length && !r.data.templates?.[activeEvent]) {
        setActiveEvent(r.data.available_events[0].key);
      }
    }).catch((e) => toast.error(formatApiError(e)));
  };

  useEffect(() => { load(); }, []);

  if (!cfg) {
    return <div className="p-6 text-zinc-500 text-sm">Loading email settings…</div>;
  }

  const update = (patch) => setCfg((c) => ({ ...c, ...patch }));
  const updateTemplate = (event, patch) => setCfg((c) => ({
    ...c,
    templates: { ...c.templates, [event]: { ...(c.templates?.[event] || {}), ...patch } },
  }));

  const parseRecipients = (raw) =>
    (raw || "")
      .split(/[,\n;]+/)
      .map((s) => s.trim())
      .filter(Boolean);

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...cfg };
      // Only send password if user typed a new one (not the mask)
      if (payload.smtp_password === "********") delete payload.smtp_password;
      delete payload.available_events;
      delete payload.available_placeholders;
      delete payload.key;
      const { data } = await api.put("/settings/email", payload);
      setCfg(data);
      toast.success("Email settings saved");
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    if (!testTo) { toast.error("Enter a recipient email first"); return; }
    setTesting(true);
    try {
      await save(); // persist first
      const { data } = await api.post("/settings/email/test", { to_email: testTo });
      if (data.ok) toast.success(`Test sent to ${testTo}`);
      else toast.error(`Send failed: ${data.error || "unknown"}`);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setTesting(false);
    }
  };

  const resetTemplates = async () => {
    if (!confirm("Reset all email templates to defaults? Custom subjects/bodies will be lost.")) return;
    try {
      const { data } = await api.post("/settings/email/reset-templates");
      setCfg(data);
      toast.success("Templates reset to defaults");
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const runReminders = async () => {
    setRunningReminders(true);
    try {
      await save();
      const { data } = await api.post("/settings/email/reminders/run");
      setLastReminderRun(data);
      if (data.skipped) {
        toast.error(`Skipped: ${data.reason}`);
      } else {
        toast.success(`Scanned ${data.inspected} · sent ${data.sent} · deduped ${data.skipped_dedup}`);
      }
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setRunningReminders(false);
    }
  };

  const toggleReminderDoc = (docKey, on) => {
    const cur = new Set(cfg.reminder_docs || []);
    if (on) cur.add(docKey); else cur.delete(docKey);
    update({ reminder_docs: Array.from(cur) });
  };

  const events = cfg.available_events || [];
  const activeTpl = cfg.templates?.[activeEvent] || { subject: "", body: "", enabled: true };
  const recipientsText = Array.isArray(cfg.extra_recipients) ? cfg.extra_recipients.join(", ") : "";

  return (
    <div className="space-y-6" data-testid="email-alerts-settings">
      {/* Master toggle */}
      <div className="bg-white border border-zinc-200 rounded-lg p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-zinc-900 text-white p-2"><Mail className="h-4 w-4" /></div>
            <div>
              <h2 className="text-base font-medium text-zinc-900">Email Alerts</h2>
              <p className="text-xs text-zinc-500 mt-0.5">Send transactional emails when manpower submissions, updates, or renewals happen. Requires SMTP.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Label htmlFor="email-enabled" className="text-sm text-zinc-700">Enabled</Label>
            <Switch
              id="email-enabled"
              checked={!!cfg.enabled}
              onCheckedChange={(v) => update({ enabled: v })}
              data-testid="email-master-toggle"
            />
          </div>
        </div>
      </div>

      {/* SMTP configuration */}
      <div className="bg-white border border-zinc-200 rounded-lg p-6 space-y-4">
        <div>
          <h3 className="text-sm font-medium text-zinc-900">SMTP Configuration</h3>
          <p className="text-xs text-zinc-500">Provider host / credentials. Port 587 + STARTTLS is the safe default; use 465 + TLS if your provider requires it.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-700">SMTP Host</Label>
            <Input value={cfg.smtp_host || ""} placeholder="smtp.gmail.com" onChange={(e) => update({ smtp_host: e.target.value })} data-testid="smtp-host" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-700">Port</Label>
            <Input type="number" value={cfg.smtp_port ?? 587} onChange={(e) => update({ smtp_port: parseInt(e.target.value || "587", 10) })} data-testid="smtp-port" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-700">Username</Label>
            <Input value={cfg.smtp_username || ""} placeholder="user@example.com" onChange={(e) => update({ smtp_username: e.target.value })} data-testid="smtp-username" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-700">Password</Label>
            <Input type="password" value={cfg.smtp_password || ""} placeholder="•••••••" onChange={(e) => update({ smtp_password: e.target.value })} data-testid="smtp-password" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-700">From Email</Label>
            <Input value={cfg.from_email || ""} placeholder="alerts@yourcompany.com" onChange={(e) => update({ from_email: e.target.value })} data-testid="smtp-from-email" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-700">From Name</Label>
            <Input value={cfg.from_name || ""} placeholder="CMES Manpower Portal" onChange={(e) => update({ from_name: e.target.value })} data-testid="smtp-from-name" />
          </div>
        </div>

        <div className="flex flex-wrap gap-x-8 gap-y-3 pt-2 border-t border-zinc-100">
          <div className="flex items-center gap-2">
            <Switch checked={!!cfg.start_tls} onCheckedChange={(v) => update({ start_tls: v, use_tls: v ? false : cfg.use_tls })} data-testid="smtp-starttls" />
            <Label className="text-sm text-zinc-700">STARTTLS (port 587)</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={!!cfg.use_tls} onCheckedChange={(v) => update({ use_tls: v, start_tls: v ? false : cfg.start_tls })} data-testid="smtp-tls" />
            <Label className="text-sm text-zinc-700">Direct TLS (port 465)</Label>
          </div>
        </div>
      </div>

      {/* Recipients */}
      <div className="bg-white border border-zinc-200 rounded-lg p-6 space-y-4">
        <div>
          <h3 className="text-sm font-medium text-zinc-900">Recipients</h3>
          <p className="text-xs text-zinc-500">Emails are sent to the manpower's own email + the submitter (creator) and assigned Member, plus any extra addresses below.</p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-zinc-700">Extra recipients (comma or newline separated)</Label>
          <Textarea
            rows={3}
            value={recipientsText}
            onChange={(e) => update({ extra_recipients: parseRecipients(e.target.value) })}
            placeholder="ops@example.com, hr@example.com"
            data-testid="extra-recipients"
          />
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <div className="flex items-center gap-2">
            <Switch checked={!!cfg.include_member_email} onCheckedChange={(v) => update({ include_member_email: v })} data-testid="include-member" />
            <Label className="text-sm text-zinc-700">Include Submitter / Member (creator) email</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={!!cfg.include_manpower_email} onCheckedChange={(v) => update({ include_manpower_email: v })} data-testid="include-manpower" />
            <Label className="text-sm text-zinc-700">Include Manpower's own email</Label>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-zinc-700">Portal URL (used in email links, e.g. https://portal.example.com)</Label>
          <Input value={cfg.portal_url || ""} onChange={(e) => update({ portal_url: e.target.value })} placeholder="https://portal.example.com" data-testid="portal-url" />
        </div>
      </div>

      {/* Expiry Reminder Scheduler */}
      <div className="bg-white border border-zinc-200 rounded-lg p-6 space-y-4" data-testid="reminder-section">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-amber-500 text-white p-2"><Clock className="h-4 w-4" /></div>
            <div>
              <h3 className="text-sm font-medium text-zinc-900">Nightly Expiry Reminders</h3>
              <p className="text-xs text-zinc-500 mt-0.5">Automatically email a reminder when a certificate is within N days of expiring. Runs once daily; each reminder fires once per (manpower · cert · expiry).</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Label className="text-sm text-zinc-700">Enabled</Label>
            <Switch
              checked={!!cfg.reminder_enabled}
              onCheckedChange={(v) => update({ reminder_enabled: v })}
              data-testid="reminder-toggle"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-700">Reminder window (days before expiry)</Label>
            <Input
              type="number" min="1" max="180"
              value={cfg.reminder_window_days ?? 30}
              onChange={(e) => update({ reminder_window_days: parseInt(e.target.value || "30", 10) })}
              data-testid="reminder-window"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-700">Daily run hour (UTC, 0–23)</Label>
            <Input
              type="number" min="0" max="23"
              value={cfg.reminder_hour_utc ?? 2}
              onChange={(e) => update({ reminder_hour_utc: parseInt(e.target.value || "2", 10) })}
              data-testid="reminder-hour"
            />
          </div>
        </div>

        <div>
          <Label className="text-xs text-zinc-700 mb-2 block">Certificates to watch</Label>
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            {[
              ["medical", "Medical"],
              ["height_work", "Height Work"],
              ["safety_belt", "Safety Belt"],
              ["extension_rope", "Extension Rope"],
              ["ppe_register", "PPE Register"],
            ].map(([k, label]) => (
              <div key={k} className="flex items-center gap-2">
                <Switch
                  checked={(cfg.reminder_docs || []).includes(k)}
                  onCheckedChange={(v) => toggleReminderDoc(k, v)}
                  data-testid={`reminder-doc-${k}`}
                />
                <Label className="text-sm text-zinc-700">{label}</Label>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-zinc-100">
          <Button
            variant="outline"
            size="sm"
            onClick={runReminders}
            disabled={runningReminders || !cfg.smtp_host}
            data-testid="reminder-run-now-btn"
          >
            <Clock className="h-3.5 w-3.5 mr-1.5" /> {runningReminders ? "Scanning…" : "Save & Run now"}
          </Button>
          {lastReminderRun && !lastReminderRun.skipped && (
            <span className="text-xs text-zinc-500">
              Last run: inspected <b>{lastReminderRun.inspected}</b> · sent <b>{lastReminderRun.sent}</b> · deduped <b>{lastReminderRun.skipped_dedup}</b>
            </span>
          )}
        </div>
      </div>

      {/* Templates per event */}
      <div className="bg-white border border-zinc-200 rounded-lg p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-medium text-zinc-900">Email Templates</h3>
            <p className="text-xs text-zinc-500">Customize subject and HTML body per event. Placeholders:{" "}
              <span className="font-mono text-[11px] text-zinc-700">
                {PLACEHOLDER_HINTS.join("  ·  ")}
              </span>
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={resetTemplates} data-testid="reset-templates-btn">
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset defaults
          </Button>
        </div>

        <Tabs value={activeEvent} onValueChange={setActiveEvent}>
          <TabsList className="flex flex-wrap h-auto">
            {events.map((ev) => (
              <TabsTrigger key={ev.key} value={ev.key} data-testid={`tab-tpl-${ev.key}`}>
                {ev.label}
                {cfg.templates?.[ev.key]?.enabled === false && (
                  <span className="ml-1.5 text-[10px] text-zinc-400">(off)</span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {events.map((ev) => {
            const tpl = cfg.templates?.[ev.key] || { subject: "", body: "", enabled: true };
            return (
              <TabsContent key={ev.key} value={ev.key} className="mt-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={tpl.enabled !== false}
                    onCheckedChange={(v) => updateTemplate(ev.key, { enabled: v })}
                    data-testid={`tpl-enabled-${ev.key}`}
                  />
                  <Label className="text-sm text-zinc-700">Send email for this event</Label>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-zinc-700">Subject</Label>
                  <Input
                    value={tpl.subject || ""}
                    onChange={(e) => updateTemplate(ev.key, { subject: e.target.value })}
                    data-testid={`tpl-subject-${ev.key}`}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-zinc-700">Body (HTML supported)</Label>
                  <Textarea
                    rows={10}
                    className="font-mono text-xs"
                    value={tpl.body || ""}
                    onChange={(e) => updateTemplate(ev.key, { body: e.target.value })}
                    data-testid={`tpl-body-${ev.key}`}
                  />
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
      </div>

      {/* Test send + Save */}
      <div className="bg-white border border-zinc-200 rounded-lg p-6 space-y-4">
        <h3 className="text-sm font-medium text-zinc-900">Test & Save</h3>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs text-zinc-700">Send test email to</Label>
            <Input
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="you@example.com"
              data-testid="test-email-to"
            />
          </div>
          <Button
            variant="outline"
            onClick={sendTest}
            disabled={testing || !cfg.smtp_host}
            data-testid="test-email-btn"
          >
            <Send className="h-3.5 w-3.5 mr-1.5" /> {testing ? "Sending…" : "Save & Send test"}
          </Button>
        </div>
        <div className="flex justify-end pt-2 border-t border-zinc-100">
          <Button
            onClick={save}
            disabled={saving}
            className="bg-zinc-900 hover:bg-zinc-800 text-white"
            data-testid="save-email-settings-btn"
          >
            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> {saving ? "Saving…" : "Save Email Settings"}
          </Button>
        </div>
      </div>
    </div>
  );
}
