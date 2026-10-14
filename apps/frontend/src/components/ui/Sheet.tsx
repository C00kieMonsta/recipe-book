import { useEffect, useId, useRef, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconButton } from "./Button";
import { useFocusTrap } from "./use-focus-trap";

export type SheetSide = "bottom" | "left" | "right";

// Right side only. Floating sits over the page with no overlay; docked is flush at the edge and pushes the page through --assistant-inset.
export type SheetMode = "floating" | "docked";

export interface SheetResize {
  min: number;
  max: number;
  onResize: (width: number) => void;
}

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  side?: SheetSide;
  // Without a mode a right sheet is modal, like the other sides.
  mode?: SheetMode;
  // Right side, in px; the CSS keeps it inside the viewport.
  width?: number;
  // Right side: a grip on the left edge, dragged or moved with the arrow keys.
  resizable?: SheetResize;
  title?: ReactNode;
  headerRight?: ReactNode;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}

const PANEL = {
  bottom: "fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-background pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-dialog animate-sheet",
  left: "fixed inset-y-0 left-0 z-50 w-[280px] overflow-y-auto bg-sidebar shadow-dialog",
};

// Page overlays (dialogs, menus, bottom sheets) sit at z-50, above a floating or docked sheet.
const RIGHT_PANEL = {
  modal: "sheet-right sheet-right-modal z-50 shadow-dialog",
  floating: "sheet-right sheet-right-floating z-40 rounded-3xl shadow-dialog",
  docked: "sheet-right sheet-right-docked z-40",
};

const KEYBOARD_STEP = 16;
const PHONE_QUERY = "(max-width: 639px)";

export function clampWidth(width: number, min: number, max: number): number {
  if (!Number.isFinite(width)) return min;
  return Math.min(max, Math.max(min, Math.round(width)));
}

export default function Sheet({ open, onClose, side = "bottom", mode, width, resizable, title, headerRight, children, className, "aria-label": ariaLabel }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const right = side === "right";
  const variant: "modal" | SheetMode = right && mode ? mode : "modal";
  const modal = variant === "modal";

  useFocusTrap(panelRef, open && modal, onClose, contentRef);
  useLightFocus(panelRef, open && !modal);
  useDockInset(open && variant === "docked", width);
  useVisualViewport(panelRef, open && right && modal);

  if (!open) return null;

  const onPanelKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (modal || event.key !== "Escape") return;
    if ((event.target as HTMLElement).closest("[data-keeps-escape]")) return;
    event.preventDefault();
    event.stopPropagation();
    onClose();
  };

  // The drag listens on the document so a fast pointer that leaves the grip keeps resizing.
  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!resizable || event.button !== 0) return;
    const startX = event.clientX;
    const startWidth = width ?? panelRef.current?.offsetWidth ?? resizable.min;
    const body = document.body;
    const cursor = body.style.cursor;
    const select = body.style.userSelect;
    body.style.cursor = "ew-resize";
    body.style.userSelect = "none";
    const onMove = (move: PointerEvent) => {
      resizable.onResize(clampWidth(startWidth + (startX - move.clientX), resizable.min, resizable.max));
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      body.style.cursor = cursor;
      body.style.userSelect = select;
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
    event.preventDefault();
  };

  const resizeByKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!resizable) return;
    const current = width ?? panelRef.current?.offsetWidth ?? resizable.min;
    let next: number | null = null;
    if (event.key === "ArrowLeft") next = current + KEYBOARD_STEP;
    else if (event.key === "ArrowRight") next = current - KEYBOARD_STEP;
    else if (event.key === "Home") next = resizable.min;
    else if (event.key === "End") next = resizable.max;
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    resizable.onResize(clampWidth(next, resizable.min, resizable.max));
  };

  const style = right && width ? ({ "--sheet-width": `${width}px` } as CSSProperties) : undefined;

  return createPortal(
    <>
      {modal && <div className="fixed inset-0 z-50 bg-overlay animate-fade-in" onClick={onClose} aria-hidden="true" />}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal={modal ? "true" : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabel === undefined && title !== undefined ? titleId : undefined}
        tabIndex={-1}
        style={style}
        className={cn(right ? RIGHT_PANEL[variant] : PANEL[side], "outline-none", className)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={right ? onPanelKeyDown : undefined}
      >
        {right && resizable && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Redimensionner"
            aria-valuemin={resizable.min}
            aria-valuemax={resizable.max}
            aria-valuenow={width}
            tabIndex={0}
            className="sheet-grip"
            onPointerDown={startDrag}
            onKeyDown={resizeByKey}
          >
            <span className="sheet-grip-pill" aria-hidden="true" />
          </div>
        )}
        {side === "bottom" && <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-divider" aria-hidden="true" />}
        {(title !== undefined || headerRight !== undefined) && (
          <div className="flex h-11 shrink-0 items-center justify-between px-4 text-base font-semibold">
            <span id={titleId} className="min-w-0 truncate">{title}</span>
            {headerRight ?? <IconButton size="md" aria-label="Fermer" onClick={onClose} icon={<X />} />}
          </div>
        )}
        {/* display: contents keeps the panel as the flex parent of the children. */}
        <div ref={contentRef} className="contents">{children}</div>
      </div>
    </>,
    document.body,
  );
}

// A floating or docked sheet is not modal: focus moves in on open and back on close, but Tab reaches the page.
function useLightFocus(panelRef: RefObject<HTMLElement>, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const panel = panelRef.current;
    if (!panel) return;
    const opener = document.activeElement as HTMLElement | null;
    if (!panel.contains(opener)) {
      const target = panel.querySelector<HTMLElement>("[data-autofocus]") ?? panel;
      target.focus();
      if (target instanceof HTMLTextAreaElement) target.setSelectionRange(target.value.length, target.value.length);
    }
    return () => {
      // Focus that moved to the page while the sheet was open stays there.
      const current = document.activeElement;
      if (current && current !== document.body && !panel.contains(current)) return;
      if (opener?.isConnected && opener !== document.body) opener.focus();
    };
  }, [panelRef, active]);
}

// The layout reads --assistant-inset as padding-right so a docked sheet pushes the page instead of covering it.
function useDockInset(active: boolean, width?: number) {
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    root.style.setProperty("--assistant-inset", width ? `${width}px` : "var(--sheet-right-w)");
    return () => {
      root.style.removeProperty("--assistant-inset");
    };
  }, [active, width]);
}

// A phone keyboard shrinks the visual viewport, not the layout one; the panel follows it so its bottom stays above the keys.
function useVisualViewport(panelRef: RefObject<HTMLElement>, active: boolean) {
  useEffect(() => {
    const panel = panelRef.current;
    const viewport = window.visualViewport;
    if (!active || !panel || !viewport) return;
    const apply = () => {
      if (!window.matchMedia(PHONE_QUERY).matches) {
        panel.style.removeProperty("--sheet-vv-height");
        panel.style.removeProperty("--sheet-vv-top");
        return;
      }
      panel.style.setProperty("--sheet-vv-height", `${viewport.height}px`);
      panel.style.setProperty("--sheet-vv-top", `${viewport.offsetTop}px`);
    };
    apply();
    viewport.addEventListener("resize", apply);
    viewport.addEventListener("scroll", apply);
    return () => {
      viewport.removeEventListener("resize", apply);
      viewport.removeEventListener("scroll", apply);
    };
  }, [panelRef, active]);
}
