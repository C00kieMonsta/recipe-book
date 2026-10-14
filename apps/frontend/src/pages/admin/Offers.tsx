import { useEffect, useMemo, useState, type FormEvent, type MouseEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowUpDown, Plus, Search, X } from "lucide-react";
import type { AppEvent, AppSettings, CreateOfferRequest, Ingredient, Offer, Recipe } from "@packages/types";
import { DEFAULT_PRESTATION_TYPES, calcRecipeCost, fmtEur, offerFromEvent, offerSummary } from "@packages/types";
import { api, errorReason, invalidate } from "@/lib/api";
import { dayMonthShortLabel } from "@/lib/dates";
import { plural } from "@/lib/use-planning-data";
import { useToast } from "@/hooks/use-toast";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useTopTitle } from "@/components/admin/AdminLayout";
import {
  ActionMenu,
  Button,
  Dialog,
  EmptyState,
  FieldLabel,
  IconButton,
  Menu,
  MenuRadio,
  PageHeader,
  SearchSelect,
  Table,
  Tag,
  Toolbar,
  ViewTabs,
  useMenu,
} from "@/components/ui";

type Tab = "active" | "archived";
type Sort = "name" | "price" | "margin";

const TABS: { key: Tab; label: string }[] = [
  { key: "active", label: "Actives" },
  { key: "archived", label: "Archivées" },
];

const EMPTY_SENTENCE = "Aucune offre type. Une offre est un menu avec son prix par convive, à partir duquel vous faites un devis.";

// « 69,0 % »
export function fmtPct(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return `${v.toFixed(1).replace(".", ",")} %`;
}

// The create body of a copy: the offer's own fields without the server-owned ones.
export function duplicateOfferPayload(offer: Offer): CreateOfferRequest {
  const body: CreateOfferRequest = {
    name: `${offer.name} (copie)`,
    guestCountRef: offer.guestCountRef,
    lines: offer.lines.map((l) => ({ ...l })),
    extraCosts: offer.extraCosts.map((c) => ({ ...c })),
    revenueLines: offer.revenueLines.map((l) => ({ ...l })),
    pricingMode: offer.pricingMode ?? "par_convive",
    sellingPricePerGuest: offer.sellingPricePerGuest,
  };
  if (body.pricingMode === "total") body.sellingTotal = offer.sellingTotal ?? 0;
  if (offer.prestationType) body.prestationType = offer.prestationType;
  if (offer.vatRate !== undefined) body.vatRate = offer.vatRate;
  if (offer.notes) body.notes = offer.notes;
  return body;
}

export interface FromEventDialogProps {
  open: boolean;
  onClose: () => void;
  // create: picks an event and names the offer; replace: picks an event only.
  mode: "create" | "replace";
  onPick: (event: AppEvent, name: string) => void | Promise<void>;
}

// The event picker of spec 6.3, shared by « Depuis un événement… » and « Remplacer le menu depuis un événement… ».
export function FromEventDialog({ open, onClose, mode, onPick }: FromEventDialogProps) {
  const { toast } = useToast();
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [eventId, setEventId] = useState("");
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEventId("");
    setName("");
    setNameTouched(false);
    setBusy(false);
    api.events.list().then(setEvents).catch(() => toast({ title: "Erreur de chargement", variant: "destructive" }));
  }, [open]);

  const options = useMemo(
    () => [...events]
      .sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name, "fr"))
      .map((e) => ({ value: e.eventId, label: e.name, detail: `${dayMonthShortLabel(e.date)} ${e.date.slice(0, 4)}` })),
    [events],
  );
  const event = events.find((e) => e.eventId === eventId);
  const trimmed = name.trim();
  const ready = Boolean(event) && (mode === "replace" || trimmed.length > 0);

  const pick = (id: string) => {
    setEventId(id);
    const ev = events.find((e) => e.eventId === id);
    if (ev && !nameTouched) setName(ev.name);
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!event || !ready || busy) return;
    setBusy(true);
    try {
      await onPick(event, trimmed);
      onClose();
    } catch {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title={mode === "create" ? "Créer une offre depuis un événement" : "Remplacer le menu depuis un événement"}
      footer={
        <>
          <Button variant="default" onClick={onClose}>Annuler</Button>
          <Button variant="primary" type="submit" form="from-event-form" disabled={!ready || busy}>
            {mode === "create" ? "Créer l'offre" : "Remplacer"}
          </Button>
        </>
      }
    >
      <form id="from-event-form" onSubmit={submit} className="flex flex-col gap-3">
        <div>
          <FieldLabel htmlFor="from-event-event">Événement</FieldLabel>
          <SearchSelect id="from-event-event" options={options} value={eventId} onChange={pick} placeholder="Rechercher un événement…" autoFocus />
        </div>
        {mode === "create" && (
          <div>
            <FieldLabel htmlFor="from-event-name">Nom de l'offre</FieldLabel>
            <input id="from-event-name" className="input-field" value={name} onChange={(e) => { setName(e.target.value); setNameTouched(true); }} />
          </div>
        )}
      </form>
    </Dialog>
  );
}

export interface DeleteOfferDialogProps {
  offer: Offer | null;
  onClose: () => void;
  onDeleted: (offer: Offer) => void;
}

export function DeleteOfferDialog({ offer, onClose, onDeleted }: DeleteOfferDialogProps) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (offer) setBusy(false); }, [offer]);

  const confirm = async () => {
    if (!offer || busy) return;
    setBusy(true);
    try {
      await api.offers.delete(offer.offerId);
      toast({ title: "Offre supprimée" });
      onDeleted(offer);
      onClose();
    } catch (e) {
      toast({ title: "Erreur lors de la suppression", description: errorReason(e) || undefined, variant: "destructive" });
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={offer !== null}
      onClose={onClose}
      size="sm"
      title={<span className="whitespace-normal">Supprimer « {offer?.name ?? ""} » ?</span>}
      footer={
        <>
          <Button variant="default" onClick={onClose}>Annuler</Button>
          <Button variant="danger" onClick={confirm} disabled={busy}>Supprimer</Button>
        </>
      }
    >
      <p className="text-caption text-muted-foreground">Les événements créés depuis cette offre ne changent pas.</p>
    </Dialog>
  );
}

interface OfferRow {
  offer: Offer;
  prestation?: string;
  summary: ReturnType<typeof offerSummary>;
}

// Rendered once per toolbar slot, so each copy owns its menu state.
function SortMenu({ value, onChange }: { value: Sort; onChange: (s: Sort) => void }) {
  const menu = useMenu();
  return (
    <div ref={menu.ref} className="relative inline-flex">
      <Button variant="subtle" size="sm" icon={<ArrowUpDown />} onClick={menu.toggle} aria-haspopup="menu" aria-expanded={menu.open}>
        Trier
      </Button>
      <Menu {...menu.props} align="right" title="Trier">
        <MenuRadio checked={value === "name"} onSelect={() => onChange("name")}>Nom</MenuRadio>
        <MenuRadio checked={value === "price"} onSelect={() => onChange("price")}>Prix</MenuRadio>
        <MenuRadio checked={value === "margin"} onSelect={() => onChange("margin")}>Marge %</MenuRadio>
      </Menu>
    </div>
  );
}

const stop = (e: MouseEvent) => e.stopPropagation();

export default function Offers() {
  useTopTitle("Offres");
  const navigate = useNavigate();
  const { toast } = useToast();

  const [offers, setOffers] = useState<Offer[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [tab, setTab] = useState<Tab>("active");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [sort, setSort] = useState<Sort>("name");
  const [fromEvent, setFromEvent] = useState(false);
  const [deleting, setDeleting] = useState<Offer | null>(null);
  const [busy, setBusy] = useState(false);
  // Under md the « Devis » button leaves the header for the ⋯ menu.
  const narrow = useMediaQuery("(max-width: 767px)");

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.offers.list(), api.recipes.list(), api.ingredients.list(), api.settings.get()])
      .then(([ofs, recs, ings, se]) => {
        if (cancelled) return;
        setOffers(ofs); setRecipes(recs); setIngredients(ings); setSettings(se);
      })
      .catch(() => { if (!cancelled) { setLoadError(true); toast({ title: "Erreur de chargement", variant: "destructive" }); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.recipeId, r])), [recipes]);
  const ingredientById = useMemo(() => new Map(ingredients.map((i) => [i.ingredientId, i])), [ingredients]);
  const recipeCostById = useMemo(() => new Map(recipes.map((r) => [r.recipeId, calcRecipeCost(r, ingredientById)])), [recipes, ingredientById]);
  const recipePortionsById = useMemo(() => new Map(recipes.map((r) => [r.recipeId, r.portions || 1])), [recipes]);
  const prestationTypes = settings?.prestationTypes?.length ? settings.prestationTypes : DEFAULT_PRESTATION_TYPES;
  const prestationLabel = useMemo(() => new Map(prestationTypes.map((p) => [p.key, p.label])), [prestationTypes]);

  const rows = useMemo<OfferRow[]>(() => {
    const q = search.trim().toLowerCase();
    const list = offers
      .filter((o) => (tab === "archived" ? o.archived === true : !o.archived))
      .filter((o) => !q || o.name.toLowerCase().includes(q))
      .map((o) => ({
        offer: o,
        prestation: o.prestationType ? prestationLabel.get(o.prestationType) ?? o.prestationType : undefined,
        summary: offerSummary(o, recipeCostById, recipePortionsById, recipeById),
      }));
    list.sort((a, b) => {
      if (sort === "price") return b.summary.pricePerGuest - a.summary.pricePerGuest || a.offer.name.localeCompare(b.offer.name, "fr");
      if (sort === "margin") return b.summary.marginPct - a.summary.marginPct || a.offer.name.localeCompare(b.offer.name, "fr");
      return a.offer.name.localeCompare(b.offer.name, "fr");
    });
    return list;
  }, [offers, tab, search, sort, prestationLabel, recipeCostById, recipePortionsById, recipeById]);

  const reload = () => {
    invalidate("offers");
    api.offers.list().then(setOffers).catch(() => undefined);
  };

  const createNew = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const created = await api.offers.create({ name: "Nouvelle offre", guestCountRef: 20, pricingMode: "par_convive", sellingPricePerGuest: 0, lines: [], extraCosts: [], revenueLines: [] });
      navigate(`/offres/${created.offerId}`);
    } catch (e) {
      toast({ title: "Erreur lors de la création de l'offre", description: errorReason(e) || undefined, variant: "destructive" });
      setBusy(false);
    }
  };

  const createFromEvent = async (event: AppEvent, name: string) => {
    try {
      const created = await api.offers.create(offerFromEvent(event, name));
      navigate(`/offres/${created.offerId}`);
    } catch (e) {
      toast({ title: "Erreur lors de la création de l'offre", description: errorReason(e) || undefined, variant: "destructive" });
      throw e;
    }
  };

  const duplicate = async (offer: Offer) => {
    try {
      const created = await api.offers.create(duplicateOfferPayload(offer));
      navigate(`/offres/${created.offerId}`);
    } catch (e) {
      toast({ title: "Erreur lors de la duplication", description: errorReason(e) || undefined, variant: "destructive" });
    }
  };

  const setArchived = async (offer: Offer, archived: boolean) => {
    try {
      const updated = await api.offers.update(offer.offerId, { archived });
      setOffers((prev) => prev.map((o) => (o.offerId === updated.offerId ? updated : o)));
      toast({ title: archived ? "Offre archivée" : "Offre réactivée" });
    } catch (e) {
      toast({ title: "Erreur lors de la sauvegarde", description: errorReason(e) || undefined, variant: "destructive" });
      reload();
    }
  };

  if (loading) return <div className="p-8 text-muted-foreground">Chargement…</div>;
  if (loadError) return <div className="p-8 text-muted-foreground">Erreur de chargement.</div>;

  const searchField = (
    <input
      className="input-field input-compact w-[220px] touch:w-full"
      placeholder="Rechercher une offre…"
      value={search}
      autoFocus
      onChange={(e) => setSearch(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Escape") { setSearch(""); setSearchOpen(false); } }}
      onBlur={() => { if (!search) setSearchOpen(false); }}
    />
  );

  const rowMenu = (offer: Offer) => (
    <span onClick={stop} className="inline-flex pointer:opacity-0 pointer:focus-within:opacity-100 pointer:[tr:hover_&]:opacity-100">
      <ActionMenu
        title={offer.name}
        items={[
          { label: "Faire un devis", onClick: () => navigate(`/devis?offre=${offer.offerId}`) },
          { label: "Dupliquer", onClick: () => { void duplicate(offer); } },
          offer.archived
            ? { label: "Réactiver", onClick: () => { void setArchived(offer, false); } }
            : { label: "Archiver", onClick: () => { void setArchived(offer, true); } },
          { kind: "separator" },
          { label: "Supprimer", variant: "danger", onClick: () => setDeleting(offer) },
        ]}
      />
    </span>
  );

  const tableEmpty = search.trim()
    ? "Aucun résultat"
    : tab === "archived"
      ? "Aucune offre archivée."
      : "Aucune offre active.";

  return (
    <div className="mx-auto max-w-wide">
      <PageHeader
        iconKey="offres"
        title="Offres"
        meta={plural(offers.length, "offre")}
        actions={
          <>
            <Button as={Link} to="/devis" variant="default" size="md" className="hidden md:inline-flex">Devis</Button>
            <ActionMenu
              title="Offres"
              items={[
                ...(narrow ? [{ label: "Devis", onClick: () => navigate("/devis") }, { kind: "separator" as const }] : []),
                { label: "Depuis un événement…", onClick: () => setFromEvent(true) },
              ]}
            />
            <Button variant="primary" size="lg" icon={<Plus />} onClick={createNew} disabled={busy}>
              <span className="hidden sm:inline">Nouvelle offre</span><span className="sm:hidden">Nouvelle</span>
            </Button>
          </>
        }
      />

      {offers.length === 0 ? (
        <div data-tour="offers-list" className="flex flex-col items-center gap-2 py-10 text-center">
          <p className="max-w-md text-sm text-muted-foreground touch:text-base">{EMPTY_SENTENCE}</p>
          <div className="flex flex-wrap items-center justify-center gap-1">
            <Button variant="link" size="sm" onClick={createNew} disabled={busy}>+ Nouvelle offre</Button>
            <Button variant="link" size="sm" onClick={() => setFromEvent(true)}>Depuis un événement…</Button>
          </div>
        </div>
      ) : (
        <div data-tour="offers-list">
          <Toolbar
            left={<ViewTabs items={TABS} value={tab} onChange={(k) => setTab(k as Tab)} aria-label="Offres" />}
            right={
              <>
                {searchOpen ? searchField : <IconButton size="sm" aria-label="Rechercher" icon={<Search />} onClick={() => setSearchOpen(true)} />}
                <SortMenu value={sort} onChange={setSort} />
              </>
            }
            rightTouch={
              <>
                <IconButton size="sm" aria-label="Rechercher" icon={<Search />} onClick={() => setSearchOpen((o) => !o)} className={searchOpen ? "bg-active" : ""} />
                <SortMenu value={sort} onChange={setSort} />
              </>
            }
          />
          {searchOpen && (
            <div className="hidden items-center gap-1 py-2 touch:flex">
              {searchField}
              <IconButton size="sm" aria-label="Fermer la recherche" icon={<X />} onClick={() => { setSearch(""); setSearchOpen(false); }} />
            </div>
          )}

          <div className="mt-2">
            <Table<OfferRow>
              rows={rows}
              rowKey={(r) => r.offer.offerId}
              rowHref={(r) => `/offres/${r.offer.offerId}`}
              empty={<EmptyState message={tableEmpty} />}
              columns={[
                { key: "name", label: "Nom", render: (r) => <span className="font-medium">{r.offer.name}</span> },
                { key: "prestation", label: "Prestation", render: (r) => (r.prestation ? <Tag colour="gray">{r.prestation}</Tag> : "") },
                {
                  key: "recipes",
                  label: "Recettes",
                  width: "90px",
                  align: "right",
                  render: (r) => (
                    <>
                      <span className="md:hidden">{plural(r.offer.lines.length, "recette")}</span>
                      <span className="hidden md:inline">{r.offer.lines.length}</span>
                    </>
                  ),
                },
                {
                  key: "price",
                  label: "Prix / conv.",
                  width: "120px",
                  align: "right",
                  trailing: true,
                  render: (r) => (
                    <span className="text-foreground">
                      {fmtEur(r.summary.pricePerGuest)}
                      {r.offer.pricingMode === "total" && <span className="text-muted-foreground"> total</span>}
                    </span>
                  ),
                },
                { key: "cost", label: "Coût / conv.", width: "120px", align: "right", render: (r) => fmtEur(r.summary.costPerGuest) },
                {
                  key: "margin",
                  label: "Marge %",
                  width: "100px",
                  align: "right",
                  render: (r) => (
                    <>
                      <span className={r.summary.marginPct < 0 ? "text-danger" : undefined}>{fmtPct(r.summary.marginPct)}</span>
                      {r.summary.incompleteRecipes > 0 && (
                        <span className="ml-1 font-medium text-danger" title={`${plural(r.summary.incompleteRecipes, "recette")} sans ingrédients`}>!</span>
                      )}
                    </>
                  ),
                },
                { key: "actions", label: "", width: "40px", align: "right", render: (r) => rowMenu(r.offer) },
              ]}
            />
          </div>
        </div>
      )}

      <FromEventDialog open={fromEvent} onClose={() => setFromEvent(false)} mode="create" onPick={createFromEvent} />
      <DeleteOfferDialog offer={deleting} onClose={() => setDeleting(null)} onDeleted={(o) => setOffers((prev) => prev.filter((x) => x.offerId !== o.offerId))} />
    </div>
  );
}
