import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Archive, ArchiveRestore, Trash2, Plus, X, User, Phone, Mail, MapPin, Hash, Receipt, Percent, Euro, Users, FileText, Search } from "lucide-react";
import type {
  AppEvent,
  AppSettings,
  Client,
  ClientTemplate,
  ClientTemplateRequest,
  CreateClientRequest,
  EventExtraCost,
  ExtraCostKind,
  LedgerEntry,
  Person,
  PrestationTypeSetting,
  Recipe,
  TemplateLine,
  UpdateClientRequest,
  VatRate,
  Weekday,
} from "@packages/types";
import { DEFAULT_COURSES, DEFAULT_PRESTATION_TYPES, VAT_RATES, fmtEur, isWeekdayLabel, round2 } from "@packages/types";
import { ApiError, api } from "@/lib/api";
import { longDayLabel, dayMonthShortLabel, dayMonthLabel, todayIso, ymOf } from "@/lib/dates";
import { useToast } from "@/hooks/use-toast";
import { useBackLink, useTopTitle } from "@/components/admin/AdminLayout";
import {
  ActionMenu,
  ListRow,
  PageHeader,
  SearchSelect,
  Section,
  StatusTag,
  Tag,
  Button,
  IconButton,
  Dialog,
  PropertyList,
  Property,
  SelectPill,
  EmptyState,
  EditableInlineNum,
} from "@/components/ui";
import { PersonAssign } from "@/components/admin/PersonPicker";

const WEEKDAYS: { value: Weekday; label: string }[] = [
  { value: 1, label: "Lundi" },
  { value: 2, label: "Mardi" },
  { value: 3, label: "Mercredi" },
  { value: 4, label: "Jeudi" },
  { value: 5, label: "Vendredi" },
  { value: 6, label: "Samedi" },
  { value: 7, label: "Dimanche" },
];

const KIND_OPTIONS = [
  { value: "entreprise", label: "Entreprise", colour: "blue" as const },
  { value: "particulier", label: "Particulier", colour: "purple" as const },
];

const INVOICING_OPTIONS = [
  { value: "par_evenement", label: "Par événement" },
  { value: "mensuelle", label: "Mensuelle" },
];

const EXTRA_KINDS: { value: ExtraCostKind; label: string }[] = [
  { value: "matiere", label: "Matière" },
  { value: "personnel", label: "Personnel" },
  { value: "location", label: "Location" },
  { value: "transport", label: "Transport" },
  { value: "autre", label: "Autre" },
];

const NONE = "__none__";

type ClientForm = Omit<CreateClientRequest, "templates" | "active">;

const EMPTY_FORM: ClientForm = { name: "" };

// Optional fields that the API clears when sent as null.
const CLEARABLE: ReadonlySet<keyof ClientForm> = new Set<keyof ClientForm>([
  "kind", "contactName", "phone", "email", "address", "vatNumber", "defaultPrestationType",
  "defaultVatRate", "defaultPricePerGuest", "defaultGuestCount", "invoicing", "notes",
]);

function toUpdateBody(patch: Partial<ClientForm>): UpdateClientRequest {
  const body: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    const cleared = v === undefined || v === "";
    body[k] = cleared && CLEARABLE.has(k as keyof ClientForm) ? null : v;
  }
  return body as UpdateClientRequest;
}

function formOf(c: Client): ClientForm {
  return {
    name: c.name,
    kind: c.kind,
    contactName: c.contactName,
    phone: c.phone,
    email: c.email,
    address: c.address,
    vatNumber: c.vatNumber,
    defaultPrestationType: c.defaultPrestationType,
    defaultVatRate: c.defaultVatRate,
    defaultPricePerGuest: c.defaultPricePerGuest,
    defaultGuestCount: c.defaultGuestCount,
    invoicing: c.invoicing,
    notes: c.notes,
  };
}

function parseVat(v: string): VatRate | undefined {
  const n = Number(v);
  return (VAT_RATES as readonly number[]).includes(n) ? (n as VatRate) : undefined;
}

function templateFromEvent(ev: AppEvent, weekday: Weekday, existing?: ClientTemplate): ClientTemplate {
  return {
    templateId: existing?.templateId ?? "",
    name: existing?.name ?? ev.name,
    weekday,
    guestCount: ev.guestCount,
    sellingPricePerGuest: ev.sellingPricePerGuest,
    prestationType: ev.prestationType,
    vatRate: ev.vatRate,
    recipes: ev.recipes.map((l) => ({ recipeId: l.recipeId, portions: l.portions, course: l.course, notes: l.notes })),
    extraCosts: (ev.extraCosts ?? []).map((c) => ({ label: c.label, amount: c.amount, kind: c.kind })),
    notes: ev.notes,
    assignedTo: existing?.assignedTo ?? ev.assignedTo,
  };
}

// Strips client-only fields and empty rows so the payload passes the strict schema.
function toTemplatePayload(t: ClientTemplate): ClientTemplateRequest {
  return {
    ...(t.templateId ? { templateId: t.templateId } : {}),
    name: t.name.trim() || "Sans nom",
    weekday: t.weekday,
    guestCount: Math.max(1, Math.round(t.guestCount || 1)),
    sellingPricePerGuest: round2(Math.max(0, t.sellingPricePerGuest || 0)),
    prestationType: t.prestationType || undefined,
    vatRate: t.vatRate,
    recipes: t.recipes.map((l) => ({
      recipeId: l.recipeId,
      portions: Math.max(1, Math.round(l.portions || 1)),
      course: l.course || undefined,
      notes: l.notes || undefined,
    })),
    extraCosts: t.extraCosts
      .filter((c) => c.label.trim())
      .map((c) => ({ label: c.label.trim(), amount: round2(Math.max(0, c.amount || 0)), kind: c.kind })),
    notes: t.notes || undefined,
    ...(t.assignedTo?.length ? { assignedTo: t.assignedTo } : {}),
  };
}

const ROW = "group flex min-h-9 items-center gap-3 rounded px-2 hover:bg-hover touch:min-h-11";

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id;
  const navigate = useNavigate();
  const { toast } = useToast();

  const [client, setClient] = useState<Client | null>(null);
  const [form, setForm] = useState<ClientForm>(EMPTY_FORM);
  const [templates, setTemplates] = useState<ClientTemplate[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [creating, setCreating] = useState(false);

  const [editing, setEditing] = useState<ClientTemplate | null>(null);
  const [pickFor, setPickFor] = useState<Weekday | null>(null);

  const pending = useRef<UpdateClientRequest>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const prestationTypes = settings?.prestationTypes?.length ? settings.prestationTypes : DEFAULT_PRESTATION_TYPES;
  const courses = settings?.courses?.length ? settings.courses : DEFAULT_COURSES;
  const people: Person[] = settings?.people ?? [];
  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.recipeId, r])), [recipes]);

  useBackLink({ to: "/clients", label: "Clients" });
  useTopTitle(isNew ? "Nouveau client" : form.name);

  const loadEvents = useCallback(() => api.events.list().then(setEvents), []);

  useEffect(() => {
    const year = Number(todayIso().slice(0, 4));
    const base: Promise<unknown>[] = [
      api.recipes.list().then(setRecipes),
      api.settings.get().then(setSettings),
      loadEvents(),
      // The ledger table may not exist yet; a failure here must not break the page.
      Promise.allSettled([api.ledger.list(year), api.ledger.list(year - 1)]).then((rs) => {
        setLedger(rs.flatMap((r) => (r.status === "fulfilled" ? r.value : [])));
      }),
    ];
    if (id) {
      base.push(
        api.clients.get(id).then((c) => {
          setClient(c);
          setForm(formOf(c));
          setTemplates(c.templates ?? []);
        }),
      );
    } else {
      setClient(null);
      setForm(EMPTY_FORM);
      setTemplates([]);
    }
    Promise.all(base)
      .catch(() => toast({ title: "Erreur de chargement", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [id, loadEvents, toast]);

  const flush = useCallback(() => {
    if (!id) return;
    const body = pending.current;
    pending.current = {};
    timer.current = null;
    if (Object.keys(body).length === 0) return;
    setSaveState("saving");
    api.clients
      .update(id, body)
      .then((c) => { setClient(c); setSaveState("saved"); })
      .catch(() => { setSaveState("error"); toast({ title: "Erreur d'enregistrement", variant: "destructive" }); });
  }, [id, toast]);

  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); flush(); } }, [flush]);

  const update = (patch: Partial<ClientForm>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    if (isNew) return;
    pending.current = { ...pending.current, ...toUpdateBody(patch) };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 800);
  };

  const create = async () => {
    if (!form.name.trim()) { toast({ title: "Le nom est requis", variant: "destructive" }); return; }
    setCreating(true);
    try {
      const c = await api.clients.create({ ...form, name: form.name.trim(), templates: [], active: true });
      toast({ title: "Client créé" });
      navigate(`/clients/${c.clientId}`, { replace: true });
    } catch {
      toast({ title: "Erreur lors de la création", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const saveTemplates = async (next: ClientTemplate[]) => {
    if (!id) return;
    try {
      const c = await api.clients.update(id, { templates: next.map(toTemplatePayload) });
      setClient(c);
      setTemplates(c.templates ?? []);
      return true;
    } catch {
      toast({ title: "Erreur d'enregistrement du modèle", variant: "destructive" });
      return false;
    }
  };

  const upsertTemplate = async (t: ClientTemplate) => {
    const next = t.templateId && templates.some((x) => x.templateId === t.templateId)
      ? templates.map((x) => (x.templateId === t.templateId ? t : x))
      : [...templates, t];
    const ok = await saveTemplates(next);
    if (ok) { setEditing(null); setPickFor(null); toast({ title: "Modèle enregistré" }); }
  };

  const removeTemplate = async (templateId: string) => {
    if (!window.confirm("Supprimer ce modèle ?")) return;
    const ok = await saveTemplates(templates.filter((t) => t.templateId !== templateId));
    if (ok) { setEditing(null); toast({ title: "Modèle supprimé" }); }
  };

  const startNewTemplate = (weekday: Weekday) => {
    setPickFor(null);
    setEditing({
      templateId: "",
      name: WEEKDAYS.find((w) => w.value === weekday)?.label ?? "",
      weekday,
      guestCount: form.defaultGuestCount ?? 10,
      sellingPricePerGuest: form.defaultPricePerGuest ?? 0,
      prestationType: form.defaultPrestationType,
      vatRate: form.defaultVatRate,
      recipes: [],
      extraCosts: [],
    });
  };

  const applyEvent = (ev: AppEvent, weekday: Weekday) => {
    const existing = templates.find((t) => t.weekday === weekday);
    if (existing && !window.confirm(`Remplacer le modèle du ${WEEKDAYS.find((w) => w.value === weekday)?.label.toLowerCase()} par cet événement ?`)) return;
    void upsertTemplate(templateFromEvent(ev, weekday, existing));
  };

  const setActive = async (active: boolean) => {
    if (!id) return;
    try {
      const c = await api.clients.update(id, { active });
      setClient(c);
      toast({ title: active ? "Client réactivé" : "Client archivé" });
    } catch {
      toast({ title: "Erreur d'enregistrement", variant: "destructive" });
    }
  };

  const remove = async () => {
    if (!id || !window.confirm(`Supprimer le client « ${form.name} » ?`)) return;
    try {
      await api.clients.delete(id);
      toast({ title: "Client supprimé" });
      navigate("/clients");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) toast({ title: "Ce client a des événements, archivez-le", variant: "destructive" });
      else toast({ title: "Erreur lors de la suppression", variant: "destructive" });
    }
  };

  const linkEvents = async () => {
    if (!id) return;
    try {
      const r = await api.clients.linkEvents(id, {
        contactEmail: form.email?.trim() || undefined,
        contactName: form.contactName?.trim() || undefined,
      });
      toast({ title: `${r.linked} événement${r.linked === 1 ? "" : "s"} associé${r.linked === 1 ? "" : "s"}` });
      await loadEvents();
    } catch {
      toast({ title: "Erreur lors de l'association", variant: "destructive" });
    }
  };

  const clientEvents = useMemo(
    () => (id ? events.filter((e) => e.clientId === id).sort((a, b) => b.date.localeCompare(a.date)) : []),
    [events, id],
  );
  const invoiceNumberByEvent = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of ledger) {
      if (e.book !== "ventes" || e.kind !== "facture") continue;
      for (const evId of e.eventIds ?? []) m.set(evId, e.number ?? "");
    }
    return m;
  }, [ledger]);
  const clientEntries = useMemo(
    () => (id ? ledger.filter((e) => e.clientId === id).sort((a, b) => b.date.localeCompare(a.date)) : []),
    [ledger, id],
  );

  if (loading) return <p className="p-8 text-muted-foreground">Chargement…</p>;
  if (!isNew && !client) return <p className="p-8 text-muted-foreground">Client introuvable.</p>;

  const saveLabel = saveState === "saving" ? "Enregistrement…" : saveState === "saved" ? "Enregistré" : saveState === "error" ? "Non enregistré" : "";
  const prestationLabel = (key?: string) => (key ? prestationTypes.find((p) => p.key === key)?.label ?? key : undefined);
  const facturerMois = () => navigate(`/comptes/journal?client=${id}&prefill=month&ym=${ymOf(todayIso())}`);
  const canLink = Boolean(form.email?.trim() || form.contactName?.trim());

  const properties = (
    <PropertyList>
      <Property icon="🏷" label="Type" kind="select" value={form.kind ?? ""} options={[...KIND_OPTIONS, { value: NONE, label: "Non précisé" }]} onSave={(v) => update({ kind: (v === NONE ? undefined : v) as ClientForm["kind"] })} />
      <Property icon={User} label="Contact" kind="text" value={form.contactName ?? ""} placeholder="Ajouter un contact" onSave={(v) => update({ contactName: v })} />
      <Property icon={Phone} label="Téléphone" kind="text" value={form.phone ?? ""} placeholder="Ajouter un téléphone" onSave={(v) => update({ phone: v })} />
      <Property icon={Mail} label="Email" kind="text" value={form.email ?? ""} placeholder="Ajouter un e-mail" onSave={(v) => update({ email: v })} />
      <Property icon={MapPin} label="Adresse" kind="text" value={form.address ?? ""} onSave={(v) => update({ address: v })} />
      <Property icon={Hash} label="Numéro de TVA" kind="text" value={form.vatNumber ?? ""} onSave={(v) => update({ vatNumber: v })} />
      <Property icon={Receipt} label="Facturation" kind="select" value={form.invoicing ?? ""} options={[...INVOICING_OPTIONS, { value: NONE, label: "Non précisé" }]} colour="gray" onSave={(v) => update({ invoicing: (v === NONE ? undefined : v) as ClientForm["invoicing"] })} />
      <Property
        icon="🍽"
        label="Prestation par défaut"
        kind="select"
        value={form.defaultPrestationType ?? ""}
        options={[...prestationTypes.map((p) => ({ value: p.key, label: p.label })), { value: NONE, label: "Non précisé" }]}
        colour="gray"
        onSave={(v) => {
          const key = v === NONE ? undefined : v;
          const vat = prestationTypes.find((p) => p.key === key)?.defaultVatRate;
          update({ defaultPrestationType: key, ...(vat !== undefined && form.defaultVatRate === undefined ? { defaultVatRate: vat } : {}) });
        }}
      />
      <Property icon={Percent} label="TVA par défaut" kind="select" value={form.defaultVatRate === undefined ? "" : String(form.defaultVatRate)} options={[...VAT_RATES.map((r) => ({ value: String(r), label: `${r} %` })), { value: NONE, label: "Non précisé" }]} colour="gray" onSave={(v) => update({ defaultVatRate: v === NONE ? undefined : parseVat(v) })} />
      <Property icon={Euro} label="Prix par convive" kind="number" value={form.defaultPricePerGuest ?? null} min={0} decimals={2} suffix="€" onSave={(v) => update({ defaultPricePerGuest: v > 0 ? round2(v) : undefined })} />
      <Property icon={Users} label="Convives par défaut" kind="number" value={form.defaultGuestCount ?? null} min={1} decimals={0} onSave={(v) => update({ defaultGuestCount: v > 0 ? Math.round(v) : undefined })} />
      <Property icon={FileText} label="Notes" kind="multiline" value={form.notes ?? ""} placeholder="Ajouter une note…" onSave={(v) => update({ notes: v })} />
    </PropertyList>
  );

  return (
    <div className="mx-auto max-w-doc">
      <PageHeader
        breadcrumb={[{ label: "Clients", to: "/clients" }, { label: isNew ? "Nouveau client" : form.name || "Client" }]}
        iconKey={form.kind === "particulier" ? "particulier" : "client"}
        title={form.name}
        titlePlaceholder="Nom du client"
        onTitleChange={(v) => update({ name: v })}
        meta={[client && client.active === false ? "Archivé" : undefined, saveLabel || undefined].filter(Boolean).join(" · ") || undefined}
        actions={
          !isNew && (
            <>
              <Button variant="default" size="md" onClick={facturerMois} className="hidden md:inline-flex">Facturer le mois</Button>
              <ActionMenu
                title={form.name}
                items={[
                  client?.active === false
                    ? { label: "Réactiver", icon: <ArchiveRestore />, onClick: () => void setActive(true) }
                    : { label: "Archiver", icon: <Archive />, onClick: () => void setActive(false) },
                  { kind: "separator" },
                  { label: "Supprimer", icon: <Trash2 />, variant: "danger", onClick: () => void remove() },
                ]}
              />
            </>
          )
        }
        properties={properties}
      />

      {isNew && (
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="md" onClick={() => void create()} disabled={creating || !form.name.trim()}>Créer</Button>
          <Button variant="default" size="md" onClick={() => navigate("/clients")}>Annuler</Button>
        </div>
      )}

      <Section title="Semaine type" meta={isNew ? undefined : "Un modèle par jour de livraison"}>
        {isNew ? (
          <p className="text-sm text-muted-foreground">Créez le client pour configurer sa semaine type.</p>
        ) : (
          <div className="divide-y divide-border">
            {WEEKDAYS.map((w) => {
              const dayTemplates = templates.filter((t) => t.weekday === w.value);
              if (dayTemplates.length === 0) {
                return (
                  <div key={w.value} className={ROW}>
                    <span className="w-24 shrink-0 text-sm text-muted-foreground touch:text-base">{w.label}</span>
                    <Button variant="link" size="sm" icon={<Plus />} onClick={() => startNewTemplate(w.value)} className="-mx-2">Ajouter un jour</Button>
                    <div className="ml-auto">
                      <ActionMenu className="reveal" title={w.label} items={[{ label: "Créer depuis un événement", onClick: () => { setEditing(null); setPickFor(w.value); } }]} />
                    </div>
                  </div>
                );
              }
              return dayTemplates.map((t) => (
                <TemplateRow
                  key={t.templateId}
                  dayLabel={w.label}
                  template={t}
                  recipeById={recipeById}
                  courses={courses}
                  prestationLabel={prestationLabel(t.prestationType)}
                  people={people}
                  onAssign={(next) => void saveTemplates(templates.map((x) => (x.templateId === t.templateId ? { ...x, assignedTo: next } : x)))}
                  onOpen={() => { setPickFor(null); setEditing({ ...t, recipes: [...t.recipes], extraCosts: [...t.extraCosts] }); }}
                  onFromEvent={() => { setEditing(null); setPickFor(w.value); }}
                  onDelete={() => void removeTemplate(t.templateId)}
                />
              ));
            })}
          </div>
        )}
      </Section>

      {!isNew && (
        <>
          <Section
            title="Historique"
            action={
              <Button variant="default" size="sm" onClick={() => void linkEvents()} disabled={!canLink} title="Associe les événements dont le contact correspond" className="hidden md:inline-flex">
                Associer les événements existants
              </Button>
            }
          >
            <Button variant="default" size="lg" onClick={() => void linkEvents()} disabled={!canLink} className="mb-3 w-full md:hidden">Associer les événements existants</Button>
            {clientEvents.length === 0 ? (
              <EmptyState message="Aucun événement pour ce client." action={{ label: "+ Nouvel événement", to: `/events/new?client=${id}` }} />
            ) : (
              <div className="divide-y divide-border">
                {clientEvents.map((ev) => {
                  const inv = invoiceNumberByEvent.get(ev.eventId);
                  return (
                    <ListRow
                      key={ev.eventId}
                      to={`/events/${ev.eventId}`}
                      title={ev.name}
                      subtitle={`${dayMonthShortLabel(ev.date)} · ${ev.guestCount} convives`}
                      trailing={
                        <>
                          {inv !== undefined && <StatusTag status="invoiced" label={inv ? `Facturé n° ${inv}` : "Facturé"} />}
                          <Tag colour="gray">Signé {fmtEur((ev.sellingPricePerGuest || 0) * (ev.guestCount || 0))}</Tag>
                        </>
                      }
                    />
                  );
                })}
              </div>
            )}
          </Section>

          <Section title="Journal">
            <Button variant="default" size="lg" onClick={facturerMois} className="mb-3 w-full md:hidden">Facturer le mois</Button>
            {clientEntries.length === 0 ? (
              <EmptyState message="Aucune écriture pour ce client." />
            ) : (
              <div className="divide-y divide-border">
                {clientEntries.map((e) => (
                  <ListRow
                    key={e.entryId}
                    title={e.label}
                    subtitle={[dayMonthLabel(e.date), e.number ? `n° ${e.number}` : undefined].filter(Boolean).join(" · ")}
                    trailing={
                      <>
                        <span>{fmtEur(e.htva)} HTVA</span>
                        {e.paid ? <StatusTag status="paid" /> : <StatusTag status="unpaid" label="À payer" />}
                      </>
                    }
                  />
                ))}
              </div>
            )}
          </Section>
        </>
      )}

      <Dialog open={pickFor !== null} onClose={() => setPickFor(null)} title="Créer depuis un événement" size="md">
        {pickFor !== null && <EventPicker events={events} clientId={id!} onPick={(ev) => applyEvent(ev, pickFor)} />}
      </Dialog>

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? (editing.templateId ? `Modèle du ${WEEKDAYS.find((w) => w.value === editing.weekday)?.label.toLowerCase()}` : `Nouveau modèle du ${WEEKDAYS.find((w) => w.value === editing.weekday)?.label.toLowerCase()}`) : ""}
        size="md"
        footer={editing ? (
          <>
            {editing.templateId && <Button variant="danger" size="md" onClick={() => void removeTemplate(editing.templateId)} className="mr-auto">Supprimer</Button>}
            <Button variant="default" size="md" onClick={() => setEditing(null)}>Annuler</Button>
            <Button variant="primary" size="md" onClick={() => void upsertTemplate(editing)} disabled={!editing.name.trim() || editing.guestCount < 1}>Enregistrer</Button>
          </>
        ) : undefined}
      >
        {editing && (
          <TemplateEditor
            template={editing}
            recipes={recipes}
            courses={courses}
            prestationTypes={prestationTypes}
            onChange={setEditing}
          />
        )}
      </Dialog>
    </div>
  );
}

function TemplateRow({ dayLabel, template: t, recipeById, courses, prestationLabel, people, onAssign, onOpen, onFromEvent, onDelete }: {
  dayLabel: string;
  template: ClientTemplate;
  recipeById: Map<string, Recipe>;
  courses: string[];
  prestationLabel?: string;
  people: Person[];
  onAssign: (next: string[]) => void;
  onOpen: () => void;
  onFromEvent: () => void;
  onDelete: () => void;
}) {
  const lines = useMemo(() => {
    const order = (c: string) => { const i = courses.indexOf(c); return i === -1 ? courses.length : i; };
    return [...t.recipes].sort((a, b) => order(a.course || recipeById.get(a.recipeId)?.defaultCourse || "Autre") - order(b.course || recipeById.get(b.recipeId)?.defaultCourse || "Autre"));
  }, [t.recipes, recipeById, courses]);

  const title = !isWeekdayLabel(t.name) && t.name !== dayLabel ? t.name : undefined;
  const tags = (
    <>
      {title && <span className="text-sm text-muted-foreground">{title}</span>}
      {lines.map((l, i) => (
        <Tag key={`${l.recipeId}-${i}`} colour="gray">{recipeById.get(l.recipeId)?.name ?? "Recette inconnue"} ×{l.portions}</Tag>
      ))}
      {lines.length === 0 && <span className="text-sm text-placeholder">Aucune recette</span>}
      {prestationLabel && <Tag colour="blue">{prestationLabel}</Tag>}
    </>
  );
  const controls = (
    <span className="ml-auto flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <PersonAssign value={t.assignedTo ?? []} options={people} onChange={onAssign} size="sm" title="Équipe du modèle" align="right" />
      <ActionMenu
        className="reveal"
        title={dayLabel}
        items={[
          { label: "Modifier", onClick: onOpen },
          { label: "Créer depuis un événement", onClick: onFromEvent },
          { kind: "separator" },
          { label: "Supprimer", variant: "danger", onClick: onDelete },
        ]}
      />
    </span>
  );

  return (
    <div className="group cursor-pointer rounded px-2 py-1 hover:bg-hover" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}>
      <div className="hidden min-h-7 items-center gap-3 md:flex">
        <span className="w-24 shrink-0 text-sm font-medium">{dayLabel}</span>
        <span className="w-12 shrink-0 text-sm tabular-nums">{t.guestCount}</span>
        <span className="w-32 shrink-0 text-sm tabular-nums text-muted-foreground">{fmtEur(t.sellingPricePerGuest)} · {fmtEur(t.guestCount * t.sellingPricePerGuest)}</span>
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">{tags}</span>
        {controls}
      </div>
      <div className="md:hidden">
        <div className="flex min-h-11 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-base"><span className="font-medium">{dayLabel}</span> <span className="text-muted-foreground">· {t.guestCount} conv. · {fmtEur(t.guestCount * t.sellingPricePerGuest)}</span></span>
          {controls}
        </div>
        <div className="flex flex-wrap items-center gap-1 pb-2">{tags}</div>
      </div>
    </div>
  );
}

function EventPicker({ events, clientId, onPick }: {
  events: AppEvent[];
  clientId: string;
  onPick: (ev: AppEvent) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const list = useMemo(() => {
    const pool = q ? events.filter((e) => e.name.toLowerCase().includes(q)) : events.filter((e) => e.clientId === clientId);
    return [...pool].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
  }, [events, clientId, q]);

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-icon" />
        <input className="input-field pl-7" placeholder="Rechercher un événement…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
      </div>
      <p className="mt-1 text-caption text-muted-foreground">{q ? "Tous les événements" : "Événements de ce client. Tapez un nom pour chercher parmi tous."}</p>
      {list.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Aucun événement.</p>
      ) : (
        <div className="mt-2 divide-y divide-border">
          {list.map((ev) => (
            <ListRow key={ev.eventId} title={ev.name} subtitle={`${longDayLabel(ev.date)} · ${ev.guestCount} convives · ${ev.recipes.length} recettes`} onClick={() => onPick(ev)} />
          ))}
        </div>
      )}
    </div>
  );
}

function TemplateEditor({ template: t, recipes, courses, prestationTypes, onChange }: {
  template: ClientTemplate;
  recipes: Recipe[];
  courses: string[];
  prestationTypes: PrestationTypeSetting[];
  onChange: (t: ClientTemplate) => void;
}) {
  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.recipeId, r])), [recipes]);
  const options = useMemo(
    () => [...recipes].sort((a, b) => a.name.localeCompare(b.name, "fr")).map((r) => ({ value: r.recipeId, label: r.name, detail: r.type })),
    [recipes],
  );
  const set = (patch: Partial<ClientTemplate>) => onChange({ ...t, ...patch });
  const setLine = (i: number, patch: Partial<TemplateLine>) => set({ recipes: t.recipes.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const setExtra = (i: number, patch: Partial<EventExtraCost>) => set({ extraCosts: t.extraCosts.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const courseOptions = courses.map((c) => ({ value: c, label: c }));

  return (
    <div>
      <PropertyList className="mt-0">
        <Property label="Nom du modèle" kind="text" value={t.name} onSave={(v) => set({ name: v })} />
        <Property icon={Users} label="Convives" kind="number" value={t.guestCount || null} min={1} decimals={0} onSave={(v) => set({ guestCount: Math.round(v) })} />
        <Property icon={Euro} label="Prix par convive" kind="number" value={t.sellingPricePerGuest || null} min={0} decimals={2} suffix="€" onSave={(v) => set({ sellingPricePerGuest: v })} />
        <Property
          icon="🍽"
          label="Prestation"
          kind="select"
          value={t.prestationType ?? ""}
          options={[...prestationTypes.map((p) => ({ value: p.key, label: p.label })), { value: NONE, label: "Non précisé" }]}
          colour="gray"
          onSave={(v) => {
            const key = v === NONE ? undefined : v;
            const vat = prestationTypes.find((p) => p.key === key)?.defaultVatRate;
            set({ prestationType: key, ...(vat !== undefined ? { vatRate: vat } : {}) });
          }}
        />
        <Property icon={Percent} label="TVA" kind="select" value={t.vatRate === undefined ? "" : String(t.vatRate)} options={[...VAT_RATES.map((r) => ({ value: String(r), label: `${r} %` })), { value: NONE, label: "Non précisé" }]} colour="gray" onSave={(v) => set({ vatRate: v === NONE ? undefined : parseVat(v) })} />
        <Property icon={FileText} label="Notes" kind="multiline" value={t.notes ?? ""} placeholder="Ajouter une note…" onSave={(v) => set({ notes: v })} />
      </PropertyList>

      <h3 className="mt-5 text-base font-semibold">Recettes</h3>
      {t.recipes.length > 0 && (
        <ul className="mt-1">
          {t.recipes.map((l, i) => (
            <li key={`${l.recipeId}-${i}`} className="group flex min-h-9 items-center gap-2 rounded px-1 hover:bg-hover touch:min-h-11">
              <span className="min-w-0 flex-1 truncate">{recipeById.get(l.recipeId)?.name ?? "Recette inconnue"}</span>
              <SelectPill value={l.course ?? ""} options={courseOptions} colour="gray" placeholder="Catégorie" align="right" aria-label="Catégorie" onChange={(v) => setLine(i, { course: v || undefined })} />
              <span className="w-20 text-right tabular-nums">
                <EditableInlineNum value={l.portions || 0} min={1} onSave={(v) => setLine(i, { portions: Math.round(v) })} suffix=" port." />
              </span>
              <IconButton size="sm" aria-label="Retirer" onClick={() => set({ recipes: t.recipes.filter((_, j) => j !== i) })} icon={<X />} className="reveal" />
            </li>
          ))}
        </ul>
      )}
      <SearchSelect
        className="mt-2"
        options={options}
        value=""
        placeholder="Ajouter une recette…"
        onChange={(recipeId) => {
          const r = recipeById.get(recipeId);
          if (!r) return;
          set({ recipes: [...t.recipes, { recipeId, portions: t.guestCount || 1, course: r.defaultCourse }] });
        }}
      />

      <div className="mt-5 flex items-center justify-between">
        <h3 className="text-base font-semibold">Coûts annexes</h3>
        <Button variant="ghost" size="sm" icon={<Plus />} onClick={() => set({ extraCosts: [...t.extraCosts, { label: "", amount: 0 }] })}>Ajouter</Button>
      </div>
      {t.extraCosts.map((c, i) => (
        <div key={i} className="group mt-1 flex items-center gap-2">
          <input aria-label="Libellé" className="input-field min-w-0 flex-1" placeholder="Libellé" value={c.label} onChange={(e) => setExtra(i, { label: e.target.value })} />
          <SelectPill value={c.kind ?? ""} options={EXTRA_KINDS} colour="gray" placeholder="Nature" align="right" aria-label="Nature" onChange={(v) => setExtra(i, { kind: (v || undefined) as ExtraCostKind | undefined })} />
          <span className="w-20 text-right tabular-nums">
            <EditableInlineNum value={c.amount || 0} min={0} onSave={(v) => setExtra(i, { amount: v })} suffix=" €" />
          </span>
          <IconButton size="sm" aria-label="Retirer" onClick={() => set({ extraCosts: t.extraCosts.filter((_, j) => j !== i) })} icon={<X />} />
        </div>
      ))}
    </div>
  );
}
