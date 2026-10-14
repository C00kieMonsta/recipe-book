import { useEffect, useRef, type RefObject } from "react";

export const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Counts open overlays so a nested one (Menu inside Dialog) does not clear inert early.
let openOverlays = 0;

// Last element focused outside any overlay: the trigger, even when an autoFocus child already won.
let lastOutside: HTMLElement | null = null;
if (typeof document !== "undefined") {
  document.addEventListener("focusin", (e) => {
    const t = e.target as HTMLElement | null;
    if (t && !t.closest?.('[role="dialog"]')) lastOutside = t;
  }, true);
}

function setRootInert(on: boolean) {
  openOverlays = Math.max(0, openOverlays + (on ? 1 : -1));
  document.getElementById("root")?.toggleAttribute("inert", openOverlays > 0);
}

// Moves focus into the panel, traps Tab, closes on Escape and restores focus on close.
export function useFocusTrap(panelRef: RefObject<HTMLElement>, open: boolean, onClose: () => void, contentRef?: RefObject<HTMLElement>) {
  // The ref keeps inline arrow callers from re-running the effect on every render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const current = document.activeElement as HTMLElement | null;
    const previous = panel.contains(current) ? lastOutside : current;
    setRootInert(true);

    if (!panel.contains(current)) {
      const target = panel.querySelector<HTMLElement>("[data-autofocus]") ?? contentRef?.current?.querySelector<HTMLElement>(FOCUSABLE) ?? panel;
      target.focus();
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onCloseRef.current(); return; }
      if (e.key !== "Tab") return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      setRootInert(false);
      previous?.focus?.();
    };
  }, [open]);
}
