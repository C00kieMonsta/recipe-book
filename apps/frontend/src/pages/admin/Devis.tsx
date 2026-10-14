import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Building2, Calendar, Euro, Plus, Users, X } from "lucide-react";
import type {
  AppSettings,
  Client,
  CreateOfferRequest,
  EventExtraCost,
  EventRevenueLine,
  ExtraCostKind,
  Ingredient,
  Offer,
  OfferLine,
  PricingMode,
  Recipe,
  VatRate,
} from "@packages/types";
import {
  DEFAULT_COURSES,
  DEFAULT_PRESTATION_TYPES,
  VAT_RATES,
  calcRecipeCost,
  eventFromOffer,
  fmtEur,
  groupByCourse,
  linesForGuests,
  mergeOfferLines,
  pricePerGuestOf,
  quoteTotals,
  recipeCategoryOf,
  round2,
  suggestedPricePerGuest,
  sumExtraCosts,
} from "@packages/types";
import { api, ApiError, errorReason, type EventInput } from "@/lib/api";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useToast } from "@/hooks/use-toast";
import { useTouchScreen } from "@/hooks/use-touch-screen";
import { longDayLabel, todayIso } from "@/lib/dates";
import { exportMenuPdf, pricingLines } from "@/lib/menu-pdf";
import { plural } from "@/lib/use-planning-data";
import { useBackLink, useTopTitle } from "@/components/admin/AdminLayout";
import AddFromOfferDialog from "@/components/admin/AddFromOfferDialog";
import NewClientDialog from "@/components/admin/NewClientDialog";
import NewRecipeDialog from "@/components/admin/NewRecipeDialog";
import OfferMenu from "@/components/admin/OfferMenu";
import {
  ActionMenu,
  Button,
  Dialog,
  EditableInlineNum,
  EditableInlineText,
  FieldLabel,
  IconButton,
  MoneyTile,
  PageHeader,
  Property,
  PropertyList,
  Section,
  SelectPill,
} from "@/components/ui";

const DRAFT_KEY = "devis:draft";
const SEARCH_ID = "devis-recipe-search";
const LABELS_LIST_ID = "devis-revenue-labels";
const DEFAULT_GUESTS = 20;

interface DevisDraft {
  // The offer the devis started from, kept for offerId and the event note.
  loadedFrom: string | null;
  clientId: string;
  guests: number;
  // True once Convives was typed, so a client default no longer overrides it.
  guestsTouched: boolean;
  prestationType: string;
  vatRate: VatRate | null;
  date: string;
  lines: OfferLine[];
  revenueLines: EventRevenueLine[];
  extraCosts: EventExtraCost[];
  pricingMode: PricingMode;
  sellingPricePerGuest: number;
  sellingTotal: number | null;
}

const EMPTY_DRAFT: DevisDraft = {
  loadedFrom: null,
  clientId: "",
  guests: DEFAULT_GUESTS,
  guestsTouched: false,
  prestationType: "",
  vatRate: null,
  date: "",
  lines: [],
  revenueLines: [],
  extraCosts: [],
  pricingMode: "par_convive",
  sellingPricePerGuest: 0,
  sellingTotal: null,
};

function readDraft(): DevisDraft {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return EMPTY_DRAFT;
    const parsed = JSON.parse(raw) as Partial<DevisDraft> | null;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.lines)) return EMPTY_DRAFT;
    return { ...EMPTY_DRAFT, ...parsed };
  } catch {
    return EMPTY_DRAFT;
  }
}

function isPristine(d: DevisDraft): boolean {
  return JSON.stringify(d) === JSON.stringify(EMPTY_DRAFT);
}

// Lines, pricing, prestation, TVA, billed lines, costs and the reference guests come from the offer; client and date stay.
function draftFromOffer(offer: Offer, base: DevisDraft): DevisDraft {
  return {
    ...base,
    loadedFrom: offer.offerId,
    guests: offer.guestCountRef,
    guestsTouched: false,
    prestationType: offer.prestationType ?? "",
    vatRate: offer.vatRate ?? null,
    lines: offer.lines.map((l) => ({ ...l })),
    revenueLines: (offer.revenueLines ?? []).map((l) => ({ ...l })),
    extraCosts: (offer.extraCosts ?? []).map((c) => ({ ...c })),
    pricingMode: offer.pricingMode ?? "par_convive",
    sellingPricePerGuest: offer.sellingPricePerGuest,
    sellingTotal: offer.pricingMode === "total" ? offer.sellingTotal ?? 0 : null,
  };
}

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9àâéèêëïîôùûüç\s-]/g, "").trim() || "menu";
}

// "14/10/2026"
function slashDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const PRICING_OPTIONS = [
  { value: "par_convive", label: "par convive" },
  { value: "total", label: "total food" },
];

const VAT_OPTIONS = VAT_RATES.map((r) => ({ value: String(r), label: `${r} %` }));

const EXTRA_KINDS: { value: ExtraCostKind; label: string }[] = [
  { value: "matiere", label: "Matière" },
  { value: "personnel", label: "Personnel" },
  { value: "location", label: "Location" },
  { value: "transport", label: "Transport" },
  { value: "autre", label: "Autre" },
];

const REVENUE_LABELS = ["Service", "Livraison", "Autres"];

const ROW = "group flex min-h-9 items-center gap-2 rounded px-1 hover:bg-hover touch:min-h-11";

type DevisDialog =
  | { kind: "replace"; offerId: string }
  | { kind: "reset" }
  | { kind: "saveOffer" }
  | { kind: "create" }
  | null;

export default function Devis() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const isTouch = useTouchScreen();
  // Phones keep only the ⋯ in the header so the property column keeps its width.
  const md = useMediaQuery("(min-width: 768px)");
  useBackLink({ to: "/offres", label: "Offres" });
  useTopTitle("Devis");

  const [draft, setDraft] = useState<DevisDraft>(readDraft);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsConfigured, setClientsConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [dialog, setDialog] = useState<DevisDialog>(null);
  const [busy, setBusy] = useState(false);
  const [offerName, setOfferName] = useState("");
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [newClient, setNewClient] = useState<{ name: string } | null>(null);
  const [newRecipe, setNewRecipe] = useState<{ name: string; category?: string } | null>(null);
  const [addFromOffer, setAddFromOffer] = useState(false);
  // Remounts the « Offre de départ » row when a replace is cancelled, so its optimistic value reverts.
  const [offerRowKey, setOfferRowKey] = useState(0);
  const revenueRefs = useRef(new Map<number, HTMLDivElement>());
  const paramsApplied = useRef(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.offers.list(),
      api.recipes.list(),
      api.ingredients.list(),
      api.settings.get(),
      api.clients.list().catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 503) { setClientsConfigured(false); return [] as Client[]; }
        throw e;
      }),
    ])
      .then(([of, re, ing, se, cl]) => {
        if (cancelled) return;
        setOffers(of); setRecipes(re); setIngredients(ing); setSettings(se); setClients(cl);
      })
      .catch(() => { if (!cancelled) { setLoadError(true); toast({ title: "Erreur de chargement", variant: "destructive" }); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // The draft survives a reload; a pristine page leaves nothing behind.
  useEffect(() => {
    if (isPristine(draft)) sessionStorage.removeItem(DRAFT_KEY);
    else sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [draft]);

  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.recipeId, r])), [recipes]);
  const ingredientById = useMemo(() => new Map(ingredients.map((i) => [i.ingredientId, i])), [ingredients]);
  const recipeCostById = useMemo(() => new Map(recipes.map((r) => [r.recipeId, calcRecipeCost(r, ingredientById)])), [recipes, ingredientById]);
  const recipePortionsById = useMemo(() => new Map(recipes.map((r) => [r.recipeId, r.portions || 1])), [recipes]);
  const clientById = useMemo(() => new Map(clients.map((c) => [c.clientId, c])), [clients]);
  const offerById = useMemo(() => new Map(offers.map((o) => [o.offerId, o])), [offers]);
  const courses = useMemo(() => (settings?.courses?.length ? settings.courses : DEFAULT_COURSES), [settings]);
  const prestationTypes = settings?.prestationTypes?.length ? settings.prestationTypes : DEFAULT_PRESTATION_TYPES;
  const activeOffers = useMemo(() => offers.filter((o) => !o.archived), [offers]);

  const startOffer = draft.loadedFrom ? offerById.get(draft.loadedFrom) : undefined;
  const client = draft.clientId ? clientById.get(draft.clientId) : undefined;
  const prestationLabel = draft.prestationType ? prestationTypes.find((t) => t.key === draft.prestationType)?.label ?? draft.prestationType : undefined;

  const quote = useMemo(
    () =>
      quoteTotals(
        {
          lines: draft.lines,
          guests: draft.guests,
          extraCosts: draft.extraCosts,
          revenueLines: draft.revenueLines,
          pricingMode: draft.pricingMode,
          sellingPricePerGuest: draft.sellingPricePerGuest,
          sellingTotal: draft.sellingTotal ?? undefined,
          vatRate: draft.vatRate ?? undefined,
        },
        recipeCostById,
        recipePortionsById,
        recipeById,
      ),
    [draft, recipeCostById, recipePortionsById, recipeById],
  );

  const year = (draft.date || todayIso()).slice(0, 4);
  const rawMaterialPct = settings?.objectives?.[year]?.rawMaterialPct;
  const objectiveSet = typeof rawMaterialPct === "number" && rawMaterialPct > 0 && rawMaterialPct <= 1;
  const suggested = suggestedPricePerGuest(quote.costPerGuest, rawMaterialPct);
  const pctText = `${((objectiveSet ? rawMaterialPct : 0.3) * 100).toLocaleString("fr-BE", { maximumFractionDigits: 1 })} %`;

  // ── Draft edits ───────────────────────────────────────────────────────────
  const patch = useCallback((change: Partial<DevisDraft>) => setDraft((d) => ({ ...d, ...change })), []);

  const loadOffer = useCallback((offerId: string) => {
    setDraft((d) => {
      const offer = offerById.get(offerId);
      if (!offer) return { ...EMPTY_DRAFT, clientId: d.clientId, date: d.date };
      return draftFromOffer(offer, d);
    });
  }, [offerById]);

  const pickOffer = (offerId: string) => {
    if (offerId === (draft.loadedFrom ?? "")) return;
    if (draft.lines.length > 0) { setDialog({ kind: "replace", offerId }); return; }
    loadOffer(offerId);
  };

  const confirmReplace = () => {
    if (dialog?.kind !== "replace") return;
    loadOffer(dialog.offerId);
    setDialog(null);
  };

  const cancelReplace = () => {
    setDialog(null);
    setOfferRowKey((k) => k + 1);
  };

  const pickClient = useCallback((clientId: string) => {
    setDraft((d) => {
      const c = clientId ? clientById.get(clientId) : undefined;
      const next: DevisDraft = { ...d, clientId };
      if (!c) return next;
      if (!d.guestsTouched && c.defaultGuestCount) next.guests = c.defaultGuestCount;
      if (!d.prestationType && c.defaultPrestationType) next.prestationType = c.defaultPrestationType;
      if (d.vatRate === null) {
        const fromPrestation = prestationTypes.find((t) => t.key === next.prestationType)?.defaultVatRate;
        const rate = c.defaultVatRate ?? fromPrestation;
        if (rate !== undefined) next.vatRate = rate;
      }
      return next;
    });
  }, [clientById, prestationTypes]);

  const pickPrestation = (key: string) => {
    setDraft((d) => {
      const next: DevisDraft = { ...d, prestationType: key };
      const rate = prestationTypes.find((t) => t.key === key)?.defaultVatRate;
      if (d.vatRate === null && rate !== undefined) next.vatRate = rate;
      return next;
    });
  };

  const setPricingMode = (mode: string) => {
    setDraft((d) => {
      if (mode === d.pricingMode) return d;
      if (mode === "total") return { ...d, pricingMode: "total", sellingTotal: round2(d.sellingPricePerGuest * d.guests) };
      const perGuest = d.guests > 0 ? round2((d.sellingTotal ?? 0) / d.guests) : d.sellingPricePerGuest;
      return { ...d, pricingMode: "par_convive", sellingPricePerGuest: perGuest, sellingTotal: null };
    });
  };

  const setPrice = (v: number) => {
    const amount = round2(Math.max(0, v));
    setDraft((d) => (d.pricingMode === "total" ? { ...d, sellingTotal: amount } : { ...d, sellingPricePerGuest: amount }));
  };

  const useSuggested = () => {
    setDraft((d) => (d.pricingMode === "total" ? { ...d, sellingTotal: round2(suggested * d.guests) } : { ...d, sellingPricePerGuest: suggested }));
  };

  // One-shot prefill from the Offres and client pages; the params are dropped so a reload restores the draft.
  useEffect(() => {
    if (loading || paramsApplied.current) return;
    paramsApplied.current = true;
    const offre = searchParams.get("offre");
    const clientParam = searchParams.get("client");
    if (!offre && !clientParam) return;
    if (offre && offerById.has(offre)) loadOffer(offre);
    if (clientParam && clientById.has(clientParam)) pickClient(clientParam);
    const next = new URLSearchParams(searchParams);
    next.delete("offre"); next.delete("client");
    setSearchParams(next, { replace: true });
  }, [loading, searchParams, setSearchParams, offerById, clientById, loadOffer, pickClient]);

  // ── Menu ──────────────────────────────────────────────────────────────────
  const appendRecipe = (recipe: Recipe) => {
    setDraft((d) => ({ ...d, lines: [...d.lines, { recipeId: recipe.recipeId, portionsPerGuest: 1, course: recipeCategoryOf(recipe) }] }));
  };

  const onRecipeCreated = (recipe: Recipe) => {
    setRecipes((prev) => [...prev, recipe]);
    appendRecipe(recipe);
    toast({ title: "Recette créée et ajoutée" });
  };

  const focusSearch = () => document.getElementById(SEARCH_ID)?.focus();

  // ── Service, livraison, autres ────────────────────────────────────────────
  const patchRevenue = (idx: number, change: Partial<EventRevenueLine>) => {
    setDraft((d) => ({ ...d, revenueLines: d.revenueLines.map((l, i) => (i === idx ? { ...l, ...change } : l)) }));
  };
  const addRevenueLine = () => {
    const idx = draft.revenueLines.length;
    setDraft((d) => ({ ...d, revenueLines: [...d.revenueLines, { label: "Service", amount: 0, vatRate: 21 }] }));
    setTimeout(() => revenueRefs.current.get(idx)?.querySelector<HTMLElement>("[data-amount] [role=button]")?.click(), 50);
  };
  const removeRevenueLine = (idx: number) => setDraft((d) => ({ ...d, revenueLines: d.revenueLines.filter((_, i) => i !== idx) }));

  // ── Coûts supplémentaires ─────────────────────────────────────────────────
  const patchExtraCost = (idx: number, change: Partial<EventExtraCost>) => {
    setDraft((d) => ({ ...d, extraCosts: d.extraCosts.map((c, i) => (i === idx ? { ...c, ...change } : c)) }));
  };
  const addExtraCost = () => setDraft((d) => ({ ...d, extraCosts: [...d.extraCosts, { label: "Nouveau coût", amount: 0, kind: "autre" }] }));
  const removeExtraCost = (idx: number) => setDraft((d) => ({ ...d, extraCosts: d.extraCosts.filter((_, i) => i !== idx) }));

  // ── Footer actions ────────────────────────────────────────────────────────
  const reset = () => {
    sessionStorage.removeItem(DRAFT_KEY);
    setDraft(startOffer ? draftFromOffer(startOffer, EMPTY_DRAFT) : EMPTY_DRAFT);
    setDialog(null);
  };

  const openSaveOffer = () => {
    setOfferName(startOffer ? `${startOffer.name} · variante` : "Nouvelle offre");
    setDialog({ kind: "saveOffer" });
  };

  const saveAsOffer = async () => {
    const name = offerName.trim();
    if (!name || busy) return;
    const body: CreateOfferRequest = {
      name,
      guestCountRef: Math.max(1, draft.guests),
      lines: draft.lines,
      extraCosts: draft.extraCosts,
      revenueLines: draft.revenueLines,
      pricingMode: draft.pricingMode,
      sellingPricePerGuest: draft.pricingMode === "total" ? quote.pricePerGuest : draft.sellingPricePerGuest,
    };
    if (draft.pricingMode === "total") body.sellingTotal = draft.sellingTotal ?? 0;
    if (draft.prestationType) body.prestationType = draft.prestationType;
    if (draft.vatRate !== null) body.vatRate = draft.vatRate;
    setBusy(true);
    try {
      const created = await api.offers.create(body);
      sessionStorage.removeItem(DRAFT_KEY);
      toast({ title: `Offre « ${created.name} » enregistrée` });
      navigate(`/offres/${created.offerId}`);
    } catch (e) {
      toast({ title: "Erreur lors de l'enregistrement de l'offre", description: errorReason(e) || undefined, variant: "destructive" });
      setBusy(false);
    }
  };

  const openCreate = () => {
    setEventName([startOffer?.name, client?.name].filter(Boolean).join(" · ") || "Nouvel événement");
    setEventDate(draft.date);
    setDialog({ kind: "create" });
  };

  const createEvent = async () => {
    const name = eventName.trim();
    if (!name || !eventDate || busy) return;
    const offerLike: Offer = {
      offerId: draft.loadedFrom ?? "",
      name,
      nameLower: name.toLowerCase(),
      guestCountRef: draft.guests,
      lines: draft.lines,
      extraCosts: draft.extraCosts,
      revenueLines: draft.revenueLines,
      pricingMode: draft.pricingMode,
      sellingPricePerGuest: draft.sellingPricePerGuest,
      createdAt: "",
      updatedAt: "",
    };
    if (draft.pricingMode === "total") offerLike.sellingTotal = draft.sellingTotal ?? 0;
    if (draft.prestationType) offerLike.prestationType = draft.prestationType;
    if (draft.vatRate !== null) offerLike.vatRate = draft.vatRate;
    const body = eventFromOffer(offerLike, {
      name,
      date: eventDate,
      guests: Math.max(1, draft.guests),
      clientId: draft.clientId || undefined,
      notes: startOffer ? `Devis du ${slashDate(todayIso())} depuis ${startOffer.name}` : undefined,
    });
    const input: EventInput = {
      ...body,
      clientId: body.clientId ?? undefined,
      templateId: undefined,
      prestationType: body.prestationType ?? undefined,
      vatRate: body.vatRate ?? undefined,
      offerId: body.offerId || undefined,
    };
    setBusy(true);
    try {
      const created = await api.events.create(input);
      sessionStorage.removeItem(DRAFT_KEY);
      navigate(`/events/${created.eventId}`);
    } catch (e) {
      toast({ title: "Erreur lors de la création de l'événement", description: errorReason(e) || undefined, variant: "destructive" });
      setBusy(false);
    }
  };

  const exportPdf = () => {
    const quoteLines = linesForGuests(draft.lines, draft.guests).map((l, i) => ({ ...l, lineId: String(i) }));
    const groups = groupByCourse(quoteLines, courses, recipeById).map((g) => ({
      course: g.course,
      recipes: g.lines.map((l) => recipeById.get(l.recipeId)?.name ?? "Recette supprimée"),
    }));
    const priced = {
      guestCount: draft.guests,
      pricingMode: draft.pricingMode,
      sellingPricePerGuest: draft.sellingPricePerGuest,
      sellingTotal: draft.sellingTotal ?? undefined,
      revenueLines: draft.revenueLines,
      vatRate: draft.vatRate ?? undefined,
    };
    exportMenuPdf({
      title: client ? `Proposition · ${client.name}` : "Proposition de menu",
      dateLine: draft.date ? `${longDayLabel(draft.date)} ${draft.date.slice(0, 4)}` : undefined,
      guestCount: draft.guests,
      priceLines: pricingLines(priced, prestationLabel),
      groups,
      company: settings?.company?.name,
      fileName: `proposition-${safeFileName(client?.name ?? "menu")}.pdf`,
    });
  };

  if (loading) return <div className="p-8 text-muted-foreground">Chargement…</div>;
  if (loadError) return <div className="p-8 text-muted-foreground">Erreur de chargement</div>;

  const offerOptions = [
    ...activeOffers,
    ...(startOffer && startOffer.archived ? [startOffer] : []),
  ].map((o) => ({ value: o.offerId, label: o.name }));
  const clientOptions = [...clients]
    .sort((a, b) => a.name.localeCompare(b.name, "fr"))
    .map((c) => ({ value: c.clientId, label: c.name, detail: c.kind === "particulier" ? "Particulier" : c.kind === "entreprise" ? "Entreprise" : undefined }));
  const prestationOptions = [{ value: "", label: "Aucune" }, ...prestationTypes.map((t) => ({ value: t.key, label: t.label }))];
  const isTotal = draft.pricingMode === "total";
  const price = isTotal ? draft.sellingTotal ?? 0 : draft.sellingPricePerGuest;
  const marginPctText = `${quote.marginPct.toFixed(1).replace(".", ",")} %`;

  const menuItems = [
    { label: "Enregistrer comme offre", onClick: openSaveOffer },
    { label: "Proposition de menu (PDF)", onClick: exportPdf },
    ...(md ? [] : [{ label: "Réinitialiser", onClick: () => setDialog({ kind: "reset" }) }]),
  ];
  // The other offers first so the dialog preselects one of them; the starting offer stays available.
  const dialogOffers = [...activeOffers.filter((o) => o.offerId !== draft.loadedFrom), ...activeOffers.filter((o) => o.offerId === draft.loadedFrom)];

  const createButton = (className: string, size: "md" | "lg") => (
    <Button variant="primary" size={size} className={className} onClick={openCreate}>Créer l'événement</Button>
  );

  const costSub: ReactNode =
    quote.incompleteRecipes > 0 ? <span className="text-danger">{plural(quote.incompleteRecipes, "recette sans ingrédients", "recettes sans ingrédients")}</span> : undefined;

  return (
    <div className="mx-auto max-w-doc pb-20 md:pb-0">
      <PageHeader
        iconKey="devis"
        title="Devis"
        meta="Un menu et un prix pour un client, à partir d'une offre ou de zéro."
        actions={
          <>
            <Button variant="default" size="md" className="hidden md:inline-flex" onClick={() => setDialog({ kind: "reset" })}>Réinitialiser</Button>
            <ActionMenu items={menuItems} title="Devis" />
            {createButton("hidden md:inline-flex", "md")}
          </>
        }
        properties={
          <PropertyList>
            <Property
              key={`offer-${draft.loadedFrom ?? ""}-${offerRowKey}`}
              icon="📋"
              label="Offre de départ"
              kind="relation"
              value={draft.loadedFrom ?? ""}
              options={offerOptions}
              href={(oid) => `/offres/${oid}`}
              allowEmpty
              placeholder="Sans offre"
              onSave={pickOffer}
            />
            {clientsConfigured ? (
              <Property
                icon={Building2}
                label="Client"
                kind="relation"
                value={draft.clientId}
                options={clientOptions}
                href={(cid) => `/clients/${cid}`}
                allowEmpty
                placeholder="Aucun client"
                createLabel="+ Nouveau client"
                onCreateNew={(q) => setNewClient({ name: q })}
                onSave={pickClient}
                sub={
                  <button type="button" onClick={() => setNewClient({ name: "" })} className="whitespace-nowrap rounded px-1 text-primary hover:underline touch:min-h-11">
                    + Nouveau client
                  </button>
                }
              />
            ) : (
              <Property icon={Building2} label="Client" kind="computed" value={<Link to="/settings#societe" className="text-primary hover:underline">Clients non configurés</Link>} />
            )}
            <Property
              icon={Users}
              label="Convives"
              kind="number"
              value={draft.guests}
              min={1}
              decimals={0}
              onSave={(v) => patch({ guests: Math.max(1, Math.round(v)), guestsTouched: true })}
            />
            <Property icon="🍽" label="Prestation" kind="select" value={draft.prestationType} options={prestationOptions} colour="gray" onSave={pickPrestation} />
            <Property
              icon="🧾"
              label="TVA"
              kind="select"
              value={draft.vatRate === null ? "" : String(draft.vatRate)}
              options={VAT_OPTIONS}
              colour="gray"
              placeholder="Choisir un taux"
              onSave={(v) => patch({ vatRate: Number(v) as VatRate })}
            />
            <Property
              icon={Calendar}
              label="Date"
              kind="date"
              value={draft.date}
              format={longDayLabel}
              placeholder="Choisir une date"
              sub="facultatif, repris à la création"
              onSave={(iso) => patch({ date: iso })}
            />
          </PropertyList>
        }
      />

      <Section
        title="Menu"
        meta={draft.lines.length > 0 ? plural(draft.lines.length, "recette") : undefined}
        action={<Button variant="ghost" size="sm" icon={<Plus />} onClick={focusSearch}>Ajouter une recette</Button>}
      >
        <OfferMenu
          lines={draft.lines}
          courses={courses}
          recipes={recipes}
          guests={draft.guests}
          recipeCostById={recipeCostById}
          recipePortionsById={recipePortionsById}
          onChange={(lines) => patch({ lines })}
          onCreateRecipe={(name, category) => setNewRecipe({ name, category })}
          onAddFromOffer={() => setAddFromOffer(true)}
          empty={<p className="mb-3 text-sm text-muted-foreground touch:text-base">Aucune recette. Partez d'une offre ou ajoutez des recettes.</p>}
          searchId={SEARCH_ID}
        />
      </Section>

      <Section
        title="Service, livraison, autres"
        meta={draft.revenueLines.length > 0 ? fmtEur(quote.linesHtva) : undefined}
        action={<Button variant="ghost" size="sm" icon={<Plus />} onClick={addRevenueLine}>Ajouter</Button>}
      >
        {draft.revenueLines.length === 0 ? (
          <p className="text-sm text-muted-foreground touch:text-base">Aucun supplément. Service, livraison ou autres, facturés en plus du prix food, TVA 21 % par défaut.</p>
        ) : (
          <div>
            <datalist id={LABELS_LIST_ID}>
              {REVENUE_LABELS.map((l) => <option key={l} value={l} />)}
            </datalist>
            {draft.revenueLines.map((line, i) => (
              <div
                key={i}
                ref={(el) => { if (el) revenueRefs.current.set(i, el); else revenueRefs.current.delete(i); }}
                className={ROW}
              >
                <span className="min-w-0 flex-1 text-sm touch:text-base">
                  <RevenueLabel value={line.label} onSave={(v) => { if (v.trim()) patchRevenue(i, { label: v.trim() }); }} />
                </span>
                <span data-amount className="w-24 text-right text-sm tabular-nums touch:text-base">
                  <EditableInlineNum value={line.amount} min={0} suffix=" €" onSave={(v) => patchRevenue(i, { amount: round2(Math.max(0, v)) })} />
                </span>
                <SelectPill
                  value={String(line.vatRate)}
                  options={VAT_OPTIONS}
                  colour="gray"
                  align="right"
                  aria-label="Taux de TVA"
                  title="Taux de TVA"
                  onChange={(v) => patchRevenue(i, { vatRate: Number(v) as VatRate })}
                />
                {isTouch ? (
                  <ActionMenu items={[{ label: "Retirer", variant: "danger", onClick: () => removeRevenueLine(i) }]} title={line.label} />
                ) : (
                  <IconButton size="sm" aria-label="Retirer cette ligne" onClick={() => removeRevenueLine(i)} icon={<X />} className="reveal" />
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Coûts supplémentaires"
        meta={draft.extraCosts.length > 0 ? fmtEur(sumExtraCosts(draft.extraCosts)) : undefined}
        action={<Button variant="ghost" size="sm" icon={<Plus />} onClick={addExtraCost}>Ajouter</Button>}
      >
        {draft.extraCosts.length === 0 ? (
          <p className="text-sm text-muted-foreground touch:text-base">Aucun coût supplémentaire.</p>
        ) : (
          <div>
            {draft.extraCosts.map((ec, i) => (
              <div key={i} className={ROW}>
                <span className="min-w-0 flex-1 text-sm touch:text-base">
                  <EditableInlineText value={ec.label} onSave={(v) => { if (v.trim()) patchExtraCost(i, { label: v.trim() }); }} />
                </span>
                <SelectPill
                  value={ec.kind ?? "autre"}
                  options={EXTRA_KINDS}
                  colour="gray"
                  align="right"
                  aria-label="Nature du coût"
                  title="Nature du coût"
                  onChange={(v) => patchExtraCost(i, { kind: v as ExtraCostKind })}
                />
                <span className="w-24 text-right text-sm tabular-nums touch:text-base">
                  <EditableInlineNum value={ec.amount} min={0} onSave={(v) => patchExtraCost(i, { amount: round2(Math.max(0, v)) })} suffix=" €" />
                </span>
                {isTouch ? (
                  <ActionMenu items={[{ label: "Retirer", variant: "danger", onClick: () => removeExtraCost(i) }]} title={ec.label} />
                ) : (
                  <IconButton size="sm" aria-label="Retirer ce coût" onClick={() => removeExtraCost(i)} icon={<X />} className="reveal" />
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Prix">
        <div className="grid grid-cols-2 overflow-hidden rounded-lg bg-surface md:divide-x md:divide-border">
          <MoneyTile flat label="Coût matières / conv." value={fmtEur(quote.costPerGuest)} sub={costSub} />
          <MoneyTile
            flat
            label="Prix suggéré / conv."
            value={fmtEur(suggested)}
            sub={
              <>
                matières à {pctText} du prix
                {!objectiveSet && (
                  <>
                    {" · "}
                    <Link to="/settings#finances" className="text-primary hover:underline">Objectif</Link>
                  </>
                )}
              </>
            }
          />
        </div>

        <PropertyList>
          <Property icon={Euro} label="Prix proposé" kind="custom" sub={isTotal ? `soit ${fmtEur(quote.pricePerGuest)} / convive` : undefined}>
            <div className="flex flex-wrap items-center gap-1">
              <SelectPill
                value={draft.pricingMode}
                options={PRICING_OPTIONS}
                colour="gray"
                aria-label="Mode de prix"
                title="En total food, le prix ne change pas quand les convives changent."
                onChange={setPricingMode}
              />
              <EditableInlineNum value={price} min={0} suffix=" €" onSave={setPrice} />
              <span className="text-sm text-muted-foreground">HTVA</span>
            </div>
          </Property>
        </PropertyList>
        <div className="pl-[10.5rem]">
          <button
            type="button"
            onClick={useSuggested}
            className="-mx-1 rounded px-1 text-left text-sm text-primary hover:underline touch:min-h-11 touch:text-base"
          >
            Reprendre le prix suggéré
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 overflow-hidden rounded-lg bg-surface md:grid-cols-4 md:divide-x md:divide-border">
          <MoneyTile flat label="Marge / conv." value={fmtEur(quote.marginPerGuest)} />
          <MoneyTile flat label="Marge %" value={<span className={quote.marginPct < 0 ? "text-danger" : undefined}>{marginPctText}</span>} />
          <MoneyTile flat label="Total HTVA" value={fmtEur(quote.totalHtva)} />
          <MoneyTile flat label="Total TVAC" value={fmtEur(quote.totalTvac)} />
        </div>
      </Section>

      <div className="mt-block flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="default" size="md" onClick={openSaveOffer}>Enregistrer comme offre</Button>
          <Button variant="ghost" size="md" onClick={exportPdf}>Proposition de menu (PDF)</Button>
        </div>
        {createButton("hidden md:inline-flex", "md")}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 bg-background p-3 shadow-[0_-1px_0_0_var(--border)] md:hidden">
        {createButton("flex-1", "lg")}
      </div>

      <AddFromOfferDialog
        open={addFromOffer}
        onClose={() => setAddFromOffer(false)}
        offers={dialogOffers}
        recipeById={recipeById}
        onAdd={(added) => setDraft((d) => ({ ...d, lines: mergeOfferLines(d.lines, added) }))}
      />

      <NewRecipeDialog
        open={newRecipe !== null}
        onClose={() => setNewRecipe(null)}
        initial={newRecipe ?? { name: "" }}
        categories={courses}
        existing={recipes}
        defaultPortions={Math.max(1, draft.guests)}
        onCreated={onRecipeCreated}
        onUseExisting={(rid) => { const r = recipeById.get(rid); if (r) appendRecipe(r); }}
      />

      {clientsConfigured && (
        <NewClientDialog
          open={newClient !== null}
          onClose={() => setNewClient(null)}
          initial={{ name: newClient?.name, kind: "particulier" }}
          existing={clients}
          onCreated={(c) => { setClients((prev) => [...prev, c]); setDraft((d) => ({ ...d, clientId: c.clientId })); }}
          onLinkExisting={(cid) => pickClient(cid)}
        />
      )}

      <Dialog
        open={dialog?.kind === "replace"}
        onClose={cancelReplace}
        title="Remplacer le devis en cours ?"
        size="sm"
        footer={<DialogActions onCancel={cancelReplace} onConfirm={confirmReplace} confirmLabel="Remplacer" />}
      >
        <p className="text-muted-foreground">
          {dialog?.kind === "replace" && dialog.offerId
            ? `Le menu, le prix et les suppléments de « ${offerById.get(dialog.offerId)?.name ?? "l'offre"} » remplacent le devis en cours.`
            : "Le menu, le prix et les suppléments en cours sont effacés."}
        </p>
      </Dialog>

      <Dialog
        open={dialog?.kind === "reset"}
        onClose={() => setDialog(null)}
        title="Réinitialiser le devis ?"
        size="sm"
        footer={<DialogActions onCancel={() => setDialog(null)} onConfirm={reset} confirmLabel="Réinitialiser" />}
      >
        <p className="text-muted-foreground">
          {startOffer ? `Le devis repart de « ${startOffer.name} ».` : "Le devis repart de zéro."}
        </p>
      </Dialog>

      <Dialog
        open={dialog?.kind === "saveOffer"}
        onClose={() => setDialog(null)}
        title="Enregistrer comme offre"
        size="sm"
        footer={<DialogActions onCancel={() => setDialog(null)} onConfirm={saveAsOffer} confirmLabel="Enregistrer" busy={busy || !offerName.trim()} />}
      >
        <form id="devis-save-offer" onSubmit={(e) => { e.preventDefault(); saveAsOffer(); }}>
          <FieldLabel htmlFor="devis-offer-name">Nom de l'offre</FieldLabel>
          <input id="devis-offer-name" className="input-field" autoFocus value={offerName} onChange={(e) => setOfferName(e.target.value)} />
        </form>
      </Dialog>

      <Dialog
        open={dialog?.kind === "create"}
        onClose={() => setDialog(null)}
        title="Créer l'événement"
        size="sm"
        footer={<DialogActions onCancel={() => setDialog(null)} onConfirm={createEvent} confirmLabel="Créer" busy={busy || !eventName.trim() || !eventDate} />}
      >
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); createEvent(); }}>
          <div>
            <FieldLabel htmlFor="devis-event-name">Nom</FieldLabel>
            <input id="devis-event-name" className="input-field" autoFocus value={eventName} onChange={(e) => setEventName(e.target.value)} />
          </div>
          <div>
            <FieldLabel htmlFor="devis-event-date">Date</FieldLabel>
            <input id="devis-event-date" type="date" required className="input-field" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          </div>
          <p className="text-caption text-muted-foreground">Le menu, le prix et les suppléments sont repris. Les tâches et l'équipe se complètent sur l'événement.</p>
        </form>
      </Dialog>
    </div>
  );
}

const INLINE_INPUT = "-mx-1 w-32 rounded border-0 bg-input-bg px-1 font-medium shadow-ring outline-none";

// EditableInlineText with the « Service », « Livraison », « Autres » suggestions.
function RevenueLabel({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  useEffect(() => { if (!editing) setText(value); }, [value, editing]);
  const commit = () => { setEditing(false); if (text !== value) onSave(text); };
  if (editing) {
    return (
      <input
        className={INLINE_INPUT}
        list={LABELS_LIST_ID}
        value={text}
        aria-label="Intitulé"
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
      {value || <span className="font-normal text-placeholder">Intitulé</span>}
    </strong>
  );
}

function DialogActions({ onCancel, onConfirm, confirmLabel, busy }: { onCancel: () => void; onConfirm: () => void; confirmLabel: string; busy?: boolean }) {
  return (
    <>
      <Button variant="default" size="md" onClick={onCancel}>Annuler</Button>
      <Button variant="primary" size="md" onClick={onConfirm} disabled={busy}>{confirmLabel}</Button>
    </>
  );
}
