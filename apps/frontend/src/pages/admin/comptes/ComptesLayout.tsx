import { NavLink, Outlet } from "react-router-dom";
import { PageHeader } from "@/components/ui";

const TABS = [
  { to: "/comptes/journal", label: "Journal" },
  { to: "/comptes/apercu", label: "Aperçu" },
  { to: "/comptes/resultats", label: "Compte de résultats" },
  { to: "/comptes/previsionnel", label: "Prévisionnel" },
  { to: "/comptes/au-reel", label: "Au réel" },
];

// Shared header and tabs; each page loads its own data with useReportInputs.
export default function ComptesLayout() {
  return (
    <div>
      <PageHeader title="Comptabilité" className="mb-2" />
      <nav aria-label="Comptabilité" className="no-print -mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `inline-flex min-h-11 shrink-0 items-center whitespace-nowrap border-b-2 px-3 text-base ${
                isActive ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
