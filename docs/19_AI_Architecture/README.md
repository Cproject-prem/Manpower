# 19 - AI & Automated Intelligence Architecture

## Automated Intelligence Integration

The CMES Manpower Portal incorporates intelligent background tasks and rule engines for automated compliance management.

---

## Intelligent System Components

### 1. Automated Compliance Calculation Engine
- **Dynamic Status Evaluation**: Automatically computes real-time worker compliance status (`Active`, `Expiring Soon`, `Expired`, `Renewal Pending`) based on rolling 30-day certificate evaluation windows.
- **Nightly Expiry Scanner**: Automated background service that scans all active worker records every night and dispatches scheduled warning alerts to regional managers.

### 2. Intelligent Form Schema Translation
- Dynamic JSON-to-Form translation layer that reads custom form field configurations from MongoDB (`form_configs`) and dynamically renders form controls and backend schemas without code deployment.

### 3. Future AI Component Readiness
- Pre-built integration hooks for OCR-assisted certificate data extraction (automated scanning of PDF medical reports).
- Anomaly detection pipeline for detecting duplicate manpower registrations based on fuzzy name and phone matching.
