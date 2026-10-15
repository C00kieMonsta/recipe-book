import { useEffect, useMemo, useState } from "react";
import type { AppEvent } from "@packages/types";
import { addDays, datesOfIsoWeek, dayMonthLabel, isoWeekOf, rangeLabel, todayYmd } from "@packages/types";
import { api } from "@/lib/api";
import {
  buildGroceryItems,
  eventMatchesSearch,
  groceryTitleFor,
  selectEventsInRange,
  sortEventsByDateThenName,
  upcomingRange,
  type GroceryRange,
} from "@/lib/grocery";
import { plural, usePlanningData } from "@/lib/use-planning-data";
import { useToast } from "@/hooks/use-toast";
import { Button, Checkbox, Dialog, FieldLabel, SelectPill } from "@/components/ui";

export type Preset = "avenir" | "semaine" | "semaine_prochaine" | "aujourdhui" | "libre";

export interface GroceryFromEventsDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (listId: string) => void;
  // Preset shown when the dialog opens; « semaine » when absent.
  initialPreset?: Preset;
  // Opens on « À venir » with exactly these events ticked, listed even outside the window.
  initialEventIds?: string[];
}

const PRESET_OPTIONS: { value: Preset; label: string }[] = [
  { value: "avenir", label: "À venir" },
  { value: "semaine", label: "Cette semaine" },
  { value: "semaine_prochaine", label: "Semaine prochaine" },
  { value: "aujourdhui", label: "Aujourd'hui" },
  { value: "libre", label: "Autre période" },
];

const SEARCH_THRESHOLD = 8;

export function presetRange(preset: Preset, today: string): GroceryRange | null {
  if (preset === "avenir") return upcomingRange(today);
  if (preset === "aujourdhui") return { from: today, to: today };
  const week = datesOfIsoWeek(isoWeekOf(today));
  if (preset === "semaine") return { from: week[0], to: week[6] };
  if (preset === "semaine_prochaine") return { from: addDays(week[0], 7), to: addDays(week[6], 7) };
  return null;
}

// Period presets tick everything and remember what was unticked; « À venir » ticks nothing and remembers what was ticked.
type Picked = { mode: "exclude" | "include"; ids: Set<string> };

const allTicked = (): Picked => ({ mode: "exclude", ids: new Set() });
const onlyTicked = (ids: string[] = []): Picked => ({ mode: "include", ids: new Set(ids) });

// A list built from events: a period with everything ticked, or any choice among the upcoming events.
export default function GroceryFromEventsDialog({ open, onClose, onCreated, initialPreset, initialEventIds }: GroceryFromEventsDialogProps) {
  const { toast } = useToast();
  const { events, clientById, recipeById, ingredientById, loading } = usePlanningData();
  const today = todayYmd();
  const startPreset: Preset = initialEventIds?.length ? "avenir" : initialPreset ?? "semaine";
  const [preset, setPreset] = useState<Preset>(startPreset);
  const [from, setFrom] = useState(() => presetRange(startPreset, today)?.from ?? today);
  const [to, setTo] = useState(() => presetRange(startPreset, today)?.to ?? today);
  const [picked, setPicked] = useState<Picked>(() => (startPreset === "avenir" ? onlyTicked(initialEventIds) : allTicked()));
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const initialIdsKey = (initialEventIds ?? []).join(",");

  // Reopening starts from the initial preset again.
  useEffect(() => {
    if (!open) return;
    const ids = initialIdsKey ? initialIdsKey.split(",") : [];
    const p: Preset = ids.length ? "avenir" : initialPreset ?? "semaine";
    const r = presetRange(p, today);
    setPreset(p);
    if (r) { setFrom(r.from); setTo(r.to); }
    setPicked(p === "avenir" ? onlyTicked(ids) : allTicked());
    setQuery("");
  }, [open, today, initialPreset, initialIdsKey]);

  const choosePreset = (p: Preset) => {
    setPreset(p);
    const r = presetRange(p, today);
    if (r) { setFrom(r.from); setTo(r.to); }
    setPicked(p === "avenir" ? onlyTicked() : allTicked());
    setQuery("");
  };

  const listed = useMemo(() => {
    const inRange = selectEventsInRange(events, { from, to });
    if (preset !== "avenir" || !initialIdsKey) return sortEventsByDateThenName(inRange);
    const wanted = new Set(initialIdsKey.split(","));
    const seen = new Set(inRange.map((e) => e.eventId));
    const extra = events.filter((e) => wanted.has(e.eventId) && !seen.has(e.eventId));
    return sortEventsByDateThenName([...inRange, ...extra]);
  }, [events, from, to, preset, initialIdsKey]);

  const isTicked = (id: string) => (picked.mode === "include" ? picked.ids.has(id) : !picked.ids.has(id));
  const selected = useMemo(() => listed.filter((e) => isTicked(e.eventId)), [listed, picked]);
  const items = useMemo(() => buildGroceryItems(selected, recipeById, ingredientById), [selected, recipeById, ingredientById]);
  const rangeOk = preset === "libre" ? from <= to : true;
  const searchable = listed.length > SEARCH_THRESHOLD;
  const clientNameOf = (ev: AppEvent) => (ev.clientId ? clientById.get(ev.clientId)?.name : undefined);
  const visible = useMemo(
    () => (searchable && query ? listed.filter((e) => eventMatchesSearch(e, clientNameOf(e), query)) : listed),
    [listed, searchable, query, clientById],
  );

  const create = async () => {
    if (!rangeOk || selected.length === 0) return;
    setBusy(true);
    try {
      const periodPreset = preset !== "avenir";
      const range = { from, to };
      const allOfRange = periodPreset && selected.length === listed.length;
      const list = await api.groceryLists.create({
        title: allOfRange ? groceryTitleFor(range) : groceryTitleFor(selected),
        items: items.map((i) => ({ ...i, checked: false })),
        eventIds: selected.map((e) => e.eventId),
        ...(periodPreset ? { range } : {}),
      });
      toast({ title: "Liste de courses créée" });
      onCreated(list.listId);
    } catch {
      toast({ title: "Erreur lors de la création de la liste", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const toggle = (ev: AppEvent, on: boolean) => {
    setPicked((prev) => {
      const ids = new Set(prev.ids);
      const keep = prev.mode === "include" ? on : !on;
      if (keep) ids.add(ev.eventId); else ids.delete(ev.eventId);
      return { mode: prev.mode, ids };
    });
  };

  const onDateChange = (field: "from" | "to", value: string) => {
    setPreset("libre");
    if (field === "from") setFrom(value); else setTo(value);
    setPicked(allTicked());
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Liste de courses depuis les événements"
      size="md"
      footer={(
        <>
          <Button variant="default" size="md" onClick={onClose}>Annuler</Button>
          <Button
            variant="primary"
            size="md"
            onClick={create}
            disabled={busy || loading || !rangeOk || selected.length === 0}
            className="min-w-0 touch:h-auto touch:min-h-11 touch:whitespace-normal touch:py-2 touch:leading-tight"
          >
            {selected.length === 0
              ? "Créer la liste"
              : `Créer la liste · ${plural(selected.length, "événement")} · ${plural(items.length, "ingrédient")}`}
          </Button>
        </>
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <SelectPill colour="gray" value={preset} onChange={(v) => choosePreset(v as Preset)} options={PRESET_OPTIONS} aria-label="Période" />
        {preset !== "libre" && <span className="text-sm text-muted-foreground">{rangeLabel(from, to)}</span>}
      </div>
      {preset === "libre" && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <FieldLabel htmlFor="grocery-from">Du</FieldLabel>
            <input id="grocery-from" type="date" className="input-field" value={from} onChange={(e) => onDateChange("from", e.target.value)} />
          </div>
          <div>
            <FieldLabel htmlFor="grocery-to">Au</FieldLabel>
            <input id="grocery-to" type="date" className="input-field" value={to} onChange={(e) => onDateChange("to", e.target.value)} />
          </div>
        </div>
      )}
      {!rangeOk && <p className="mt-2 text-sm text-danger">La date de fin précède la date de début.</p>}
      <div className="mt-4">
        <FieldLabel>{preset === "avenir" ? "Événements à venir" : "Événements de la période"}</FieldLabel>
        {searchable && (
          <input
            type="search"
            className="input-field mb-2"
            placeholder="Rechercher un événement"
            aria-label="Rechercher un événement"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
        {loading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : listed.length === 0 ? (
          <p className="text-sm text-muted-foreground">{preset === "avenir" ? "Aucun événement à venir." : "Aucun événement sur cette période."}</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun événement ne correspond à « {query.trim()} ».</p>
        ) : (
          <ul className="max-h-72 overflow-y-auto">
            {visible.map((ev) => {
              const lines = ev.recipes.length;
              const client = clientNameOf(ev);
              return (
                <li key={ev.eventId} className="flex items-center gap-2">
                  <Checkbox
                    checked={isTicked(ev.eventId)}
                    onChange={(on) => toggle(ev, on)}
                    className="h-auto min-h-7 w-full py-1 touch:h-auto touch:min-h-11"
                    label={(
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate">
                          {ev.name}
                          {client && <span className="text-muted-foreground"> · {client}</span>}
                        </span>
                        <span className="truncate text-muted-foreground">
                          {dayMonthLabel(ev.date)} · {plural(ev.guestCount, "convive")} · {lines === 0 ? "sans menu" : plural(lines, "recette")}
                        </span>
                      </span>
                    )}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        Les quantités sont additionnées à partir des recettes au menu, pour le nombre de portions de chaque événement.
      </p>
    </Dialog>
  );
}
