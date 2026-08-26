# 09 - UI / UX Design & Theme Guidelines

## Design Principles
- **Clean Industrial Aesthetics**: Neutral dark/light zinc palette (`zinc-900`, `zinc-500`, `zinc-100`) tailored for corporate compliance and operational clarity.
- **High Information Density**: Compact tables, pill tags (`id-pill`, `status-pill`), and badge indicators for fast scanning.
- **Immediate Feedback**: Instant toast notifications via `sonner`, explicit loading skeletons, and interactive state changes.

---

## Status Color System

| Status / Badge | Background | Text Color | Border Color | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Active / Approved** | `bg-emerald-50` | `text-emerald-700` | `border-emerald-200` | Verified and compliant |
| **Pending Approval** | `bg-amber-50` | `text-amber-700` | `border-amber-200` | Awaiting admin review |
| **Renewal Pending** | `bg-orange-50` | `text-orange-700` | `border-orange-200` | Renewal doc uploaded |
| **Expiring Soon (<30d)** | `bg-yellow-50` | `text-yellow-800` | `border-yellow-200` | Medical test expiring soon |
| **Expired** | `bg-rose-50` | `text-rose-700` | `border-rose-200` | Compliance breach / expired |
| **Draft** | `bg-zinc-100` | `text-zinc-700` | `border-zinc-300` | Unsubmitted registration |
| **Disabled** | `bg-zinc-200` | `text-zinc-700` | `border-zinc-300` | Offboarded / disabled |

---

## Layout Structure
- **Sidebar Header**: App Logo, Global Tenant Context, User Profile Badge, Quick Logout.
- **Primary Content Area**: Dynamic Page Header, Stat Cards, Data Table / Grid, Context Modals.
- **Modals & Dialogs**: `DocumentViewerDialog` for PDF/Image inline preview with tokenized auth URL.
