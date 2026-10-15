import { ViewTabs } from "@/components/ui";

export type OffersTab = "documents" | "formules" | "archivees";

export interface OffersTabsProps {
  current: OffersTab;
  // The list « Archivées » belongs to: documents on /offres/documents, formulas on /offres.
  base: "/offres/documents" | "/offres";
  counts?: Partial<Record<OffersTab, number>>;
  className?: string;
}

export const OFFERS_ARCHIVED_SEARCH = "?vue=archivees";

// Documents | Formules | Archivées, shared by the documents list and the 07 Offres page.
export default function OffersTabs({ current, base, counts, className }: OffersTabsProps) {
  const items = [
    { key: "documents", label: "Documents", to: "/offres/documents", count: counts?.documents },
    { key: "formules", label: "Formules", to: "/offres", count: counts?.formules },
    { key: "archivees", label: "Archivées", to: `${base}${OFFERS_ARCHIVED_SEARCH}`, count: counts?.archivees },
  ];
  return <ViewTabs items={items} value={current} aria-label="Offres" className={className} />;
}
