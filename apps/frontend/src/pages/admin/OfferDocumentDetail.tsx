import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Plus, X } from "lucide-react";
import type {
  AppSettings,
  DocRow,
  DocSection,
  DocServices,
  DocVatLine,
  Ingredient,
  Offer,
  OfferDocument,
  Recipe,
  UpdateOfferDocumentRequest,
  VatRate,
} from "@packages/types";
import {
  DEFAULT_BRAND_ACCENT,
  DEFAULT_COURSES,
  DEFAULT_DOC_CONDITIONS,
  DEFAULT_PRESTATION_TYPES,
  DEFAULT_SECTION_UNIT_LABEL,
  DOC_SERVICES_TITLES,
  DOC_VAT_LABELS,
  VAT_RATES,
  calcRecipeCost,
  foodVatRateOf,
  guestsFact,
  offerSummary,
  sectionFromOffer,
} from "@packages/types";
import { api, ApiError, errorReason, invalidate } from "@/lib/api";
import { plural } from "@/lib/use-planning-data";
import { useToast } from "@/hooks/use-toast";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useBackLink, useTopTitle } from "@/components/admin/AdminLayout";
import DocSectionBlock, { type SectionCosting, type SectionOfferState } from "@/components/admin/DocSectionBlock";
import { DocRows, InlineText, newDocId, type RecipeOption, type SectionOption } from "@/components/admin/DocRow";
import DocumentPreviewDialog from "@/components/admin/DocumentPreviewDialog";
import NewRecipeDialog from "@/components/admin/NewRecipeDialog";
import UseInEventDialog from "@/components/admin/UseInEventDialog";
import {
  ActionMenu,
  Button,
  Callout,
  Dialog,
  EditableText,
  FieldLabel,
  IconButton,
  Menu,
  MenuItem,
  PageHeader,
  Property,
  PropertyList,
  SearchSelect,
  Section,
  SelectPill,
  Tag,
  useMenu,
} from "@/components/ui";
import { DeleteDocumentDialog, DuplicateDocumentDialog, SEASON_LABELS, buildDocumentPdf, documentLabel, loadBrandImages } from "./OfferDocuments";

const NONE = "__none__";
const SAVE_DELAY = 300;
const VAT_LABELS_ID = "document-vat-labels";
const DEFAULT_GUESTS = 20;
const OTHER = "__other";

const SEASON_OPTIONS = [
  ...(Object.keys(SEASON_LABELS) as (keyof typeof SEASON_LABELS)[]).map((k) => ({ value: k, label: SEASON_LABELS[k] })),
  { value: NONE, label: "Aucune" },
];
const VAT_OPTIONS = VAT_RATES.map((r) => ({ value: String(r), label: `${r} %` }));
const ROW = "group flex min-h-9 items-center gap-2 rounded px-1 hover:bg-hover touch:min-h-11";

function parseVat(v: string): VatRate | undefined {
  const n = Number(v);
  return (VAT_RATES as readonly number[]).includes(n) ? (n as VatRate) : undefined;
}

// The local copy of a patch: null removes the field.
function applyPatch(prev: OfferDocument, patch: UpdateOfferDocumentRequest): OfferDocument {
  const next: Record<string, unknown> = { ...prev };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (value === null) delete next[key];
    else next[key] = value;
  }
  return next as unknown as OfferDocument;
}

function withoutUndefined<T extends object>(o: T): T {
  const next = { ...o } as Record<string, unknown>;
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
  return next as T;
}

// Click-to-edit whole number; empty shows a dash.
function InlineCount({ value, onSave, readOnly, label }: { value?: number; onSave: (v: number | undefined) => void; readOnly?: boolean; label: string }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value === undefined ? "" : String(value));
  useEffect(() => { if (!editing) setText(value === undefined ? "" : String(value)); }, [value, editing]);
  const commit = () => {
    setEditing(false);
    const t = text.trim();
    if (t === "") { if (value !== undefined) onSave(undefined); return; }
    const n = Math.round(Number(t));
    if (!Number.isFinite(n) || n < 1) return;
    if (n !== value) onSave(n);
  };
  if (readOnly) return <span className="tabular-nums">{value ?? "—"}</span>;
  if (editing) {
    return (
      <input
        className="-mx-1 w-14 rounded border-0 bg-input-bg px-1 text-right font-medium tabular-nums shadow-ring outline-none"
        inputMode="numeric"
        aria-label={label}
        value={text}
        onChange={(e) => { if (/^\d*$/.test(e.target.value)) setText(e.target.value); }}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { e.preventDefault(); setText(value === undefined ? "" : String(value)); setEditing(false); }
        }}
        autoFocus
      />
    );
  }
  return (
    <strong
      role="button"
      tabIndex={0}
      aria-label={label}
      className="prop-value font-medium tabular-nums touch:inline-flex touch:min-h-11 touch:items-center"
      onClick={() => setEditing(true)}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setEditing(true); } }}
    >
      {value ?? <span className="font-normal text-placeholder">—</span>}
    </strong>
  );
}

// EditableInlineText with a datalist of the usual labels.
function InlineLabel({ value, onSave, list, readOnly }: { value: string; onSave: (v: string) => void; list: string; readOnly?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  useEffect(() => { if (!editing) setText(value); }, [value, editing]);
  const commit = () => { setEditing(false); if (text !== value) onSave(text); };
  if (readOnly) return <span className="font-medium">{value}</span>;
  if (editing) {
    return (
      <input
        className="-mx-1 w-48 max-w-full rounded border-0 bg-input-bg px-1 font-medium shadow-ring outline-none"
        list={list}
        value={text}
        aria-label="Libellé"
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

// The services title over DOC_SERVICES_TITLES plus « Autre… » typed inline.
function ServicesTitle({ value, onChange, readOnly }: { value: string; onChange: (v: string) => void; readOnly?: boolean }) {
  const [custom, setCustom] = useState(false);
  if (readOnly) return <span className="text-sm font-semibold touch:text-base">{value}</span>;
  if (custom) {
    return (
      <InlineText
        value={value}
        focused
        placeholder="Titre du bloc"
        aria-label="Titre des services"
        className="text-sm font-semibold touch:text-base"
        onSave={(v) => { const t = v.trim(); if (t) onChange(t); }}
        onEditEnd={() => setCustom(false)}
      />
    );
  }
  const options = [
    ...(DOC_SERVICES_TITLES.includes(value) ? [] : [{ value, label: value }]),
    ...DOC_SERVICES_TITLES.map((t) => ({ value: t, label: t })),
    { value: OTHER, label: "Autre…" },
  ];
  return (
    <SelectPill
      value={value}
      options={options}
      aria-label="Titre des services"
      onChange={(v) => { if (v === OTHER) setCustom(true); else onChange(v); }}
    />
  );
}

function AddSectionMenu({ onNew, onFromOffer }: { onNew: () => void; onFromOffer: () => void }) {
  const menu = useMenu();
  return (
    <div ref={menu.ref} className="relative inline-flex">
      <Button variant="ghost" size="sm" icon={<Plus />} className="text-muted-foreground" onClick={menu.toggle} aria-haspopup="menu" aria-expanded={menu.open}>
        Section
      </Button>
      <Menu {...menu.props} title="Ajouter une section" aria-label="Ajouter une section">
        <MenuItem onSelect={onNew}>Nouvelle section</MenuItem>
        <MenuItem onSelect={onFromOffer}>Depuis une formule…</MenuItem>
      </Menu>
    </div>
  );
}

// « Depuis une formule… »: a section built from an active 07 offer.
function FromOfferDialog({ open, onClose, offers, onPick }: { open: boolean; onClose: () => void; offers: Offer[]; onPick: (offer: Offer) => void }) {
  const [offerId, setOfferId] = useState("");
  useEffect(() => { if (open) setOfferId(""); }, [open]);
  const options = useMemo(
    () => offers
      .filter((o) => !o.archived)
      .sort((a, b) => a.name.localeCompare(b.name, "fr"))
      .map((o) => ({ value: o.offerId, label: o.name, detail: plural(o.lines.length, "recette") })),
    [offers],
  );
  const offer = offers.find((o) => o.offerId === offerId);
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!offer) return;
    onPick(offer);
    onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title="Ajouter une formule"
      footer={
        <>
          <Button variant="default" onClick={onClose}>Annuler</Button>
          <Button variant="primary" type="submit" form="from-offer-form" disabled={!offer}>Ajouter</Button>
        </>
      }
    >
      <form id="from-offer-form" onSubmit={submit}>
        <FieldLabel htmlFor="from-offer-offer">Formule</FieldLabel>
        <SearchSelect id="from-offer-offer" options={options} value={offerId} onChange={setOfferId} placeholder="Rechercher une formule…" autoFocus />
        {options.length === 0 && <p className="mt-2 text-caption text-muted-foreground">Aucune formule active.</p>}
      </form>
    </Dialog>
  );
}

interface NewRecipeTarget {
  sectionId: string;
  rowId: string;
  name: string;
  category?: string;
}

export default function OfferDocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const narrow = useMediaQuery("(max-width: 767px)");

  const [document, setDocumentState] = useState<OfferDocument | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // Null until the brand images were looked up once.
  const [assetsMissing, setAssetsMissing] = useState<boolean | null>(null);

  const [focusSectionId, setFocusSectionId] = useState<string | null>(null);
  const [editGuestsLabel, setEditGuestsLabel] = useState(false);
  const [fromOffer, setFromOffer] = useState(false);
  const [newRecipe, setNewRecipe] = useState<NewRecipeTarget | null>(null);
  const [useInEvent, setUseInEvent] = useState<DocSection | null>(null);
  const [duplicating, setDuplicating] = useState<OfferDocument | null>(null);
  const [deleting, setDeleting] = useState<OfferDocument | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The latest document, readable from handlers that fire before the next render.
  const documentRef = useRef<OfferDocument | null>(null);
  const commitDocument = useCallback((next: OfferDocument | null) => { documentRef.current = next; setDocumentState(next); }, []);
  // The stamp the server returned last; every PATCH carries it.
  const stampRef = useRef("");
  const adopt = useCallback((saved: OfferDocument) => { stampRef.current = saved.updatedAt; commitDocument(saved); }, [commitDocument]);

  const pendingRef = useRef<UpdateOfferDocumentRequest>({});
  const timerRef = useRef<number | null>(null);
  const chainRef = useRef<Promise<unknown>>(Promise.resolve());
  const editsRef = useRef(0);

  const reloadDocument = useCallback(async () => {
    if (!id) return null;
    invalidate("offerDocuments");
    const fresh = await api.offerDocuments.get(id);
    adopt(fresh);
    return fresh;
  }, [id, adopt]);

  const flush = useCallback(() => {
    if (timerRef.current !== null) { window.clearTimeout(timerRef.current); timerRef.current = null; }
    const patch = pendingRef.current;
    pendingRef.current = {};
    if (!id || Object.keys(patch).length === 0) return;
    const seen = editsRef.current;
    chainRef.current = chainRef.current
      .catch(() => undefined)
      .then(() => api.offerDocuments.update(id, { ...patch, updatedAt: stampRef.current }))
      .then((saved) => {
        stampRef.current = saved.updatedAt;
        // A newer local edit wins over the response; only the stamp moves on.
        if (editsRef.current === seen) commitDocument(saved);
        else if (documentRef.current) commitDocument({ ...documentRef.current, updatedAt: saved.updatedAt });
      })
      .catch(async (e: unknown) => {
        if (e instanceof ApiError && e.status === 409) toast({ title: "Le document a changé ailleurs, il a été rechargé", variant: "destructive" });
        else toast({ title: "Erreur lors de la sauvegarde", description: errorReason(e) || undefined, variant: "destructive" });
        pendingRef.current = {};
        editsRef.current += 1;
        await reloadDocument().catch(() => undefined);
      });
  }, [id, commitDocument, reloadDocument, toast]);

  // Pending edits leave with the page instead of being lost.
  useEffect(() => () => flush(), [flush]);

  const edit = useCallback((patch: UpdateOfferDocumentRequest) => {
    const prev = documentRef.current;
    if (!prev) return;
    editsRef.current += 1;
    commitDocument(applyPatch(prev, patch));
    pendingRef.current = { ...pendingRef.current, ...patch };
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(flush, SAVE_DELAY);
  }, [commitDocument, flush]);

  // Runs a server call after the pending patches, so it sees the saved document and later patches wait for it.
  const afterSaves = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    flush();
    const run = chainRef.current.catch(() => undefined).then(fn);
    chainRef.current = run.catch(() => undefined);
    return run;
  }, [flush]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    Promise.all([api.offerDocuments.get(id), api.offers.list(), api.recipes.list(), api.ingredients.list(), api.settings.get()])
      .then(([doc, ofs, recs, ings, se]) => {
        if (cancelled) return;
        adopt(doc);
        setOffers(ofs); setRecipes(recs); setIngredients(ings); setSettings(se);
      })
      .catch(() => { if (!cancelled) { setLoadError(true); toast({ title: "Erreur de chargement", variant: "destructive" }); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, adopt]);

  // The warning callout needs to know whether a logo or a banner exists; the lookup is cached for the PDF.
  useEffect(() => {
    if (!settings) return;
    let cancelled = false;
    loadBrandImages(settings).then(({ logo, banner }) => { if (!cancelled) setAssetsMissing(!logo && !banner); });
    return () => { cancelled = true; };
  }, [settings]);

  // Blob URLs stay alive while the page is mounted: a tab opened on touch may still be loading one.
  const blobUrlsRef = useRef<string[]>([]);
  useEffect(() => () => { for (const url of blobUrlsRef.current) URL.revokeObjectURL(url); }, []);

  useBackLink({ to: "/offres/documents", label: "Offres" });
  useTopTitle(document?.title ?? "Document");

  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.recipeId, r])), [recipes]);
  const ingredientById = useMemo(() => new Map(ingredients.map((i) => [i.ingredientId, i])), [ingredients]);
  const recipeCostById = useMemo(() => new Map(recipes.map((r) => [r.recipeId, calcRecipeCost(r, ingredientById)])), [recipes, ingredientById]);
  const recipePortionsById = useMemo(() => new Map(recipes.map((r) => [r.recipeId, r.portions || 1])), [recipes]);
  const recipeNameById = useMemo(() => new Map(recipes.map((r) => [r.recipeId, r.name])), [recipes]);
  const recipeOptions = useMemo<RecipeOption[]>(() => recipes.map((r) => ({ recipeId: r.recipeId, name: r.name, category: r.category })), [recipes]);
  const offerById = useMemo(() => new Map(offers.map((o) => [o.offerId, o])), [offers]);
  const courses = useMemo(() => (settings?.courses?.length ? settings.courses : DEFAULT_COURSES), [settings]);
  const prestationTypes = settings?.prestationTypes?.length ? settings.prestationTypes : DEFAULT_PRESTATION_TYPES;

  if (loading) return <div className="p-8 text-muted-foreground">Chargement…</div>;
  if (loadError || !document || !id) return <div className="p-8 text-muted-foreground">Document introuvable.</div>;

  const readOnly = document.archived === true;
  const accent = settings?.company?.accent ?? DEFAULT_BRAND_ACCENT;
  const foodVat = foodVatRateOf(document, prestationTypes);
  const fact = guestsFact(document);
  const sectionOptions: SectionOption[] = document.sections.map((s) => ({ sectionId: s.sectionId, title: s.title }));
  const label = documentLabel(document);

  // ── Sections ──────────────────────────────────────────────────────────────
  const current = () => documentRef.current ?? document;
  const setSections = (sections: DocSection[]) => edit({ sections });
  const replaceSection = (section: DocSection) => setSections(current().sections.map((s) => (s.sectionId === section.sectionId ? section : s)));
  const patchSectionRow = (sectionId: string, rowId: string, change: Partial<DocRow>) =>
    setSections(current().sections.map((s) => (s.sectionId === sectionId ? { ...s, rows: s.rows.map((r) => (r.rowId === rowId ? withoutUndefined({ ...r, ...change }) : r)) } : s)));
  const moveRowTo = (row: DocRow, fromId: string, toId: string) => {
    if (fromId === toId) return;
    setSections(current().sections.map((s) => {
      if (s.sectionId === fromId) return { ...s, rows: s.rows.filter((r) => r.rowId !== row.rowId) };
      if (s.sectionId === toId) return { ...s, rows: [...s.rows, row] };
      return s;
    }));
  };
  const swapSection = (sectionId: string, delta: number) => {
    const sections = current().sections;
    const i = sections.findIndex((s) => s.sectionId === sectionId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= sections.length) return;
    const next = [...sections];
    [next[i], next[j]] = [next[j], next[i]];
    setSections(next);
  };
  const duplicateSection = (sectionId: string) => {
    const sections = current().sections;
    const i = sections.findIndex((s) => s.sectionId === sectionId);
    if (i < 0) return;
    const source = sections[i];
    const copy: DocSection = { ...source, sectionId: newDocId(), title: `${source.title} (copie)`, rows: source.rows.map((r) => ({ ...r, rowId: newDocId() })) };
    delete copy.offerId;
    setSections([...sections.slice(0, i + 1), copy, ...sections.slice(i + 1)]);
  };
  const removeSection = (sectionId: string) => setSections(current().sections.filter((s) => s.sectionId !== sectionId));
  const unlinkSection = (sectionId: string) => setSections(current().sections.map((s) => { if (s.sectionId !== sectionId) return s; const next = { ...s }; delete next.offerId; return next; }));
  const addSection = () => {
    const section: DocSection = { sectionId: newDocId(), title: "Nouvelle section", unitLabel: DEFAULT_SECTION_UNIT_LABEL, unitKind: "convive", rows: [] };
    setSections([...current().sections, section]);
    setFocusSectionId(section.sectionId);
  };
  const addSectionFromOffer = (offer: Offer) => {
    setSections([...current().sections, sectionFromOffer(offer, recipeNameById, newDocId)]);
  };

  const costSection = (sectionId: string, mode: "create" | "sync") => {
    const seen = editsRef.current;
    afterSaves(() => api.offerDocuments.costSection(id, sectionId))
      .then(({ document: saved, offer }) => {
        stampRef.current = saved.updatedAt;
        const local = documentRef.current;
        if (editsRef.current === seen || !local) commitDocument(saved);
        else commitDocument({ ...local, updatedAt: saved.updatedAt, sections: local.sections.map((s) => (s.sectionId === sectionId ? { ...s, offerId: offer.offerId } : s)) });
        setOffers((prev) => (prev.some((o) => o.offerId === offer.offerId) ? prev.map((o) => (o.offerId === offer.offerId ? offer : o)) : [...prev, offer]));
        const title = saved.sections.find((s) => s.sectionId === sectionId)?.title ?? "Section";
        if (mode === "create") toast({ title: `Formule « ${title} » créée`, action: { label: "Ouvrir", onClick: () => navigate(`/offres/${offer.offerId}`) } });
        else toast({ title: `Formule « ${title} » mise à jour` });
      })
      .catch((e: unknown) => toast({ title: mode === "create" ? "Erreur lors de la création de la formule" : "Erreur lors de la mise à jour de la formule", description: errorReason(e) || undefined, variant: "destructive" }));
  };

  const offerStateOf = (section: DocSection): SectionOfferState => (section.offerId ? (offerById.has(section.offerId) ? "linked" : "dangling") : "none");
  const costingOf = (section: DocSection): SectionCosting | undefined => {
    const offer = section.offerId ? offerById.get(section.offerId) : undefined;
    if (!offer || offer.lines.length === 0) return undefined;
    const summary = offerSummary(offer, recipeCostById, recipePortionsById, recipeById);
    return { costPerGuest: summary.costPerGuest, marginPct: summary.marginPct };
  };

  // ── Services, conditions, TVA ─────────────────────────────────────────────
  const services = document.services;
  const setServices = (next: DocServices) => edit({ services: next });
  const vatLines = document.vatLines;
  const setVatLines = (next: DocVatLine[]) => edit({ vatLines: next });
  const addVatLine = () => {
    const label = DOC_VAT_LABELS.find((l) => !vatLines.some((v) => v.label === l)) ?? "TVA";
    setVatLines([...vatLines, { label, rate: 12 }]);
  };

  // ── PDF ───────────────────────────────────────────────────────────────────
  const download = async () => {
    if (busy) return;
    setBusy(true);
    flush();
    try {
      const { doc, fileName } = await buildDocumentPdf(current(), settings);
      doc.save(fileName);
      toast({ title: "PDF téléchargé" });
    } catch (e) {
      toast({ title: "Erreur lors de la génération du PDF", description: errorReason(e) || undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };
  const preview = async () => {
    if (busy) return;
    setBusy(true);
    flush();
    try {
      const { doc } = await buildDocumentPdf(current(), settings);
      const url = String(doc.output("bloburl"));
      blobUrlsRef.current.push(url);
      setPreviewUrl(url);
    } catch (e) {
      toast({ title: "Erreur lors de la génération du PDF", description: errorReason(e) || undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  // ── Page actions ──────────────────────────────────────────────────────────
  const setArchived = (archived: boolean) => {
    edit({ archived });
    toast({ title: archived ? "Document archivé" : "Document réactivé" });
  };
  const menuItems = [
    ...(narrow ? [{ label: "Aperçu", onClick: () => { void preview(); } }, { kind: "separator" as const }] : []),
    { label: `Dupliquer pour ${document.year + 1}…`, onClick: () => { flush(); setDuplicating(current()); } },
    readOnly ? { label: "Réactiver", onClick: () => setArchived(false) } : { label: "Archiver", onClick: () => setArchived(true) },
    { kind: "separator" as const },
    { label: "Supprimer", variant: "danger" as const, onClick: () => setDeleting(document) },
  ];

  const prestationOptions = [...prestationTypes.map((t) => ({ value: t.key, label: t.label })), { value: NONE, label: "Aucun" }];
  const derivedGuests = guestsFact({ minGuests: document.minGuests, maxGuests: document.maxGuests });
  const guestsSub = fact || editGuestsLabel ? (
    <span>
      Imprimé : « {(fact ?? derivedGuests)?.[0] ?? "Nombre de personnes"} :{" "}
      {document.guestsLabel !== undefined || editGuestsLabel ? (
        <InlineText
          value={document.guestsLabel ?? derivedGuests?.[1] ?? ""}
          placeholder="Texte imprimé"
          aria-label="Texte imprimé"
          className="text-caption"
          readOnly={readOnly}
          focused={editGuestsLabel}
          onEditEnd={() => setEditGuestsLabel(false)}
          onSave={(v) => { const t = v.trim(); edit({ guestsLabel: t && t !== derivedGuests?.[1] ? t : null }); }}
        />
      ) : (
        fact?.[1]
      )}
      {" "}»
      {!readOnly && document.guestsLabel === undefined && !editGuestsLabel && (
        <>
          {" · "}
          <button type="button" className="text-primary hover:underline touch:inline-flex touch:min-h-11 touch:items-center" onClick={() => setEditGuestsLabel(true)}>Modifier le texte</button>
        </>
      )}
    </span>
  ) : (
    <span>
      Non imprimé
      {!readOnly && (
        <>
          {" · "}
          <button type="button" className="text-primary hover:underline touch:inline-flex touch:min-h-11 touch:items-center" onClick={() => setEditGuestsLabel(true)}>Modifier le texte</button>
        </>
      )}
    </span>
  );

  return (
    <div className="mx-auto max-w-doc pb-20 md:pb-0">
      <PageHeader
        breadcrumb={[{ label: "Offres", to: "/offres/documents" }, { label: "Documents", to: "/offres/documents" }, { label }]}
        iconKey="document"
        title={readOnly ? (
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="min-w-0">{document.title}</span>
            <Tag colour="gray">Archivée</Tag>
          </span>
        ) : document.title}
        onTitleChange={readOnly ? undefined : (v) => edit({ title: v })}
        actions={
          <>
            <Button variant="default" size="md" className="hidden md:inline-flex" onClick={preview} disabled={busy}>Aperçu</Button>
            <ActionMenu items={menuItems} title={label} />
            <Button variant="primary" size="lg" className="hidden md:inline-flex" onClick={download} disabled={busy}>Télécharger le PDF</Button>
          </>
        }
        properties={
          <>
            {assetsMissing && (
              <Callout tone="warning" className="mt-3">
                Logo et bannière manquants · <Link to="/settings#societe" className="underline underline-offset-2 hover:opacity-80">Les ajouter dans Paramètres › Société</Link>
              </Callout>
            )}
            <PropertyList className="md:[&_dt]:w-44">
              <Property icon="📅" label="Année" kind="number" value={document.year} min={2020} decimals={0} format={(v) => String(v)} onSave={readOnly ? undefined : (v) => edit({ year: Math.max(2020, Math.round(v)) })} />
              <Property icon="🍂" label="Saison" kind="select" value={document.season ?? NONE} options={SEASON_OPTIONS} colour="gray" onSave={readOnly ? undefined : (v) => edit({ season: v === NONE ? null : (v as OfferDocument["season"]) })} />
              <Property icon="🍽" label="Prestation" kind="text" value={document.prestationLabel} placeholder="Avec service, à emporter…" onSave={readOnly ? undefined : (v) => edit({ prestationLabel: v.trim() })} />
              <Property
                icon="🧾"
                label="Type"
                kind="select"
                value={document.prestationType ?? NONE}
                options={prestationOptions}
                colour="gray"
                sub={`Sert au devis et à la TVA food (${foodVat} %)`}
                onSave={readOnly ? undefined : (v) => edit({ prestationType: v === NONE ? null : v })}
              />
              <Property icon="👥" label="Convives" kind="custom" sub={guestsSub}>
                <span className="inline-flex items-center gap-1 text-base">
                  <span className="text-sm text-muted-foreground">min</span>
                  <InlineCount value={document.minGuests} readOnly={readOnly} label="Minimum de convives" onSave={(v) => edit({ minGuests: v ?? null })} />
                  <span className="px-1 text-muted-foreground">·</span>
                  <span className="text-sm text-muted-foreground">max</span>
                  <InlineCount value={document.maxGuests} readOnly={readOnly} label="Maximum de convives" onSave={(v) => edit({ maxGuests: v ?? null })} />
                </span>
              </Property>
              <Property icon="📝" label="Note" kind="multiline" value={document.note ?? ""} placeholder="Ajouter une note" onSave={readOnly ? undefined : (v) => edit({ note: v.trim() ? v.trim() : null })} />
            </PropertyList>
          </>
        }
      />

      <div className="border-t border-border" />

      <div className="mt-3 flex flex-col gap-3">
        {document.sections.length === 0 && (
          <p className="py-2 text-sm text-muted-foreground">Aucune section. Une section est une formule à un prix par personne, ou une liste de prix.</p>
        )}
        {document.sections.map((section, i) => (
          <DocSectionBlock
            key={section.sectionId}
            documentId={id}
            section={section}
            accent={accent}
            index={i}
            count={document.sections.length}
            readOnly={readOnly}
            recipes={recipeOptions}
            categories={courses}
            sections={sectionOptions}
            offerState={offerStateOf(section)}
            costing={costingOf(section)}
            focusTitle={focusSectionId === section.sectionId}
            onFocusTitleEnd={() => setFocusSectionId(null)}
            onChange={replaceSection}
            onMoveRowTo={(row, target) => moveRowTo(row, section.sectionId, target)}
            onCreateRecipe={(rowId, name, category) => setNewRecipe({ sectionId: section.sectionId, rowId, name, category })}
            onCost={() => costSection(section.sectionId, "create")}
            onSync={() => costSection(section.sectionId, "sync")}
            onUnlink={() => unlinkSection(section.sectionId)}
            onUseInEvent={() => { flush(); setUseInEvent(current().sections.find((s) => s.sectionId === section.sectionId) ?? section); }}
            onMoveUp={() => swapSection(section.sectionId, -1)}
            onMoveDown={() => swapSection(section.sectionId, 1)}
            onDuplicate={() => duplicateSection(section.sectionId)}
            onRemove={() => removeSection(section.sectionId)}
          />
        ))}
        {!readOnly && (
          <div>
            <AddSectionMenu onNew={addSection} onFromOffer={() => setFromOffer(true)} />
          </div>
        )}
      </div>

      <Section
        title="Services"
        meta={services.shown ? "affichés" : "masqués"}
        action={!readOnly && (
          <Button variant="link" size="sm" onClick={() => setServices({ ...services, shown: !services.shown })}>
            {services.shown ? "Masquer" : "Afficher"}
          </Button>
        )}
      >
        <div className={services.shown ? undefined : "opacity-60"}>
          <div className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1 px-1 touch:min-h-11">
            <ServicesTitle value={services.title} readOnly={readOnly} onChange={(title) => setServices({ ...services, title })} />
            <InlineText
              value={services.intro ?? ""}
              placeholder="Ajouter une mention sous le titre"
              aria-label="Mention sous le titre"
              className="text-sm text-muted-foreground touch:text-base"
              readOnly={readOnly}
              onSave={(v) => setServices(withoutUndefined({ ...services, intro: v.trim() || undefined }))}
            />
          </div>
          <DocRows
            className="mt-0.5"
            rows={services.rows}
            priceList
            readOnly={readOnly}
            onChange={(rows) => setServices({ ...services, rows })}
          />
        </div>
      </Section>

      <Section
        title="Conditions"
        action={!readOnly && document.conditions !== DEFAULT_DOC_CONDITIONS && (
          <Button variant="link" size="sm" onClick={() => edit({ conditions: DEFAULT_DOC_CONDITIONS })}>Reprendre le texte standard</Button>
        )}
      >
        {readOnly ? (
          <p className="whitespace-pre-wrap text-sm text-muted-foreground touch:text-base">{document.conditions || "Aucune condition."}</p>
        ) : (
          <EditableText
            value={document.conditions}
            multiline
            placeholder="Ajouter les conditions"
            className="text-sm touch:text-base"
            onSave={(v) => edit({ conditions: v.trim() })}
          />
        )}
      </Section>

      <Section
        title="TVA"
        action={!readOnly && <Button variant="ghost" size="sm" icon={<Plus />} onClick={addVatLine}>Ligne</Button>}
      >
        {vatLines.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune ligne. Le tableau TVA n'est pas imprimé.</p>
        ) : (
          <div>
            <datalist id={VAT_LABELS_ID}>
              {DOC_VAT_LABELS.map((l) => <option key={l} value={l} />)}
            </datalist>
            {vatLines.map((line, i) => (
              <div key={i} className={ROW}>
                <span className="min-w-0 flex-1 text-sm touch:text-base">
                  <InlineLabel value={line.label} list={VAT_LABELS_ID} readOnly={readOnly} onSave={(v) => { if (v.trim()) setVatLines(vatLines.map((l, j) => (j === i ? { ...l, label: v.trim() } : l))); }} />
                </span>
                {readOnly ? (
                  <span className="text-sm tabular-nums touch:text-base">{line.rate} %</span>
                ) : (
                  <SelectPill
                    value={String(line.rate)}
                    options={VAT_OPTIONS}
                    colour="gray"
                    align="right"
                    aria-label="Taux"
                    onChange={(v) => { const rate = parseVat(v); if (rate !== undefined) setVatLines(vatLines.map((l, j) => (j === i ? { ...l, rate } : l))); }}
                  />
                )}
                {!readOnly && <IconButton size="sm" aria-label="Retirer" onClick={() => setVatLines(vatLines.filter((_, j) => j !== i))} icon={<X />} className="reveal" />}
              </div>
            ))}
          </div>
        )}
      </Section>

      <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 bg-background p-3 shadow-[0_-1px_0_0_var(--border)] md:hidden">
        <Button variant="primary" size="lg" className="flex-1" onClick={download} disabled={busy}>Télécharger le PDF</Button>
      </div>

      <DocumentPreviewDialog open={previewUrl !== null} onClose={() => setPreviewUrl(null)} url={previewUrl} title={label} />

      <FromOfferDialog open={fromOffer} onClose={() => setFromOffer(false)} offers={offers} onPick={addSectionFromOffer} />

      <NewRecipeDialog
        open={newRecipe !== null}
        onClose={() => setNewRecipe(null)}
        initial={newRecipe ? { name: newRecipe.name, category: newRecipe.category } : { name: "" }}
        categories={courses}
        existing={recipes}
        defaultPortions={document.minGuests ?? DEFAULT_GUESTS}
        onCreated={(recipe) => {
          setRecipes((prev) => [...prev, recipe]);
          if (newRecipe) patchSectionRow(newRecipe.sectionId, newRecipe.rowId, { recipeId: recipe.recipeId });
          toast({ title: "Recette créée et liée" });
        }}
        onUseExisting={(recipeId) => { if (newRecipe) patchSectionRow(newRecipe.sectionId, newRecipe.rowId, { recipeId }); }}
      />

      {useInEvent && (
        <UseInEventDialog
          open
          onClose={() => setUseInEvent(null)}
          document={document}
          section={useInEvent}
          prestationTypes={prestationTypes}
          categories={courses}
        />
      )}

      <DuplicateDocumentDialog
        document={duplicating}
        onClose={() => setDuplicating(null)}
        onDuplicated={(copy) => navigate(`/offres/documents/${copy.documentId}`)}
      />
      <DeleteDocumentDialog document={deleting} onClose={() => setDeleting(null)} onDeleted={() => navigate("/offres/documents")} />
    </div>
  );
}
