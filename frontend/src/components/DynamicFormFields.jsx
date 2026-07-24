import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";

/**
 * Renders a single section's fields based on form-config field definitions.
 * Props:
 *  - section: { title, fields: [...] }
 *  - values: { [fieldKey]: any }
 *  - onChange: (key, value) => void
 *  - context: { contractors: [], members: [], isAdmin: bool, currentRole: string }
 *  - disabledKeys: optional Set<string> for fields that must be readonly in this view
 */
export default function DynamicFormFields({ section, values, onChange, context = {}, disabledKeys }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-[0.12em] text-zinc-500 mb-3">{section.title}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {section.fields.map((f) => (
          <FieldRenderer
            key={f.key}
            field={f}
            value={values[f.key] ?? ""}
            onChange={onChange}
            context={context}
            disabled={disabledKeys?.has(f.key)}
          />
        ))}
      </div>
    </div>
  );
}

function FieldRenderer({ field, value, onChange, context, disabled }) {
  const { contractors = [], members = [], isAdmin = false } = context;
  // Hide admin-only fields for non-admins
  if (field.admin_only && !isAdmin) return null;
  // "document" type is a file-upload slot, not a form input — surfaced only in the Documents tab.
  if (field.type === "document") return null;
  const testId = `field-${field.key}`;
  const isDisabled = disabled || field.readonly;

  let control = null;
  if (field.type === "textarea") {
    control = (
      <Textarea
        value={value || ""}
        onChange={(e) => onChange(field.key, e.target.value)}
        data-testid={testId}
        disabled={isDisabled}
      />
    );
  } else if (field.type === "select") {
    control = (
      <Select
        value={value || ""}
        onValueChange={(v) => onChange(field.key, v)}
        disabled={isDisabled}
      >
        <SelectTrigger data-testid={testId}><SelectValue placeholder="Select" /></SelectTrigger>
        <SelectContent>
          {(field.options || []).map((o) => (
            <SelectItem key={o} value={o}>{o}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  } else if (field.type === "contractor") {
    control = (
      <Select
        value={value || ""}
        onValueChange={(v) => onChange(field.key, v)}
        disabled={isDisabled}
      >
        <SelectTrigger data-testid={testId}><SelectValue placeholder="Select contractor" /></SelectTrigger>
        <SelectContent>
          {contractors.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  } else if (field.type === "member") {
    control = (
      <Select
        value={value || ""}
        onValueChange={(v) => onChange(field.key, v)}
        disabled={isDisabled}
      >
        <SelectTrigger data-testid={testId}><SelectValue placeholder="Assign to member" /></SelectTrigger>
        <SelectContent>
          {members.map((m) => (
            <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  } else {
    // text / email / tel / date / number
    control = (
      <Input
        type={field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "email" ? "email" : field.type === "tel" ? "tel" : "text"}
        value={value || ""}
        onChange={(e) => onChange(field.key, e.target.value)}
        data-testid={testId}
        disabled={isDisabled}
        required={!!field.required}
      />
    );
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-zinc-700">
        {field.label}
        {field.required && <span className="text-rose-600"> *</span>}
      </Label>
      {control}
    </div>
  );
}
