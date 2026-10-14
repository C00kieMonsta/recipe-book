import { useBackLink, useTopTitle } from "@/components/admin/AdminLayout";
import { PageHeader, EmptyState } from "@/components/ui";

// Stub until Phase 6 fills the page (spec 07, 6.4).
export default function OfferDetail() {
  useBackLink({ to: "/offres", label: "Offres" });
  useTopTitle("Offre");
  return (
    <div className="mx-auto max-w-doc">
      <PageHeader breadcrumb={[{ label: "Offres", to: "/offres" }, { label: "Offre" }]} iconKey="offre" title="Offre" />
      <EmptyState message="Bientôt" />
    </div>
  );
}
