import { useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent } from "react";
import type { AppEvent, Client } from "@packages/types";
import { shortDayLabel, shortEventName } from "@packages/types";
import { useToast } from "@/hooks/use-toast";
import SelectPill from "@/components/ui/SelectPill";

export interface TaskComposerProps {
  date: string;
  // Week events sorted by date then name; the composer hides when empty.
  events: AppEvent[];
  clientById: Map<string, Pick<Client, "name">>;
  // Default event per the rule below; the caller passes it so the week and the day page agree.
  defaultEventId: string;
  onAdd: (eventId: string, label: string) => Promise<void>;
  onClose: () => void;
}

// Inline box at the foot of a day column; pointer screens only.
export default function TaskComposer({ events, clientById, defaultEventId, onAdd, onClose }: TaskComposerProps) {
  const { toast } = useToast();
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [eventId, setEventId] = useState(defaultEventId);
  const [busy, setBusy] = useState(false);

  if (events.length === 0) return null;

  const options = events.map((ev) => {
    const full = `${shortEventName(ev, ev.clientId ? clientById.get(ev.clientId) : undefined)} · ${shortDayLabel(ev.date)}`;
    return { value: ev.eventId, full, label: <span className="truncate">{full}</span> };
  });
  const selected = options.find((o) => o.value === eventId) ?? options[0];

  const add = async () => {
    const label = text.trim();
    if (!label || busy) return;
    setBusy(true);
    try {
      await onAdd(selected.value, label);
      setText("");
      input.current?.focus();
    } catch {
      toast({ title: "Erreur lors de l'ajout de la tâche", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); void add(); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };

  // Leaving the box with nothing typed closes it; moving focus to the event pill does not.
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null;
    if (next && box.current?.contains(next)) return;
    if (!text.trim() && !busy) onClose();
  };

  // Clicks on the pill and its menu keep the focus in the input.
  const onMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target !== input.current) e.preventDefault();
  };

  return (
    <div ref={box} className="shadow-card rounded-lg p-1" onBlur={onBlur} onMouseDown={onMouseDown}>
      <input
        ref={input}
        className="h-7 w-full bg-transparent text-sm outline-none placeholder:text-placeholder"
        placeholder="Nouvelle tâche, ex. dégeler le poisson"
        aria-label="Nouvelle tâche"
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
      />
      <SelectPill
        colour="gray"
        value={selected.value}
        options={options}
        onChange={setEventId}
        title={selected.full}
        aria-label="Pour quel événement"
        className="max-w-full"
      />
    </div>
  );
}
