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

const COLLAPSE_BELOW = "(max-width: 1535.98px)";

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

export interface AdminSidebarProps {
  hidden?: boolean;
}

export default function AdminSidebar({ hidden = false }: AdminSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  // null means no choice yet, so the week page decides from the viewport.
  const [collapsedPref, setCollapsedPref] = useLocalStorage<boolean | null>("recipe-book:sidebar-collapsed", null);
  const narrow = useMediaQuery(COLLAPSE_BELOW);
  const onWeek = location.pathname.startsWith("/semaine");
  const collapsed = collapsedPref ?? (onWeek && narrow);

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

      <nav className={`flex-1 space-y-1 ${isCollapsed ? "px-2" : "px-3"}`}>
        {menuItems.map((item) => {
          const isActive = item.isActive(location.pathname);
          return (
            <Link
              key={item.path}
              to={item.path}
              title={isCollapsed ? item.label : undefined}
              aria-current={isActive ? "page" : undefined}
              className={`flex items-center rounded-lg text-sm font-medium transition-colors ${
                isCollapsed ? "justify-center px-2 py-2.5" : "gap-3 px-4 py-2.5"
              } ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
              }`}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {!isCollapsed && item.label}
            </Link>
          );
        })}
      </nav>

      <div className={`p-3 border-t border-sidebar-border ${isCollapsed ? "flex flex-col items-center gap-1" : ""}`}>
        <button
          onClick={handleLogout}
          title={isCollapsed ? "Déconnexion" : undefined}
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
          collapsed ? "w-16" : "w-60"
        }`}
      >
        {sidebarContent(collapsed)}
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-3 bg-sidebar text-sidebar-foreground border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0">
            <span className="font-serif text-sm font-bold text-white">A</span>
          </div>
          <span className="font-serif text-sm font-semibold">La Table d'Amélie</span>
        </div>
        <button onClick={() => setMobileOpen(!mobileOpen)} className="p-2 -mr-2 rounded-lg hover:bg-sidebar-accent transition-colors" aria-label="Menu">
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-30" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm" />
          <aside className="absolute top-[52px] left-0 right-0 bg-sidebar text-sidebar-foreground flex flex-col max-h-[calc(100vh-52px)] overflow-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
            {sidebarContent(false)}
          </aside>
        </div>
      )}
    </>
  );
}
