import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { Check, Plus, X } from "lucide-react";
import type {
  AppEvent,
  AppSettings,
  Client,
  EventExtraCost,
  EventRecipeLine,
  ExtraCostKind,
  Ingredient,
  Person,
  PrestationTypeSetting,
  Recipe,
  VatRate,
} from "@packages/types";
import { DEFAULT_COURSES, DEFAULT_PRESTATION_TYPES, VAT_RATES, groupByCourse } from "@packages/types";
import { api, ApiError, type EventInput } from "@/lib/api";
import { longDayLabel, todayIso, weekdayOf } from "@/lib/dates";
import { useToast } from "@/hooks/use-toast";
import { safeReturn } from "@/lib/safe-return";
import { calcEventCost, calcRecipeCost, fmt } from "@/lib/recipe-helpers";
import { useBackLink, useTopTitle } from "@/components/admin/AdminLayout";
import { FieldLabel, NumericInput, PageHeader, Section, Tag, Button, IconButton, SearchSelect, MoneyTile } from "@/components/ui";
import { PersonChip } from "@/components/admin/PersonChips";
import NewClientDialog from "@/components/admin/NewClientDialog";

// Lines of a not-yet-created event have no lineId; the server fills it on POST.
type LocalLine = Omit<EventRecipeLine, "lineId"> & { lineId?: string };

const EXTRA_KINDS: { value: ExtraCostKind; label: string }[] = [
  { value: "matiere", label: "Matière" },
  { value: "personnel", label: "Personnel" },
  { value: "location", label: "Location" },
  { value: "transport", label: "Transport" },
  { value: "autre", label: "Autre" },
];

const NEW_CLIENT = "__new__";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const PERSON_TOGGLE = "inline-flex h-8 items-center gap-1.5 rounded-sm pl-1 pr-2.5 text-sm shadow-outline hover:bg-hover touch:h-11 touch:text-base";
const PERSON_ON = "bg-selected text-primary shadow-[0_0_0_1px_rgba(35,131,226,0.35)] hover:bg-selected";

export default function EventEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [allRecipes, setAllRecipes] = useState<Recipe[]>([]);
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(isNew ? null : id ?? null);

  const [name, setName] = useState("");
  const [date, setDate] = useState(todayIso());
  const [guestCount, setGuestCount] = useState(10);
  const [recipes, setRecipes] = useState<LocalLine[]>([]);
  const [localLineVersion, setLocalLineVersion] = useState(0);
  const [extraCosts, setExtraCosts] = useState<EventExtraCost[]>([]);
  const [sellingPricePerGuest, setSellingPricePerGuest] = useState(0);
  const [notes, setNotes] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [actualCost, setActualCost] = useState<number | null>(null);
  const [clientId, setClientId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [prestationType, setPrestationType] = useState("");
  const [vatRate, setVatRate] = useState<VatRate | undefined>(undefined);
  const [assignedTo, setAssignedTo] = useState<string[]>([]);
  const retour = safeReturn(searchParams.get("retour"));

  const [newClientOpen, setNewClientOpen] = useState(false);
  const [clientsConfigured, setClientsConfigured] = useState(true);

  const initialized = useRef(false);
  // Set by addRecipe so only a freshly added line without a category takes the focus.
  const justAdded = useRef(false);
  const savingRef = useRef(false);
  const pendingRef = useRef(false);
  const createdIdRef = useRef<string | null>(null);
  const guestCountTouched = useRef(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>();

  const prestationTypes: PrestationTypeSetting[] = settings?.prestationTypes?.length ? settings.prestationTypes : DEFAULT_PRESTATION_TYPES;
  const courses: string[] = settings?.courses?.length ? settings.courses : DEFAULT_COURSES;
  const people: Person[] = settings?.people?.filter((p) => p.active) ?? [];

  const pageTitle = isNew && !currentId ? "Nouvel événement" : name || "Modifier l'événement";
  const weekMatch = retour?.match(/^\/semaine\/\d{4}-W(\d{2})/);
  const retourLabel = weekMatch ? `Semaine ${Number(weekMatch[1])}` : retour?.startsWith("/jour/") ? "Jour" : "Événements";
  useBackLink({ to: retour ?? (currentId ? `/events/${currentId}` : "/events"), label: retourLabel });
  useTopTitle(pageTitle);

  const defaultVatFor = (types: PrestationTypeSetting[], key: string | undefined): VatRate | undefined =>
    types.find((t) => t.key === key)?.defaultVatRate;

  // Copies the client defaults into fields that are still empty.
  const applyClientDefaults = (c: Client, types: PrestationTypeSetting[]) => {
    setPrestationType((prev) => prev || c.defaultPrestationType || "");
    setVatRate((prev) => prev ?? c.defaultVatRate ?? defaultVatFor(types, c.defaultPrestationType));
    setSellingPricePerGuest((prev) => prev || c.defaultPricePerGuest || 0);
    if (!guestCountTouched.current && c.defaultGuestCount) setGuestCount(c.defaultGuestCount);
    setContactName((prev) => prev || c.contactName || "");
    setContactPhone((prev) => prev || c.phone || "");
    setContactEmail((prev) => prev || c.email || "");
  };

  // Copies the client's template for the weekday of `date`; a later date change does not re-apply it.
  const applyClientTemplate = (c: Client, date: string, types: PrestationTypeSetting[]) => {
    const t = c.templates.find((x) => x.weekday === weekdayOf(date));
    if (!t) return;
    setName((prev) => prev || `${c.name} · ${longDayLabel(date)}`);
    setGuestCount(t.guestCount);
    guestCountTouched.current = true;
    setSellingPricePerGuest(t.sellingPricePerGuest);
    setPrestationType(t.prestationType ?? c.defaultPrestationType ?? "");
    setVatRate(t.vatRate ?? c.defaultVatRate ?? defaultVatFor(types, t.prestationType ?? c.defaultPrestationType));
    setRecipes(t.recipes.map((l) => ({ recipeId: l.recipeId, portions: l.portions, course: l.course, notes: l.notes })));
    setExtraCosts(t.extraCosts);
    setNotes(t.notes ?? "");
    setTemplateId(t.templateId);
    setAssignedTo(t.assignedTo ?? []);
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [recs, ings, cls, st] = await Promise.all([
          api.recipes.list(),
          api.ingredients.list(),
          // The clients table may not be provisioned yet; the editor must still open.
          api.clients.list().catch((e: unknown) => {
            if (e instanceof ApiError && e.status === 503) { setClientsConfigured(false); return [] as Client[]; }
            throw e;
          }),
          api.settings.get(),
        ]);
        setAllRecipes(recs);
        setAllIngredients(ings);
        setClients(cls);
        setSettings(st);
        const types = st.prestationTypes?.length ? st.prestationTypes : DEFAULT_PRESTATION_TYPES;
        if (!isNew && id) {
          // The editor already owns the event it just created, so no refetch after the URL swap.
          if (id === createdIdRef.current) return;
          const ev = await api.events.get(id);
          setName(ev.name); setDate(ev.date); setGuestCount(ev.guestCount);
          guestCountTouched.current = true;
          setRecipes(ev.recipes); setExtraCosts(ev.extraCosts);
          setSellingPricePerGuest(ev.sellingPricePerGuest);
          setNotes(ev.notes || "");
          setContactName(ev.contactName || ""); setContactPhone(ev.contactPhone || ""); setContactEmail(ev.contactEmail || "");
          if (ev.actualCost !== undefined) setActualCost(ev.actualCost ?? null);
          setClientId(ev.clientId || "");
          setTemplateId(ev.templateId || "");
          setPrestationType(ev.prestationType || "");
          setVatRate(ev.vatRate);
          setAssignedTo(ev.assignedTo ?? []);
          setSavedOnce(true);
        } else {
          const dateParam = searchParams.get("date");
          const startDate = dateParam && ISO_DATE.test(dateParam) ? dateParam : todayIso();
          setDate(startDate);
          const clientParam = searchParams.get("client");
          const c = clientParam ? cls.find((x) => x.clientId === clientParam) : undefined;
          if (c) {
            setClientId(c.clientId);
            applyClientDefaults(c, types);
            applyClientTemplate(c, startDate, types);
          }
        }
      } catch {
        toast({ title: "Erreur de chargement", variant: "destructive" });
      } finally {
        setLoading(false);
        setTimeout(() => { initialized.current = true; }, 100);
      }
    };
    load();
  }, [id]);

  const scalarPayload = useCallback((): Partial<AppEvent> => ({
    name: name.trim(), date, guestCount, sellingPricePerGuest,
    extraCosts: extraCosts.filter((c) => c.label.trim()),
    notes: notes || undefined, actualCost, templateId: templateId || undefined,
    contactName: contactName || undefined, contactPhone: contactPhone || undefined, contactEmail: contactEmail || undefined,
    clientId: clientId || undefined, prestationType: prestationType || undefined, vatRate,
    assignedTo,
  }), [name, date, guestCount, extraCosts, sellingPricePerGuest, notes, actualCost, templateId, contactName, contactPhone, contactEmail, clientId, prestationType, vatRate, assignedTo]);

  // Recipes travel in the payload only until the event exists; after that the line endpoints own them.
  const buildPayload = useCallback((): EventInput => {
    const scalars = scalarPayload();
    if (currentId) return scalars;
    return { ...scalars, recipes };
  }, [scalarPayload, currentId, recipes]);

  const canCreate = Boolean(name.trim()) && (Boolean(currentId) || Boolean(prestationType));

  const autoSave = useCallback(async (): Promise<string | null> => {
    if (savingRef.current) { pendingRef.current = true; return currentId; }
    if (!canCreate) return currentId;
    savingRef.current = true;
    setSaving(true);
    let savedId = currentId;
    try {
      const payload = buildPayload();
      if (currentId) {
        await api.events.update(currentId, payload);
      } else {
        const created = await api.events.create(payload);
        savedId = created.eventId;
        createdIdRef.current = created.eventId;
        setCurrentId(created.eventId);
        setRecipes(created.recipes);
        navigate(`/events/${created.eventId}/edit`, { replace: true });
      }
      setSavedOnce(true);
    } catch {
      toast({ title: "Erreur lors de la sauvegarde", variant: "destructive" });
    } finally {
      savingRef.current = false;
      setSaving(false);
      if (pendingRef.current) {
        pendingRef.current = false;
        autoSaveRef.current();
      }
    }
    return savedId;
  }, [canCreate, currentId, buildPayload, navigate, toast]);

  const autoSaveRef = useRef(autoSave);
  autoSaveRef.current = autoSave;

  useEffect(() => {
    if (!initialized.current) return;
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => { autoSaveRef.current(); }, 800);
    return () => clearTimeout(autoSaveTimer.current);
  }, [name, date, guestCount, extraCosts, sellingPricePerGuest, notes, actualCost, templateId, contactName, contactPhone, contactEmail, clientId, prestationType, vatRate, assignedTo, localLineVersion]);

  const recipeCostMap = useMemo(() => {
    const map = new Map<string, number>();
    allRecipes.forEach((r) => { map.set(r.recipeId, calcRecipeCost(r, allIngredients)); });
    return map;
  }, [allRecipes, allIngredients]);

  const recipePortionMap = useMemo(() => {
    const map = new Map<string, number>();
    allRecipes.forEach((r) => { map.set(r.recipeId, r.portions || 1); });
    return map;
  }, [allRecipes]);

  const costLines = useMemo<EventRecipeLine[]>(
    () => recipes.map((l, i) => ({ ...l, lineId: l.lineId ?? `local-${i}` })),
    [recipes],
  );
  const liveRecipeCost = useMemo(
    () => calcEventCost({ recipes: costLines, actualCost: null, extraCosts: [] }, recipeCostMap, recipePortionMap).rawMaterial,
    [costLines, recipeCostMap, recipePortionMap],
  );
  const breakdown = useMemo(
    () => calcEventCost({ recipes: costLines, actualCost, extraCosts }, recipeCostMap, recipePortionMap),
    [costLines, actualCost, extraCosts, recipeCostMap, recipePortionMap],
  );
  const totalExtraCosts = Object.values(breakdown.extras).reduce((s, v) => s + v, 0);
  const totalCost = breakdown.total;
  const totalRevenue = sellingPricePerGuest * guestCount;
  const margin = totalRevenue - totalCost;
  const marginPct = totalRevenue > 0 ? (margin / totalRevenue) * 100 : 0;

  const recipeOptions = useMemo(
    () => [...allRecipes].sort((a, b) => a.name.localeCompare(b.name, "fr")).map((r) => ({ value: r.recipeId, label: r.name, detail: r.type })),
    [allRecipes],
  );
  const recipeById = useMemo(() => new Map(allRecipes.map((r) => [r.recipeId, r])), [allRecipes]);

  // Lines grouped under their category; lines with no value and no recipe default go last under « Non définie ».
  const indexById = useMemo(() => new Map(costLines.map((l, i) => [l.lineId, i])), [costLines]);
  const menuGroups = useMemo(() => {
    const undefinedLines = costLines.filter((rl) => !rl.course && !recipeById.get(rl.recipeId)?.defaultCourse);
    const rest = costLines.filter((rl) => rl.course || recipeById.get(rl.recipeId)?.defaultCourse);
    const groups = groupByCourse(rest, courses, recipeById);
    return undefinedLines.length > 0 ? [...groups, { course: "Non définie", lines: undefinedLines }] : groups;
  }, [costLines, courses, recipeById]);
  const lastLineId = costLines.length > 0 ? costLines[costLines.length - 1].lineId : null;

  // autoFocus only fires at mount, so the flag can drop once the added line has rendered.
  useEffect(() => { justAdded.current = false; }, [recipes]);

  const runLineOp = async (op: () => Promise<AppEvent>) => {
    setSaving(true);
    try {
      const ev = await op();
      setRecipes(ev.recipes);
      setSavedOnce(true);
    } catch {
      toast({ title: "Erreur lors de la sauvegarde", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const touchLocalLines = (next: LocalLine[]) => {
    setRecipes(next);
    setLocalLineVersion((v) => v + 1);
  };

  const addRecipe = (recipeId: string) => {
    if (recipes.some((r) => r.recipeId === recipeId) && !window.confirm("Cette recette est déjà dans le menu. Ajouter une seconde ligne ?")) return;
    const rec = allRecipes.find((r) => r.recipeId === recipeId);
    const line: LocalLine = { recipeId, portions: Math.max(1, Math.round(guestCount)), course: rec?.defaultCourse };
    justAdded.current = true;
    if (currentId) {
      runLineOp(() => api.events.lines.add(currentId, { recipeId: line.recipeId, portions: line.portions, course: line.course }));
    } else {
      touchLocalLines([...recipes, line]);
    }
  };

  const patchLine = (i: number, patch: { portions?: number; course?: string }) => {
    const line = recipes[i];
    const next = [...recipes];
    next[i] = { ...line, ...patch };
    if (currentId && line.lineId) {
      setRecipes(next);
      runLineOp(() => api.events.lines.patch(currentId, line.lineId as string, patch));
    } else {
      touchLocalLines(next);
    }
  };

  const removeRecipeLine = (i: number) => {
    const line = recipes[i];
    if (currentId && line.lineId) {
      runLineOp(() => api.events.lines.remove(currentId, line.lineId as string));
    } else {
      touchLocalLines(recipes.filter((_, idx) => idx !== i));
    }
  };

  const addExtraCost = () => setExtraCosts([...extraCosts, { label: "", amount: 0, kind: "autre" }]);
  const updateExtraCost = (i: number, patch: Partial<EventExtraCost>) => {
    const next = [...extraCosts];
    next[i] = { ...next[i], ...patch };
    setExtraCosts(next);
  };
  const removeExtraCost = (i: number) => setExtraCosts(extraCosts.filter((_, idx) => idx !== i));

  const onClientChange = (value: string) => {
    if (value === NEW_CLIENT) { setNewClientOpen(true); return; }
    setClientId(value);
    const c = clients.find((x) => x.clientId === value);
    if (!c) return;
    applyClientDefaults(c, prestationTypes);
    // Only a new event with an empty menu takes the template, so saved lines are never overwritten.
    if (!currentId && recipes.length === 0) applyClientTemplate(c, date, prestationTypes);
  };

  const onClientCreated = (c: Client) => {
    setClients([...clients, c].sort((a, b) => a.name.localeCompare(b.name, "fr")));
    setClientId(c.clientId);
    applyClientDefaults(c, prestationTypes);
  };

  const onPrestationChange = (key: string) => {
    setPrestationType(key);
    if (vatRate === undefined) setVatRate(defaultVatFor(prestationTypes, key));
  };

  const handleDone = async () => {
    clearTimeout(autoSaveTimer.current);
    if (!name.trim()) { navigate(retour ?? "/events"); return; }
    if (!currentId && !prestationType) {
      toast({ title: "Choisissez un type de prestation pour enregistrer l'événement", variant: "destructive" });
      return;
    }
    const savedId = await autoSave();
    navigate(retour ?? (savedId ? `/events/${savedId}` : "/events"));
  };

  const handleCancel = () => {
    clearTimeout(autoSaveTimer.current);
    navigate(retour ?? (currentId ? `/events/${currentId}` : "/events"));
  };

  if (loading) return <div className="p-8 text-base text-muted-foreground">Chargement…</div>;

  const hint = saving
    ? "Sauvegarde…"
    : savedOnce
      ? "Enregistré"
      : !name.trim()
        ? "Saisissez un nom pour démarrer"
        : !prestationType
          ? "Choisissez un type de prestation"
          : "";

  const courseOptions = (current: string | undefined) =>
    current && !courses.includes(current) ? [current, ...courses] : courses;

  const footer = (
    <>
      <Button variant="default" size="md" onClick={handleCancel}>Annuler</Button>
      <Button variant="primary" size="md" icon={<Check />} onClick={handleDone}>Enregistrer</Button>
    </>
  );

  return (
    <div className="mx-auto max-w-doc">
      <PageHeader
        breadcrumb={[retour ? { label: retourLabel, to: retour } : { label: "Événements", to: "/events" }, { label: isNew && !currentId ? "Nouveau" : name || "Événement" }]}
        iconKey="evenement"
        title={pageTitle}
        meta={hint || undefined}
        actions={<div className="hidden items-center gap-1 md:flex">{footer}</div>}
      />

      <Section title="Informations" className="!mt-0">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="ev-name">Nom de l'événement</FieldLabel>
            <input id="ev-name" className="input-field" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="ev-client">Client</FieldLabel>
            <select id="ev-client" className="input-field" value={clientId} onChange={(e) => onClientChange(e.target.value)}>
              <option value="">Aucun client</option>
              {clients.map((c) => <option key={c.clientId} value={c.clientId}>{c.name}</option>)}
              {clientsConfigured && <option value={NEW_CLIENT}>Nouveau client…</option>}
            </select>
            {clientsConfigured && (
              <Link to="#" onClick={(e) => { e.preventDefault(); onClientChange(NEW_CLIENT); }} className="mt-1 inline-block text-sm text-primary hover:underline">+ Nouveau client</Link>
            )}
            <p className="mt-1 text-sm text-muted-foreground">Choisir un client remplit le menu, les convives, le prix et l'équipe depuis sa semaine type.</p>
          </div>
          <div className="sm:col-span-2">
            <FieldLabel>Équipe</FieldLabel>
            {people.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune personne · <Link to="/settings#equipe" className="text-primary hover:underline">Ajouter dans Paramètres › Équipe</Link></p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {people.map((p) => {
                  const on = assignedTo.includes(p.personId);
                  return (
                    <button
                      key={p.personId}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setAssignedTo(on ? assignedTo.filter((id) => id !== p.personId) : [...assignedTo, p.personId])}
                      className={`${PERSON_TOGGLE} ${on ? PERSON_ON : ""}`}
                    >
                      <PersonChip personId={p.personId} people={people} size="sm" />
                      {p.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div>
            <FieldLabel htmlFor="ev-prestation">
              <span className="inline-flex items-center gap-2">
                Type de prestation
                {!prestationType && currentId && <Tag colour="yellow">À renseigner</Tag>}
              </span>
            </FieldLabel>
            <select id="ev-prestation" className="input-field" required value={prestationType} onChange={(e) => onPrestationChange(e.target.value)}>
              <option value="">Choisir…</option>
              {prestationTypes.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel htmlFor="ev-vat">Taux de TVA</FieldLabel>
            <select id="ev-vat" className="input-field" value={vatRate === undefined ? "" : String(vatRate)} onChange={(e) => setVatRate(e.target.value === "" ? undefined : (Number(e.target.value) as VatRate))}>
              <option value="">Non défini</option>
              {VAT_RATES.map((r) => <option key={r} value={String(r)}>{r} %</option>)}
            </select>
          </div>
          <div>
            <FieldLabel htmlFor="ev-date">Date</FieldLabel>
            <input id="ev-date" className="input-field" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <FieldLabel htmlFor="ev-guests">Nombre de convives</FieldLabel>
            <NumericInput id="ev-guests" className="input-field" value={guestCount} onChange={(v) => { guestCountTouched.current = true; setGuestCount(Math.max(1, Math.round(v))); }} min={1} />
          </div>
          <div>
            <FieldLabel htmlFor="ev-price">Prix de vente par convive HTVA (€)</FieldLabel>
            <NumericInput id="ev-price" className="input-field" value={sellingPricePerGuest} onChange={setSellingPricePerGuest} />
          </div>
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="ev-notes">Notes</FieldLabel>
            <textarea id="ev-notes" className="input-field" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
      </Section>

      <Section title="Contact de l'hôte">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <FieldLabel htmlFor="ev-contact-name">Nom</FieldLabel>
            <input id="ev-contact-name" className="input-field" placeholder="Nom du contact" value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </div>
          <div>
            <FieldLabel htmlFor="ev-contact-phone">Téléphone</FieldLabel>
            <input id="ev-contact-phone" className="input-field" type="tel" placeholder="+32…" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
          </div>
          <div>
            <FieldLabel htmlFor="ev-contact-email">Email</FieldLabel>
            <input id="ev-contact-email" className="input-field" type="email" placeholder="email@exemple.com" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
          </div>
        </div>
      </Section>

      <Section title="Menu" meta={recipes.length > 0 ? `${recipes.length} ligne${recipes.length > 1 ? "s" : ""}` : undefined}>
        {allRecipes.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">Aucune recette pour l'instant · <Link to="/recipes" className="text-primary hover:underline">Créer une recette</Link></p>
        ) : (
          <SearchSelect options={recipeOptions} value="" onChange={addRecipe} placeholder="Ajouter une recette…" />
        )}

        {recipes.length > 0 && (
          <div className="mt-4">
            {menuGroups.map((group) => (
              <div key={group.course} className="mt-4 first:mt-0">
                <h3 className="text-base font-semibold">{group.course}</h3>
                <ul className="mt-1 divide-y divide-border">
                  {group.lines.map((rl) => {
                    const i = indexById.get(rl.lineId) ?? 0;
                    const rec = recipeById.get(rl.recipeId);
                    const costPerPortion = (recipeCostMap.get(rl.recipeId) || 0) / (recipePortionMap.get(rl.recipeId) || 1);
                    const lineCost = costPerPortion * rl.portions;
                    const courseValue = rl.course ?? rec?.defaultCourse ?? "";
                    const focusSelect = !courseValue && justAdded.current && rl.lineId === lastLineId;
                    return (
                      <li key={rl.lineId} className="py-3">
                        <div className="flex items-center justify-between gap-3">
                          <Link to={`/recipes/${rl.recipeId}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline touch:text-base">
                            {rec?.name || "Recette inconnue"}
                          </Link>
                          <IconButton size="sm" aria-label="Retirer la recette" onClick={() => removeRecipeLine(i)} icon={<X />} />
                        </div>
                        <div className="mt-2 flex flex-wrap items-end gap-3">
                          <div className="w-36">
                            <FieldLabel htmlFor={`ev-line-course-${i}`}>Catégorie</FieldLabel>
                            <select id={`ev-line-course-${i}`} className="input-field" value={courseValue} autoFocus={focusSelect} onChange={(e) => patchLine(i, { course: e.target.value || rec?.defaultCourse || "Autre" })}>
                              {!courseValue && <option value="">Non définie</option>}
                              {courseOptions(courseValue).map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </div>
                          <div className="w-28">
                            <FieldLabel htmlFor={`ev-line-portions-${i}`}>Portions</FieldLabel>
                            <NumericInput id={`ev-line-portions-${i}`} className="input-field text-right" value={rl.portions} onChange={(v) => { const p = Math.max(1, Math.round(v)); if (p !== rl.portions) patchLine(i, { portions: p }); }} min={1} />
                          </div>
                          <div className="ml-auto text-right text-sm text-muted-foreground tabular-nums">
                            <div>{fmt(costPerPortion)} / portion</div>
                            <div className="font-medium text-foreground">{fmt(lineCost)}</div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            <div className="mt-4 flex items-center justify-between border-t border-divider py-3 text-sm font-semibold">
              <span>Sous-total recettes HTVA</span>
              <span className="tabular-nums">{fmt(liveRecipeCost)}</span>
            </div>
          </div>
        )}
      </Section>

      {clientsConfigured && (
        <NewClientDialog
          open={newClientOpen}
          onClose={() => setNewClientOpen(false)}
          initial={{ name: "", kind: "particulier", contactName, phone: contactPhone, email: contactEmail }}
          existing={clients}
          onCreated={onClientCreated}
          onLinkExisting={(cid) => onClientChange(cid)}
        />
      )}

      <Section
        title="Coûts supplémentaires"
        action={<Button variant="ghost" size="sm" icon={<Plus />} onClick={addExtraCost}>Ajouter</Button>}
      >
        {extraCosts.length === 0 && <p className="text-sm text-muted-foreground">Aucun coût supplémentaire.</p>}
        {extraCosts.map((ec, i) => (
          <div key={i} className="mb-2 flex flex-wrap items-center gap-2">
            <input className="input-field min-w-[10rem] flex-1" placeholder="Description…" aria-label="Description" value={ec.label} onChange={(e) => updateExtraCost(i, { label: e.target.value })} />
            <select className="input-field w-36" aria-label="Nature" value={ec.kind ?? "autre"} onChange={(e) => updateExtraCost(i, { kind: e.target.value as ExtraCostKind })}>
              {EXTRA_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
            <NumericInput className="input-field w-28 text-right" aria-label="Montant" value={ec.amount} onChange={(v) => updateExtraCost(i, { amount: v })} />
            <IconButton size="md" aria-label="Retirer le coût" onClick={() => removeExtraCost(i)} icon={<X />} />
          </div>
        ))}
        {extraCosts.length > 0 && (
          <div className="flex justify-between border-t border-divider py-3 text-sm font-semibold">
            <span>Sous-total</span>
            <span className="tabular-nums">{fmt(totalExtraCosts)}</span>
          </div>
        )}
      </Section>

      <Section title="Résumé financier">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="text-sm">
            <span className="text-muted-foreground">Coût calculé recettes : </span>
            <span className="font-semibold tabular-nums">{fmt(liveRecipeCost)}</span>
          </div>
          <div className="flex items-center gap-2">
            <FieldLabel htmlFor="ev-actual-cost" className="!mb-0">Coût réel recettes HTVA</FieldLabel>
            <NumericInput
              id="ev-actual-cost"
              className="input-field w-32 text-right"
              value={actualCost ?? 0}
              onChange={(v) => setActualCost(v > 0 ? v : null)}
              placeholder="0"
            />
            {actualCost !== null && (
              <IconButton size="md" aria-label="Effacer le coût réel" onClick={() => setActualCost(null)} icon={<X />} />
            )}
          </div>
        </div>
        {actualCost !== null && (
          <p className="mt-2 text-sm text-muted-foreground">Le coût réel remplace le coût calculé dans les calculs de marge.</p>
        )}
        <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-lg bg-surface md:grid-cols-4 md:divide-x md:divide-border">
          <MoneyTile flat label="Coût total HTVA" value={fmt(totalCost)} />
          <MoneyTile flat label="Revenu total HTVA" value={fmt(totalRevenue)} />
          <MoneyTile flat label="Marge HTVA" value={<span className={margin >= 0 ? "text-success" : "text-danger"}>{fmt(margin)}</span>} />
          <MoneyTile flat label="Marge %" value={<span className={marginPct >= 0 ? "text-success" : "text-danger"}>{marginPct.toFixed(1).replace(".", ",")} %</span>} />
        </div>
        <div className="mt-2 grid grid-cols-2 overflow-hidden rounded-lg bg-surface md:divide-x md:divide-border">
          <MoneyTile flat label="Coût/convive HTVA" value={fmt(guestCount > 0 ? totalCost / guestCount : 0)} />
          <MoneyTile flat label="Marge/convive HTVA" value={<span className={margin >= 0 ? "text-success" : "text-danger"}>{fmt(guestCount > 0 ? margin / guestCount : 0)}</span>} />
        </div>
      </Section>

      <div className="mt-block flex justify-end gap-2 border-t border-border pt-4">{footer}</div>
    </div>
  );
}
