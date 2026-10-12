import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Archive, ArchiveRestore, ChevronDown, ChevronUp, Plus, Search, Trash2, X } from "lucide-react";
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
import { dayMonthLabel, longDayLabel, todayIso, ymOf } from "@/lib/dates";
import { useToast } from "@/hooks/use-toast";
import { ActionMenu, FieldLabel, ListRow, PageHeader, SearchSelect, Section, StatusTag, Tag } from "@/components/ui";
import { EditableText } from "@/components/ui/editable";
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

const KIND_LABEL: Record<NonNullable<Client["kind"]>, string> = {
  entreprise: "Entreprise",
  particulier: "Particulier",
};

const INVOICING_LABEL: Record<NonNullable<Client["invoicing"]>, string> = {
  par_evenement: "Facturation par événement",
  mensuelle: "Facturation mensuelle",
};

const EXTRA_KINDS: { value: ExtraCostKind; label: string }[] = [
  { value: "matiere", label: "Matière" },
  { value: "personnel", label: "Personnel" },
  { value: "location", label: "Location" },
  { value: "transport", label: "Transport" },
  { value: "autre", label: "Autre" },
];

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

function parseNum(v: string): number | undefined {
  const n = parseFloat(v.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : undefined;
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
  const prestationLabel = (key?: string) => (key ? prestationTypes.find((p) => p.key === key)?.label ?? key : undefined);
  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.recipeId, r])), [recipes]);

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

  if (loading) return <p className="text-base text-muted-foreground">Chargement…</p>;
  if (!isNew && !client) return <p className="text-base text-muted-foreground">Client introuvable.</p>;

  const meta = [
    form.kind ? KIND_LABEL[form.kind] : undefined,
    form.contactName?.trim() || undefined,
    form.invoicing ? INVOICING_LABEL[form.invoicing] : undefined,
    client && client.active === false ? "Archivé" : undefined,
  ].filter(Boolean).join(" · ");

  const saveLabel = saveState === "saving" ? "Enregistrement…" : saveState === "saved" ? "Enregistré" : saveState === "error" ? "Non enregistré" : "";

  return (
    <div className="max-w-doc">
      <PageHeader
        breadcrumb={[{ label: "Clients", to: "/clients" }, { label: isNew ? "Nouveau client" : form.name || "Client" }]}
        title={
          <EditableText
            value={form.name}
            onSave={(v) => {
              const name = v.trim();
              if (name) update({ name });
              else setForm((p) => ({ ...p, name: client?.name ?? p.name }));
            }}
            placeholder="Nom du client"
            className="text-h1 md:text-h1-lg"
            inputClassName="input-field text-h1"
          />
        }
        meta={
          <span>
            {meta}
            {saveLabel && <span className="ml-2 text-sm">{saveLabel}</span>}
          </span>
        }
        actions={
          !isNew && (
            <ActionMenu
              items={[
                client?.active === false
                  ? { label: "Réactiver", icon: <ArchiveRestore className="h-4 w-4" />, onClick: () => void setActive(true) }
                  : { label: "Archiver", icon: <Archive className="h-4 w-4" />, onClick: () => void setActive(false) },
                { label: "Supprimer", icon: <Trash2 className="h-4 w-4" />, variant: "danger", onClick: () => void remove() },
              ]}
            />
          )
        }
      />

      <Section title="Informations">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <FieldLabel htmlFor="c-kind">Type</FieldLabel>
            <select id="c-kind" className="input-field" value={form.kind ?? ""} onChange={(e) => update({ kind: (e.target.value || undefined) as ClientForm["kind"] })}>
              <option value="">Non précisé</option>
              <option value="entreprise">Entreprise</option>
              <option value="particulier">Particulier</option>
            </select>
          </div>
          <div>
            <FieldLabel htmlFor="c-contact">Contact</FieldLabel>
            <input id="c-contact" className="input-field" value={form.contactName ?? ""} onChange={(e) => update({ contactName: e.target.value })} />
          </div>
          <div>
            <FieldLabel htmlFor="c-phone">Téléphone</FieldLabel>
            <input id="c-phone" type="tel" className="input-field" value={form.phone ?? ""} onChange={(e) => update({ phone: e.target.value })} />
          </div>
          <div>
            <FieldLabel htmlFor="c-email">Email</FieldLabel>
            <input id="c-email" type="email" className="input-field" value={form.email ?? ""} onChange={(e) => update({ email: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <FieldLabel htmlFor="c-address">Adresse</FieldLabel>
            <input id="c-address" className="input-field" value={form.address ?? ""} onChange={(e) => update({ address: e.target.value })} />
          </div>
          <div>
            <FieldLabel htmlFor="c-vatnum">Numéro de TVA</FieldLabel>
            <input id="c-vatnum" className="input-field" value={form.vatNumber ?? ""} onChange={(e) => update({ vatNumber: e.target.value })} />
          </div>
          <div>
            <FieldLabel htmlFor="c-invoicing">Facturation</FieldLabel>
            <select id="c-invoicing" className="input-field" value={form.invoicing ?? ""} onChange={(e) => update({ invoicing: (e.target.value || undefined) as ClientForm["invoicing"] })}>
              <option value="">Non précisé</option>
              <option value="par_evenement">Par événement</option>
              <option value="mensuelle">Mensuelle</option>
            </select>
          </div>
          <div>
            <FieldLabel htmlFor="c-prestation">Prestation par défaut</FieldLabel>
            <select
              id="c-prestation"
              className="input-field"
              value={form.defaultPrestationType ?? ""}
              onChange={(e) => {
                const key = e.target.value || undefined;
                const vat = prestationTypes.find((p) => p.key === key)?.defaultVatRate;
                update({ defaultPrestationType: key, ...(vat !== undefined && form.defaultVatRate === undefined ? { defaultVatRate: vat } : {}) });
              }}
            >
              <option value="">Non précisé</option>
              {prestationTypes.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel htmlFor="c-vat">TVA par défaut</FieldLabel>
            <select id="c-vat" className="input-field" value={form.defaultVatRate ?? ""} onChange={(e) => update({ defaultVatRate: parseVat(e.target.value) })}>
              <option value="">Non précisé</option>
              {VAT_RATES.map((r) => <option key={r} value={r}>{r} %</option>)}
            </select>
          </div>
          <div>
            <FieldLabel htmlFor="c-price">Prix par convive (€)</FieldLabel>
            <input id="c-price" type="number" inputMode="decimal" min={0} step="0.01" className="input-field" value={form.defaultPricePerGuest ?? ""} onChange={(e) => { const n = parseNum(e.target.value); update({ defaultPricePerGuest: n === undefined ? undefined : round2(n) }); }} />
          </div>
          <div>
            <FieldLabel htmlFor="c-guests">Convives par défaut</FieldLabel>
            <input id="c-guests" type="number" inputMode="numeric" min={1} step={1} className="input-field" value={form.defaultGuestCount ?? ""} onChange={(e) => { const n = parseNum(e.target.value); update({ defaultGuestCount: n ? Math.round(n) : undefined }); }} />
          </div>
          <div className="md:col-span-2">
            <FieldLabel htmlFor="c-notes">Notes</FieldLabel>
            <textarea id="c-notes" className="input-field" rows={3} value={form.notes ?? ""} onChange={(e) => update({ notes: e.target.value })} />
          </div>
        </div>
        {isNew && (
          <div className="mt-6 flex flex-wrap gap-2">
            <button type="button" onClick={() => void create()} disabled={creating || !form.name.trim()} className="min-h-11 rounded-lg bg-primary px-5 text-base font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
              Créer
            </button>
            <button type="button" onClick={() => navigate("/clients")} className="min-h-11 rounded-lg border border-border px-5 text-base hover:bg-hover">
              Annuler
            </button>
          </div>
        )}
      </Section>

      <Section title="Semaine type" meta={isNew ? undefined : "Un modèle par jour de livraison"}>
        {isNew ? (
          <p className="text-base text-muted-foreground">Créez le client pour configurer sa semaine type.</p>
        ) : (
          <div className="divide-y divide-border">
            {WEEKDAYS.map((w) => {
              const dayTemplates = templates.filter((t) => t.weekday === w.value);
              const isEditingHere = editing?.weekday === w.value;
              return (
                <div key={w.value} className="py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-lead font-semibold">{w.label}</h3>
                    {!isEditingHere && dayTemplates.length === 0 && (
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => startNewTemplate(w.value)} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-border px-3 text-base hover:bg-hover">
                          <Plus className="h-5 w-5" /> Ajouter un jour
                        </button>
                        <button type="button" onClick={() => { setEditing(null); setPickFor(pickFor === w.value ? null : w.value); }} className="min-h-11 rounded-lg border border-border px-3 text-base hover:bg-hover">
                          Créer depuis un événement
                        </button>
                      </div>
                    )}
                  </div>

                  {pickFor === w.value && (
                    <EventPicker events={events} clientId={id!} onPick={(ev) => applyEvent(ev, w.value)} onClose={() => setPickFor(null)} />
                  )}

                  {isEditingHere && editing && (
                    <TemplateEditor
                      template={editing}
                      recipes={recipes}
                      courses={courses}
                      prestationTypes={prestationTypes}
                      onChange={setEditing}
                      onSave={() => void upsertTemplate(editing)}
                      onCancel={() => setEditing(null)}
                      onDelete={editing.templateId ? () => void removeTemplate(editing.templateId) : undefined}
                    />
                  )}

                  {!isEditingHere && dayTemplates.map((t) => (
                    <TemplateView
                      key={t.templateId}
                      template={t}
                      recipeById={recipeById}
                      courses={courses}
                      prestationLabel={prestationLabel(t.prestationType)}
                      people={people}
                      onAssign={(next) => void saveTemplates(templates.map((x) => (x.templateId === t.templateId ? { ...x, assignedTo: next } : x)))}
                      onEdit={() => { setPickFor(null); setEditing({ ...t, recipes: [...t.recipes], extraCosts: [...t.extraCosts] }); }}
                      onFromEvent={() => { setEditing(null); setPickFor(pickFor === w.value ? null : w.value); }}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {!isNew && (
        <Section
          title="Historique"
          action={
            <button type="button" onClick={() => void linkEvents()} disabled={!form.email?.trim() && !form.contactName?.trim()} title="Associe les événements dont le contact correspond" className="min-h-11 rounded-lg border border-border px-3 text-base hover:bg-hover disabled:opacity-50">
              Associer les événements existants
            </button>
          }
        >
          <h3 className="text-base font-semibold text-muted-foreground">Événements</h3>
          {clientEvents.length === 0 ? (
            <p className="mt-2 text-base text-muted-foreground">Aucun événement pour ce client.</p>
          ) : (
            <div className="mt-1 divide-y divide-border">
              {clientEvents.map((ev) => {
                const inv = invoiceNumberByEvent.get(ev.eventId);
                return (
                  <ListRow
                    key={ev.eventId}
                    to={`/events/${ev.eventId}`}
                    title={ev.name}
                    subtitle={`${longDayLabel(ev.date)} · ${ev.guestCount} convives`}
                    trailing={
                      <>
                        {inv !== undefined && <Tag variant="primary">Facturé{inv ? ` n° ${inv}` : ""}</Tag>}
                        <span className="text-sm tabular-nums text-muted-foreground">Signé {fmtEur((ev.sellingPricePerGuest || 0) * (ev.guestCount || 0))}</span>
                      </>
                    }
                  />
                );
              })}
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-muted-foreground">Journal</h3>
            <button type="button" onClick={() => navigate(`/comptes/journal?client=${id}&prefill=month&ym=${ymOf(todayIso())}`)} className="min-h-11 rounded-lg border border-border px-3 text-base hover:bg-hover">
              Facturer le mois
            </button>
          </div>
          {clientEntries.length === 0 ? (
            <p className="mt-2 text-base text-muted-foreground">Aucune écriture pour ce client.</p>
          ) : (
            <div className="mt-1 divide-y divide-border">
              {clientEntries.map((e) => (
                <ListRow
                  key={e.entryId}
                  title={e.label}
                  subtitle={[dayMonthLabel(e.date), e.number ? `n° ${e.number}` : undefined].filter(Boolean).join(" · ")}
                  trailing={
                    <>
                      <span className="text-sm tabular-nums text-muted-foreground">{fmtEur(e.htva)} HTVA</span>
                      {e.paid ? <StatusTag status="paid" /> : <StatusTag status="invoiced" label="À payer" />}
                    </>
                  }
                />
              ))}
            </div>
          )}
        </Section>
      )}
    </div>
  );
}

function TemplateView({ template: t, recipeById, courses, prestationLabel, people, onAssign, onEdit, onFromEvent }: {
  template: ClientTemplate;
  recipeById: Map<string, Recipe>;
  courses: string[];
  prestationLabel?: string;
  people: Person[];
  onAssign: (next: string[]) => void;
  onEdit: () => void;
  onFromEvent: () => void;
}) {
  const groups = useMemo(() => {
    const byCourse = new Map<string, TemplateLine[]>();
    for (const l of t.recipes) {
      const course = l.course || recipeById.get(l.recipeId)?.defaultCourse || "Autre";
      const list = byCourse.get(course) ?? [];
      list.push(l);
      byCourse.set(course, list);
    }
    const order = (c: string) => { const i = courses.indexOf(c); return i === -1 ? courses.length : i; };
    return [...byCourse.entries()].sort(([a], [b]) => order(a) - order(b));
  }, [t.recipes, recipeById, courses]);

  const extras = t.extraCosts.reduce((s, c) => s + (c.amount || 0), 0);

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2">
        {!isWeekdayLabel(t.name) && <span className="text-base font-medium">{t.name}</span>}
        {prestationLabel && <Tag variant="primary">{prestationLabel}</Tag>}
        {t.vatRate !== undefined && <Tag>{t.vatRate} %</Tag>}
        <PersonAssign value={t.assignedTo ?? []} options={people} onChange={onAssign} size="md" title="Équipe du modèle" />
      </div>
      <div className="mt-1 text-base text-muted-foreground">
        {t.guestCount} convives · {fmtEur(t.sellingPricePerGuest)} / convive · {fmtEur(t.guestCount * t.sellingPricePerGuest)}
        {extras > 0 && ` · ${fmtEur(extras)} de coûts annexes`}
      </div>
      {groups.length === 0 ? (
        <p className="mt-2 text-base text-muted-foreground">Aucune recette.</p>
      ) : (
        <div className="mt-2 space-y-2">
          {groups.map(([course, lines]) => (
            <div key={course}>
              <div className="text-sm font-medium text-muted-foreground">{course}</div>
              <ul className="text-base">
                {lines.map((l, i) => (
                  <li key={`${l.recipeId}-${i}`} className="flex justify-between gap-3">
                    <span className="truncate">{recipeById.get(l.recipeId)?.name ?? "Recette inconnue"}</span>
                    <span className="shrink-0 tabular-nums">× {l.portions}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {t.notes && <p className="mt-2 whitespace-pre-wrap text-base text-muted-foreground">{t.notes}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onEdit} className="min-h-11 rounded-lg border border-border px-3 text-base hover:bg-hover">Modifier</button>
        <button type="button" onClick={onFromEvent} className="min-h-11 rounded-lg border border-border px-3 text-base hover:bg-hover">Créer depuis un événement</button>
      </div>
    </div>
  );
}

function EventPicker({ events, clientId, onPick, onClose }: {
  events: AppEvent[];
  clientId: string;
  onPick: (ev: AppEvent) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const list = useMemo(() => {
    const pool = q ? events.filter((e) => e.name.toLowerCase().includes(q)) : events.filter((e) => e.clientId === clientId);
    return [...pool].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
  }, [events, clientId, q]);

  return (
    <div className="mt-3 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
        <input className="min-h-11 flex-1 bg-transparent text-base outline-none" placeholder="Rechercher un événement…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
        <button type="button" onClick={onClose} aria-label="Fermer" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-hover"><X className="h-5 w-5" /></button>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{q ? "Tous les événements" : "Événements de ce client. Tapez un nom pour chercher parmi tous."}</p>
      {list.length === 0 ? (
        <p className="mt-2 text-base text-muted-foreground">Aucun événement.</p>
      ) : (
        <div className="mt-1 divide-y divide-border">
          {list.map((ev) => (
            <ListRow key={ev.eventId} title={ev.name} subtitle={`${longDayLabel(ev.date)} · ${ev.guestCount} convives · ${ev.recipes.length} recettes`} onClick={() => onPick(ev)} />
          ))}
        </div>
      )}
    </div>
  );
}

function TemplateEditor({ template: t, recipes, courses, prestationTypes, onChange, onSave, onCancel, onDelete }: {
  template: ClientTemplate;
  recipes: Recipe[];
  courses: string[];
  prestationTypes: PrestationTypeSetting[];
  onChange: (t: ClientTemplate) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.recipeId, r])), [recipes]);
  const options = useMemo(
    () => [...recipes].sort((a, b) => a.name.localeCompare(b.name, "fr")).map((r) => ({ value: r.recipeId, label: r.name, detail: r.type })),
    [recipes],
  );
  const set = (patch: Partial<ClientTemplate>) => onChange({ ...t, ...patch });
  const setLine = (i: number, patch: Partial<TemplateLine>) => set({ recipes: t.recipes.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= t.recipes.length) return;
    const next = [...t.recipes];
    [next[i], next[j]] = [next[j], next[i]];
    set({ recipes: next });
  };
  const setExtra = (i: number, patch: Partial<EventExtraCost>) => set({ extraCosts: t.extraCosts.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  return (
    <div className="mt-3 rounded-lg border border-border bg-card p-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <FieldLabel htmlFor="t-name">Nom du modèle</FieldLabel>
          <input id="t-name" className="input-field" value={t.name} onChange={(e) => set({ name: e.target.value })} />
        </div>
        <div>
          <FieldLabel htmlFor="t-guests">Convives</FieldLabel>
          <input id="t-guests" type="number" inputMode="numeric" min={1} step={1} className="input-field" value={t.guestCount || ""} onChange={(e) => set({ guestCount: Math.round(parseNum(e.target.value) ?? 0) })} />
        </div>
        <div>
          <FieldLabel htmlFor="t-price">Prix par convive (€)</FieldLabel>
          <input id="t-price" type="number" inputMode="decimal" min={0} step="0.01" className="input-field" value={t.sellingPricePerGuest || ""} onChange={(e) => set({ sellingPricePerGuest: parseNum(e.target.value) ?? 0 })} />
        </div>
        <div>
          <FieldLabel htmlFor="t-prestation">Prestation</FieldLabel>
          <select
            id="t-prestation"
            className="input-field"
            value={t.prestationType ?? ""}
            onChange={(e) => {
              const key = e.target.value || undefined;
              const vat = prestationTypes.find((p) => p.key === key)?.defaultVatRate;
              set({ prestationType: key, ...(vat !== undefined ? { vatRate: vat } : {}) });
            }}
          >
            <option value="">Non précisé</option>
            {prestationTypes.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <FieldLabel htmlFor="t-vat">TVA</FieldLabel>
          <select id="t-vat" className="input-field" value={t.vatRate ?? ""} onChange={(e) => set({ vatRate: parseVat(e.target.value) })}>
            <option value="">Non précisé</option>
            {VAT_RATES.map((r) => <option key={r} value={r}>{r} %</option>)}
          </select>
        </div>
      </div>

      <div className="mt-5">
        <FieldLabel>Recettes</FieldLabel>
        {t.recipes.length > 0 && (
          <ul className="divide-y divide-border">
            {t.recipes.map((l, i) => (
              <li key={`${l.recipeId}-${i}`} className="flex flex-wrap items-center gap-2 py-2">
                <span className="min-w-0 flex-1 truncate text-base">{recipeById.get(l.recipeId)?.name ?? "Recette inconnue"}</span>
                <select aria-label="Catégorie" className="input-field w-auto" value={l.course ?? ""} onChange={(e) => setLine(i, { course: e.target.value || undefined })}>
                  <option value="">Catégorie</option>
                  {courses.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <input aria-label="Portions" type="number" inputMode="numeric" min={1} step={1} className="input-field w-24 text-right tabular-nums" value={l.portions || ""} onChange={(e) => setLine(i, { portions: Math.round(parseNum(e.target.value) ?? 0) })} />
                <button type="button" aria-label="Monter" disabled={i === 0} onClick={() => move(i, -1)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-hover disabled:opacity-30"><ChevronUp className="h-5 w-5" /></button>
                <button type="button" aria-label="Descendre" disabled={i === t.recipes.length - 1} onClick={() => move(i, 1)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-hover disabled:opacity-30"><ChevronDown className="h-5 w-5" /></button>
                <button type="button" aria-label="Retirer" onClick={() => set({ recipes: t.recipes.filter((_, j) => j !== i) })} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-destructive hover:bg-destructive-soft"><X className="h-5 w-5" /></button>
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
      </div>

      <div className="mt-5">
        <FieldLabel>Coûts annexes</FieldLabel>
        {t.extraCosts.map((c, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 py-1">
            <input aria-label="Libellé" className="input-field min-w-0 flex-1" placeholder="Libellé" value={c.label} onChange={(e) => setExtra(i, { label: e.target.value })} />
            <select aria-label="Nature" className="input-field w-auto" value={c.kind ?? ""} onChange={(e) => setExtra(i, { kind: (e.target.value || undefined) as ExtraCostKind | undefined })}>
              <option value="">Nature</option>
              {EXTRA_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
            <input aria-label="Montant" type="number" inputMode="decimal" min={0} step="0.01" className="input-field w-28 text-right tabular-nums" value={c.amount || ""} onChange={(e) => setExtra(i, { amount: parseNum(e.target.value) ?? 0 })} />
            <button type="button" aria-label="Retirer" onClick={() => set({ extraCosts: t.extraCosts.filter((_, j) => j !== i) })} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-destructive hover:bg-destructive-soft"><X className="h-5 w-5" /></button>
          </div>
        ))}
        <button type="button" onClick={() => set({ extraCosts: [...t.extraCosts, { label: "", amount: 0 }] })} className="mt-1 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-base hover:bg-hover">
          <Plus className="h-5 w-5" /> Coût annexe
        </button>
      </div>

      <div className="mt-5">
        <FieldLabel htmlFor="t-notes">Notes</FieldLabel>
        <textarea id="t-notes" className="input-field" rows={2} value={t.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button type="button" onClick={onSave} disabled={!t.name.trim() || t.guestCount < 1} className="min-h-11 rounded-lg bg-primary px-5 text-base font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">Enregistrer</button>
        <button type="button" onClick={onCancel} className="min-h-11 rounded-lg border border-border px-4 text-base hover:bg-hover">Annuler</button>
        {onDelete && (
          <button type="button" onClick={onDelete} className="ml-auto min-h-11 rounded-lg px-3 text-base text-destructive hover:bg-destructive-soft">Supprimer ce modèle</button>
        )}
      </div>
    </div>
  );
}
