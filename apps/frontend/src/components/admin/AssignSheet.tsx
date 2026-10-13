import type { AppEvent, Client, EventRecipeLine, EventTask, Person, RecipeLookup, WeekDay } from "@packages/types";
import { assigneesOf, longDayLabel, personInitials, shortEventName, sortEventLines, tasksOf } from "@packages/types";
import { plural } from "@/lib/use-planning-data";
import { useTouchScreen } from "@/hooks/use-touch-screen";
import { Button, Callout, Dialog, Sheet, Tag } from "@/components/ui";
import { PersonChip } from "./PersonChips";

export interface AssignSheetProps {
  days: WeekDay[];
  people: Person[];
  clientById: Map<string, Pick<Client, "name">>;
  recipeById: RecipeLookup;
  courses: string[];
  onEvent: (eventId: string, assignedTo: string[]) => void;
  onLine: (eventId: string, lineId: string, assignedTo: string[]) => void;
  onTask?: (eventId: string, taskId: string, assignedTo: string[]) => void;
  onClose: () => void;
}

// One event of the sheet with the lines and tasks it shows.
interface Entry {
  event: AppEvent;
  lines: EventRecipeLine[];
  tasks: EventTask[];
}

function toggled(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

// Week events under their own day with every line and the week's tasks; outside events under the first day they are prepared, with the moved-in items only.
function entriesByDay(days: WeekDay[]): { date: string; entries: Entry[] }[] {
  const week = new Set(days.map((d) => d.date));
  const seen = new Set<string>();
  const outside = new Map<string, Entry>();
  for (const day of days) {
    for (const m of day.movedIn) {
      if (week.has(m.event.date.slice(0, 10))) continue;
      const entry = outside.get(m.event.eventId) ?? { event: m.event, lines: [], tasks: [] };
      entry.lines.push(...m.lines);
      entry.tasks.push(...m.tasks);
      outside.set(m.event.eventId, entry);
    }
  }
  return days.map((day) => {
    const entries: Entry[] = [];
    for (const ev of day.events) {
      if (seen.has(ev.eventId)) continue;
      seen.add(ev.eventId);
      entries.push({ event: ev, lines: ev.recipes, tasks: tasksOf(ev).filter((t) => week.has(t.date)) });
    }
    for (const m of day.movedIn) {
      const entry = outside.get(m.event.eventId);
      if (!entry || seen.has(m.event.eventId)) continue;
      seen.add(m.event.eventId);
      entries.push(entry);
    }
    return { date: day.date, entries };
  });
}

const EVENT_TOGGLE = "inline-flex h-7 items-center gap-1 rounded-sm pl-0.5 pr-2 text-sm shadow-outline hover:bg-hover touch:h-11";
const EVENT_TOGGLE_ON = "bg-selected text-primary shadow-[0_0_0_1px_rgba(35,131,226,0.35)]";
const LINE_TOGGLE = "inline-flex h-7 w-7 items-center justify-center rounded hover:bg-hover touch:h-11 touch:w-11";

// A dialog on the laptop, a full-height sheet on the phone; every tap writes at once.
export default function AssignSheet({ days, people, clientById, recipeById, courses, onEvent, onLine, onTask = () => {}, onClose }: AssignSheetProps) {
  const touch = useTouchScreen();
  const active = people.filter((p) => p.active);
  const sections = entriesByDay(days).filter((d) => d.entries.length > 0);

  const missingOf = (entry: Entry) =>
    entry.lines.filter((l) => assigneesOf(l, entry.event).length === 0).length
    + entry.tasks.filter((t) => assigneesOf(t, entry.event).length === 0).length;
  const unassigned = sections.reduce((n, d) => n + d.entries.reduce((m, entry) => m + missingOf(entry), 0), 0);
  const title = unassigned === 0 ? "Toutes les préparations ont une personne" : `${plural(unassigned, "préparation")} sans personne`;

  const toggleEvent = (ev: AppEvent, id: string) => onEvent(ev.eventId, toggled(ev.assignedTo ?? [], id));
  const toggleLine = (ev: AppEvent, line: EventRecipeLine, id: string) => onLine(ev.eventId, line.lineId, toggled(assigneesOf(line, ev), id));
  const toggleTask = (ev: AppEvent, task: EventTask, id: string) => onTask(ev.eventId, task.taskId, toggled(assigneesOf(task, ev), id));

  const itemRow = (ev: AppEvent, key: string, label: string, item: { assignedTo?: string[] }, isTask: boolean, reset: () => void, toggle: (id: string) => void) => {
    const own = Boolean(item.assignedTo?.length);
    const effective = assigneesOf(item, ev);
    return (
      <li key={key} className="flex min-h-8 flex-wrap items-center gap-2 text-sm touch:min-h-11 touch:text-base">
        <span className="min-w-0 flex-1 truncate">
          {label}
          {isTask && <Tag colour="gray" className="ml-2">tâche</Tag>}
        </span>
        {own && (
          // On touch the button drops under the name so the recipe keeps its width.
          <span className="touch:order-last touch:-mt-1 touch:basis-full">
            <Button variant="subtle" size="sm" onClick={reset}>Comme l'événement</Button>
          </span>
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
                onClick={() => toggle(p.personId)}
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
  };

  const body = (
    <>
      <p className="text-sm text-muted-foreground">Chaque clic est enregistré tout de suite. Les boutons avec le prénom donnent tout l'événement ; les petits cercles changent une seule ligne.</p>
      {unassigned === 0 && <Callout tone="success" emoji="✅" title="Toutes les préparations ont une personne" />}
      {active.length === 0 && <p className="py-4 text-base text-muted-foreground">Aucune personne active dans les paramètres.</p>}
      {sections.map((day) => (
        <section key={day.date}>
          <h3 className="mt-2 text-sm font-medium text-muted-foreground">{longDayLabel(day.date)}</h3>
          {[...day.entries].sort((a, b) => Number(missingOf(b) > 0) - Number(missingOf(a) > 0)).map((entry) => {
            const ev = entry.event;
            const client = ev.clientId ? clientById.get(ev.clientId) : undefined;
            const eventIds = ev.assignedTo ?? [];
            const missing = missingOf(entry);
            return (
              <div key={ev.eventId} className="mt-1">
                <div className="flex min-h-8 flex-wrap items-center gap-2 touch:min-h-11">
                  <span className="inline-flex min-w-0 flex-1 flex-wrap items-center gap-2 text-sm font-medium touch:text-base">
                    <span>{shortEventName(ev, client)} · Tout l'événement</span>
                    {missing > 0 && <Tag colour="red">{plural(missing, "préparation")} sans personne</Tag>}
                  </span>
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
                  {sortEventLines(entry.lines, courses, recipeById).map((line) =>
                    itemRow(ev, line.lineId, recipeById.get(line.recipeId)?.name ?? line.recipeId, line, false, () => onLine(ev.eventId, line.lineId, []), (id) => toggleLine(ev, line, id)),
                  )}
                  {entry.tasks.map((task) =>
                    itemRow(ev, task.taskId, task.label, task, true, () => onTask(ev.eventId, task.taskId, []), (id) => toggleTask(ev, task, id)),
                  )}
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
          <Button variant="primary" size="md" onClick={onClose}>Fermer</Button>
        </div>
      </Sheet>
    );
  }

  return (
    <Dialog open onClose={onClose} title={title} size="lg" aria-label="Assigner les lignes de la semaine" footer={<Button variant="primary" size="md" onClick={onClose}>Fermer</Button>}>
      {body}
    </Dialog>
  );
}
