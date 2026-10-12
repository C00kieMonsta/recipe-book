import { Outlet, useLocation, useOutletContext } from "react-router-dom";
import { useTopTitle } from "@/components/admin/AdminLayout";
import { PageHeader, Toolbar, ViewTabs } from "@/components/ui";

const TABS = [
  { key: "journal", to: "/comptes/journal", label: "Journal" },
  { key: "a-facturer", to: "/comptes/a-facturer", label: "À facturer" },
  { key: "apercu", to: "/comptes/apercu", label: "Aperçu" },
  { key: "resultats", to: "/comptes/resultats", label: "Compte de résultats" },
  { key: "previsionnel", to: "/comptes/previsionnel", label: "Prévisionnel" },
  { key: "au-reel", to: "/comptes/au-reel", label: "Au réel" },
];

// Shared header and tabs; each page loads its own data with useReportInputs.
export default function ComptesLayout() {
  const { pathname } = useLocation();
  const context = useOutletContext();
  useTopTitle("Comptabilité");
  const current = TABS.find((t) => pathname.startsWith(t.to))?.key ?? "journal";
  return (
    <div className="mx-auto max-w-wide">
      <PageHeader iconKey="comptabilite" title="Comptabilité" className="mb-2" />
      <Toolbar className="mb-4" left={<ViewTabs aria-label="Comptabilité" items={TABS} value={current} />} />
      <Outlet context={context} />
    </div>
  );
}
