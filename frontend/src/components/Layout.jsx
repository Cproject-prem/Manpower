import { useEffect, useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Users as UsersIcon, FilePlus, RefreshCcw, FileText,
  BarChart3, ShieldCheck, Settings as SettingsIcon, Bell, LogOut, Building2, ClipboardList, Menu, X as XIcon, Database,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["super_admin", "admin", "vendor_admin", "member", "manpower"] },
  { to: "/manpower", label: "Manpower", icon: UsersIcon, roles: ["super_admin", "admin", "vendor_admin", "member"] },
  { to: "/manpower/new", label: "New Registration", icon: FilePlus, roles: ["super_admin", "admin", "vendor_admin", "member"] },
  { to: "/renewals", label: "Renewals", icon: RefreshCcw, roles: ["super_admin", "admin", "vendor_admin", "member", "manpower"] },
  { to: "/documents", label: "Documents", icon: FileText, roles: ["super_admin", "admin", "vendor_admin", "member", "manpower"] },
  { to: "/contractors", label: "Contractors", icon: Building2, roles: ["super_admin", "admin", "vendor_admin"] },
  { to: "/vendor-evaluations", label: "Vendor Evaluations", icon: ClipboardList, roles: ["super_admin", "admin", "vendor_admin"] },
  { to: "/reports", label: "Workforce Deployment", icon: BarChart3, roles: ["super_admin", "admin", "vendor_admin", "member"] },
  { to: "/users", label: "Users", icon: ShieldCheck, roles: ["super_admin", "admin", "vendor_admin", "member"] },
  { to: "/master-data", label: "Master Data (Sites)", icon: Database, roles: ["super_admin", "admin"] },
  { to: "/settings", label: "Settings", icon: SettingsIcon, roles: ["super_admin", "admin"] },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const [notifs, setNotifs] = useState({ items: [], unread: 0 });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  const loadNotifs = async () => {
    try {
      const { data } = await api.get("/notifications");
      setNotifs(data);
    } catch (e) { /* ignore */ }
  };

  useEffect(() => {
    loadNotifs();
    const t = setInterval(loadNotifs, 30000);
    return () => clearInterval(t);
  }, []);

  const markAllRead = async () => {
    await api.post("/notifications/read-all");
    loadNotifs();
  };

    if (!user || !user.role) return null;

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 z-30 bg-black/50 md:hidden" 
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`w-64 fixed inset-y-0 left-0 z-40 bg-zinc-900 text-zinc-200 flex flex-col transition-transform duration-200 ease-in-out md:translate-x-0 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`} 
        data-testid="sidebar"
      >
        <div className="h-16 flex items-center justify-between px-6 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-white rounded-sm flex items-center justify-center">
              <span className="text-zinc-900 font-bold text-sm" style={{ fontFamily: "Cabinet Grotesk" }}>M</span>
            </div>
            <span className="font-semibold tracking-tight text-white" style={{ fontFamily: "Cabinet Grotesk" }}>
              Manpower Portal
            </span>
          </div>
          <button 
            className="md:hidden text-zinc-400 hover:text-white" 
            onClick={() => setMobileMenuOpen(false)}
          >
            <XIcon size={20} />
          </button>
        </div>
        <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
          {NAV.filter((n) => n.roles.includes(user.role)).map((n) => {
            const Icon = n.icon;
            return (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === "/dashboard"}
                onClick={() => setMobileMenuOpen(false)}
                data-testid={`nav-${n.to.replace(/\//g, "-")}`}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                    isActive
                      ? "bg-white/10 text-white"
                      : "text-zinc-400 hover:bg-white/5 hover:text-white"
                  }`
                }
              >
                <Icon size={16} strokeWidth={1.75} />
                <span>{n.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="p-3 border-t border-zinc-800 text-xs text-zinc-500">
          v1.0 · {user.role.replace("_", " ")}
        </div>
      </aside>

      {/* Header */}
      <header className="h-16 fixed top-0 right-0 left-0 md:left-64 z-20 bg-white border-b border-zinc-200 flex items-center justify-between md:justify-end px-4 md:px-6 gap-3">
        <div className="flex items-center md:hidden">
          <button 
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 -ml-2 text-zinc-600 hover:bg-zinc-100 rounded-md"
          >
            <Menu size={20} />
          </button>
        </div>

        <div className="flex items-center gap-1 sm:gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button data-testid="notifications-btn" className="relative p-2 hover:bg-zinc-100 rounded-md transition-colors">
              <Bell size={18} strokeWidth={1.75} />
              {notifs.unread > 0 && (
                <span className="absolute top-1 right-1 bg-rose-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                  {notifs.unread}
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>Notifications</span>
              {notifs.unread > 0 && (
                <button onClick={markAllRead} data-testid="mark-all-read-btn" className="text-xs text-zinc-500 hover:text-zinc-900">
                  Mark all read
                </button>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="max-h-80 overflow-y-auto">
              {notifs.items.length === 0 && (
                <div className="px-3 py-6 text-center text-sm text-zinc-500">No notifications</div>
              )}
              {notifs.items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => n.link && navigate(n.link)}
                  className={`block w-full text-left px-3 py-2 hover:bg-zinc-50 ${n.read ? "opacity-60" : ""}`}
                  data-testid={`notif-${n.id}`}
                >
                  <div className="text-sm font-medium text-zinc-900">{n.title}</div>
                  <div className="text-xs text-zinc-600 line-clamp-2">{n.body}</div>
                </button>
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" data-testid="user-menu-btn" className="gap-2 h-auto py-1.5">
              <div className="w-8 h-8 rounded-full bg-zinc-900 text-white flex items-center justify-center text-xs font-medium shrink-0">
                {user.name?.[0]?.toUpperCase() || "U"}
              </div>
              <div className="flex flex-col items-start leading-tight text-left">
                <span className="text-sm font-medium text-zinc-900">{user.name}</span>
                <span className="text-[11px] text-zinc-500 -mt-0.5" data-testid="header-user-subtitle">
                  {user.contractor_name
                    ? <>{user.contractor_name} · <span className="capitalize">{user.role?.replace("_", " ")}</span></>
                    : <span className="capitalize">{user.role?.replace("_", " ")}</span>}
                </span>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              <div className="text-sm">{user.name}</div>
              <div className="text-xs text-zinc-500">{user.email}</div>
              {user.contractor_name && (
                <div className="text-xs text-zinc-700 mt-1.5 flex items-center gap-1.5" data-testid="header-contractor-name">
                  <Building2 size={11} strokeWidth={1.75} />
                  {user.contractor_name}
                </div>
              )}
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 mt-0.5">
                {user.role?.replace("_", " ")}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} data-testid="logout-btn">
              <LogOut size={14} className="mr-2" /> Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      </header>

      <main className="md:ml-64 pt-16 min-h-screen">
        <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] w-full overflow-x-hidden">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
