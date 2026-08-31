import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, ChevronUp, ChevronDown, GripVertical, RotateCcw, Pencil, Lock } from "lucide-react";
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

const FIELD_TYPES = [
  { value: "text", label: "Text (single line)" },
  { value: "email", label: "Email" },
  { value: "tel", label: "Phone (Tel)" },
  { value: "date", label: "Date" },
  { value: "number", label: "Number" },
  { value: "textarea", label: "Textarea (multi-line)" },
  { value: "select", label: "Select (Dropdown)" },
  { value: "contractor", label: "Contractor Selector" },
  { value: "member", label: "Member Selector" },
  { value: "cluster_manager", label: "Cluster Manager (Admin Users)" },
  { value: "document", label: "Document Upload Slot" },
];

/**
 * Form builder UI for `manpower`, `contractor`, and `compliance` form configs.
 * Loads from /api/form-configs/{key} and saves via PUT.
 * Supports adding, removing, reordering, and full editing of system & custom fields.
 */
export default function FormBuilder({ formKey, title, hideAddSection = false }) {
  const [config, setConfig] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [showAddField, setShowAddField] = useState(null); // section index or null
  const [newField, setNewField] = useState({ key: "", label: "", type: "text", required: false, options: "", admin_only: false, readonly: false });
  
  // Edit field dialog state
  const [editingTarget, setEditingTarget] = useState(null); // { si: number, fi: number } or null
  const [editField, setEditField] = useState({ key: "", label: "", type: "text", required: false, options: "", system: false, admin_only: false, readonly: false });

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

  const startEditField = (si, fi) => {
    const fld = config.sections[si].fields[fi];
    setEditingTarget({ si, fi });
    setEditField({
      key: fld.key,
      label: fld.label || "",
      type: fld.type || "text",
      required: !!fld.required,
      options: Array.isArray(fld.options) ? fld.options.join(", ") : (fld.options || ""),
      system: !!fld.system,
      admin_only: !!fld.admin_only,
      readonly: !!fld.readonly,
    });
  };

  const saveEditField = () => {
    if (!editingTarget) return;
    const { si, fi } = editingTarget;
    const label = editField.label.trim();
    if (!label) {
      toast.error("Field label is required");
      return;
    }

    const updated = {
      ...config.sections[si].fields[fi],
      label,
      type: editField.type,
      required: editField.required,
      admin_only: editField.admin_only,
      readonly: editField.readonly,
    };

    if (editField.type === "select") {
      const opts = editField.options.split(",").map((o) => o.trim()).filter(Boolean);
      if (opts.length === 0) {
        toast.error("Please provide at least one option for Select dropdown");
        return;
      }
      updated.options = opts;
    } else {
      delete updated.options;
    }

    const nextSections = config.sections.map((s, sIdx) => {
      if (sIdx !== si) return s;
      return {
        ...s,
        fields: s.fields.map((f, fIdx) => (fIdx === fi ? updated : f)),
      };
    });

    update({ ...config, sections: nextSections });
    setEditingTarget(null);
    toast.success(`Field "${label}" updated in draft. Click "Save Changes" to persist.`);
  };

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
      admin_only: newField.admin_only,
      readonly: newField.readonly,
    };
    if (newField.type === "select") {
      const opts = newField.options.split(",").map((o) => o.trim()).filter(Boolean);
      if (opts.length === 0) { toast.error("Provide at least one option (comma separated)"); return; }
      fld.options = opts;
    }
    const next = { ...config, sections: config.sections.map((s, i) => i === showAddField ? { ...s, fields: [...s.fields, fld] } : s) };
    update(next);
    setShowAddField(null);
    setNewField({ key: "", label: "", type: "text", required: false, options: "", admin_only: false, readonly: false });
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
      toast.success("Form configuration saved successfully");
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = async () => {
    if (!window.confirm("Reset this form to factory defaults? Custom fields will be removed and system fields restored.")) return;
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
          <p className="text-xs text-zinc-500">Edit field types, required rules, options, reorder or add fields. Click the Edit pencil on any field.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={resetDefaults} data-testid={`reset-${formKey}-btn`}>
            <RotateCcw size={14} className="mr-1.5" /> Reset Defaults
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
                <Button size="sm" variant="ghost" onClick={() => moveSection(si, -1)} data-testid={`section-up-${si}`} title="Move section up"><ChevronUp size={14} /></Button>
                <Button size="sm" variant="ghost" onClick={() => moveSection(si, 1)} data-testid={`section-down-${si}`} title="Move section down"><ChevronDown size={14} /></Button>
                {!hideAddSection && (
                  <Button size="sm" variant="ghost" onClick={() => removeSection(si)} data-testid={`section-remove-${si}`} className="text-rose-700" title="Remove section">
                    <Trash2 size={14} />
                  </Button>
                )}
              </div>
            </div>
            <ul className="divide-y divide-zinc-100">
              {sec.fields.map((f, fi) => (
                <li key={f.key} className="flex items-center justify-between px-3 py-2 text-sm hover:bg-zinc-50/50 transition-colors" data-testid={`field-row-${f.key}`}>
                  <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
                    <span className="mono text-xs text-zinc-500 font-medium px-1.5 py-0.5 rounded bg-zinc-100 border border-zinc-200 truncate max-w-[140px]">{f.key}</span>
                    <span className="text-zinc-900 font-medium truncate">{f.label}</span>
                    <span className="id-pill">{f.type}</span>
                    {f.required && <span className="text-[11px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 font-medium">Required</span>}
                    {f.system && <span className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 border border-zinc-200 flex items-center gap-1"><Lock size={10} /> System</span>}
                    {f.admin_only && <span className="text-[11px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">Admin Only</span>}
                    {f.readonly && <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">Read-only</span>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs text-zinc-700 hover:text-zinc-900 hover:bg-zinc-100"
                      onClick={() => startEditField(si, fi)}
                      data-testid={`field-edit-${f.key}`}
                      title="Edit field type, required rule, and label"
                    >
                      <Pencil size={12} className="mr-1" /> Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => moveField(si, fi, -1)} data-testid={`field-up-${f.key}`} title="Move up"><ChevronUp size={14} /></Button>
                    <Button size="sm" variant="ghost" onClick={() => moveField(si, fi, 1)} data-testid={`field-down-${f.key}`} title="Move down"><ChevronDown size={14} /></Button>
                    {!f.system && (
                      <Button size="sm" variant="ghost" onClick={() => removeField(si, fi)} data-testid={`field-remove-${f.key}`} className="text-rose-700" title="Delete custom field">
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

      {/* Edit field dialog */}
      <Dialog open={editingTarget !== null} onOpenChange={(open) => !open && setEditingTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil size={16} className="text-zinc-700" />
              Edit Field Configuration
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs text-zinc-600">Field Key (System identifier)</Label>
              <div className="flex items-center gap-2">
                <Input value={editField.key} disabled className="bg-zinc-50 font-mono text-xs text-zinc-600" />
                {editField.system && (
                  <span className="text-[11px] whitespace-nowrap px-2 py-1 bg-zinc-100 text-zinc-600 rounded border border-zinc-200 flex items-center gap-1">
                    <Lock size={10} /> System
                  </span>
                )}
              </div>
            </div>
            
            <div className="space-y-1">
              <Label className="text-xs text-zinc-700 font-medium">Display Label</Label>
              <Input
                placeholder="Label"
                value={editField.label}
                onChange={(e) => setEditField({ ...editField, label: e.target.value })}
                data-testid="edit-field-label"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-zinc-700 font-medium">Field Type</Label>
              <Select value={editField.type} onValueChange={(v) => setEditField({ ...editField, type: v })}>
                <SelectTrigger data-testid="edit-field-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {editField.type === "select" && (
              <div className="space-y-1">
                <Label className="text-xs text-zinc-700 font-medium">Dropdown Options (comma separated)</Label>
                <Input
                  placeholder="Option 1, Option 2, Option 3"
                  value={editField.options}
                  onChange={(e) => setEditField({ ...editField, options: e.target.value })}
                  data-testid="edit-field-options"
                />
                <p className="text-[11px] text-zinc-400">Separate multiple options with commas.</p>
              </div>
            )}

            <div className="pt-2 space-y-2 border-t border-zinc-100">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={editField.required}
                  onChange={(e) => setEditField({ ...editField, required: e.target.checked })}
                  data-testid="edit-field-required"
                  className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                />
                <span className="font-medium text-zinc-900">Required Field</span>
                <span className="text-xs text-zinc-500">(User must fill before submitting)</span>
              </label>

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={editField.admin_only}
                  onChange={(e) => setEditField({ ...editField, admin_only: e.target.checked })}
                  data-testid="edit-field-admin-only"
                  className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                />
                <span className="text-zinc-700">Admin Only</span>
                <span className="text-xs text-zinc-400">(Visible only to Admins)</span>
              </label>

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={editField.readonly}
                  onChange={(e) => setEditField({ ...editField, readonly: e.target.checked })}
                  data-testid="edit-field-readonly"
                  className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                />
                <span className="text-zinc-700">Read-Only</span>
                <span className="text-xs text-zinc-400">(Locked from manual edits)</span>
              </label>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setEditingTarget(null)}>Cancel</Button>
            <Button onClick={saveEditField} className="bg-zinc-900 hover:bg-zinc-800 text-white" data-testid="confirm-edit-field">
              Apply Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add field dialog */}
      <Dialog open={showAddField !== null} onOpenChange={(o) => !o && setShowAddField(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Custom Field</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs text-zinc-700 font-medium">Field Key (lowercase, no spaces)</Label>
              <Input placeholder="aadhar_number" value={newField.key} onChange={(e) => setNewField({ ...newField, key: e.target.value })} data-testid="new-field-key" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-zinc-700 font-medium">Label</Label>
              <Input placeholder="Aadhar Number" value={newField.label} onChange={(e) => setNewField({ ...newField, label: e.target.value })} data-testid="new-field-label" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-zinc-700 font-medium">Type</Label>
              <Select value={newField.type} onValueChange={(v) => setNewField({ ...newField, type: v })}>
                <SelectTrigger data-testid="new-field-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {newField.type === "select" && (
              <div className="space-y-1">
                <Label className="text-xs text-zinc-700 font-medium">Options (comma separated)</Label>
                <Input placeholder="Option A, Option B, Option C" value={newField.options} onChange={(e) => setNewField({ ...newField, options: e.target.value })} data-testid="new-field-options" />
              </div>
            )}
            <div className="pt-2 space-y-2 border-t border-zinc-100">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={newField.required} onChange={(e) => setNewField({ ...newField, required: e.target.checked })} data-testid="new-field-required" />
                <span className="font-medium text-zinc-900">Required Field</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={newField.admin_only} onChange={(e) => setNewField({ ...newField, admin_only: e.target.checked })} data-testid="new-field-admin-only" />
                <span className="text-zinc-700">Admin Only</span>
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddField(null)}>Cancel</Button>
            <Button onClick={addField} className="bg-zinc-900 hover:bg-zinc-800 text-white" data-testid="confirm-add-field">Add Field</Button>
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
