import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { Send, Square } from "lucide-react";
import Button, { IconButton } from "@/components/ui/Button";
import { useTouchScreen } from "@/hooks/use-touch-screen";
import { cn } from "@/lib/utils";

export const COMPOSER_PLACEHOLDER = "Par exemple : ajoute une recette de houmous pour 10 personnes…";
export const COMPOSER_MAX_LINES = 6;

export interface ComposerHandle {
  // Focuses the textarea with the caret at the end.
  focus: () => void;
}

export interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  // A turn is streaming: Enter does nothing and the button reads « Arrêter ».
  busy: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  { value, onChange, onSend, onStop, busy, disabled = false, placeholder = COMPOSER_PLACEHOLDER, className },
  ref,
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const touch = useTouchScreen();
  const canSend = value.trim().length > 0 && !busy && !disabled;

  useImperativeHandle(
    ref,
    () => ({
      focus() {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        // The caret moves once the pending value has reached the DOM.
        requestAnimationFrame(() => el.setSelectionRange(el.value.length, el.value.length));
      },
    }),
    [],
  );

  // Grows with the text up to COMPOSER_MAX_LINES, then scrolls. Empty stays at one line: Chrome counts the wrapped placeholder in scrollHeight.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    if (!value) {
      el.style.height = "";
      el.style.overflowY = "hidden";
      return;
    }
    el.style.height = "auto";
    const style = getComputedStyle(el);
    const line = parseFloat(style.lineHeight) || 21;
    const chrome = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    const max = line * COMPOSER_MAX_LINES + chrome;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }, [value, touch]);

  // The button unmounts on stop, so focus moves back to the textarea instead of falling to the body.
  const stop = () => {
    onStop();
    textareaRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (canSend) onSend();
  };

  return (
    <form
      className={cn("shrink-0 border-t border-border px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3", className)}
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) onSend();
      }}
    >
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          placeholder={placeholder}
          aria-label="Message"
          disabled={disabled}
          data-autofocus
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          className="block min-h-8 w-full resize-none rounded-lg bg-input-bg px-2.5 py-1.5 text-sm leading-normal shadow-input outline-none placeholder:truncate placeholder:text-placeholder focus:shadow-ring disabled:opacity-50 touch:min-h-11 touch:px-3 touch:py-2.5 touch:text-base"
        />
        {busy ? (
          touch ? (
            <IconButton size="lg" variant="default" aria-label="Arrêter" onClick={stop} icon={<Square className="fill-current" />} />
          ) : (
            <Button variant="default" size="md" icon={<Square className="fill-current" />} onClick={stop}>
              Arrêter
            </Button>
          )
        ) : touch ? (
          <IconButton size="lg" variant="primary" type="submit" aria-label="Envoyer" disabled={!canSend} icon={<Send />} />
        ) : (
          <Button type="submit" variant="primary" size="md" icon={<Send />} disabled={!canSend}>
            Envoyer
          </Button>
        )}
      </div>
      <p className="mt-1.5 text-caption text-muted-foreground touch:hidden">Entrée pour envoyer, Maj+Entrée pour un retour à la ligne.</p>
    </form>
  );
});

export default Composer;
