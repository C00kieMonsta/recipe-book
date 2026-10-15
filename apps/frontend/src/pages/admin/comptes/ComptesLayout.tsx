import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate, useOutletContext } from "react-router-dom";
import type { InvoicingMode } from "@packages/types";
import { api } from "@/lib/api";
import { enqueueInboxFiles } from "@/lib/inbox-queue";
import { useTopTitle } from "@/components/admin/AdminLayout";
import { PageHeader, Toolbar, ViewTabs } from "@/components/ui";

const TABS = [
  { key: "journal", to: "/comptes/journal", label: "Journal" },
  { key: "depot", to: "/comptes/depot", label: "Dépôt" },
  { key: "a-facturer", to: "/comptes/a-facturer", label: "À facturer" },
  { key: "apercu", to: "/comptes/apercu", label: "Aperçu" },
  { key: "resultats", to: "/comptes/resultats", label: "Compte de résultats" },
  { key: "previsionnel", to: "/comptes/previsionnel", label: "Prévisionnel" },
  { key: "au-reel", to: "/comptes/au-reel", label: "Au réel" },
  { key: "equipe", to: "/comptes/equipe", label: "Équipe" },
];

const INTRO: Record<string, string> = {
  journal: "Une ligne par facture, acompte, vente ou achat, classée par mois. Les autres onglets se calculent à partir du journal.",
  depot: "Déposez vos factures, l'application les lit et les ajoute au journal après votre accord.",
  "a-facturer": "Ce qu'il reste à faire : terminer les événements passés, créer les factures, encaisser les impayées.",
  apercu: "L'année en un coup d'œil : chiffre d'affaires par mois, face à l'objectif et à l'année précédente.",
  equipe: "Ce que vous devez à chacun d'après les heures et kilomètres notés sur les événements, par mode de paiement.",
};

// Invoices issued in another tool (Odoo): the same route lists what is left to close.
const INTRO_EXTERNE: Record<string, string> = {
  journal: "Une ligne par vente, CA mensuel, facture importée ou achat, classée par mois. Les autres onglets se calculent à partir du journal.",
  "a-facturer": "Terminer les événements passés pour figer leur coût, puis marquer facturés ceux dont la facture est faite dans votre autre outil.",
};

const DEPOT = "/comptes/depot";

const hasFiles = (e: DragEvent) => Boolean(e.dataTransfer?.types.includes("Files"));

// Shared header and tabs; each page loads its own data with useReportInputs.
export default function ComptesLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const context = useOutletContext();
  useTopTitle("Comptabilité");
  const [invoicing, setInvoicing] = useState<InvoicingMode>("app");
  useEffect(() => {
    let cancelled = false;
    api.settings.get().then((s) => { if (!cancelled) setInvoicing(s.invoicing ?? "app"); }).catch(() => {});
    return () => { cancelled = true; };
  }, [pathname]);

  // Files dropped anywhere on a Comptabilité page go to the Dépôt queue; the zone on that page handles its own drops.
  useEffect(() => {
    const onDragOver = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if ((e.target as Element | null)?.closest?.("[data-drop-zone]")) return;
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length === 0) return;
      enqueueInboxFiles(files);
      if (!pathname.startsWith(DEPOT)) navigate(DEPOT);
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [pathname, navigate]);

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
