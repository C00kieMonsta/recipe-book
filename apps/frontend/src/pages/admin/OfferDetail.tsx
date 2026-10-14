import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Plus, X } from "lucide-react";
import type {
  AppEvent,
  AppSettings,
  EventExtraCost,
  EventRevenueLine,
  ExtraCostKind,
  Ingredient,
  Offer,
  OfferLine,
  Recipe,
  UpdateOfferRequest,
  VatRate,
} from "@packages/types";
import {
  DEFAULT_COURSES,
  DEFAULT_PRESTATION_TYPES,
  VAT_RATES,
  calcRecipeCost,
  fmtEur,
  mergeOfferLines,
  offerFromEvent,
  pricePerGuestOf,
  quoteTotals,
  recipeCategoryOf,
  round2,
} from "@packages/types";
import { api, ApiError, errorReason, invalidate } from "@/lib/api";
import { plural } from "@/lib/use-planning-data";
import { useToast } from "@/hooks/use-toast";
import { useBackLink, useTopTitle } from "@/components/admin/AdminLayout";
import AddFromOfferDialog from "@/components/admin/AddFromOfferDialog";
import NewRecipeDialog from "@/components/admin/NewRecipeDialog";
import OfferMenu from "@/components/admin/OfferMenu";
import {
  ActionMenu,
  Button,
  Dialog,
  EditableInlineNum,
  EditableInlineText,
  EditableText,
  IconButton,
  MoneyTile,
  PageHeader,
  Property,
  PropertyList,
  Section,
  SelectPill,
  Tag,
} from "@/components/ui";
import { DeleteOfferDialog, FromEventDialog, duplicateOfferPayload, fmtPct } from "./Offers";

const NONE = "__none__";
const SAVE_DELAY = 300;
const SEARCH_ID = "offer-menu-search";
const REVENUE_LABELS_ID = "offer-revenue-labels";

const EXTRA_KINDS: { value: ExtraCostKind; label: string }[] = [
  { value: "matiere", label: "Matière" },
  { value: "personnel", label: "Personnel" },
  { value: "location", label: "Location" },
  { value: "transport", label: "Transport" },
  { value: "autre", label: "Autre" },
];

const PRICING_OPTIONS = [
  { value: "par_convive", label: "par convive" },
  { value: "total", label: "total food" },
];

const VAT_OPTIONS = VAT_RATES.map((r) => ({ value: String(r), label: `${r} %` }));

const ROW = "group flex min-h-9 items-center gap-2 rounded px-1 hover:bg-hover touch:min-h-11";

function parseVat(v: string): VatRate | undefined {
  const n = Number(v);
  return (VAT_RATES as readonly number[]).includes(n) ? (n as VatRate) : undefined;
}

// The local copy of a patch: null removes the field, total mode keeps the derived per-guest price.
function applyPatch(prev: Offer, patch: UpdateOfferRequest): Offer {
  const next: Record<string, unknown> = { ...prev };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (value === null) delete next[key];
    else next[key] = value;
  }
  const offer = next as unknown as Offer;
  if (offer.pricingMode === "total") offer.sellingPricePerGuest = round2((offer.sellingTotal ?? 0) / (offer.guestCountRef || 1));
  else if (patch.pricingMode === "par_convive") delete offer.sellingTotal;
  return offer;
}

export default function OfferDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [offer, setOfferState] = useState<Offer | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [newRecipe, setNewRecipe] = useState<{ name: string; category?: string } | null>(null);
  const [addFromOffer, setAddFromOffer] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replaceWith, setReplaceWith] = useState<AppEvent | null>(null);
  const [deleting, setDeleting] = useState<Offer | null>(null);
  const [busy, setBusy] = useState(false);
  const revenueRef = useRef<HTMLDivElement>(null);

  // The latest offer, readable from handlers that fire before the next render.
  const offerRef = useRef<Offer | null>(null);
  const commitOffer = useCallback((next: Offer | null) => { offerRef.current = next; setOfferState(next); }, []);

  const pendingRef = useRef<UpdateOfferRequest>({});
  const timerRef = useRef<number | null>(null);
  const chainRef = useRef<Promise<unknown>>(Promise.resolve());
  const editsRef = useRef(0);

  const reloadOffer = useCallback(async () => {
    invalidate("offers");
    const list = await api.offers.list();
    setOffers(list);
    const fresh = list.find((o) => o.offerId === id) ?? null;
    commitOffer(fresh);
    return fresh;
  }, [id, commitOffer]);

  const flush = useCallback(() => {
    if (timerRef.current !== null) { window.clearTimeout(timerRef.current); timerRef.current = null; }
    const patch = pendingRef.current;
    pendingRef.current = {};
    if (!id || Object.keys(patch).length === 0) return;
    const seen = editsRef.current;
    chainRef.current = chainRef.current
      .catch(() => undefined)
      .then(() => api.offers.update(id, patch))
      .then((saved) => {
        setOffers((prev) => prev.map((o) => (o.offerId === saved.offerId ? saved : o)));
        // A newer local edit wins over the response.
        if (editsRef.current === seen) commitOffer(saved);
      })
      .catch(async (e: unknown) => {
        if (e instanceof ApiError && e.status === 409) toast({ title: "L'offre a changé ailleurs, elle a été rechargée", variant: "destructive" });
        else toast({ title: "Erreur lors de la sauvegarde", description: errorReason(e) || undefined, variant: "destructive" });
        pendingRef.current = {};
        editsRef.current += 1;
        await reloadOffer().catch(() => undefined);
      });
  }, [id, commitOffer, reloadOffer, toast]);

  // Pending edits leave with the page instead of being lost.
  useEffect(() => () => flush(), [flush]);

  const edit = useCallback((patch: UpdateOfferRequest) => {
    const prev = offerRef.current;
    if (!prev) return;
    editsRef.current += 1;
    commitOffer(applyPatch(prev, patch));
    pendingRef.current = { ...pendingRef.current, ...patch };
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(flush, SAVE_DELAY);
  }, [commitOffer, flush]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    Promise.all([api.offers.list(), api.recipes.list(), api.ingredients.list(), api.settings.get()])
      .then(([ofs, recs, ings, se]) => {
        if (cancelled) return;
        setOffers(ofs);
        commitOffer(ofs.find((o) => o.offerId === id) ?? null);
        setRecipes(recs); setIngredients(ings); setSettings(se);
      })
      .catch(() => { if (!cancelled) { setLoadError(true); toast({ title: "Erreur de chargement", variant: "destructive" }); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, commitOffer]);

  useBackLink({ to: "/offres", label: "Offres" });
  useTopTitle(offer?.name ?? "Offre");

  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.recipeId, r])), [recipes]);
  const ingredientById = useMemo(() => new Map(ingredients.map((i) => [i.ingredientId, i])), [ingredients]);
  const recipeCostById = useMemo(() => new Map(recipes.map((r) => [r.recipeId, calcRecipeCost(r, ingredientById)])), [recipes, ingredientById]);
  const recipePortionsById = useMemo(() => new Map(recipes.map((r) => [r.recipeId, r.portions || 1])), [recipes]);
  const courses = useMemo(() => (settings?.courses?.length ? settings.courses : DEFAULT_COURSES), [settings]);
  const prestationTypes = settings?.prestationTypes?.length ? settings.prestationTypes : DEFAULT_PRESTATION_TYPES;

  if (loading) return <div className="p-8 text-muted-foreground">Chargement…</div>;
  if (loadError || !offer || !id) return <div className="p-8 text-muted-foreground">Offre introuvable.</div>;

  const totals = quoteTotals(
    {
      lines: offer.lines,
      guests: offer.guestCountRef,
      extraCosts: offer.extraCosts,
      revenueLines: offer.revenueLines,
      pricingMode: offer.pricingMode ?? "par_convive",
      sellingPricePerGuest: offer.sellingPricePerGuest,
      sellingTotal: offer.sellingTotal,
      vatRate: offer.vatRate,
    },
    recipeCostById,
    recipePortionsById,
    recipeById,
  );
  const totalMode = offer.pricingMode === "total";
  const perGuest = pricePerGuestOf({ guestCount: offer.guestCountRef, pricingMode: offer.pricingMode, sellingPricePerGuest: offer.sellingPricePerGuest, sellingTotal: offer.sellingTotal });
  const devisHref = `/devis?offre=${offer.offerId}`;

  // ── Properties ────────────────────────────────────────────────────────────
  const changePrestation = (v: string) => {
    if (v === NONE) { edit({ prestationType: null }); return; }
    const type = prestationTypes.find((t) => t.key === v);
    edit({ prestationType: v, ...(offer.vatRate === undefined && type ? { vatRate: type.defaultVatRate } : {}) });
  };

  const switchPricing = (mode: string) => {
    if (mode === (offer.pricingMode ?? "par_convive")) return;
    if (mode === "total") edit({ pricingMode: "total", sellingTotal: round2(offer.sellingPricePerGuest * offer.guestCountRef) });
    else edit({ pricingMode: "par_convive", sellingPricePerGuest: perGuest });
  };

  const savePrice = (v: number) => {
    const amount = round2(Math.max(0, v));
    if (totalMode) edit({ sellingTotal: amount });
    else edit({ sellingPricePerGuest: amount });
  };

  // ── Menu ──────────────────────────────────────────────────────────────────
  const addLine = (recipeId: string, course?: string) => {
    const current = offerRef.current;
    const recipe = recipeById.get(recipeId);
    if (!current || !recipe) return;
    const line: OfferLine = { recipeId, portionsPerGuest: 1, course: course ?? recipeCategoryOf(recipe) };
    edit({ lines: [...current.lines, line] });
  };

  const focusSearch = () => document.getElementById(SEARCH_ID)?.focus();

  // ── Service, livraison, autres ────────────────────────────────────────────
  const setRevenueLines = (revenueLines: EventRevenueLine[]) => edit({ revenueLines });
  const updateRevenueLine = (i: number, patch: Partial<EventRevenueLine>) => setRevenueLines(offer.revenueLines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const addRevenueLine = () => {
    setRevenueLines([...offer.revenueLines, { label: "Service", amount: 0, vatRate: 21 }]);
    setTimeout(() => {
      const cells = revenueRef.current?.querySelectorAll<HTMLElement>("[data-amount] [role=button]");
      cells?.[cells.length - 1]?.click();
    }, 50);
  };
  const removeRevenueLine = (i: number) => setRevenueLines(offer.revenueLines.filter((_, j) => j !== i));

  // ── Coûts supplémentaires ─────────────────────────────────────────────────
  const setExtraCosts = (extraCosts: EventExtraCost[]) => edit({ extraCosts });
  const updateExtraCost = (i: number, patch: Partial<EventExtraCost>) => setExtraCosts(offer.extraCosts.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const addExtraCost = () => setExtraCosts([...offer.extraCosts, { label: "Nouveau coût", amount: 0, kind: "autre" }]);
  const removeExtraCost = (i: number) => setExtraCosts(offer.extraCosts.filter((_, j) => j !== i));

  // ── Overflow actions ──────────────────────────────────────────────────────
  const duplicate = async () => {
    if (busy) return;
    setBusy(true);
    flush();
    try {
      const created = await api.offers.create(duplicateOfferPayload(offerRef.current ?? offer));
      navigate(`/offres/${created.offerId}`);
    } catch (e) {
      toast({ title: "Erreur lors de la duplication", description: errorReason(e) || undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const replaceMenu = () => {
    if (!replaceWith) return;
    const from = offerFromEvent(replaceWith, offer.name);
    edit({ lines: from.lines, extraCosts: from.extraCosts, revenueLines: from.revenueLines });
    setReplaceWith(null);
  };

  const menuItems = [
    { label: "Dupliquer", onClick: () => { void duplicate(); } },
    { label: "Remplacer le menu depuis un événement…", onClick: () => setReplaceOpen(true) },
    offer.archived
      ? { label: "Réactiver", onClick: () => edit({ archived: false }) }
      : { label: "Archiver", onClick: () => edit({ archived: true }) },
    { kind: "separator" as const },
    { label: "Supprimer", variant: "danger" as const, onClick: () => setDeleting(offer) },
  ];

  const prestationOptions = [...prestationTypes.map((t) => ({ value: t.key, label: t.label })), { value: NONE, label: "Aucune" }];
  const incompleteSub = totals.incompleteRecipes > 0 ? <span className="text-danger">{plural(totals.incompleteRecipes, "recette")} sans ingrédients</span> : undefined;

  return (
    <div className="mx-auto max-w-doc pb-20 md:pb-0">
      <PageHeader
        breadcrumb={[{ label: "Offres", to: "/offres" }, { label: offer.name }]}
        iconKey="offre"
        title={offer.archived ? (
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <EditableText value={offer.name} onSave={(v) => { if (v.trim()) edit({ name: v.trim() }); }} placeholder="Sans titre" className="min-w-0 text-h1 md:text-h1-lg" />
            <Tag colour="gray">Archivée</Tag>
          </span>
        ) : offer.name}
        onTitleChange={offer.archived ? undefined : (v) => edit({ name: v })}
        actions={
          <>
            <Button as={Link} to={devisHref} variant="primary" size="lg" className="hidden md:inline-flex">Faire un devis</Button>
            <ActionMenu items={menuItems} title={offer.name} />
          </>
        }
        properties={
          <PropertyList className="md:[&_dt]:w-48">
            <Property icon="🍽" label="Prestation" kind="select" value={offer.prestationType ?? NONE} options={prestationOptions} colour="gray" onSave={changePrestation} />
            <Property icon="🧾" label="TVA" kind="select" value={offer.vatRate === undefined ? "" : String(offer.vatRate)} options={VAT_OPTIONS} colour="gray" placeholder="Choisir" onSave={(v) => { const rate = parseVat(v); if (rate !== undefined) edit({ vatRate: rate }); }} />
            <Property icon="👥" label="Convives de référence" kind="number" value={offer.guestCountRef} min={1} decimals={0} sub="Sert au calcul du coût et des portions" onSave={(v) => edit({ guestCountRef: Math.max(1, Math.round(v)) })} />
            <Property icon="💶" label="Prix" kind="custom" sub={totalMode ? `soit ${fmtEur(perGuest)} / convive` : undefined}>
              <div className="flex flex-wrap items-center gap-1">
                <SelectPill
                  value={offer.pricingMode ?? "par_convive"}
                  options={PRICING_OPTIONS}
                  colour="gray"
                  aria-label="Mode de prix"
                  title="En total food, le prix ne change pas quand les convives changent."
                  onChange={switchPricing}
                />
                <EditableInlineNum value={totalMode ? offer.sellingTotal ?? 0 : offer.sellingPricePerGuest} min={0} suffix=" €" onSave={savePrice} />
                <span className="text-sm text-muted-foreground">HTVA</span>
              </div>
            </Property>
            <Property icon="📝" label="Notes" kind="multiline" value={offer.notes ?? ""} placeholder="Ajouter une note" onSave={(v) => edit({ notes: v.trim() ? v : null })} />
          </PropertyList>
        }
      />

      <div className="flex overflow-x-auto rounded-lg bg-surface md:grid md:grid-cols-4 md:divide-x md:divide-border">
        <MoneyTile flat label="Coût matières / conv." value={fmtEur(totals.costPerGuest)} sub={incompleteSub} className="min-w-[10rem] shrink-0 md:min-w-0" />
        <MoneyTile flat label="Prix / conv." value={fmtEur(totals.pricePerGuest)} className="min-w-[10rem] shrink-0 md:min-w-0" />
        <MoneyTile flat label="Marge / conv." value={fmtEur(totals.marginPerGuest)} className="min-w-[10rem] shrink-0 md:min-w-0" />
        <MoneyTile flat label="Marge %" value={<span className={totals.marginPct < 0 ? "text-danger" : undefined}>{fmtPct(totals.marginPct)}</span>} className="min-w-[10rem] shrink-0 md:min-w-0" />
      </div>

      <Section
        title="Menu"
        meta={plural(offer.lines.length, "recette")}
        action={<Button variant="ghost" size="sm" icon={<Plus />} onClick={focusSearch}>Ajouter une recette</Button>}
      >
        <OfferMenu
          lines={offer.lines}
          courses={courses}
          recipes={recipes}
          guests={offer.guestCountRef}
          recipeCostById={recipeCostById}
          recipePortionsById={recipePortionsById}
          onChange={(lines) => edit({ lines })}
          onCreateRecipe={(name, category) => setNewRecipe({ name, category })}
          onAddFromOffer={() => setAddFromOffer(true)}
          searchId={SEARCH_ID}
        />
      </Section>

      <Section
        title="Service, livraison, autres"
        meta={`${fmtEur(totals.linesHtva)} HTVA`}
        action={<Button variant="ghost" size="sm" icon={<Plus />} onClick={addRevenueLine}>Ajouter</Button>}
      >
        {offer.revenueLines.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun supplément. Service, livraison ou autres, facturés en plus du prix food, TVA 21 % par défaut.</p>
        ) : (
          <div ref={revenueRef}>
            <datalist id={REVENUE_LABELS_ID}>
              <option value="Service" />
              <option value="Livraison" />
              <option value="Autres" />
            </datalist>
            {offer.revenueLines.map((line, i) => (
              <div key={i} className={ROW}>
                <span className="min-w-0 flex-1 text-sm touch:text-base">
                  <InlineLabel value={line.label} list={REVENUE_LABELS_ID} onSave={(v) => { if (v.trim()) updateRevenueLine(i, { label: v.trim() }); }} />
                </span>
                <span className="w-24 text-right text-sm tabular-nums touch:text-base" data-amount>
                  <EditableInlineNum value={line.amount} min={0} onSave={(v) => updateRevenueLine(i, { amount: round2(Math.max(0, v)) })} suffix=" €" />
                </span>
                <SelectPill
                  value={String(line.vatRate)}
                  options={VAT_OPTIONS}
                  colour="gray"
                  align="right"
                  aria-label="TVA"
                  title="TVA"
                  onChange={(v) => { const rate = parseVat(v); if (rate !== undefined) updateRevenueLine(i, { vatRate: rate }); }}
                />
                <IconButton size="sm" aria-label="Retirer" onClick={() => removeRevenueLine(i)} icon={<X />} className="reveal" />
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Coûts supplémentaires"
        meta={fmtEur(totals.extrasCost)}
        action={<Button variant="ghost" size="sm" icon={<Plus />} onClick={addExtraCost}>Ajouter</Button>}
      >
        {offer.extraCosts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun coût supplémentaire.</p>
        ) : (
          <div>
            {offer.extraCosts.map((ec, i) => (
              <div key={i} className={ROW}>
                <span className="min-w-0 flex-1 text-sm touch:text-base">
                  <EditableInlineText value={ec.label} onSave={(v) => { if (v.trim()) updateExtraCost(i, { label: v.trim() }); }} />
                </span>
                <SelectPill
                  value={ec.kind ?? "autre"}
                  options={EXTRA_KINDS}
                  colour="gray"
                  align="right"
                  aria-label="Nature du coût"
                  title="Nature du coût"
                  onChange={(v) => updateExtraCost(i, { kind: v as ExtraCostKind })}
                />
                <span className="w-20 text-right text-sm tabular-nums touch:text-base">
                  <EditableInlineNum value={ec.amount} min={0} onSave={(v) => updateExtraCost(i, { amount: round2(Math.max(0, v)) })} suffix=" €" />
                </span>
                <IconButton size="sm" aria-label="Retirer ce coût" onClick={() => removeExtraCost(i)} icon={<X />} className="reveal" />
              </div>
            ))}
          </div>
        )}
      </Section>

      <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 bg-background p-3 shadow-[0_-1px_0_0_var(--border)] md:hidden">
        <Button as={Link} to={devisHref} variant="primary" size="lg" className="flex-1">Faire un devis</Button>
      </div>

      <NewRecipeDialog
        open={newRecipe !== null}
        onClose={() => setNewRecipe(null)}
        initial={newRecipe ?? { name: "" }}
        categories={courses}
        existing={recipes}
        defaultPortions={offer.guestCountRef}
        onCreated={(recipe) => {
          setRecipes((prev) => [...prev, recipe]);
          const current = offerRef.current;
          if (current) edit({ lines: [...current.lines, { recipeId: recipe.recipeId, portionsPerGuest: 1, course: recipeCategoryOf(recipe) }] });
          toast({ title: "Recette créée et ajoutée" });
        }}
        onUseExisting={(recipeId) => addLine(recipeId)}
      />

      <AddFromOfferDialog
        open={addFromOffer}
        onClose={() => setAddFromOffer(false)}
        offers={offers}
        excludeOfferId={offer.offerId}
        recipeById={recipeById}
        onAdd={(lines) => { const current = offerRef.current; if (current) edit({ lines: mergeOfferLines(current.lines, lines) }); }}
      />

      <FromEventDialog open={replaceOpen} onClose={() => setReplaceOpen(false)} mode="replace" onPick={(event) => setReplaceWith(event)} />

      <Dialog
        open={replaceWith !== null}
        onClose={() => setReplaceWith(null)}
        size="sm"
        title={<span className="whitespace-normal">Remplacer le menu de « {offer.name} » par celui de « {replaceWith?.name ?? ""} » ?</span>}
        footer={
          <>
            <Button variant="default" onClick={() => setReplaceWith(null)}>Annuler</Button>
            <Button variant="primary" onClick={replaceMenu}>Remplacer</Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">{replaceWith ? `${plural(replaceWith.recipes.length, "recette")} · ${plural(replaceWith.guestCount, "convive")}` : ""}</p>
      </Dialog>

      <DeleteOfferDialog offer={deleting} onClose={() => setDeleting(null)} onDeleted={() => navigate("/offres")} />
    </div>
  );
}

// EditableInlineText with a datalist of the usual labels.
function InlineLabel({ value, onSave, list }: { value: string; onSave: (v: string) => void; list: string }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  useEffect(() => { if (!editing) setText(value); }, [value, editing]);
  const commit = () => { setEditing(false); if (text !== value) onSave(text); };
  if (editing) {
    return (
      <input
        className="-mx-1 w-32 rounded border-0 bg-input-bg px-1 font-medium shadow-ring outline-none"
        list={list}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { e.preventDefault(); setText(value); setEditing(false); }
        }}
        autoFocus
      />
    );
  }
  return (
    <strong
      role="button"
      tabIndex={0}
      className="prop-value font-medium touch:inline-flex touch:min-h-11 touch:items-center"
      onClick={() => setEditing(true)}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setEditing(true); } }}
    >
      {value}
    </strong>
  );
}
