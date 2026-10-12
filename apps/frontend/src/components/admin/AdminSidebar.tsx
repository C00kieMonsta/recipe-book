import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronsLeft, LogOut, Menu } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { PAGE_ICONS } from "@/lib/page-icons";
import { IconButton } from "@/components/ui/Button";
import Sheet from "@/components/ui/Sheet";
import { useChrome } from "./AdminLayout";

interface MenuItem {
  path: string;
  icon: string;
  label: string;
  isActive: (pathname: string) => boolean;
}

const startsWith = (...prefixes: string[]) => (pathname: string) =>
  prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));

const isPrepSheet = (pathname: string) => /^\/events\/[^/]+\/lines(\/|$)/.test(pathname);

const menuItems: MenuItem[] = [
  { path: "/semaine", icon: PAGE_ICONS.semaine, label: "Semaine", isActive: (p) => startsWith("/semaine", "/jour")(p) || isPrepSheet(p) },
  { path: "/events", icon: PAGE_ICONS.evenements, label: "Événements", isActive: (p) => startsWith("/events")(p) && !isPrepSheet(p) },
  { path: "/recipes", icon: PAGE_ICONS.recettes, label: "Recettes", isActive: startsWith("/recipes") },
  { path: "/ingredients", icon: PAGE_ICONS.ingredients, label: "Ingrédients", isActive: startsWith("/ingredients") },
  { path: "/grocery-list", icon: PAGE_ICONS.courses, label: "Courses", isActive: startsWith("/grocery-list") },
  { path: "/clients", icon: PAGE_ICONS.clients, label: "Clients", isActive: startsWith("/clients") },
  { path: "/comptes/journal", icon: PAGE_ICONS.comptabilite, label: "Comptabilité", isActive: startsWith("/comptes") },
  { path: "/settings", icon: PAGE_ICONS.parametres, label: "Paramètres", isActive: startsWith("/settings") },
];

const ROW = "mx-1 flex h-7 items-center gap-2 rounded px-2 text-sm text-muted-foreground hover:bg-sidebar-hover hover:text-foreground touch:h-11 touch:text-base";
const ROW_ACTIVE = "bg-sidebar-active font-medium text-foreground";

export interface AdminSidebarProps {
  hidden?: boolean;
  collapsed?: boolean;
  onCollapse?: () => void;
}

export default function AdminSidebar({ hidden = false, collapsed = false, onCollapse }: AdminSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { backTo, topTitle } = useChrome();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const handleLogout = () => { logout(); navigate("/login"); };

  if (hidden) return null;

  const nav = (
    <>
      <nav className="mt-2 flex flex-col">
        {menuItems.map((item) => {
          const isActive = item.isActive(location.pathname);
          return (
            <Link key={item.path} to={item.path} aria-current={isActive ? "page" : undefined} className={`${ROW} ${isActive ? ROW_ACTIVE : ""}`}>
              <span className="w-5 text-center text-base leading-none" aria-hidden="true">{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <button type="button" onClick={handleLogout} className={`${ROW} mb-2 mt-auto w-auto`}>
        <span className="flex w-5 items-center justify-center" aria-hidden="true"><LogOut className="h-4 w-4" /></span>
        Déconnexion
      </button>
    </>
  );

  const brand = (
    <>
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-muted text-caption font-semibold" aria-hidden="true">A</span>
      <span className="truncate text-sm font-medium">La Table d'Amélie</span>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      {!collapsed && (
        <aside className="sticky top-0 hidden h-screen w-sidebar shrink-0 flex-col bg-sidebar md:flex">
          <div className="group mx-1 mt-1 flex h-9 items-center gap-2 rounded px-2 hover:bg-sidebar-hover">
            {brand}
            <IconButton size="sm" aria-label="Réduire le menu" className="ml-auto reveal" onClick={onCollapse} icon={<ChevronsLeft />} />
          </div>
          {nav}
        </aside>
      )}

      {/* Phone top bar */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-topbar items-center gap-1 border-b border-border bg-background px-2 md:hidden">
        {backTo ? (
          <Link to={backTo.to} className="inline-flex h-7 shrink-0 items-center gap-0.5 rounded pl-1 pr-2 text-sm font-medium hover:bg-hover touch:h-11 touch:text-base">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            {backTo.label}
          </Link>
        ) : (
          <IconButton size="lg" aria-label="Menu" onClick={() => setMobileOpen(true)} icon={<Menu />} />
        )}
        <span className="min-w-0 flex-1 truncate text-center text-sm font-medium">{topTitle ?? ""}</span>
        <span className={backTo ? "w-[72px] shrink-0" : "w-11 shrink-0"} aria-hidden="true" />
      </div>

      {/* Phone drawer */}
      <Sheet open={mobileOpen} onClose={() => setMobileOpen(false)} side="left" aria-label="Menu">
        <div className="flex h-full min-h-full flex-col">
          <div className="mx-1 mt-1 flex h-11 items-center gap-2 rounded px-2">{brand}</div>
          {nav}
        </div>
      </Sheet>
    </>
  );
}
