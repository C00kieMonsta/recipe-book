import { useCallback, type KeyboardEvent, type RefObject } from "react";
import { Bold, Highlighter } from "lucide-react";
import { toggleWrap, type StepMarker } from "@packages/types";
import { IconButton } from "@/components/ui";
import { cn } from "@/lib/utils";

export interface StepToolbarProps {
  textareaRef: RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: (next: string) => void;
  className?: string;
}

// Wraps the textarea selection in the marker and puts the selection back once React has written the new text.
function applyMarker(textarea: HTMLTextAreaElement | null, value: string, onChange: (next: string) => void, marker: StepMarker) {
  const start = textarea?.selectionStart ?? value.length;
  const end = textarea?.selectionEnd ?? start;
  const next = toggleWrap(value, start, end, marker);
  onChange(next.text);
  requestAnimationFrame(() => {
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(next.selStart, next.selEnd);
  });
}

function shortcutMarker(e: KeyboardEvent<HTMLTextAreaElement>): StepMarker | null {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return null;
  const key = e.key.toLowerCase();
  if (key === "b" && !e.shiftKey) return "**";
  if (key === "h" && e.shiftKey) return "==";
  return null;
}

// Keydown handler for the step textarea: Cmd/Ctrl+B toggles bold, Cmd/Ctrl+Shift+H toggles the highlight. Returns true when handled.
export function useStepShortcuts(
  textareaRef: RefObject<HTMLTextAreaElement>,
  value: string,
  onChange: (next: string) => void,
): (e: KeyboardEvent<HTMLTextAreaElement>) => boolean {
  return useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      const marker = shortcutMarker(e);
      if (!marker) return false;
      e.preventDefault();
      applyMarker(textareaRef.current ?? e.currentTarget, value, onChange, marker);
      return true;
    },
    [textareaRef, value, onChange],
  );
}

// Place it as a direct child of the element that wraps the textarea: on pointer screens it shows only while that wrapper has focus, on touch it is always visible.
export default function StepToolbar({ textareaRef, value, onChange, className }: StepToolbarProps) {
  const run = (marker: StepMarker) => applyMarker(textareaRef.current, value, onChange, marker);
  // Keeps the textarea focused and its selection intact while the button is pressed.
  const keepFocus = (e: { preventDefault: () => void }) => e.preventDefault();
  return (
    <div
      role="toolbar"
      aria-label="Mise en forme de l'étape"
      className={cn("hidden items-center gap-0.5 pointer:[:focus-within>&]:flex touch:flex", className)}
    >
      <IconButton
        size="sm"
        aria-label="Gras"
        title="Gras · ⌘B / Ctrl+B"
        icon={<Bold />}
        onPointerDown={keepFocus}
        onMouseDown={keepFocus}
        onClick={() => run("**")}
      />
      <IconButton
        size="sm"
        aria-label="Surligner"
        title="Surligner · ⌘⇧H / Ctrl+Maj+H"
        icon={<Highlighter />}
        onPointerDown={keepFocus}
        onMouseDown={keepFocus}
        onClick={() => run("==")}
      />
    </div>
  );
}
