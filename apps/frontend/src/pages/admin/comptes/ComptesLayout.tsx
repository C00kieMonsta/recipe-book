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

const INTRO: Record<string, string> = {
  journal: "Une ligne par facture, acompte, vente ou achat, classée par mois. Les autres onglets se calculent à partir du journal.",
  "a-facturer": "Ce qu'il reste à faire : terminer les événements passés, créer les factures, encaisser les impayées.",
  apercu: "L'année en un coup d'œil : chiffre d'affaires par mois, face à l'objectif et à l'année précédente.",
};

// Shared header and tabs; each page loads its own data with useReportInputs.
export default function ComptesLayout() {
  const { pathname } = useLocation();
  const context = useOutletContext();
  useTopTitle("Comptabilité");
  const current = TABS.find((t) => pathname.startsWith(t.to))?.key ?? "journal";
  return (
    <div className="mx-auto max-w-wide">
      <PageHeader iconKey="comptabilite" title="Comptabilité" className="mb-2" />
      <Toolbar className="mb-4" left={<div data-tour="comptes-tabs" className="flex min-w-0"><ViewTabs aria-label="Comptabilité" items={TABS} value={current} /></div>} />
      {INTRO[current] && <p className="-mt-2 mb-4 text-sm text-muted-foreground">{INTRO[current]}</p>}
      <Outlet context={context} />
    </div>
  );
}
