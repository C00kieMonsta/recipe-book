import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { BarChart3, BookOpen, ClipboardList, Calendar, Settings, LogOut, Menu, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const menuItems = [
  { path: "/", icon: BarChart3, label: "Tableau de bord", exact: true },
  { path: "/recipes", icon: BookOpen, label: "Recettes" },
  { path: "/ingredients", icon: ClipboardList, label: "Ingrédients" },
  { path: "/events", icon: Calendar, label: "Événements" },
  { path: "/settings", icon: Settings, label: "Paramètres" },
];

export default function AdminSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(false); }, [location.pathname]);

  const handleLogout = () => { logout(); navigate("/login"); };

  const sidebarContent = (
    <>
      <div className="p-6 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0">
            <span className="font-serif text-xl font-bold text-white">A</span>
          </div>
          <div>
            <h1 className="text-sm font-serif font-semibold leading-tight opacity-95">La Table d'Amélie</h1>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {menuItems.map((item) => {
          const isActive = item.exact
            ? location.pathname === item.path
            : location.pathname.startsWith(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              }`}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border">
        <div className="text-[11px] text-sidebar-foreground/40 mb-2 px-3">admin · v1.0</div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors"
        >
          <LogOut className="h-5 w-5" />
          Déconnexion
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 min-h-screen bg-sidebar text-sidebar-foreground flex-col">
        {sidebarContent}
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-3 bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0">
            <span className="font-serif text-sm font-bold text-white">A</span>
          </div>
          <span className="font-serif text-sm font-semibold opacity-95">La Table d'Amélie</span>
        </div>
        <button onClick={() => setOpen(!open)} className="p-2 -mr-2 rounded-lg hover:bg-sidebar-accent/50 transition-colors">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile drawer overlay */}
      {open && (
        <div className="md:hidden fixed inset-0 z-30" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm" />
          <aside className="absolute top-[52px] left-0 right-0 bg-sidebar text-sidebar-foreground flex flex-col max-h-[calc(100vh-52px)] overflow-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
