import { useBackLink, useTopTitle } from "@/components/admin/AdminLayout";
import { PageHeader, EmptyState } from "@/components/ui";

// Stub until Phase 6 fills the page (spec 07, 6.10).
export default function IngredientPrices() {
  useBackLink({ to: "/ingredients", label: "Ingrédients" });
  useTopTitle("Prix");
  return (
    <div className="mx-auto max-w-doc">
      <PageHeader breadcrumb={[{ label: "Ingrédients", to: "/ingredients" }, { label: "Prix" }]} iconKey="ingredients" title="Prix fournisseur" />
      <EmptyState message="Bientôt" />
    </div>
  );
}
