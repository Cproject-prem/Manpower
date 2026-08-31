import React, { useState, useEffect } from "react";
import {
  Database, Upload, Download, Plus, Search, Trash2, Edit2, FileSpreadsheet,
  CheckCircle2, AlertCircle, RefreshCw, Layers, MapPin, Globe
} from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { toast } from "sonner";

export default function MasterData() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [regionFilter, setRegionFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [distinctRegions, setDistinctRegions] = useState([]);
  const [distinctStates, setDistinctStates] = useState([]);

  // Upload modal & state
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadMode, setUploadMode] = useState("replace");
  const [uploading, setUploading] = useState(false);

  // Add / Edit modal
  const [showEdit, setShowEdit] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState({ region: "", state: "", location: "", code: "" });

  const loadData = async () => {
    setLoading(true);
    try {
      const params = { page, page_size: pageSize };
      if (q.trim()) params.q = q.trim();
      if (regionFilter !== "all") params.region = regionFilter;
      if (stateFilter !== "all") params.state = stateFilter;

      const { data } = await api.get("/master-data/locations", { params });
      setItems(data.items || []);
      setTotal(data.total || 0);
      if (data.regions) setDistinctRegions(data.regions);
      if (data.states) setDistinctStates(data.states);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line
  }, [page, regionFilter, stateFilter]);

  const handleSearch = (e) => {
    if (e.key === "Enter") {
      setPage(1);
      loadData();
    }
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!uploadFile) {
      toast.error("Please select an Excel or CSV file to upload");
      return;
    }
    setUploading(true);
    const fd = new FormData();
    fd.append("file", uploadFile);

    try {
      const { data } = await api.post(`/master-data/upload?mode=${uploadMode}`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success(data.message || `Loaded ${data.count} records successfully!`);
      setShowUpload(false);
      setUploadFile(null);
      setPage(1);
      loadData();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const res = await api.get("/master-data/template", { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "locations_template.xlsx");
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (e) {
      toast.error("Failed to download template");
    }
  };

  const handleExport = async () => {
    try {
      const res = await api.get("/master-data/export", { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `master_locations_${new Date().toISOString().slice(0, 10)}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (e) {
      toast.error("Failed to export data");
    }
  };

  const openAdd = () => {
    setEditingItem(null);
    setForm({ region: distinctRegions[0] || "South", state: "", location: "", code: "" });
    setShowEdit(true);
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setForm({
      region: item.region || "",
      state: item.state || "",
      location: item.location || item.site_name || "",
      code: item.code || "",
    });
    setShowEdit(true);
  };

  const handleSaveItem = async () => {
    if (!form.location.trim()) {
      toast.error("Location / Site name is required");
      return;
    }
    try {
      if (editingItem) {
        await api.put(`/master-data/locations/${editingItem.id}`, form);
        toast.success("Location updated successfully");
      } else {
        await api.post("/master-data/locations", form);
        toast.success("Location added successfully");
      }
      setShowEdit(false);
      loadData();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const handleDeleteItem = async (item) => {
    if (!window.confirm(`Delete location "${item.location || item.site_name}"?`)) return;
    try {
      await api.delete(`/master-data/locations/${item.id}`);
      toast.success("Location deleted");
      loadData();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  return (
    <div className="space-y-6" data-testid="master-data-page">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Administration & Master DB</p>
          <h1 className="text-3xl tracking-tight font-semibold text-zinc-900" style={{ fontFamily: "Cabinet Grotesk" }}>
            Site & Location Database
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Manage regions, states, and site locations linked with dropdown search options across the portal.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleDownloadTemplate} data-testid="download-template-btn">
            <Download size={14} className="mr-1.5" /> Sample Template
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} data-testid="export-master-btn">
            <FileSpreadsheet size={14} className="mr-1.5" /> Export Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowUpload(true)} className="border-emerald-300 text-emerald-700 bg-emerald-50/50 hover:bg-emerald-100/60" data-testid="upload-excel-btn">
            <Upload size={14} className="mr-1.5 text-emerald-600" /> Upload Excel
          </Button>
          <Button size="sm" onClick={openAdd} className="bg-zinc-900 hover:bg-zinc-800 text-white" data-testid="add-location-btn">
            <Plus size={14} className="mr-1.5" /> Add Location
          </Button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-white border border-zinc-200 rounded-lg shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Total Sites / Locations</div>
            <div className="text-2xl font-bold text-zinc-900 mt-1">{total}</div>
          </div>
          <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
            <MapPin size={20} />
          </div>
        </div>
        <div className="p-4 bg-white border border-zinc-200 rounded-lg shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Configured States</div>
            <div className="text-2xl font-bold text-zinc-900 mt-1">{distinctStates.length}</div>
          </div>
          <div className="w-10 h-10 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center">
            <Layers size={20} />
          </div>
        </div>
        <div className="p-4 bg-white border border-zinc-200 rounded-lg shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Active Regions</div>
            <div className="text-2xl font-bold text-zinc-900 mt-1">{distinctRegions.length}</div>
          </div>
          <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Globe size={20} />
          </div>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="bg-white border border-zinc-200 rounded-lg p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="relative md:col-span-2">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <Input
            placeholder="Search location, site name, state, code…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={handleSearch}
            data-testid="search-master-input"
            className="pl-9"
          />
        </div>
        <div>
          <select
            value={regionFilter}
            onChange={(e) => { setRegionFilter(e.target.value); setPage(1); }}
            data-testid="filter-region"
            className="w-full h-9 rounded-md border border-zinc-300 px-3 text-sm bg-white"
          >
            <option value="all">All Regions</option>
            {distinctRegions.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <select
            value={stateFilter}
            onChange={(e) => { setStateFilter(e.target.value); setPage(1); }}
            data-testid="filter-state"
            className="w-full h-9 rounded-md border border-zinc-300 px-3 text-sm bg-white"
          >
            <option value="all">All States</option>
            {distinctStates.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white border border-zinc-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600">
            <tr>
              <th className="text-left py-2.5 px-4 font-medium">Region</th>
              <th className="text-left py-2.5 px-4 font-medium">State</th>
              <th className="text-left py-2.5 px-4 font-medium">Location / Site Name</th>
              <th className="text-left py-2.5 px-4 font-medium">Site Code</th>
              <th className="text-right py-2.5 px-4 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-zinc-500">
                  {loading ? "Loading master data..." : "No sites/locations found. Upload an Excel file or add one manually."}
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-b border-zinc-100 hover:bg-zinc-50 transition-colors">
                  <td className="py-2.5 px-4 font-medium text-zinc-900">
                    <span className="px-2 py-0.5 rounded text-xs bg-zinc-100 text-zinc-800 border border-zinc-200">
                      {item.region || "—"}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-zinc-700">{item.state || "—"}</td>
                  <td className="py-2.5 px-4 text-zinc-900 font-medium">
                    <div className="flex items-center gap-1.5">
                      <MapPin size={13} className="text-zinc-400 shrink-0" />
                      <span>{item.location || item.site_name}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-zinc-500 font-mono text-xs">{item.code || "—"}</td>
                  <td className="py-2.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditModal(item)}
                        className="h-7 w-7 p-0 text-zinc-500 hover:text-zinc-900"
                        title="Edit Location"
                      >
                        <Edit2 size={13} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteItem(item)}
                        className="h-7 w-7 p-0 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                        title="Delete Location"
                      >
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-200">
          <span className="text-xs text-zinc-500">{total} total sites · page {page}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Prev</Button>
            <Button size="sm" variant="outline" disabled={page * pageSize >= total} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </div>
      </div>

      {/* Upload Modal */}
      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Site & Location Excel</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUploadSubmit} className="space-y-4">
            <p className="text-xs text-zinc-500">
              Upload an Excel (.xlsx / .xls) or CSV file containing columns for <b>Region</b>, <b>State</b>, and <b>Location / Site</b>.
            </p>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-zinc-700">Select File (.xlsx, .xls, .csv)</Label>
              <Input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                data-testid="upload-file-input"
                className="cursor-pointer"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-zinc-700">Import Mode</Label>
              <div className="flex gap-4 text-xs text-zinc-700">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="mode"
                    value="replace"
                    checked={uploadMode === "replace"}
                    onChange={() => setUploadMode("replace")}
                  />
                  <span>Replace existing database</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="mode"
                    value="append"
                    checked={uploadMode === "append"}
                    onChange={() => setUploadMode("append")}
                  />
                  <span>Append to existing database</span>
                </label>
              </div>
            </div>

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setShowUpload(false)}>Cancel</Button>
              <Button type="submit" disabled={uploading || !uploadFile} className="bg-zinc-900 hover:bg-zinc-800 text-white" data-testid="confirm-upload-btn">
                {uploading ? <RefreshCw size={14} className="animate-spin mr-1.5" /> : <Upload size={14} className="mr-1.5" />}
                {uploading ? "Processing..." : "Import Database"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add / Edit Modal */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Location / Site" : "Add Location / Site"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-zinc-700">Region</Label>
              <Input
                placeholder="e.g. South, North, West"
                value={form.region}
                onChange={(e) => setForm({ ...form, region: e.target.value })}
                data-testid="input-region"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-zinc-700">State</Label>
              <Input
                placeholder="e.g. Tamil Nadu, Karnataka"
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
                data-testid="input-state"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-zinc-700">Location / Site Name *</Label>
              <Input
                placeholder="e.g. Villivakkam Solar Site"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                data-testid="input-location"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-zinc-700">Site Code (Optional)</Label>
              <Input
                placeholder="e.g. VIL-01"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                data-testid="input-code"
              />
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button onClick={handleSaveItem} className="bg-zinc-900 hover:bg-zinc-800 text-white" data-testid="save-location-btn">
              Save Location
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
