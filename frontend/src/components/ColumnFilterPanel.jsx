import { useEffect, useState } from "react";
import { Filter, X } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover, PopoverTrigger, PopoverContent,
} from "@/components/ui/popover";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";

/**
 * Generic column-picker filter panel driven by a form-config (`formKey`).
 *
 * `value` is a `{ fieldKey: stringValue }` map. `fieldKey` is either a native
 * field (e.g. "blood_group") or a `extra_fields.<custom>` path.
 *
 * Only fields the user has explicitly checked are applied — this lets the user
 * pick *which* columns to filter on, exactly as requested.
 */
export default function ColumnFilterPanel({
  formKey = "manpower",
  value = {},
  onChange,
  onApply,
  extraFields = [],   // Optional list of injected pseudo-columns not present in form config
  testIdPrefix = "colfilter",
}) {
  const [config, setConfig] = useState(null);
  const [enabled, setEnabled] = useState(() => new Set(Object.keys(value || {})));
  const [values, setValues] = useState(value || {});
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api.get(`/form-configs/${formKey}`).then((r) => setConfig(r.data)).catch(() => setConfig({ sections: [] }));
  }, [formKey]);

  useEffect(() => {
    setEnabled(new Set(Object.keys(value || {})));
    setValues(value || {});
  }, [value]);

  const allFields = (() => {
    const rows = [];
    (config?.sections || []).forEach((sec) => {
      (sec.fields || []).forEach((fld) => {
        // Skip password / file-type fields; only include filterable fields
        if (fld.type === "document") return;
        const path = fld.system ? fld.key : `extra_fields.${fld.key}`;
        rows.push({
          path,
          label: fld.label || fld.key,
          type: fld.type,
          options: fld.options || null,
          section: sec.title,
        });
      });
    });
    extraFields.forEach((f) => rows.push(f));
    return rows;
  })();

  const toggle = (path) => {
    const next = new Set(enabled);
    if (next.has(path)) {
      next.delete(path);
      const v = { ...values };
      delete v[path];
      setValues(v);
    } else {
      next.add(path);
    }
    setEnabled(next);
  };

  const updateValue = (path, val) => {
    setValues((prev) => ({ ...prev, [path]: val }));
  };

  const apply = () => {
    // Only pass filters where the checkbox is enabled AND value is non-empty
    const applied = {};
    for (const path of enabled) {
      const v = values[path];
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        applied[path] = v;
      }
    }
    onChange && onChange(applied);
    onApply && onApply(applied);
    setOpen(false);
  };

  const reset = () => {
    setEnabled(new Set());
    setValues({});
    onChange && onChange({});
    onApply && onApply({});
  };

  const activeCount = Object.keys(value || {}).length;

  const renderInput = (fld) => {
    const path = fld.path;
    const val = values[path] ?? "";
    if (fld.type === "select" && (fld.options || []).length > 0) {
      return (
        <Select value={val || "__any__"} onValueChange={(v) => updateValue(path, v === "__any__" ? "" : v)}>
          <SelectTrigger className="h-8 text-xs" data-testid={`${testIdPrefix}-value-${path}`}>
            <SelectValue placeholder="Any" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__any__">Any</SelectItem>
            {fld.options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      );
    }
    return (
      <Input
        value={val}
        onChange={(e) => updateValue(path, e.target.value)}
        placeholder={fld.type === "date" ? "YYYY-MM-DD" : `Contains…`}
        type={fld.type === "date" ? "date" : fld.type === "number" ? "number" : "text"}
        className="h-8 text-xs"
        data-testid={`${testIdPrefix}-value-${path}`}
        onKeyDown={(e) => { if (e.key === "Enter") apply(); }}
      />
    );
  };

  const bySection = allFields.reduce((acc, f) => {
    const k = f.section || "Other";
    acc[k] = acc[k] || [];
    acc[k].push(f);
    return acc;
  }, {});

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" data-testid={`${testIdPrefix}-open-btn`} className="relative">
          <Filter size={14} className="mr-1.5" />
          Column Filters
          {activeCount > 0 && (
            <span className="ml-2 inline-flex items-center justify-center rounded-full bg-zinc-900 text-white text-[10px] px-1.5 py-0.5" data-testid={`${testIdPrefix}-active-count`}>
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[420px] p-0" data-testid={`${testIdPrefix}-panel`}>
        <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-zinc-900">Filter by Columns</div>
            <div className="text-xs text-zinc-500">Tick any columns and enter values. Filters combine with AND.</div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-zinc-400 hover:text-zinc-700"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[420px] overflow-y-auto px-4 py-3 space-y-4">
          {Object.entries(bySection).map(([section, fields]) => (
            <div key={section} className="space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">{section}</div>
              <div className="space-y-2">
                {fields.map((fld) => {
                  const isOn = enabled.has(fld.path);
                  return (
                    <div key={fld.path} className="grid grid-cols-[auto_1fr_1.4fr] gap-2 items-center">
                      <Checkbox
                        checked={isOn}
                        onCheckedChange={() => toggle(fld.path)}
                        data-testid={`${testIdPrefix}-toggle-${fld.path}`}
                      />
                      <Label
                        className={`text-xs cursor-pointer ${isOn ? "text-zinc-900" : "text-zinc-500"}`}
                        onClick={() => toggle(fld.path)}
                      >
                        {fld.label}
                      </Label>
                      <div className={isOn ? "opacity-100" : "opacity-40 pointer-events-none"}>
                        {renderInput(fld)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {allFields.length === 0 && (
            <div className="text-xs text-zinc-500 italic py-6 text-center">No columns available.</div>
          )}
        </div>
        <div className="px-4 py-3 border-t border-zinc-200 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={reset} data-testid={`${testIdPrefix}-reset-btn`}>
            Reset
          </Button>
          <Button size="sm" onClick={apply} className="bg-zinc-900 hover:bg-zinc-800 text-white" data-testid={`${testIdPrefix}-apply-btn`}>
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
