import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, ChevronUp, ChevronDown, GripVertical, RotateCcw } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

const FIELD_TYPES = ["text", "email", "tel", "date", "number", "textarea", "select", "document"];

/**
 * Form builder UI for `manpower` and `compliance` form configs.
 * Loads from /api/form-configs/{key} and saves via PUT.
 */
export default function FormBuilder({ formKey, title, hideAddSection = false }) {
  const [config, setConfig] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [showAddField, setShowAddField] = useState(null); // section index or null
  const [newField, setNewField] = useState({ key: "", label: "", type: "text", required: false, options: "" });
  const [showAddSection, setShowAddSection] = useState(false);
  const [newSection, setNewSection] = useState({ title: "" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get(`/form-configs/${formKey}`);
      setConfig(data);
      setDirty(false);
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [formKey]);

  if (!config) {
    return <div className="text-zinc-500 text-sm">Loading form builder…</div>;
  }

  const update = (next) => { setConfig(next); setDirty(true); };

  const addField = () => {
    if (showAddField === null) return;
    const key = newField.key.trim();
    const label = newField.label.trim();
    if (!key || !label) { toast.error("Field key and label are required"); return; }
    if (!/^[a-z][a-z0-9_]*$/.test(key)) {
      toast.error("Field key must be lowercase letters, digits, underscores, starting with a letter");
      return;
    }
    // Uniqueness check
    const allKeys = config.sections.flatMap((s) => s.fields.map((f) => f.key));
    if (allKeys.includes(key)) { toast.error("Field key already exists"); return; }
    const fld = {
      key,
      label,
      type: newField.type,
      required: newField.required,
      system: false,
    };
    if (newField.type === "select") {
      const opts = newField.options.split(",").map((o) => o.trim()).filter(Boolean);
      if (opts.length === 0) { toast.error("Provide at least one option (comma separated)"); return; }
      fld.options = opts;
    }
    const next = { ...config, sections: config.sections.map((s, i) => i === showAddField ? { ...s, fields: [...s.fields, fld] } : s) };
    update(next);
    setShowAddField(null);
    setNewField({ key: "", label: "", type: "text", required: false, options: "" });
  };

  const removeField = (si, fi) => {
    const fld = config.sections[si].fields[fi];
    if (fld.system) { toast.error("Cannot remove system field"); return; }
    const next = { ...config, sections: config.sections.map((s, i) => i === si ? { ...s, fields: s.fields.filter((_, j) => j !== fi) } : s) };
    update(next);
  };

  const moveField = (si, fi, delta) => {
    const fields = [...config.sections[si].fields];
    const ni = fi + delta;
    if (ni < 0 || ni >= fields.length) return;
    [fields[fi], fields[ni]] = [fields[ni], fields[fi]];
    const next = { ...config, sections: config.sections.map((s, i) => i === si ? { ...s, fields } : s) };
    update(next);
  };

  const moveSection = (si, delta) => {
    const sections = [...config.sections];
    const ni = si + delta;
    if (ni < 0 || ni >= sections.length) return;
    [sections[si], sections[ni]] = [sections[ni], sections[si]];
    update({ ...config, sections });
  };

  const addSection = () => {
    const title = newSection.title.trim();
    if (!title) { toast.error("Section title required"); return; }
    update({ ...config, sections: [...config.sections, { title, fields: [] }] });
    setShowAddSection(false);
    setNewSection({ title: "" });
  };

  const removeSection = (si) => {
    const sec = config.sections[si];
    if (sec.fields.some((f) => f.system)) {
      toast.error("Cannot remove section containing system fields");
      return;
    }
    update({ ...config, sections: config.sections.filter((_, i) => i !== si) });
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = { sections: config.sections };
      const { data } = await api.put(`/form-configs/${formKey}`, payload);
      setConfig(data);
      setDirty(false);
      toast.success("Form saved");
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = async () => {
    if (!window.confirm("Reset this form to factory defaults? Custom fields will be removed.")) return;
    try {
      await api.post(`/form-configs/${formKey}/reset`);
      toast.success("Reset to defaults");
      load();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-6 space-y-5" data-testid={`form-builder-${formKey}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-medium text-zinc-900">{title}</h2>
          <p className="text-xs text-zinc-500">Reorder, add or remove fields. System fields (locked icon) cannot be removed.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={resetDefaults} data-testid={`reset-${formKey}-btn`}>
            <RotateCcw size={14} className="mr-1.5" /> Reset
          </Button>
          <Button onClick={save} disabled={!dirty || saving} className="bg-zinc-900 hover:bg-zinc-800 text-white" data-testid={`save-${formKey}-btn`}>
            {saving ? "Saving…" : dirty ? "Save Changes" : "Saved"}
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {config.sections.map((sec, si) => (
          <div key={si} className="border border-zinc-200 rounded-md" data-testid={`section-${si}`}>
            <div className="flex items-center justify-between px-3 py-2 bg-zinc-50 border-b border-zinc-200">
              <div className="flex items-center gap-2">
                <GripVertical size={14} className="text-zinc-400" />
                <span className="font-medium text-sm text-zinc-900">{sec.title}</span>
                {sec.doc_key && <span className="id-pill">{sec.doc_key.toUpperCase()}</span>}
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => moveSection(si, -1)} data-testid={`section-up-${si}`}><ChevronUp size={14} /></Button>
                <Button size="sm" variant="ghost" onClick={() => moveSection(si, 1)} data-testid={`section-down-${si}`}><ChevronDown size={14} /></Button>
                {!hideAddSection && (
                  <Button size="sm" variant="ghost" onClick={() => removeSection(si)} data-testid={`section-remove-${si}`} className="text-rose-700">
                    <Trash2 size={14} />
                  </Button>
                )}
              </div>
            </div>
            <ul className="divide-y divide-zinc-100">
              {sec.fields.map((f, fi) => (
                <li key={f.key} className="flex items-center justify-between px-3 py-2 text-sm" data-testid={`field-row-${f.key}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="mono text-xs text-zinc-500 truncate w-32">{f.key}</span>
                    <span className="text-zinc-900 truncate">{f.label}</span>
                    <span className="id-pill">{f.type}</span>
                    {f.required && <span className="text-xs text-rose-600">required</span>}
                    {f.system && <span className="text-xs text-zinc-500">🔒 system</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => moveField(si, fi, -1)} data-testid={`field-up-${f.key}`}><ChevronUp size={14} /></Button>
                    <Button size="sm" variant="ghost" onClick={() => moveField(si, fi, 1)} data-testid={`field-down-${f.key}`}><ChevronDown size={14} /></Button>
                    {!f.system && (
                      <Button size="sm" variant="ghost" onClick={() => removeField(si, fi)} data-testid={`field-remove-${f.key}`} className="text-rose-700">
                        <Trash2 size={14} />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <div className="px-3 py-2 border-t border-zinc-100">
              <Button size="sm" variant="outline" onClick={() => setShowAddField(si)} data-testid={`add-field-${si}-btn`}>
                <Plus size={12} className="mr-1" /> Add field
              </Button>
            </div>
          </div>
        ))}

        {!hideAddSection && (
          <Button variant="outline" onClick={() => setShowAddSection(true)} data-testid={`add-section-${formKey}-btn`}>
            <Plus size={14} className="mr-1.5" /> Add Section
          </Button>
        )}
      </div>

      {/* Add field dialog */}
      <Dialog open={showAddField !== null} onOpenChange={(o) => !o && setShowAddField(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add custom field</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-700">Field Key (lowercase, no spaces)</Label>
              <Input placeholder="aadhar_number" value={newField.key} onChange={(e) => setNewField({ ...newField, key: e.target.value })} data-testid="new-field-key" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-700">Label</Label>
              <Input placeholder="Aadhar Number" value={newField.label} onChange={(e) => setNewField({ ...newField, label: e.target.value })} data-testid="new-field-label" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-700">Type</Label>
              <Select value={newField.type} onValueChange={(v) => setNewField({ ...newField, type: v })}>
                <SelectTrigger data-testid="new-field-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {newField.type === "select" && (
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-700">Options (comma separated)</Label>
                <Input placeholder="Option A, Option B, Option C" value={newField.options} onChange={(e) => setNewField({ ...newField, options: e.target.value })} data-testid="new-field-options" />
              </div>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={newField.required} onChange={(e) => setNewField({ ...newField, required: e.target.checked })} data-testid="new-field-required" />
              <span>Required</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddField(null)}>Cancel</Button>
            <Button onClick={addField} className="bg-zinc-900 hover:bg-zinc-800 text-white" data-testid="confirm-add-field">Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add section dialog */}
      <Dialog open={showAddSection} onOpenChange={setShowAddSection}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Section</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-700">Section Title</Label>
              <Input value={newSection.title} onChange={(e) => setNewSection({ title: e.target.value })} data-testid="new-section-title" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddSection(false)}>Cancel</Button>
            <Button onClick={addSection} className="bg-zinc-900 hover:bg-zinc-800 text-white" data-testid="confirm-add-section">Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
