"""Reports: summary + CSV export with region/contractor/member/location filters."""
import io
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from app.db import db
from app.deps import require_roles
from app.helpers import compute_dynamic_status, filter_for_user

router = APIRouter(prefix="/reports", tags=["reports"])


def _apply_extra_filters(base: dict, contractor_id: Optional[str], member_id: Optional[str],
                          location: Optional[str], region: Optional[str]) -> dict:
    f = dict(base)
    if contractor_id:
        f["contractor_id"] = contractor_id
    if member_id:
        f["assigned_member_id"] = member_id
    if location:
        f["location"] = location
    if region:
        wanted = [r.strip() for r in region.split(",") if r.strip()]
        if wanted:
            existing = f.get("region")
            if isinstance(existing, dict) and "$in" in existing:
                allowed = [r for r in wanted if r in existing["$in"]]
                f["region"] = {"$in": allowed} if allowed else {"$in": ["__none__"]}
            else:
                f["region"] = {"$in": wanted}
    return f


@router.get("/summary")
async def report_summary(
    contractor_id: Optional[str] = Query(None),
    member_id: Optional[str] = Query(None),
    location: Optional[str] = Query(None),
    region: Optional[str] = Query(None),
    user=Depends(require_roles("super_admin", "admin", "vendor_admin", "member")),
):
    base_f = await filter_for_user(user)
    f = _apply_extra_filters(base_f, contractor_id, member_id, location, region)
    items = await db.manpower.find(f, {"_id": 0}).to_list(5000)

    by_contractor, by_member, by_location, by_region = {}, {}, {}, {}

    for it in items:
        from app.helpers import doc_status
        s = compute_dynamic_status(it)
        d_s = doc_status(it)
        
        for bucket, val in [(by_contractor, it.get("contractor_id")), 
                            (by_member, it.get("assigned_member_id")), 
                            (by_location, it.get("location")), 
                            (by_region, it.get("region"))]:
            key = val or "Unassigned"
            if key not in bucket:
                bucket[key] = {"total": 0, "active": 0, "expiring_soon": 0, "expired": 0,
                               "renewal_pending": 0, "pending_approval": 0, "rejected": 0, "draft": 0}
            bucket[key]["total"] += 1
            
            # Workflow status
            if s in bucket[key]:
                bucket[key][s] += 1
                
            # Expiry status from doc_status
            if d_s in ["expired", "expiring_soon", "renewal_pending"]:
                bucket[key][d_s] += 1

    # Collect distinct filter option values from the full (pre-filter) dataset for dropdowns
    all_items = await db.manpower.find(base_f, {"contractor_id": 1, "assigned_member_id": 1,
                                                  "location": 1, "region": 1, "_id": 0}).to_list(10000)
    locations = sorted({i.get("location") for i in all_items if i.get("location")})
    regions   = sorted({i.get("region")   for i in all_items if i.get("region")})

    return {
        "by_contractor": by_contractor,
        "by_member": by_member,
        "by_location": by_location,
        "by_region": by_region,
        "filter_options": {
            "locations": locations,
            "regions": regions,
        },
    }


@router.get("/export")
async def export_report(
    format: str = "csv",
    contractor_id: Optional[str] = Query(None),
    member_id: Optional[str] = Query(None),
    location: Optional[str] = Query(None),
    region: Optional[str] = Query(None),
    user=Depends(require_roles("super_admin", "admin", "vendor_admin", "member")),
):
    base_f = await filter_for_user(user)
    f = _apply_extra_filters(base_f, contractor_id, member_id, location, region)
    items = await db.manpower.find(f, {"_id": 0}).to_list(5000)

    headers = ["manpower_id", "full_name", "contractor_id", "assigned_member_id",
               "region", "location", "designation", "phone", "medical_expiry_date",
               "status", "display_status", "created_at"]
    output = io.StringIO()
    output.write(",".join(headers) + "\n")
    for it in items:
        it["display_status"] = compute_dynamic_status(it)
        row = [str(it.get(h, "") or "").replace(",", " ") for h in headers]
        output.write(",".join(row) + "\n")

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=manpower_report.csv"},
    )
