import { useEffect, useState } from "react";
import { Outlet, useLocation, useOutletContext } from "react-router-dom";
import type { InvoicingMode } from "@packages/types";
import { api } from "@/lib/api";
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

// Invoices issued in another tool (Odoo): the same route lists what is left to close.
const INTRO_EXTERNE: Record<string, string> = {
  journal: "Une ligne par vente, CA mensuel, facture importée ou achat, classée par mois. Les autres onglets se calculent à partir du journal.",
  "a-facturer": "Terminer les événements passés pour figer leur coût. Les factures se font dans un autre outil.",
};

// Shared header and tabs; each page loads its own data with useReportInputs.
export default function ComptesLayout() {
  const { pathname } = useLocation();
  const context = useOutletContext();
  useTopTitle("Comptabilité");
  const [invoicing, setInvoicing] = useState<InvoicingMode>("app");
  useEffect(() => {
    let cancelled = false;
    api.settings.get().then((s) => { if (!cancelled) setInvoicing(s.invoicing ?? "app"); }).catch(() => {});
    return () => { cancelled = true; };
  }, [pathname]);
  const externe = invoicing === "externe";
  const tabs = externe ? TABS.map((t) => (t.key === "a-facturer" ? { ...t, label: "À terminer" } : t)) : TABS;
  const current = TABS.find((t) => pathname.startsWith(t.to))?.key ?? "journal";
  const intro = (externe && INTRO_EXTERNE[current]) || INTRO[current];
  return (
    <div className="mx-auto max-w-wide">
      <PageHeader iconKey="comptabilite" title="Comptabilité" className="mb-2" />
      <Toolbar className="mb-4" left={<div data-tour="comptes-tabs" className="flex min-w-0"><ViewTabs aria-label="Comptabilité" items={tabs} value={current} /></div>} />
      {intro && <p className="-mt-2 mb-4 text-sm text-muted-foreground">{intro}</p>}
      <Outlet context={context} />
    </div>
  );
}
