# 05 - Detailed Page Specifications

## Key Interface Breakdown

### 1. Dashboard (`/dashboard`)
- **Key Indicators**: Total Active Manpower, Pending Approvals, Expiring Soon (<30 days), Expired Certificates, Renewal Pending Queue.
- **Visual Analytics**: Interactive breakdowns by Region, Contractor, Location, and Certificate Expiry timeline.
- **Filter Controls**: Dynamic region and date range filtering.

### 2. Manpower List (`/manpower`)
- **Data Grid**: Displays Manpower ID, Full Name, Contractor, Region, Location, Designation, Document Expiry Status, Assigned Member, and Workflow Status.
- **Advanced Filtering**: Full-text search, column filters, region select, contractor select, and document status badges.
- **Bulk Actions**: CSV export of selected query results.

### 3. New Registration (`/new`)
- **Dynamic Field Rendering**: Renders standard native fields (Name, Phone, Address, Designation, Work State) alongside dynamic custom fields defined in `form_configs`.
- **Contractor-Scoped Member Dropdown**: Selecting a contractor dynamically filters the "Assigned Member" dropdown to members belonging strictly to that contractor.
- **Auto-Fill & Locking**: For Vendor Admins and Members, contractor selection is locked to their designated company.

### 4. Manpower Profile (`/manpower/:id`)
- **Profile Header**: Displays passport photo, Manpower ID, status pill, contractor name, and vendor ID.
- **Tabs**:
  - **Overview**: Personal details, work location, designation, cluster manager.
  - **Documents**: Certificate upload, preview, download, and status indicators.
  - **History**: Complete timeline of status transitions, document renewals, and admin comments.
- **Approval Actions**: Region-scoped Admins can approve or reject registrations with audit logging.

### 5. Contractor Management (`/contractors` & `/:id`)
- **Compliance Uploads**: Upload, verify, and approve contractor ESI, PF, MSME, and GST certificates.
- **ID Format Configurator**: Configure per-contractor ID templates (On-Role & Off-Role) with live sequence preview and re-numbering triggers.
- **Vendor ID Generation**: Auto-generates Vendor ID once all mandatory compliance documents are approved.

### 6. System Settings (`/settings`)
- **Form Builder**: Drag-and-drop / key-based custom field builder for site-specific onboarding requirements.
- **Region Management**: Add, update, and delete active deployment regions.
- **Global Maintenance Toggles**: Instantly disable/enable document upload capabilities across the system.
