import { useEffect, useMemo, useState } from "react";
import type { AppEvent } from "@packages/types";
import { addDays, datesOfIsoWeek, dayMonthLabel, isoWeekOf, todayYmd } from "@packages/types";
import { api } from "@/lib/api";
import { buildGroceryItems, groceryTitleFor, selectEventsInRange } from "@/lib/grocery";
import { plural, usePlanningData } from "@/lib/use-planning-data";
import { useToast } from "@/hooks/use-toast";
import { Button, Checkbox, Dialog, FieldLabel, SelectPill } from "@/components/ui";

export interface GroceryFromEventsDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (listId: string) => void;
}

type Preset = "semaine" | "semaine_prochaine" | "aujourdhui" | "libre";

function presetRange(preset: Preset, today: string): { from: string; to: string } | null {
  if (preset === "aujourdhui") return { from: today, to: today };
  const week = datesOfIsoWeek(isoWeekOf(today));
  if (preset === "semaine") return { from: week[0], to: week[6] };
  if (preset === "semaine_prochaine") return { from: addDays(week[0], 7), to: addDays(week[6], 7) };
  return null;
}

// A list built from the events of a period: the user picks the period, unticks what she does not need, and gets the aggregated ingredients.
export default function GroceryFromEventsDialog({ open, onClose, onCreated }: GroceryFromEventsDialogProps) {
  const { toast } = useToast();
  const { events, recipeById, ingredientById, loading } = usePlanningData();
  const today = todayYmd();
  const [preset, setPreset] = useState<Preset>("semaine");
  const [from, setFrom] = useState(() => presetRange("semaine", today)?.from ?? today);
  const [to, setTo] = useState(() => presetRange("semaine", today)?.to ?? today);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  // Reopening starts from this week again.
  useEffect(() => {
    if (!open) return;
    const r = presetRange("semaine", today);
    setPreset("semaine");
    if (r) { setFrom(r.from); setTo(r.to); }
    setExcluded(new Set());
  }, [open, today]);

  const choosePreset = (p: Preset) => {
    setPreset(p);
    const r = presetRange(p, today);
    if (r) { setFrom(r.from); setTo(r.to); }
    setExcluded(new Set());
  };

  const inRange = useMemo(
    () => selectEventsInRange(events, { from, to }).sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "fr")),
    [events, from, to],
  );
  const selected = useMemo(() => inRange.filter((e) => !excluded.has(e.eventId)), [inRange, excluded]);
  const items = useMemo(() => buildGroceryItems(selected, recipeById, ingredientById), [selected, recipeById, ingredientById]);
  const rangeOk = from <= to;

  const create = async () => {
    if (!rangeOk || selected.length === 0) return;
    setBusy(true);
    try {
      const range = { from, to };
      const allOfRange = selected.length === inRange.length;
      const list = await api.groceryLists.create({
        title: allOfRange ? groceryTitleFor(range) : groceryTitleFor(selected),
        items: items.map((i) => ({ ...i, checked: false })),
        eventIds: selected.map((e) => e.eventId),
        range,
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
    setExcluded((prev) => {
      const next = new Set(prev);
      if (on) next.delete(ev.eventId); else next.add(ev.eventId);
      return next;
    });
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
          <Button variant="primary" size="md" onClick={create} disabled={busy || loading || !rangeOk || selected.length === 0}>
            {selected.length === 0 ? "Créer la liste" : `Créer la liste · ${plural(items.length, "ingrédient")}`}
          </Button>
        </>
      )}
    >
      <div className="flex flex-wrap items-center gap-1">
        <SelectPill
          colour="gray"
          value={preset}
          onChange={(v) => choosePreset(v as Preset)}
          options={[
            { value: "semaine", label: "Cette semaine" },
            { value: "semaine_prochaine", label: "Semaine prochaine" },
            { value: "aujourdhui", label: "Aujourd'hui" },
            { value: "libre", label: "Autre période" },
          ]}
          aria-label="Période"
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <FieldLabel htmlFor="grocery-from">Du</FieldLabel>
          <input id="grocery-from" type="date" className="input-field" value={from} onChange={(e) => { setPreset("libre"); setFrom(e.target.value); setExcluded(new Set()); }} />
        </div>
        <div>
          <FieldLabel htmlFor="grocery-to">Au</FieldLabel>
          <input id="grocery-to" type="date" className="input-field" value={to} onChange={(e) => { setPreset("libre"); setTo(e.target.value); setExcluded(new Set()); }} />
        </div>
      </div>
      {!rangeOk && <p className="mt-2 text-sm text-danger">La date de fin précède la date de début.</p>}
      <div className="mt-4">
        <FieldLabel>Événements de la période</FieldLabel>
        {loading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : inRange.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun événement sur cette période.</p>
        ) : (
          <ul className="max-h-64 overflow-y-auto">
            {inRange.map((ev) => {
              const lines = ev.recipes.length;
              return (
                <li key={ev.eventId} className="flex min-h-8 items-center gap-2 touch:min-h-11">
                  <Checkbox
                    checked={!excluded.has(ev.eventId)}
                    onChange={(on) => toggle(ev, on)}
                    label={(
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate">{ev.name}</span>
                        <span className="shrink-0 text-muted-foreground">
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
