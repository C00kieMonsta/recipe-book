import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { Check, Plus, X, Search } from "lucide-react";
import type {
  AppEvent,
  AppSettings,
  Client,
  ClientKind,
  EventExtraCost,
  EventRecipeLine,
  EventStatus,
  ExtraCostKind,
  Ingredient,
  PrestationTypeSetting,
  Recipe,
  VatRate,
} from "@packages/types";
import { DEFAULT_COURSES, DEFAULT_PRESTATION_TYPES, VAT_RATES } from "@packages/types";
import { api, type EventInput } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { calcEventCost, calcRecipeCost, fmt } from "@/lib/recipe-helpers";
import { FieldLabel, NumericInput, PageHeader, Section, Tag } from "@/components/ui";

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

const ICON_BTN = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-hover hover:text-foreground";

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
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
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
  const [status, setStatus] = useState<EventStatus>("upcoming");
  const [clientId, setClientId] = useState("");
  const [prestationType, setPrestationType] = useState("");
  const [vatRate, setVatRate] = useState<VatRate | undefined>(undefined);
  const [recipeSearch, setRecipeSearch] = useState("");

  const [newClientOpen, setNewClientOpen] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientKind, setNewClientKind] = useState<ClientKind>("entreprise");
  const [creatingClient, setCreatingClient] = useState(false);

  const initialized = useRef(false);
  const savingRef = useRef(false);
  const guestCountTouched = useRef(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>();

  const prestationTypes: PrestationTypeSetting[] = settings?.prestationTypes?.length ? settings.prestationTypes : DEFAULT_PRESTATION_TYPES;
  const courses: string[] = settings?.courses?.length ? settings.courses : DEFAULT_COURSES;

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

  useEffect(() => {
    const load = async () => {
      try {
        const [recs, ings, cls, st] = await Promise.all([api.recipes.list(), api.ingredients.list(), api.clients.list(), api.settings.get()]);
        setAllRecipes(recs);
        setAllIngredients(ings);
        setClients(cls);
        setSettings(st);
        const types = st.prestationTypes?.length ? st.prestationTypes : DEFAULT_PRESTATION_TYPES;
        if (!isNew && id) {
          const ev = await api.events.get(id);
          setName(ev.name); setDate(ev.date); setGuestCount(ev.guestCount);
          guestCountTouched.current = true;
          setRecipes(ev.recipes); setExtraCosts(ev.extraCosts);
          setSellingPricePerGuest(ev.sellingPricePerGuest);
          setNotes(ev.notes || ""); setStatus(ev.status);
          setContactName(ev.contactName || ""); setContactPhone(ev.contactPhone || ""); setContactEmail(ev.contactEmail || "");
          if (ev.actualCost !== undefined) setActualCost(ev.actualCost ?? null);
          setClientId(ev.clientId || "");
          setPrestationType(ev.prestationType || "");
          setVatRate(ev.vatRate);
          setSavedOnce(true);
        } else {
          const dateParam = searchParams.get("date");
          if (dateParam && ISO_DATE.test(dateParam)) setDate(dateParam);
          const clientParam = searchParams.get("client");
          const c = clientParam ? cls.find((x) => x.clientId === clientParam) : undefined;
          if (c) { setClientId(c.clientId); applyClientDefaults(c, types); }
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
    notes: notes || undefined, status, actualCost,
    contactName: contactName || undefined, contactPhone: contactPhone || undefined, contactEmail: contactEmail || undefined,
    clientId: clientId || undefined, prestationType: prestationType || undefined, vatRate,
  }), [name, date, guestCount, extraCosts, sellingPricePerGuest, notes, status, actualCost, contactName, contactPhone, contactEmail, clientId, prestationType, vatRate]);

  // Recipes travel in the payload only until the event exists; after that the line endpoints own them.
  const buildPayload = useCallback((): EventInput => {
    const scalars = scalarPayload();
    if (currentId) return scalars;
    return { ...scalars, recipes };
  }, [scalarPayload, currentId, recipes]);

  const canCreate = Boolean(name.trim()) && (Boolean(currentId) || Boolean(prestationType));

  const autoSave = useCallback(async () => {
    if (savingRef.current) return;
    if (!canCreate) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const payload = buildPayload();
      if (currentId) {
        await api.events.update(currentId, payload);
      } else {
        const created = await api.events.create(payload);
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
    }
  }, [canCreate, currentId, buildPayload, navigate, toast]);

  const autoSaveRef = useRef(autoSave);
  autoSaveRef.current = autoSave;

  useEffect(() => {
    if (!initialized.current) return;
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => { autoSaveRef.current(); }, 800);
    return () => clearTimeout(autoSaveTimer.current);
  }, [name, date, guestCount, extraCosts, sellingPricePerGuest, notes, status, actualCost, contactName, contactPhone, contactEmail, clientId, prestationType, vatRate, localLineVersion]);

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

  const filteredRecipes = useMemo(() => {
    if (!recipeSearch) return allRecipes.slice(0, 10);
    return allRecipes.filter((r) => r.name.toLowerCase().includes(recipeSearch.toLowerCase())).slice(0, 10);
  }, [allRecipes, recipeSearch]);

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
    const line: LocalLine = { recipeId, portions: guestCount, course: rec?.defaultCourse };
    setRecipeSearch("");
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
    if (c) applyClientDefaults(c, prestationTypes);
  };

  const createClient = async () => {
    const trimmed = newClientName.trim();
    if (!trimmed) return;
    setCreatingClient(true);
    try {
      const c = await api.clients.create({ name: trimmed, kind: newClientKind, templates: [], active: true });
      setClients([...clients, c].sort((a, b) => a.name.localeCompare(b.name, "fr")));
      setClientId(c.clientId);
      applyClientDefaults(c, prestationTypes);
      setNewClientOpen(false);
      setNewClientName("");
    } catch {
      toast({ title: "Erreur lors de la création du client", variant: "destructive" });
    } finally {
      setCreatingClient(false);
    }
  };

  const onPrestationChange = (key: string) => {
    setPrestationType(key);
    if (vatRate === undefined) setVatRate(defaultVatFor(prestationTypes, key));
  };

  const handleDone = async () => {
    clearTimeout(autoSaveTimer.current);
    if (!name.trim()) { navigate("/events"); return; }
    if (!currentId && !prestationType) {
      toast({ title: "Choisissez un type de prestation pour enregistrer l'événement", variant: "destructive" });
      return;
    }
    await autoSave();
    navigate(currentId ? `/events/${currentId}` : "/events");
  };

  if (loading) return <div className="p-8 text-base text-muted-foreground">Chargement…</div>;

  const hint = saving
    ? "Sauvegarde…"
    : savedOnce
      ? "Enregistré ✓"
      : !name.trim()
        ? "Saisissez un nom pour démarrer"
        : !prestationType
          ? "Choisissez un type de prestation"
          : "";

  const courseOptions = (current: string | undefined) =>
    current && !courses.includes(current) ? [current, ...courses] : courses;

  return (
    <div className="mx-auto max-w-doc">
      <PageHeader
        breadcrumb={[{ label: "Événements", to: "/events" }, { label: isNew && !currentId ? "Nouveau" : name || "Événement" }]}
        title={isNew && !currentId ? "Nouvel événement" : name || "Modifier l'événement"}
        meta={hint || undefined}
        actions={
          <button onClick={handleDone} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-base font-medium text-primary-foreground hover:opacity-90">
            <Check className="h-5 w-5" /> Terminé
          </button>
        }
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
              <option value={NEW_CLIENT}>Nouveau client…</option>
            </select>
            {newClientOpen && (
              <div className="mt-3 rounded-lg border border-border bg-surface p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor="new-client-name">Nom du client</FieldLabel>
                    <input id="new-client-name" className="input-field" autoFocus value={newClientName} onChange={(e) => setNewClientName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); createClient(); } }} />
                  </div>
                  <div>
                    <FieldLabel htmlFor="new-client-kind">Type</FieldLabel>
                    <select id="new-client-kind" className="input-field" value={newClientKind} onChange={(e) => setNewClientKind(e.target.value as ClientKind)}>
                      <option value="entreprise">Entreprise</option>
                      <option value="particulier">Particulier</option>
                    </select>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={createClient} disabled={creatingClient || !newClientName.trim()} className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-base font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
                    Créer le client
                  </button>
                  <button type="button" onClick={() => { setNewClientOpen(false); setNewClientName(""); }} className="inline-flex min-h-11 items-center rounded-lg border border-input px-4 text-base hover:bg-hover">
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </div>
          <div>
            <FieldLabel htmlFor="ev-prestation">
              <span className="inline-flex items-center gap-2">
                Type de prestation
                {!prestationType && currentId && <Tag variant="warning">À renseigner</Tag>}
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
            <FieldLabel>Nombre de convives</FieldLabel>
            <NumericInput className="input-field" value={guestCount} onChange={(v) => { guestCountTouched.current = true; setGuestCount(v); }} min={1} />
          </div>
          <div>
            <FieldLabel>Prix de vente par convive HTVA (€)</FieldLabel>
            <NumericInput className="input-field" value={sellingPricePerGuest} onChange={setSellingPricePerGuest} />
          </div>
          <div>
            <FieldLabel htmlFor="ev-status">Statut</FieldLabel>
            <select id="ev-status" className="input-field" value={status} onChange={(e) => setStatus(e.target.value as EventStatus)}>
              <option value="upcoming">À venir</option>
              <option value="completed">Terminé</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="ev-notes">Notes</FieldLabel>
            <textarea id="ev-notes" className="input-field min-h-[80px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
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
        <div className="relative">
          <div className="flex min-h-11 items-center gap-2 rounded-lg border border-input bg-card px-3">
            <Search className="h-5 w-5 text-muted-foreground" />
            <input className="flex-1 bg-transparent text-base outline-none" placeholder="Ajouter une recette…" value={recipeSearch} onChange={(e) => setRecipeSearch(e.target.value)} />
          </div>
          {recipeSearch && filteredRecipes.length > 0 && (
            <div className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-border bg-card shadow-lg">
              {filteredRecipes.map((r) => (
                <button key={r.recipeId} type="button" onClick={() => addRecipe(r.recipeId)} className="flex min-h-11 w-full items-center justify-between gap-3 px-4 text-left text-base hover:bg-hover">
                  <span className="font-medium">{r.name}</span>
                  <span className="text-sm text-muted-foreground">{r.type}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {recipes.length > 0 && (
          <ul className="mt-4 divide-y divide-border">
            {recipes.map((rl, i) => {
              const rec = allRecipes.find((r) => r.recipeId === rl.recipeId);
              const costPerPortion = (recipeCostMap.get(rl.recipeId) || 0) / (recipePortionMap.get(rl.recipeId) || 1);
              const lineCost = costPerPortion * rl.portions;
              const courseValue = rl.course ?? "";
              return (
                <li key={rl.lineId ?? `local-${i}`} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <Link to={`/recipes/${rl.recipeId}`} className="min-w-0 flex-1 text-base font-medium hover:text-primary hover:underline">
                      {rec?.name || "Recette inconnue"}
                    </Link>
                    <button type="button" onClick={() => removeRecipeLine(i)} className={ICON_BTN} aria-label="Retirer la recette">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-end gap-3">
                    <div className="w-36">
                      <FieldLabel className="!text-sm !text-muted-foreground">Catégorie</FieldLabel>
                      <select className="input-field" value={courseValue} onChange={(e) => patchLine(i, { course: e.target.value })}>
                        <option value="">Non définie</option>
                        {courseOptions(rl.course).map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="w-28">
                      <FieldLabel className="!text-sm !text-muted-foreground">Portions</FieldLabel>
                      <NumericInput className="input-field text-right" value={rl.portions} onChange={(v) => { if (v !== rl.portions) patchLine(i, { portions: v }); }} min={1} />
                    </div>
                    <div className="ml-auto text-right text-sm text-muted-foreground tabular-nums">
                      <div>{fmt(costPerPortion)} / portion</div>
                      <div className="text-base font-medium text-foreground">{fmt(lineCost)}</div>
                    </div>
                  </div>
                </li>
              );
            })}
            <li className="flex items-center justify-between py-3 text-base font-semibold">
              <span>Sous-total recettes HTVA</span>
              <span className="tabular-nums">{fmt(liveRecipeCost)}</span>
            </li>
          </ul>
        )}
      </Section>

      <Section
        title="Coûts supplémentaires"
        action={
          <button type="button" onClick={addExtraCost} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-input px-3 text-base font-medium hover:bg-hover">
            <Plus className="h-5 w-5" /> Ajouter
          </button>
        }
      >
        {extraCosts.length === 0 && <p className="text-base text-muted-foreground">Aucun coût supplémentaire.</p>}
        {extraCosts.map((ec, i) => (
          <div key={i} className="mb-3 flex flex-wrap items-center gap-3">
            <input className="input-field min-w-[10rem] flex-1" placeholder="Description…" value={ec.label} onChange={(e) => updateExtraCost(i, { label: e.target.value })} />
            <select className="input-field w-36" value={ec.kind ?? "autre"} onChange={(e) => updateExtraCost(i, { kind: e.target.value as ExtraCostKind })}>
              {EXTRA_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
            <NumericInput className="input-field w-28 text-right" value={ec.amount} onChange={(v) => updateExtraCost(i, { amount: v })} />
            <button type="button" onClick={() => removeExtraCost(i)} className={ICON_BTN} aria-label="Retirer le coût">
              <X className="h-5 w-5" />
            </button>
          </div>
        ))}
        {extraCosts.length > 0 && (
          <div className="flex justify-between border-t border-border py-3 text-base font-semibold">
            <span>Sous-total</span>
            <span className="tabular-nums">{fmt(totalExtraCosts)}</span>
          </div>
        )}
      </Section>

      <Section title="Résumé financier">
        <div className="rounded-lg bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="text-base">
              <span className="text-muted-foreground">Coût calculé recettes : </span>
              <span className="font-semibold tabular-nums">{fmt(liveRecipeCost)}</span>
            </div>
            <div className="flex items-center gap-2">
              <FieldLabel className="!mb-0">Coût réel recettes HTVA</FieldLabel>
              <NumericInput
                className="input-field w-32 text-right"
                value={actualCost ?? 0}
                onChange={(v) => setActualCost(v > 0 ? v : null)}
                placeholder="0"
              />
              {actualCost !== null && (
                <button type="button" onClick={() => setActualCost(null)} className={ICON_BTN} aria-label="Effacer le coût réel">
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
          {actualCost !== null && (
            <p className="mt-2 text-sm text-muted-foreground">Le coût réel remplace le coût calculé dans les calculs de marge.</p>
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
          <SummaryCard label="Coût total HTVA" value={fmt(totalCost)} />
          <SummaryCard label="Revenu total HTVA" value={fmt(totalRevenue)} />
          <SummaryCard label="Marge HTVA" value={fmt(margin)} className={margin >= 0 ? "text-success" : "text-destructive"} />
          <SummaryCard label="Marge %" value={`${marginPct.toFixed(1)} %`} className={marginPct >= 0 ? "text-success" : "text-destructive"} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-4">
          <SummaryCard label="Coût/convive HTVA" value={fmt(guestCount > 0 ? totalCost / guestCount : 0)} />
          <SummaryCard label="Marge/convive HTVA" value={fmt(guestCount > 0 ? margin / guestCount : 0)} className={margin >= 0 ? "text-success" : "text-destructive"} />
        </div>
      </Section>
    </div>
  );
}

function SummaryCard({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className="card-elevated p-4 text-center">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lead font-semibold tabular-nums ${className}`}>{value}</div>
    </div>
  );
}
