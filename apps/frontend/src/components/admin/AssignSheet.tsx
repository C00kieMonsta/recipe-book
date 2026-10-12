import { useEffect } from "react";
import { X } from "lucide-react";
import type { AppEvent, Client, EventRecipeLine, Person, RecipeLookup, WeekDay } from "@packages/types";
import { assigneesOf, longDayLabel, personInitials, shortEventName, sortEventLines } from "@packages/types";
import { plural } from "@/lib/use-planning-data";
import { PersonChip } from "./PersonChips";

export interface AssignSheetProps {
  days: WeekDay[];
  people: Person[];
  clientById: Map<string, Pick<Client, "name">>;
  recipeById: RecipeLookup;
  courses: string[];
  onEvent: (eventId: string, assignedTo: string[]) => void;
  onLine: (eventId: string, lineId: string, assignedTo: string[]) => void;
  onClose: () => void;
}

function toggled(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

// Full-height sheet on the phone, a 520px dialog on the laptop; every tap writes at once.
export default function AssignSheet({ days, people, clientById, recipeById, courses, onEvent, onLine, onClose }: AssignSheetProps) {
  const active = people.filter((p) => p.active);
  const events = days.flatMap((d) => d.events);
  const unassigned = events.reduce((n, ev) => n + ev.recipes.filter((l) => assigneesOf(l, ev).length === 0).length, 0);

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);

  const toggleEvent = (ev: AppEvent, id: string) => onEvent(ev.eventId, toggled(ev.assignedTo ?? [], id));
  const toggleLine = (ev: AppEvent, line: EventRecipeLine, id: string) => onLine(ev.eventId, line.lineId, toggled(assigneesOf(line, ev), id));

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-overlay md:items-center md:p-4" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Assigner les lignes de la semaine"
        onClick={(e) => e.stopPropagation()}
        className="flex w-full flex-col bg-card shadow-xl md:max-h-[85dvh] md:w-[520px] md:rounded-xl"
      >
        <div className={`flex min-h-14 items-center justify-between gap-2 border-b border-border px-4 ${unassigned === 0 ? "bg-success-soft md:rounded-t-xl" : ""}`}>
          <h2 className="text-h3">{unassigned === 0 ? "Toutes les lignes ont une personne" : `${plural(unassigned, "ligne")} sans personne`}</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-hover">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
          {active.length === 0 && <p className="py-4 text-base text-muted-foreground">Aucune personne active dans les paramètres.</p>}
          {days.filter((d) => d.events.length > 0).map((day) => (
            <section key={day.date} className="py-2">
              <h3 className="text-base font-semibold text-muted-foreground">{longDayLabel(day.date)}</h3>
              {day.events.map((ev) => {
                const client = ev.clientId ? clientById.get(ev.clientId) : undefined;
                const eventIds = ev.assignedTo ?? [];
                return (
                  <div key={ev.eventId} className="mt-1">
                    <div className="flex min-h-11 flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 text-base font-medium">{shortEventName(ev, client)} · Tout l'événement</span>
                      <div className="flex flex-wrap gap-1">
                        {active.map((p) => {
                          const on = eventIds.includes(p.personId);
                          return (
                            <button
                              key={p.personId}
                              type="button"
                              aria-pressed={on}
                              title={p.name}
                              onClick={() => toggleEvent(ev, p.personId)}
                              className={`inline-flex min-h-11 items-center gap-1.5 rounded-sm border pl-1 pr-3 text-base ${on ? "border-primary bg-selected" : "border-input bg-card hover:bg-hover"}`}
                            >
                              <PersonChip personId={p.personId} people={people} size="md" />
                              {p.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <ul className="pl-4">
                      {sortEventLines(ev.recipes, courses, recipeById).map((line) => {
                        const own = Boolean(line.assignedTo?.length);
                        const effective = assigneesOf(line, ev);
                        return (
                          <li key={line.lineId} className="flex min-h-11 items-center gap-2 text-base">
                            <span className="min-w-0 flex-1 truncate">{recipeById.get(line.recipeId)?.name ?? line.recipeId}</span>
                            {own && (
                              <button type="button" onClick={() => onLine(ev.eventId, line.lineId, [])} className="min-h-11 shrink-0 rounded-lg px-2 text-sm text-muted-foreground hover:bg-hover">
                                Comme l'événement
                              </button>
                            )}
                            <div className="flex shrink-0 gap-0.5">
                              {active.map((p) => {
                                const on = effective.includes(p.personId);
                                return (
                                  <button
                                    key={p.personId}
                                    type="button"
                                    aria-pressed={on}
                                    aria-label={`${p.name}${on && !own ? ", comme l'événement" : ""}`}
                                    title={p.name}
                                    onClick={() => toggleLine(ev, line, p.personId)}
                                    className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg ${on ? (own ? "" : "opacity-50") : "opacity-40 hover:opacity-100"} hover:bg-hover`}
                                  >
                                    <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-caption font-semibold leading-none ${on ? "bg-selected text-foreground" : "border border-dashed border-muted-foreground text-muted-foreground"}`}>
                                      {personInitials(p)}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
        <div className="flex justify-end border-t border-border p-3">
          <button type="button" onClick={onClose} className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-base font-medium text-primary-foreground hover:opacity-90">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
