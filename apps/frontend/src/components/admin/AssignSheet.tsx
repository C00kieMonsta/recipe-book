import type { AppEvent, Client, EventRecipeLine, Person, RecipeLookup, WeekDay } from "@packages/types";
import { assigneesOf, longDayLabel, personInitials, shortEventName, sortEventLines } from "@packages/types";
import { plural } from "@/lib/use-planning-data";
import { useTouchScreen } from "@/hooks/use-touch-screen";
import { Button, Callout, Dialog, Sheet } from "@/components/ui";
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

const EVENT_TOGGLE = "inline-flex h-7 items-center gap-1 rounded-sm pl-0.5 pr-2 text-sm shadow-outline hover:bg-hover touch:h-11";
const EVENT_TOGGLE_ON = "bg-selected text-primary shadow-[0_0_0_1px_rgba(35,131,226,0.35)]";
const LINE_TOGGLE = "inline-flex h-7 w-7 items-center justify-center rounded hover:bg-hover touch:h-11 touch:w-11";

// A dialog on the laptop, a full-height sheet on the phone; every tap writes at once.
export default function AssignSheet({ days, people, clientById, recipeById, courses, onEvent, onLine, onClose }: AssignSheetProps) {
  const touch = useTouchScreen();
  const active = people.filter((p) => p.active);
  const events = days.flatMap((d) => d.events);
  const unassigned = events.reduce((n, ev) => n + ev.recipes.filter((l) => assigneesOf(l, ev).length === 0).length, 0);
  const title = unassigned === 0 ? "Toutes les lignes ont une personne" : `${plural(unassigned, "ligne")} sans personne`;

  const toggleEvent = (ev: AppEvent, id: string) => onEvent(ev.eventId, toggled(ev.assignedTo ?? [], id));
  const toggleLine = (ev: AppEvent, line: EventRecipeLine, id: string) => onLine(ev.eventId, line.lineId, toggled(assigneesOf(line, ev), id));

  const body = (
    <>
      {unassigned === 0 && <Callout tone="success" emoji="✅" title="Toutes les lignes ont une personne" />}
      {active.length === 0 && <p className="py-4 text-base text-muted-foreground">Aucune personne active dans les paramètres.</p>}
      {days.filter((d) => d.events.length > 0).map((day) => (
        <section key={day.date}>
          <h3 className="mt-2 text-sm font-medium text-muted-foreground">{longDayLabel(day.date)}</h3>
          {day.events.map((ev) => {
            const client = ev.clientId ? clientById.get(ev.clientId) : undefined;
            const eventIds = ev.assignedTo ?? [];
            return (
              <div key={ev.eventId} className="mt-1">
                <div className="flex min-h-8 flex-wrap items-center gap-2 touch:min-h-11">
                  <span className="min-w-0 flex-1 text-sm font-medium touch:text-base">{shortEventName(ev, client)} · Tout l'événement</span>
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
                          className={`${EVENT_TOGGLE} ${on ? EVENT_TOGGLE_ON : ""}`}
                        >
                          <PersonChip personId={p.personId} people={people} size="sm" />
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
                      <li key={line.lineId} className="flex min-h-8 items-center gap-2 text-sm touch:min-h-11 touch:text-base">
                        <span className="min-w-0 flex-1 truncate">{recipeById.get(line.recipeId)?.name ?? line.recipeId}</span>
                        {own && (
                          <Button variant="subtle" size="sm" onClick={() => onLine(ev.eventId, line.lineId, [])}>Comme l'événement</Button>
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
                                className={LINE_TOGGLE}
                              >
                                <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-caption font-medium leading-none ${on ? `bg-selected text-primary${own ? "" : " opacity-50"}` : "border border-dashed border-divider text-icon"}`}>
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
    </>
  );

  if (touch) {
    return (
      <Sheet open onClose={onClose} title={title} aria-label="Assigner les lignes de la semaine" className="flex h-dvh max-h-dvh flex-col rounded-none">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">{body}</div>
        <div className="flex justify-end border-t border-border px-4 pt-3">
          <Button variant="primary" size="md" onClick={onClose}>Terminé</Button>
        </div>
      </Sheet>
    );
  }

  return (
    <Dialog open onClose={onClose} title={title} size="lg" aria-label="Assigner les lignes de la semaine" footer={<Button variant="primary" size="md" onClick={onClose}>Terminé</Button>}>
      {body}
    </Dialog>
  );
}
