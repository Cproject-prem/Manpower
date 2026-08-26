const STATUS_STYLES = {
  draft: "bg-zinc-100 text-zinc-700 border-zinc-200",
  pending_approval: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  expiring_soon: "bg-orange-50 text-orange-700 border-orange-200",
  expired: "bg-rose-50 text-rose-700 border-rose-200",
  renewal_pending: "bg-blue-50 text-blue-700 border-blue-200",
  complete: "bg-emerald-50 text-emerald-700 border-emerald-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  disabled: "bg-zinc-200 text-zinc-700 border-zinc-300",
};

const LABELS = {
  draft: "Draft",
  pending_approval: "Pending Approval",
  approved: "Approved",
  rejected: "Rejected",
  active: "Active",
  expiring_soon: "Expiring Soon",
  expired: "Expired",
  renewal_pending: "Renewal Pending",
  complete: "Complete",
  pending: "Pending",
  disabled: "Disabled",
};

export default function StatusBadge({ status, testId }) {
  const cls = STATUS_STYLES[status] || "bg-zinc-100 text-zinc-700 border-zinc-200";
  return (
    <span
      data-testid={testId || `status-${status}`}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {LABELS[status] || status}
    </span>
  );
}
