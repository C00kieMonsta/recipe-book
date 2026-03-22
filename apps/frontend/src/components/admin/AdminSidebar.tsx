import { Link, useLocation, useNavigate } from "react-router-dom";
import { BookOpen, ClipboardList, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const menuItems = [
  { path: "/recipes", icon: BookOpen, label: "Recettes" },
  { path: "/ingredients", icon: ClipboardList, label: "Ingrédients" },
];

export default function AdminSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleLogout = () => { logout(); navigate("/login"); };

  return (
    <aside className="w-60 shrink-0 min-h-screen bg-sidebar text-sidebar-foreground flex flex-col">
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
          const isActive = location.pathname.startsWith(item.path);
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
    </aside>
  );
}
