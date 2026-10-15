import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { AppEvent, Client, DocSection, Offer, OfferDocument, PrestationTypeSetting } from "@packages/types";
import { dayMonthLabel, eventFromOffer, linesForGuests, offerFromSection, sectionRecipeLines } from "@packages/types";
import { api, ApiError, errorReason, type EventInput } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { plural } from "@/lib/use-planning-data";
import NewClientDialog from "@/components/admin/NewClientDialog";
import { Button, Dialog, FieldLabel, NumericInput, SearchSelect, SelectPill } from "@/components/ui";
import { useTouchScreen } from "@/hooks/use-touch-screen";

export interface UseInEventDialogProps {
  open: boolean;
  onClose: () => void;
  document: OfferDocument;
  section: DocSection;
  prestationTypes: PrestationTypeSetting[];
  // Recipe categories, so a sous-titre that matches one sets the course.
  categories?: string[];
}

type Mode = "new" | "existing";

const DEFAULT_GUESTS = 20;

const MODE_OPTIONS = [
  { value: "new", label: "Nouvel événement" },
  { value: "existing", label: "Événement existant" },
];

function unlinkedPlats(section: DocSection): string[] {
  return section.rows.filter((r) => r.kind === "plat" && !r.recipeId).map((r) => r.text);
}

// « BUFFET 2, La Tavola Italiana : Vitello tonnato… · Polpettes… »
function platsNote(section: DocSection): string | undefined {
  const plats = unlinkedPlats(section);
  return plats.length ? `${section.title} : ${plats.join(" · ")}` : undefined;
}

export default function UseInEventDialog({ open, onClose, document, section, prestationTypes, categories }: UseInEventDialogProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const touch = useTouchScreen();
  const [mode, setMode] = useState<Mode>("new");
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [guests, setGuests] = useState(DEFAULT_GUESTS);
  const [clientId, setClientId] = useState("");
  const [eventId, setEventId] = useState("");
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsConfigured, setClientsConfigured] = useState(true);
  const [newClient, setNewClient] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Fields reset on open; the lists load once per opening.
  useEffect(() => {
    if (!open) return;
    setMode("new");
    setName(section.title);
    setDate("");
    setGuests(document.minGuests ?? DEFAULT_GUESTS);
    setClientId("");
    setEventId("");
    setBusy(false);
    let cancelled = false;
    api.events.list().then((list) => { if (!cancelled) setEvents(list); }).catch(() => { if (!cancelled) setEvents([]); });
    api.clients.list()
      .then((list) => { if (!cancelled) setClients(list); })
      .catch((e: unknown) => {
        if (cancelled) return;
        setClients([]);
        if (e instanceof ApiError && e.status === 503) setClientsConfigured(false);
      });
    return () => { cancelled = true; };
  }, [open, document.minGuests, section.title]);

  const lines = useMemo(() => sectionRecipeLines(section, categories), [section, categories]);
  const note = platsNote(section);

  const upcoming = useMemo(
    () => events.filter((e) => e.status === "upcoming").sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "fr")),
    [events],
  );
  const eventOptions = useMemo(() => upcoming.map((e) => ({ value: e.eventId, label: e.name, detail: dayMonthLabel(e.date) })), [upcoming]);
  const clientOptions = useMemo(
    () => [...clients].sort((a, b) => a.name.localeCompare(b.name, "fr")).map((c) => ({ value: c.clientId, label: c.name })),
    [clients],
  );
  const target = upcoming.find((e) => e.eventId === eventId);

  const canCreate = name.trim() !== "" && date !== "" && guests > 0 && !busy;
  const canAdd = target !== undefined && (lines.length > 0 || note !== undefined) && !busy;

  const createEvent = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!canCreate) return;
    const request = offerFromSection(document, section, prestationTypes);
    const offer: Offer = { ...request, offerId: section.offerId ?? "", nameLower: request.name.toLowerCase(), createdAt: "", updatedAt: "" };
    const body = eventFromOffer(offer, {
      name: name.trim(),
      date,
      guests: Math.max(1, Math.round(guests)),
      clientId: clientId || undefined,
      notes: [note, `Depuis le document ${document.title} ${document.year}`].filter(Boolean).join("\n"),
    });
    const input: EventInput = {
      ...body,
      clientId: body.clientId ?? undefined,
      templateId: undefined,
      prestationType: body.prestationType ?? undefined,
      vatRate: body.vatRate ?? undefined,
      offerId: section.offerId || undefined,
    };
    setBusy(true);
    try {
      const created = await api.events.create(input);
      onClose();
      navigate(`/events/${created.eventId}`);
    } catch (err) {
      toast({ title: "Erreur lors de la création de l'événement", description: errorReason(err) || undefined, variant: "destructive" });
      setBusy(false);
    }
  };

  const addToEvent = async () => {
    if (!target || !canAdd) return;
    setBusy(true);
    try {
      let current = target;
      for (const line of linesForGuests(lines, target.guestCount)) {
        current = await api.events.lines.add(target.eventId, line);
      }
      if (note) {
        const notes = [current.notes?.trim(), note].filter(Boolean).join("\n");
        await api.events.update(target.eventId, { notes });
      }
      const n = lines.length;
      toast({
        title: n > 0
          ? `${plural(n, "recette")} ${n === 1 ? "ajoutée" : "ajoutées"} à « ${target.name} » · prix inchangé`
          : `Plats ajoutés aux notes de « ${target.name} » · prix inchangé`,
        action: { label: "Ouvrir", onClick: () => navigate(`/events/${target.eventId}`) },
      });
      onClose();
    } catch (err) {
      toast({ title: "Erreur lors de l'ajout à l'événement", description: errorReason(err) || undefined, variant: "destructive" });
      setBusy(false);
    }
  };

  const submit = mode === "new" ? createEvent : addToEvent;
  const formId = "use-in-event-form";

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        size="sm"
        title="Utiliser dans un événement"
        footer={
          <>
            <Button variant="default" onClick={onClose}>Annuler</Button>
            {mode === "new" ? (
              <Button variant="primary" type="submit" form={formId} disabled={!canCreate}>Créer</Button>
            ) : (
              <Button variant="primary" onClick={addToEvent} disabled={!canAdd}>Ajouter</Button>
            )}
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">« {section.title} »</p>
          <SelectPill value={mode} options={MODE_OPTIONS} onChange={(v) => setMode(v as Mode)} colour="gray" aria-label="Destination" />
          {mode === "new" ? (
            <form id={formId} onSubmit={submit} className="flex flex-col gap-3">
              <div>
                <FieldLabel htmlFor="use-in-event-name">Nom</FieldLabel>
                <input id="use-in-event-name" className="input-field" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <FieldLabel htmlFor="use-in-event-date">Date</FieldLabel>
                <input id="use-in-event-date" type="date" required className="input-field" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <FieldLabel htmlFor="use-in-event-guests">Convives</FieldLabel>
                <NumericInput id="use-in-event-guests" value={guests} min={1} onChange={(v) => setGuests(Math.max(1, Math.round(v)))} className="input-field w-24 text-right tabular-nums" />
              </div>
              {clientsConfigured && (
                <div>
                  <FieldLabel htmlFor="use-in-event-client">Client</FieldLabel>
                  <SearchSelect
                    id="use-in-event-client"
                    options={clientOptions}
                    value={clientId}
                    onChange={setClientId}
                    placeholder="Aucun client"
                    onCreateNew={(q) => setNewClient(q)}
                  />
                </div>
              )}
              <p className="text-caption text-muted-foreground">Le prix par convive et les plats liés à une recette sont repris ; les autres plats vont dans les notes.</p>
            </form>
          ) : (
            <div className="flex flex-col gap-3">
              <div>
                <FieldLabel htmlFor="use-in-event-target">Événement</FieldLabel>
                {upcoming.length === 0 ? (
                  <p className="text-sm text-muted-foreground touch:text-base">Aucun événement à venir.</p>
                ) : (
                  <SearchSelect id="use-in-event-target" options={eventOptions} value={eventId} onChange={setEventId} placeholder="Choisir un événement" autoFocus />
                )}
              </div>
              <p className="text-caption text-muted-foreground">Les plats liés à une recette sont ajoutés au menu ; le prix de l'événement ne change pas.</p>
            </div>
          )}
        </div>
      </Dialog>

      {clientsConfigured && (
        <NewClientDialog
          open={newClient !== null}
          onClose={() => setNewClient(null)}
          initial={{ name: newClient ?? "", kind: "particulier" }}
          existing={clients}
          onCreated={(c) => { setClients((prev) => [...prev, c]); setClientId(c.clientId); }}
          onLinkExisting={(cid) => setClientId(cid)}
        />
      )}
    </>
  );
}
