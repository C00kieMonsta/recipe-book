// Temporary harness for the Phase 5 group F screenshots; deleted before hand-off.
import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import type { AppSettings, Ingredient, Offer, OfferLine, Recipe } from "@packages/types";
import { upgradeCourses } from "@packages/types";
import { api } from "@/lib/api";
import { calcRecipeCost } from "@/lib/recipe-helpers";
import { plural } from "@/lib/use-planning-data";
import { Button, Section } from "@/components/ui";
import OfferMenu from "@/components/admin/OfferMenu";
import AddFromOfferDialog from "@/components/admin/AddFromOfferDialog";
import "./index.css";

const params = new URLSearchParams(window.location.search);
const view = params.get("view") ?? "menu";
const guests = Number(params.get("guests") ?? 20);

function Preview() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [lines, setLines] = useState<OfferLine[] | null>(null);
  const [dialog, setDialog] = useState(view.startsWith("dialog"));
  const [created, setCreated] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.offers.list(), api.recipes.list(), api.ingredients.list(), api.settings.get()]).then(([o, r, i, s]) => {
      setOffers(o);
      setRecipes(r);
      setIngredients(i);
      setSettings(s);
      const buffet = o.find((x) => x.name === "Buffet 1") ?? o[0];
      const base = view === "deleted" ? [{ recipeId: "missing", portionsPerGuest: 1 }, ...(buffet?.lines ?? [])] : (buffet?.lines ?? []);
      setLines(view === "empty" ? [] : base.map((l) => ({ ...l })));
    });
  }, []);

  const ingredientById = useMemo(() => new Map(ingredients.map((i) => [i.ingredientId, i])), [ingredients]);
  const recipeCostById = useMemo(() => new Map(recipes.map((r) => [r.recipeId, calcRecipeCost(r, ingredientById)])), [recipes, ingredientById]);
  const recipePortionsById = useMemo(() => new Map(recipes.map((r) => [r.recipeId, r.portions || 1])), [recipes]);
  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.recipeId, r])), [recipes]);
  const courses = upgradeCourses(settings?.courses);
  const buffet = offers.find((x) => x.name === "Buffet 1") ?? offers[0];

  if (!lines || !settings) return <p className="p-6 text-sm text-muted-foreground">Chargement…</p>;

  return (
    <div className="mx-auto max-w-doc px-4 py-6 md:px-8">
      <h1 className="text-h1">{buffet?.name ?? "Offre"}</h1>
      <Section title="Menu" meta={plural(lines.length, "recette")} action={<Button variant="ghost" size="sm" onClick={() => document.getElementById("offer-search")?.focus()}>+ Ajouter une recette</Button>}>
        <OfferMenu
          lines={lines}
          courses={courses}
          recipes={recipes}
          guests={guests}
          recipeCostById={recipeCostById}
          recipePortionsById={recipePortionsById}
          onChange={setLines}
          onCreateRecipe={(name) => setCreated(name)}
          onAddFromOffer={() => setDialog(true)}
          empty={<p className="text-sm text-muted-foreground">Aucune recette. Partez d'une offre ou ajoutez des recettes.</p>}
          searchId="offer-search"
        />
      </Section>
      {created && <p className="mt-4 text-sm text-muted-foreground" data-created>onCreateRecipe: {created}</p>}
      <pre className="mt-6 text-caption text-muted-foreground" data-lines>{JSON.stringify(lines)}</pre>
      <AddFromOfferDialog
        open={dialog}
        onClose={() => setDialog(false)}
        offers={offers}
        excludeOfferId={view === "dialog-all" ? undefined : buffet?.offerId}
        recipeById={recipeById}
        onAdd={(added) => setLines((cur) => [...(cur ?? []), ...added])}
      />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Preview />
    </BrowserRouter>
  </StrictMode>,
);
