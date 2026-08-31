"""Master Data (Locations / Sites, States, Regions) CRUD and Excel upload/export."""
import io
import re
from typing import List, Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import StreamingResponse
import pandas as pd

from app.db import db
from app.deps import get_current_user, require_roles
from app.helpers import audit
from app.utils import new_id, now_iso

router = APIRouter(prefix="/master-data", tags=["master-data"])


@router.get("/options")
async def get_master_data_options(
    current=Depends(get_current_user),
    region: Optional[str] = None,
    state: Optional[str] = None,
):
    """Return distinct regions, states, and locations (sites) filtered by selected region/state."""
    _ = current
    query: dict = {}
    if region and region.strip():
        query["region"] = {"$regex": f"^{re.escape(region.strip())}$", "$options": "i"}
    if state and state.strip():
        query["state"] = {"$regex": f"^{re.escape(state.strip())}$", "$options": "i"}

    # Fetch all matching locations
    cursor = db.locations.find(query, {"_id": 0, "region": 1, "state": 1, "location": 1, "site_name": 1, "code": 1})
    docs = await cursor.to_list(10000)

    # Distinct all regions from master db
    all_regions = await db.locations.distinct("region")
    all_regions = sorted([str(r).strip() for r in all_regions if r and str(r).strip()])

    # If no locations in db yet, also fallback to regions in db.settings
    if not all_regions:
        reg_doc = await db.settings.find_one({"key": "regions"}, {"_id": 0}) or {}
        all_regions = sorted([str(r).strip() for r in reg_doc.get("items", []) if r and str(r).strip()])

    # Filtered distinct states and locations
    states_set = set()
    locations_set = set()
    for d in docs:
        st = d.get("state")
        loc = d.get("location") or d.get("site_name")
        if st and str(st).strip():
            states_set.add(str(st).strip())
        if loc and str(loc).strip():
            locations_set.add(str(loc).strip())

    # If query had region filter, also collect distinct states globally for reference
    all_states = await db.locations.distinct("state")
    all_states = sorted([str(s).strip() for s in all_states if s and str(s).strip()])

    return {
        "regions": all_regions,
        "states": sorted(list(states_set)) if (region or state) else all_states,
        "all_states": all_states,
        "locations": sorted(list(locations_set)),
        "total_locations": len(docs),
    }


@router.get("/locations")
async def list_locations(
    current=Depends(get_current_user),
    region: Optional[str] = None,
    state: Optional[str] = None,
    q: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
):
    """List locations with pagination and filters."""
    _ = current
    query: dict = {}
    if region and region.strip():
        query["region"] = {"$regex": f"^{re.escape(region.strip())}$", "$options": "i"}
    if state and state.strip():
        query["state"] = {"$regex": f"^{re.escape(state.strip())}$", "$options": "i"}
    if q and q.strip():
        rx = re.escape(q.strip())
        query["$or"] = [
            {"location": {"$regex": rx, "$options": "i"}},
            {"site_name": {"$regex": rx, "$options": "i"}},
            {"state": {"$regex": rx, "$options": "i"}},
            {"region": {"$regex": rx, "$options": "i"}},
            {"code": {"$regex": rx, "$options": "i"}},
        ]

    total = await db.locations.count_documents(query)
    skip = (page - 1) * page_size
    items = await db.locations.find(query, {"_id": 0}).sort([("region", 1), ("state", 1), ("location", 1)]).skip(skip).limit(page_size).to_list(page_size)

    # Distinct filters for UI dropdowns
    distinct_regions = sorted([str(r) for r in await db.locations.distinct("region") if r])
    distinct_states = sorted([str(s) for s in await db.locations.distinct("state") if s])

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "regions": distinct_regions,
        "states": distinct_states,
    }


@router.post("/upload")
async def upload_master_excel(
    file: UploadFile = File(...),
    mode: str = Query("replace", regex="^(replace|append)$"),
    current=Depends(require_roles("super_admin", "admin")),
):
    """Upload Excel/CSV file to populate Site / Location database."""
    content = await file.read()
    filename = file.filename or ""

    try:
        if filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        else:
            df = pd.read_excel(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {str(e)}")

    if df.empty:
        raise HTTPException(status_code=400, detail="The uploaded file contains no rows")

    # Normalize column names accurately (prevent 'Site Code' from matching 'Site/Location')
    col_map = {}

    # 1. First detect Code column (e.g. 'Site Code', 'Code', 'Site ID')
    for col in df.columns:
        c_clean = str(col).strip().lower()
        if any(k in c_clean for k in ("code", "site_id", "plant_id", "site code", "site-code")):
            col_map["code"] = col
            break

    # 2. Detect Region column (e.g. 'Region', 'Zone')
    for col in df.columns:
        c_clean = str(col).strip().lower()
        if any(k in c_clean for k in ("region", "zone")):
            col_map["region"] = col
            break

    # 3. Detect State column (e.g. 'State', 'Province')
    for col in df.columns:
        c_clean = str(col).strip().lower()
        if any(k in c_clean for k in ("state", "province")):
            col_map["state"] = col
            break

    # 4. Detect Location/Site column (must not be code/region/state)
    for col in df.columns:
        if col in (col_map.get("code"), col_map.get("region"), col_map.get("state")):
            continue
        c_clean = str(col).strip().lower()
        if any(k in c_clean for k in ("location", "site", "plant", "place", "site name", "site_name", "location (site)")):
            col_map["location"] = col
            break

    # Fallback for location if not matched yet: first unused column
    if "location" not in col_map:
        for col in df.columns:
            if col not in col_map.values():
                col_map["location"] = col
                break

    if "location" not in col_map and "state" not in col_map:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required columns. Found headers: {list(df.columns)}. Expected at least 'Region', 'State', and 'Location' (or 'Site')."
        )

    now = now_iso()
    new_docs = []
    seen_keys = set()

    for _, row in df.iterrows():
        reg_val = str(row[col_map["region"]]).strip() if "region" in col_map and pd.notna(row[col_map["region"]]) else "General"
        state_val = str(row[col_map["state"]]).strip() if "state" in col_map and pd.notna(row[col_map["state"]]) else ""
        loc_val = str(row[col_map["location"]]).strip() if "location" in col_map and pd.notna(row[col_map["location"]]) else ""
        code_val = str(row[col_map["code"]]).strip() if "code" in col_map and pd.notna(row[col_map["code"]]) else ""

        # Skip rows with no location and state
        if not loc_val and not state_val:
            continue

        if not loc_val:
            loc_val = state_val

        # Deduplicate within batch
        dedupe_key = f"{reg_val.lower()}::{state_val.lower()}::{loc_val.lower()}"
        if dedupe_key in seen_keys:
            continue
        seen_keys.add(dedupe_key)

        new_docs.append({
            "id": new_id(),
            "region": reg_val,
            "state": state_val,
            "location": loc_val,
            "site_name": loc_val,
            "code": code_val,
            "created_at": now,
            "updated_at": now,
            "created_by": current.get("email"),
        })

    if not new_docs:
        raise HTTPException(status_code=400, detail="No valid data rows found in uploaded file")

    if mode == "replace":
        await db.locations.delete_many({})

    await db.locations.insert_many(new_docs)

    # Sync distinct regions back to settings if new regions were introduced
    distinct_regs = await db.locations.distinct("region")
    cleaned_regs = sorted([str(r).strip() for r in distinct_regs if r and str(r).strip()])
    if cleaned_regs:
        await db.settings.update_one(
            {"key": "regions"},
            {"$set": {"items": cleaned_regs, "updated_at": now, "key": "regions"}},
            upsert=True,
        )

    await audit(current, "master_data.upload", "locations", {
        "count": len(new_docs),
        "filename": filename,
        "mode": mode,
    })

    return {
        "ok": True,
        "count": len(new_docs),
        "message": f"Successfully loaded {len(new_docs)} site/location records into database.",
    }


@router.get("/template")
async def download_template(current=Depends(require_roles("super_admin", "admin"))):
    """Generate and download a sample Master Data Excel template."""
    _ = current
    sample_data = [
        {"Region": "South", "State": "Tamil Nadu", "Location (Site)": "Villivakkam Solar Site", "Site Code": "VIL-01"},
        {"Region": "South", "State": "Tamil Nadu", "Location (Site)": "Tuticorin Wind Plant", "Site Code": "TUT-02"},
        {"Region": "South", "State": "Karnataka", "Location (Site)": "Bellary Solar Park", "Site Code": "BEL-01"},
        {"Region": "South", "State": "Karnataka", "Location (Site)": "Pavagada Solar Plant", "Site Code": "PAV-01"},
        {"Region": "North", "State": "Rajasthan", "Location (Site)": "Bikaner Solar Plant", "Site Code": "BIK-01"},
        {"Region": "North", "State": "Rajasthan", "Location (Site)": "Jodhpur Solar Park", "Site Code": "JOD-01"},
        {"Region": "West",  "State": "Gujarat", "Location (Site)": "Khavda Hybrid Project", "Site Code": "KHA-01"},
        {"Region": "West",  "State": "Maharashtra", "Location (Site)": "Solapur Solar Site", "Site Code": "SOL-01"},
    ]
    df = pd.DataFrame(sample_data)
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Master_Locations")
    output.seek(0)

    headers = {
        "Content-Disposition": 'attachment; filename="locations_template.xlsx"'
    }
    return StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers=headers)


@router.get("/export")
async def export_master_data(current=Depends(require_roles("super_admin", "admin"))):
    """Export the current locations database to Excel."""
    _ = current
    docs = await db.locations.find({}, {"_id": 0}).sort([("region", 1), ("state", 1), ("location", 1)]).to_list(20000)
    export_rows = []
    for d in docs:
        export_rows.append({
            "Region": d.get("region", ""),
            "State": d.get("state", ""),
            "Location (Site)": d.get("location") or d.get("site_name", ""),
            "Site Code": d.get("code", ""),
            "Created At": d.get("created_at", "")[:10],
        })

    df = pd.DataFrame(export_rows)
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Master_Locations")
    output.seek(0)

    headers = {
        "Content-Disposition": f'attachment; filename="master_locations_{datetime.now(timezone.utc).strftime("%Y%m%d")}.xlsx"'
    }
    return StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers=headers)


@router.post("/locations")
async def create_single_location(payload: dict, current=Depends(require_roles("super_admin", "admin"))):
    """Add single location manually."""
    region = (payload.get("region") or "").strip()
    state = (payload.get("state") or "").strip()
    location = (payload.get("location") or payload.get("site_name") or "").strip()
    code = (payload.get("code") or "").strip()

    if not location:
        raise HTTPException(status_code=400, detail="Location / Site name is required")

    doc = {
        "id": new_id(),
        "region": region or "General",
        "state": state,
        "location": location,
        "site_name": location,
        "code": code,
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "created_by": current.get("email"),
    }
    await db.locations.insert_one(doc)
    await audit(current, "master_data.create", doc["id"], {"location": location, "region": region})
    doc.pop("_id", None)
    return doc


@router.put("/locations/{loc_id}")
async def update_single_location(loc_id: str, payload: dict, current=Depends(require_roles("super_admin", "admin"))):
    """Update a location."""
    upd = {
        "region": (payload.get("region") or "").strip(),
        "state": (payload.get("state") or "").strip(),
        "location": (payload.get("location") or payload.get("site_name") or "").strip(),
        "site_name": (payload.get("location") or payload.get("site_name") or "").strip(),
        "code": (payload.get("code") or "").strip(),
        "updated_at": now_iso(),
    }
    if not upd["location"]:
        raise HTTPException(status_code=400, detail="Location / Site name is required")

    res = await db.locations.update_one({"id": loc_id}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Location not found")
    await audit(current, "master_data.update", loc_id, upd)
    return await db.locations.find_one({"id": loc_id}, {"_id": 0})


@router.delete("/locations/{loc_id}")
async def delete_single_location(loc_id: str, current=Depends(require_roles("super_admin", "admin"))):
    """Delete a location."""
    res = await db.locations.delete_one({"id": loc_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Location not found")
    await audit(current, "master_data.delete", loc_id)
    return {"ok": True}
