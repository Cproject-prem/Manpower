import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import SearchableCombobox from "@/components/ui/SearchableCombobox";
import { api } from "@/lib/api";

/**
 * Renders a single section's fields based on form-config field definitions.
 * Props:
 *  - section: { title, fields: [...] }
 *  - values: { [fieldKey]: any }
 *  - onChange: (key, value) => void
 *  - context: { contractors: [], members: [], clusterManagers: [], masterData: {}, isAdmin: bool, currentRole: string }
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
            values={values}
            onChange={onChange}
            context={context}
            disabled={disabledKeys?.has(f.key)}
          />
        ))}
      </div>
    </div>
  );
}

function FieldRenderer({ field, value, values = {}, onChange, context, disabled }) {
  const { contractors = [], members = [], clusterManagers = [], masterData = {}, isAdmin = false } = context;
  // Hide admin-only fields for non-admins
  if (field.admin_only && !isAdmin) return null;
  // "document" type is a file-upload slot, not a form input — surfaced only in the Documents tab.
  if (field.type === "document") return null;
  const testId = `field-${field.key}`;
  const isDisabled = disabled || field.readonly;

  // Searchable dropdown for location (site)
  if (field.key === "location" || field.type === "location" || field.key === "site_name") {
    const locOptions = (masterData.locations || []).map((l) => (typeof l === "string" ? l : l.location || l.site_name || l));
    return (
      <div className="space-y-1.5">
        <Label className="text-xs text-zinc-700">
          {field.label}
          {field.required && <span className="text-rose-600"> *</span>}
        </Label>
        <SearchableCombobox
          value={value || ""}
          onChange={(v) => onChange(field.key, v)}
          options={locOptions}
          placeholder={values.region ? `Search location in ${values.region}...` : "Select or search location/site..."}
          searchPlaceholder="Type site/location name..."
          disabled={isDisabled}
          allowCustom={true}
          testId={testId}
        />
      </div>
    );
  }

  // Searchable dropdown for state and work_state
  if (field.key === "state" || field.key === "work_state" || field.type === "state") {
    const stateOptions = (masterData.states && masterData.states.length > 0)
      ? masterData.states
      : (masterData.all_states || []);
    return (
      <div className="space-y-1.5">
        <Label className="text-xs text-zinc-700">
          {field.label}
          {field.required && <span className="text-rose-600"> *</span>}
        </Label>
        <SearchableCombobox
          value={value || ""}
          onChange={(v) => onChange(field.key, v)}
          options={stateOptions}
          placeholder={values.region ? `Search state in ${values.region}...` : "Select or search state..."}
          searchPlaceholder="Type state name..."
          disabled={isDisabled}
          allowCustom={true}
          testId={testId}
        />
      </div>
    );
  }

  // Region dropdown
  if (field.key === "region" || field.type === "region") {
    const regionOptions = masterData.regions || [];
    return (
      <div className="space-y-1.5">
        <Label className="text-xs text-zinc-700">
          {field.label}
          {field.required && <span className="text-rose-600"> *</span>}
        </Label>
        <SearchableCombobox
          value={value || ""}
          onChange={(v) => onChange(field.key, v)}
          options={regionOptions}
          placeholder="Select or search region..."
          searchPlaceholder="Type region name..."
          disabled={isDisabled}
          allowCustom={true}
          testId={testId}
        />
      </div>
    );
  }

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
    const selectedContractorId = values?.contractor_id;
    const filteredMembers = selectedContractorId
      ? members.filter((m) => m.contractor_id === selectedContractorId)
      : members;

    control = (
      <Select
        value={value || ""}
        onValueChange={(v) => onChange(field.key, v)}
        disabled={isDisabled}
      >
        <SelectTrigger data-testid={testId}>
          <SelectValue placeholder={!selectedContractorId ? "Select contractor first" : filteredMembers.length === 0 ? "No members for this contractor" : "Assign to member"} />
        </SelectTrigger>
        <SelectContent>
          {filteredMembers.map((m) => (
            <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  } else if (field.type === "cluster_manager" || field.key === "reporting_cluster_manager" || field.key === "cluster_manager") {
    const selectedRegion = values?.region;
    const filteredAdmins = clusterManagers.filter((cm) => {
      if (cm.role === "super_admin") return false;
      if (!selectedRegion) return true;
      if (cm.region && cm.region.toLowerCase() === selectedRegion.toLowerCase()) return true;
      if (Array.isArray(cm.region_scope) && cm.region_scope.length > 0) {
        return cm.region_scope.some((r) => r.toLowerCase() === selectedRegion.toLowerCase());
      }
      return !cm.region && (!cm.region_scope || cm.region_scope.length === 0);
    });

    control = (
      <Select
        value={value || ""}
        onValueChange={(v) => onChange(field.key, v)}
        disabled={isDisabled}
      >
        <SelectTrigger data-testid={testId}>
          <SelectValue placeholder={!selectedRegion ? "Select cluster manager" : filteredAdmins.length === 0 ? `No admin for ${selectedRegion} region` : "Select cluster manager"} />
        </SelectTrigger>
        <SelectContent>
          {filteredAdmins.map((cm) => (
            <SelectItem key={cm.id || cm.name} value={cm.name}>
              {cm.name}{cm.region ? ` (${cm.region})` : ""}
            </SelectItem>
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
