import { useBackLink, useTopTitle } from "@/components/admin/AdminLayout";
import { PageHeader, EmptyState } from "@/components/ui";

// Stub until Phase 6 fills the page (spec 07, 6.5).
export default function Devis() {
  useBackLink({ to: "/offres", label: "Offres" });
  useTopTitle("Devis");
  return (
    <div className="mx-auto max-w-doc">
      <PageHeader iconKey="devis" title="Devis" />
      <EmptyState message="Bientôt" />
    </div>
  );
}
