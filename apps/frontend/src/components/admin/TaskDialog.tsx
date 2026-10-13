import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Person } from "@packages/types";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import FieldLabel from "@/components/ui/FieldLabel";
import { PersonChip } from "./PersonChips";

export interface TaskDialogValue { label: string; date: string; eventId: string; assignedTo: string[]; notes: string }

export interface TaskDialogProps {
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  initial: TaskDialogValue;
  // Candidate events, label "Mariage Dupont · sam. 17"; empty hides the field (event page).
  events: { eventId: string; label: string }[];
  people: Person[];
  // The dialog closes when the promise resolves and stays open when it rejects.
  onSubmit: (value: TaskDialogValue) => Promise<void>;
  // Edit mode only; the dialog asks for confirmation itself.
  onDelete?: () => Promise<void>;
}

const PERSON_TOGGLE = "inline-flex h-8 items-center gap-1.5 rounded-sm pl-1 pr-2.5 text-sm shadow-outline hover:bg-hover touch:h-11 touch:text-base";
const PERSON_ON = "bg-selected text-primary shadow-[0_0_0_1px_rgba(35,131,226,0.35)] hover:bg-selected";

export default function TaskDialog(props: TaskDialogProps) {
  // The form mounts fresh on every open so its state starts from `initial`.
  if (!props.open) return null;
  return <TaskForm {...props} />;
}

function TaskForm({ onClose, mode, initial, events, people, onSubmit, onDelete }: TaskDialogProps) {
  const [label, setLabel] = useState(initial.label);
  const [date, setDate] = useState(initial.date);
  const [eventId, setEventId] = useState(() => (events.some((ev) => ev.eventId === initial.eventId) || events.length === 0 ? initial.eventId : events[0].eventId));
  const [assignedTo, setAssignedTo] = useState<string[]>(initial.assignedTo);
  const [notes, setNotes] = useState(initial.notes);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const labelInput = useRef<HTMLInputElement>(null);

  // Runs after the Dialog focus effect, so « Quoi » keeps the focus.
  useEffect(() => { labelInput.current?.focus(); }, []);

  const active = people.filter((p) => p.active);
  const trimmed = label.trim();
  const canSubmit = trimmed.length > 0 && date.length > 0 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await onSubmit({ label: trimmed, date, eventId, assignedTo, notes: notes.trim() });
      onClose();
    } catch {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!onDelete || busy) return;
    setBusy(true);
    try {
      await onDelete();
      setConfirm(false);
      onClose();
    } catch {
      setBusy(false);
    }
  };

  const onLabelKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); void submit(); }
  };

  const togglePerson = (id: string) =>
    setAssignedTo(assignedTo.includes(id) ? assignedTo.filter((x) => x !== id) : [...assignedTo, id]);

  const title = mode === "create" ? "Nouvelle tâche" : "Modifier la tâche";
  const taskName = trimmed || initial.label;

  return (
    <>
      <Dialog
        open
        onClose={() => { if (confirm) setConfirm(false); else onClose(); }}
        title={title}
        aria-label={title}
        footer={
          <>
            {mode === "edit" && onDelete && (
              <Button variant="ghost" size="md" className="mr-auto text-danger hover:bg-danger-soft" onClick={() => setConfirm(true)} disabled={busy}>
                Supprimer
              </Button>
            )}
            <Button variant="default" size="md" onClick={onClose} disabled={busy}>Annuler</Button>
            <Button variant="primary" size="md" onClick={() => void submit()} disabled={!canSubmit}>
              {mode === "create" ? "Ajouter la tâche" : "Enregistrer"}
            </Button>
          </>
        }
      >
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <div>
            <FieldLabel htmlFor="task-label">Quoi</FieldLabel>
            <input
              ref={labelInput}
              id="task-label"
              className="input-field"
              autoFocus
              placeholder="Cuire les sablés"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={onLabelKey}
            />
          </div>
          <div>
            <FieldLabel htmlFor="task-date">Quel jour</FieldLabel>
            <input id="task-date" className="input-field" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          {events.length > 0 && (
            <div>
              <FieldLabel htmlFor="task-event">Pour quel événement</FieldLabel>
              <select id="task-event" className="input-field" value={eventId} onChange={(e) => setEventId(e.target.value)}>
                {events.map((ev) => (
                  <option key={ev.eventId} value={ev.eventId}>{ev.label}</option>
                ))}
              </select>
            </div>
          )}
          {active.length > 0 && (
            <div>
              <FieldLabel>Qui</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {active.map((p) => {
                  const on = assignedTo.includes(p.personId);
                  return (
                    <button
                      key={p.personId}
                      type="button"
                      aria-pressed={on}
                      onClick={() => togglePerson(p.personId)}
                      className={`${PERSON_TOGGLE} ${on ? PERSON_ON : ""}`}
                    >
                      <PersonChip personId={p.personId} people={people} size="sm" />
                      {p.name}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-caption text-muted-foreground">Sans choix, la tâche suit l'équipe de l'événement.</p>
            </div>
          )}
          <div>
            <FieldLabel htmlFor="task-notes">Note</FieldLabel>
            <textarea id="task-notes" className="input-field" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <p className="text-caption text-muted-foreground">Une tâche ne compte ni dans le coût ni dans les courses.</p>
        </form>
      </Dialog>

      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Supprimer la tâche « ${taskName} » ?`}
        size="sm"
        aria-label="Supprimer la tâche"
        footer={
          <>
            <Button variant="default" size="md" onClick={() => setConfirm(false)} disabled={busy}>Annuler</Button>
            <Button variant="danger" size="md" onClick={() => void remove()} disabled={busy}>Supprimer</Button>
          </>
        }
      >
        <p className="text-muted-foreground">Cette action est irréversible.</p>
      </Dialog>
    </>
  );
}
