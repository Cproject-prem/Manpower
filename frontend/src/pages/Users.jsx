import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Key, Trash2 } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";

export default function Users() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isVendorAdmin = user?.role === "vendor_admin";
  const isMember = user?.role === "member";
  const canManage = user?.role === "super_admin" || isAdmin || isVendorAdmin || isMember;
  const memberOnlyManpower = isMember; // Members are locked to creating role=manpower
  const [users, setUsers] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [regions, setRegions] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [showContractor, setShowContractor] = useState(false);
  const [resetUser, setResetUser] = useState(null);
  const [editUser, setEditUser] = useState(null);
  const [newUser, setNewUser] = useState({ email: "", password: "", name: "", role: "member", contractor_id: "", phone: "", region_scope: [] });  const [newContractor, setNewContractor] = useState({ name: "", address: "", contact_person: "", phone: "", email: "" });
  const [resetPw, setResetPw] = useState("");

  const load = () => {
    api.get("/users").then((r) => setUsers(r.data));
    api.get("/contractors").then((r) => setContractors(r.data));
    api.get("/settings/regions").then((r) => setRegions(r.data.regions || [])).catch(() => setRegions([]));
  };

  useEffect(() => { load(); }, []);

  // Members can only create Manpower-role logins under their own contractor.
  useEffect(() => {
    if (isMember) {
      setNewUser((n) => ({ ...n, role: "manpower", contractor_id: user?.contractor_id || "" }));
    }
    // eslint-disable-next-line
  }, [isMember, user?.contractor_id]);

  const createUser = async () => {
    try {
      const payload = { ...newUser };
      if (!payload.contractor_id) delete payload.contractor_id;
      if (payload.role !== "admin") delete payload.region_scope;
      await api.post("/users", payload);
      toast.success("User created");
      setShowNew(false);
      setNewUser({ email: "", password: "", name: "", role: "member", contractor_id: "", phone: "", region_scope: [] });
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const toggleDisabled = async (u) => {
    try {
      await api.put(`/users/${u.id}`, { disabled: !u.disabled });
      toast.success(u.disabled ? "User enabled" : "User disabled");
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const deleteUser = async (u) => {
    if (!window.confirm(`Delete ${u.email}?`)) return;
    try {
      await api.delete(`/users/${u.id}`);
      toast.success("Deleted");
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const doReset = async () => {
    try {
      await api.post(`/users/${resetUser.id}/reset-password`, { new_password: resetPw });
      toast.success("Password reset");
      setResetUser(null); setResetPw("");
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const saveEditUser = async () => {
    try {
      const { id, role, contractor_id, name, phone, region_scope } = editUser;
      const body = { name, phone, contractor_id: contractor_id || null };
      // Only send role if it's editable (not super_admin)
      if (role && role !== "super_admin") body.role = role;
      // region_scope: only meaningful for admin role — send [] to clear otherwise
      if (role === "admin") body.region_scope = Array.isArray(region_scope) ? region_scope : [];
      else body.region_scope = [];
      await api.put(`/users/${id}`, body);
      toast.success("User updated");
      setEditUser(null); load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const createContractor = async () => {
    try {
      await api.post("/contractors", newContractor);
      toast.success("Contractor added");
      setShowContractor(false);
      setNewContractor({ name: "", address: "", contact_person: "", phone: "", email: "" });
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const contractorName = (id) => contractors.find((c) => c.id === id)?.name || "—";

  return (
    <div className="space-y-6" data-testid="users-page">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Administration</p>
          <h1 className="text-3xl tracking-tight font-semibold text-zinc-900" style={{ fontFamily: "Cabinet Grotesk" }}>
            {isMember ? "My Manpower Users" : "Users & Contractors"}
          </h1>
        </div>
        {canManage && (
        <div className="flex gap-2">
          {!isVendorAdmin && !isMember && (
          <Dialog open={showContractor} onOpenChange={setShowContractor}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="new-contractor-btn"><Plus size={14} className="mr-1.5" /> New Contractor</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Contractor</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Field label="Name *"><Input value={newContractor.name} onChange={(e) => setNewContractor({ ...newContractor, name: e.target.value })} data-testid="contractor-name" /></Field>
                <Field label="Address"><Input value={newContractor.address} onChange={(e) => setNewContractor({ ...newContractor, address: e.target.value })} data-testid="contractor-address" /></Field>
                <Field label="Contact Person"><Input value={newContractor.contact_person} onChange={(e) => setNewContractor({ ...newContractor, contact_person: e.target.value })} data-testid="contractor-contact" /></Field>
                <Field label="Phone"><Input value={newContractor.phone} onChange={(e) => setNewContractor({ ...newContractor, phone: e.target.value })} data-testid="contractor-phone" /></Field>
                <Field label="Email"><Input type="email" value={newContractor.email} onChange={(e) => setNewContractor({ ...newContractor, email: e.target.value })} data-testid="contractor-email" /></Field>
              </div>
              <DialogFooter>
                <Button onClick={createContractor} className="bg-zinc-900 hover:bg-zinc-800 text-white" data-testid="contractor-save">Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          )}

          <Dialog open={showNew} onOpenChange={setShowNew}>
            <DialogTrigger asChild>
              <Button className="bg-zinc-900 hover:bg-zinc-800 text-white" data-testid="new-user-btn"><Plus size={14} className="mr-1.5" /> New User</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New User</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Field label="Full Name *"><Input value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} data-testid="user-name" /></Field>
                <Field label="Email *"><Input type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} data-testid="user-email" /></Field>
                <Field label="Password *"><Input type="text" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} data-testid="user-password" /></Field>
                <Field label="Role *">
                  <Select value={newUser.role} onValueChange={(v) => setNewUser({ ...newUser, role: v })} disabled={isMember}>
                    <SelectTrigger data-testid="user-role"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {!isAdmin && !isVendorAdmin && !isMember && <SelectItem value="admin">Admin</SelectItem>}
                      {!isVendorAdmin && !isMember && <SelectItem value="vendor_admin">Vendor Admin</SelectItem>}
                      {!isMember && <SelectItem value="member">Member</SelectItem>}
                      <SelectItem value="manpower">Manpower</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {!isMember && (
                <Field label="Contractor">
                  <Select value={newUser.contractor_id} onValueChange={(v) => setNewUser({ ...newUser, contractor_id: v })}>
                    <SelectTrigger data-testid="user-contractor"><SelectValue placeholder="Select contractor" /></SelectTrigger>
                    <SelectContent>{contractors.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                )}
                <Field label="Phone"><Input value={newUser.phone} onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })} data-testid="user-phone" /></Field>
                {newUser.role === "admin" && (
                  <Field label="Region Scope (leave empty = all regions)">
                    <RegionScopePicker
                      regions={regions}
                      value={newUser.region_scope || []}
                      onChange={(v) => setNewUser({ ...newUser, region_scope: v })}
                      testIdPrefix="new-user-region"
                    />
                  </Field>
                )}
              </div>
              <DialogFooter>
                <Button onClick={createUser} className="bg-zinc-900 hover:bg-zinc-800 text-white" data-testid="user-save">Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        )}
      </div>

      <div className="bg-white border border-zinc-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600">
            <tr>
              <th className="text-left py-2 px-4 font-medium">Name</th>
              <th className="text-left py-2 px-4 font-medium">Email</th>
              <th className="text-left py-2 px-4 font-medium">Role</th>
              <th className="text-left py-2 px-4 font-medium">Contractor</th>
              <th className="text-left py-2 px-4 font-medium">Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-zinc-100 hover:bg-zinc-50" data-testid={`user-row-${u.id}`}>
                <td className="py-3 px-4 font-medium text-zinc-900">{u.name}</td>
                <td className="py-3 px-4 text-zinc-700 mono text-xs">{u.email}</td>
                <td className="py-3 px-4"><span className="id-pill">{u.role}</span></td>
                <td className="py-3 px-4 text-zinc-600">
                  <span>{contractorName(u.contractor_id)}</span>
                  {(() => { const c = contractors.find((c) => c.id === u.contractor_id); return c?.vendor_id ? (
                    <span className="ml-1.5 font-mono text-[11px] px-1.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">{c.vendor_id}</span>
                  ) : null; })()}
                </td>
                <td className="py-3 px-4">
                  <span className={`text-xs ${u.disabled ? "text-rose-700" : "text-emerald-700"}`}>
                    {u.disabled ? "Disabled" : "Active"}
                  </span>
                </td>
                <td className="py-3 px-4 text-right space-x-2">
                  {canManage && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setEditUser({ ...u })} data-testid={`edit-${u.id}`}>Edit</Button>
                      <Button size="sm" variant="outline" onClick={() => setResetUser(u)} data-testid={`reset-pw-${u.id}`}>
                        <Key size={12} className="mr-1" /> Reset
                      </Button>
                      {!isMember && (
                        <Button size="sm" variant="outline" onClick={() => toggleDisabled(u)} data-testid={`toggle-${u.id}`}>
                          {u.disabled ? "Enable" : "Disable"}
                        </Button>
                      )}
                      {u.role !== "super_admin" && user?.role === "super_admin" && (
                        <Button size="sm" variant="outline" onClick={() => deleteUser(u)} data-testid={`delete-${u.id}`} className="text-rose-700">
                          <Trash2 size={12} />
                        </Button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!resetUser} onOpenChange={(o) => !o && setResetUser(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reset Password for {resetUser?.email}</DialogTitle></DialogHeader>
          <Input type="text" placeholder="New password" value={resetPw} onChange={(e) => setResetPw(e.target.value)} data-testid="reset-pw-input" />
          <DialogFooter>
            <Button onClick={doReset} className="bg-zinc-900 hover:bg-zinc-800 text-white" data-testid="reset-pw-confirm">Reset</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit User</DialogTitle></DialogHeader>
          {editUser && (
            <div className="space-y-3">
              <Field label="Name"><Input value={editUser.name || ""} onChange={(e) => setEditUser({ ...editUser, name: e.target.value })} data-testid="edit-user-name" /></Field>
              <Field label="Phone"><Input value={editUser.phone || ""} onChange={(e) => setEditUser({ ...editUser, phone: e.target.value })} data-testid="edit-user-phone" /></Field>
              <Field label="Role">
                <Select value={editUser.role} onValueChange={(v) => setEditUser({ ...editUser, role: v })} disabled={editUser.role === "super_admin" || isMember}>
                  <SelectTrigger data-testid="edit-user-role"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {editUser.role === "super_admin" && <SelectItem value="super_admin">Super Admin</SelectItem>}
                    {user?.role === "super_admin" && editUser.role !== "super_admin" && <SelectItem value="admin">Admin</SelectItem>}
                    {(user?.role === "super_admin" || user?.role === "admin") && <SelectItem value="vendor_admin">Vendor Admin</SelectItem>}
                    {!isMember && <SelectItem value="member">Member</SelectItem>}
                    <SelectItem value="manpower">Manpower</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {!isMember && (
              <Field label="Contractor">
                <Select value={editUser.contractor_id || ""} onValueChange={(v) => setEditUser({ ...editUser, contractor_id: v })}>
                  <SelectTrigger data-testid="edit-user-contractor"><SelectValue placeholder="Select contractor" /></SelectTrigger>
                  <SelectContent>{contractors.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              )}
              {editUser.role === "admin" && (
                <Field label="Region Scope (empty = all regions)">
                  <RegionScopePicker
                    regions={regions}
                    value={editUser.region_scope || []}
                    onChange={(v) => setEditUser({ ...editUser, region_scope: v })}
                    testIdPrefix="edit-user-region"
                  />
                </Field>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={saveEditUser} className="bg-zinc-900 hover:bg-zinc-800 text-white" data-testid="confirm-edit-user">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-zinc-700">{label}</Label>
      {children}
    </div>
  );
}

function RegionScopePicker({ regions, value, onChange, testIdPrefix }) {
  const toggle = (r) => {
    const set = new Set(value);
    if (set.has(r)) set.delete(r); else set.add(r);
    onChange(Array.from(set));
  };
  if (regions.length === 0) {
    return <div className="text-xs text-zinc-500 italic">No regions configured. Add them in Settings → System → Regions.</div>;
  }
  return (
    <div className="flex flex-wrap gap-2 border border-zinc-200 rounded-md p-2 bg-zinc-50">
      {regions.map((r) => {
        const on = value.includes(r);
        return (
          <button
            key={r}
            type="button"
            onClick={() => toggle(r)}
            data-testid={`${testIdPrefix}-${r}`}
            className={`text-xs px-2 py-1 rounded-full border transition-colors ${
              on ? "bg-zinc-900 text-white border-zinc-900" : "bg-white text-zinc-700 border-zinc-200 hover:border-zinc-400"
            }`}
          >
            {on ? "✓ " : ""}{r}
          </button>
        );
      })}
      {value.length === 0 && (
        <span className="text-[11px] text-zinc-500 italic self-center">All regions (unrestricted)</span>
      )}
    </div>
  );
}

