import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  CalendarDays,
  Calendar,
  BookOpen,
  ClipboardList,
  ShoppingCart,
  Users,
  Landmark,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useChrome } from "./AdminLayout";

interface MenuItem {
  path: string;
  icon: typeof CalendarDays;
  label: string;
  isActive: (pathname: string) => boolean;
}

const startsWith = (...prefixes: string[]) => (pathname: string) =>
  prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));

const isPrepSheet = (pathname: string) => /^\/events\/[^/]+\/lines(\/|$)/.test(pathname);

const menuItems: MenuItem[] = [
  { path: "/semaine", icon: CalendarDays, label: "Semaine", isActive: (p) => startsWith("/semaine", "/jour")(p) || isPrepSheet(p) },
  { path: "/events", icon: Calendar, label: "Événements", isActive: (p) => startsWith("/events")(p) && !isPrepSheet(p) },
  { path: "/recipes", icon: BookOpen, label: "Recettes", isActive: startsWith("/recipes") },
  { path: "/ingredients", icon: ClipboardList, label: "Ingrédients", isActive: startsWith("/ingredients") },
  { path: "/grocery-list", icon: ShoppingCart, label: "Courses", isActive: startsWith("/grocery-list") },
  { path: "/clients", icon: Users, label: "Clients", isActive: startsWith("/clients") },
  { path: "/comptes/journal", icon: Landmark, label: "Comptabilité", isActive: startsWith("/comptes") },
  { path: "/settings", icon: Settings, label: "Paramètres", isActive: startsWith("/settings") },
];

// Below this width the sidebar starts as the labelled rail; the chevron overrides it.
const WIDE_PX = 1400;

export interface AdminSidebarProps {
  hidden?: boolean;
}

export default function AdminSidebar({ hidden = false }: AdminSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { backTo } = useChrome();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsedPref, setCollapsedPref] = useLocalStorage<boolean | null>("recipe-book:sidebar-collapsed", null);
  const [wide] = useState(() => typeof window !== "undefined" && window.innerWidth >= WIDE_PX);
  const collapsed = collapsedPref ?? !wide;

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const handleLogout = () => { logout(); navigate("/login"); };

  if (hidden) return null;

  const sidebarContent = (isCollapsed: boolean) => (
    <>
      <div className={`p-4 pb-3 flex items-center ${isCollapsed ? "justify-center" : "justify-between"}`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0">
            <span className="font-serif text-lg font-bold text-white">A</span>
          </div>
          {!isCollapsed && (
            <h1 className="text-sm font-serif font-semibold leading-tight truncate">La Table d'Amélie</h1>
          )}
        </div>
        {!isCollapsed && (
          <button
            onClick={() => setCollapsedPref(true)}
            className="hidden md:block p-1.5 rounded-lg hover:bg-sidebar-accent transition-colors shrink-0 text-muted-foreground hover:text-sidebar-foreground"
            title="Réduire"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {isCollapsed && (
        <div className="flex justify-center pb-2">
          <button
            onClick={() => setCollapsedPref(false)}
            className="p-1.5 rounded-lg hover:bg-sidebar-accent transition-colors text-muted-foreground hover:text-sidebar-foreground"
            title="Agrandir"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      <nav className={`flex-1 space-y-1 ${isCollapsed ? "px-1.5" : "px-3"}`}>
        {menuItems.map((item) => {
          const isActive = item.isActive(location.pathname);
          return (
            <Link
              key={item.path}
              to={item.path}
              aria-current={isActive ? "page" : undefined}
              className={`flex rounded-lg font-medium transition-colors ${
                isCollapsed ? "flex-col items-center gap-1 px-1 py-2" : "items-center gap-3 px-4 py-2.5 text-sm"
              } ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
              }`}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              <span className={isCollapsed ? "rail-label" : ""}>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className={`p-3 border-t border-sidebar-border ${isCollapsed ? "flex flex-col items-center gap-1" : ""}`}>
        <button
          onClick={handleLogout}
          title={isCollapsed ? "Déconnexion" : undefined}
          aria-label={isCollapsed ? "Déconnexion" : undefined}
          className={`flex items-center rounded-lg text-sm font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors ${
            isCollapsed ? "justify-center p-2" : "gap-3 px-3 py-2 w-full"
          }`}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {!isCollapsed && "Déconnexion"}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex shrink-0 h-screen sticky top-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex-col transition-all duration-300 ${
          collapsed ? "w-[84px]" : "w-60"
        }`}
      >
        {sidebarContent(collapsed)}
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex min-h-[68px] items-center justify-between px-4 py-3 bg-sidebar text-sidebar-foreground border-b border-sidebar-border">
        {backTo ? (
          <Link to={backTo.to} className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg pl-1 pr-3 text-base font-medium hover:bg-sidebar-accent">
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            {backTo.label}
          </Link>
        ) : (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0">
              <span className="font-serif text-sm font-bold text-white">A</span>
            </div>
            <span className="font-serif text-sm font-semibold">La Table d'Amélie</span>
          </div>
        )}
        <button onClick={() => setMobileOpen(!mobileOpen)} className="inline-flex min-h-11 min-w-11 -mr-2 items-center justify-center rounded-lg hover:bg-sidebar-accent transition-colors" aria-label="Menu">
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-30" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm" />
          <aside className="absolute top-[68px] left-0 right-0 bg-sidebar text-sidebar-foreground flex flex-col max-h-[calc(100vh-68px)] overflow-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
            {sidebarContent(false)}
          </aside>
        </div>
      )}
    </>
  );
}
