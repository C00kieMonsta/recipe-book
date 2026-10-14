import { useTopTitle } from "@/components/admin/AdminLayout";
import { PageHeader, EmptyState } from "@/components/ui";

// Stub until Phase 6 fills the page (spec 07, 6.3).
export default function Offers() {
  useTopTitle("Offres");
  return (
    <div className="mx-auto max-w-wide">
      <PageHeader iconKey="offres" title="Offres" />
      <div data-tour="offers-list">
        <EmptyState message="Bientôt" />
      </div>
    </div>
  );
}
