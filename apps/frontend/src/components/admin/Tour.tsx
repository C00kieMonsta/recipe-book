import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Button } from "@/components/ui";
import { useChrome } from "./AdminLayout";
import type { TourStep } from "./tour-steps";

export interface TourProps {
  step: TourStep;
  index: number;
  total: number;
  phase: "loading" | "anchored" | "centred";
  // Viewport coordinates of the anchor, padded by 6px and clamped to the viewport.
  rect: DOMRect | null;
  anchor: HTMLElement | null;
  phone: boolean;
  // The workspace has no event yet: steps with a firstRunBody show it.
  firstRun?: boolean;
  onPrev: () => void;
  onNext: () => void;
  onSkip: () => void;
}

const CARD_W = 320;
const MARGIN = 16;
const GAP = 8;
const PAD = 6;
const TOPBAR = 44;
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function isVisible(el: HTMLElement): boolean {
  if (el.getClientRects().length === 0) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

// Returns the first visible element for a data-tour value, or null.
export function findAnchor(name: string): HTMLElement | null {
  const nodes = document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`);
  for (const el of Array.from(nodes)) if (isVisible(el)) return el;
  return null;
}

// First visible anchor among the names, in order of preference.
export function findAnyAnchor(names: string[]): HTMLElement | null {
  for (const name of names) {
    const el = findAnchor(name);
    if (el) return el;
  }
  return null;
}

// Polls findAnchor with requestAnimationFrame until found or timeout.
export function waitForAnchor(name: string, timeoutMs: number): Promise<HTMLElement | null> {
  return waitForAnyAnchor([name], timeoutMs);
}

const LOADED_GRACE = 300;

// With a loadedMark, the wait ends a few hundred ms after the page shows it without the anchor.
export function waitForAnyAnchor(names: string[], timeoutMs: number, loadedMark?: string): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const started = performance.now();
    let loadedAt: number | null = null;
    const tick = () => {
      const el = findAnyAnchor(names);
      if (el) { resolve(el); return; }
      const now = performance.now();
      if (loadedMark && loadedAt === null && findAnchor(loadedMark)) loadedAt = now;
      if (now - started >= timeoutMs || (loadedAt !== null && now - loadedAt >= LOADED_GRACE)) { resolve(null); return; }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

export function isFixed(el: HTMLElement): boolean {
  let node: HTMLElement | null = el;
  while (node && node !== document.body) {
    if (getComputedStyle(node).position === "fixed") return true;
    node = node.parentElement;
  }
  return false;
}

// Bottom edge of the sticky strips pinned under the top bar, measured after a scroll.
function pinnedBottom(anchor: HTMLElement, topbar: number): number {
  let bottom = topbar;
  for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
    if (el === anchor || el.contains(anchor) || anchor.contains(el)) continue;
    if (getComputedStyle(el).position !== "sticky") continue;
    const r = el.getBoundingClientRect();
    if (r.height > 0 && r.width > 0 && r.top <= bottom + 1 && r.bottom > bottom) bottom = r.bottom;
  }
  return bottom;
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));

// Below the anchor, else above, else to the right at the top, else null (centred).
function placeDesktop(rect: DOMRect, h: number): { top: number; left: number } | null {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = clamp(rect.left, MARGIN, vw - CARD_W - MARGIN);
  if (rect.bottom + GAP + h <= vh - MARGIN) return { top: rect.bottom + GAP, left };
  if (rect.top - GAP - h >= MARGIN) return { top: rect.top - GAP - h, left };
  if (rect.right + GAP + CARD_W <= vw - MARGIN) return { top: MARGIN, left: rect.right + GAP };
  return null;
}

export default function Tour({ step, index, total, phase, rect, anchor, phone, firstRun = false, onPrev, onNext, onSkip }: TourProps) {
  const { hideChrome } = useChrome();
  const panelRef = useRef<HTMLDivElement>(null);
  const scrolledFor = useRef<HTMLElement | null>(null);
  const [h, setH] = useState<number | null>(null);
  const last = index === total - 1;
  const anchored = phase === "anchored" && rect !== null;
  const title = phone && step.phone?.title ? step.phone.title : step.title;
  const phoneBody = firstRun && step.firstRunBody ? step.firstRunBody : phone && step.phone?.body ? step.phone.body : step.body;
  const body = phase === "centred" ? (step.fallbackBody ?? phoneBody) : phoneBody;
  const topbar = !hideChrome && window.innerWidth < 768 ? TOPBAR : 0;

  // The card is measured hidden first, then placed.
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    setH(el.offsetHeight);
    const ro = new ResizeObserver(() => setH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [index, phase, phone]);

  // The anchor is described by the card body while spotlighted.
  useEffect(() => {
    if (!anchored || !anchor) return;
    const previous = anchor.getAttribute("aria-describedby");
    anchor.setAttribute("aria-describedby", "tour-card-body");
    return () => {
      if (previous === null) anchor.removeAttribute("aria-describedby");
      else anchor.setAttribute("aria-describedby", previous);
    };
  }, [anchored, anchor]);

  // Once per anchor, scroll the page so the card has room: the band above the bottom sheet on a phone,
  // below the anchor on a laptop when neither below nor above fits at the current scroll.
  useEffect(() => {
    if (!anchored || !anchor || h === null) return;
    if (scrolledFor.current === anchor) return;
    scrolledFor.current = anchor;
    if (!phone) {
      if (isFixed(anchor)) return;
      const r = anchor.getBoundingClientRect();
      const top = r.top - PAD;
      const bottom = r.bottom + PAD;
      const below = bottom + GAP + h <= window.innerHeight - MARGIN;
      const above = top - GAP - h >= MARGIN;
      if (!below && !above && bottom - top + GAP + h <= window.innerHeight - 2 * MARGIN) window.scrollBy({ top: top - MARGIN, behavior: "instant" });
      return;
    }
    const candidates = [anchor, ...Array.from(anchor.querySelectorAll<HTMLElement>("*"))];
    for (const el of candidates) {
      if (el.scrollWidth > el.clientWidth + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowX)) el.scrollLeft = 0;
    }
    if (isFixed(anchor)) return;
    const bandBottom = window.innerHeight - h - MARGIN;
    const settle = (bandTop: number) => {
      const r = anchor.getBoundingClientRect();
      let dy = 0;
      if (r.top < bandTop) dy = r.top - bandTop;
      else if (r.bottom > bandBottom) dy = Math.min(r.bottom - bandBottom, r.top - bandTop);
      if (dy !== 0) window.scrollBy({ top: dy, behavior: "instant" });
    };
    settle(topbar + GAP);
    // A sticky strip pins under the top bar once the page has scrolled, so measure it and scroll again.
    settle(pinnedBottom(anchor, topbar) + GAP);
  }, [phone, anchored, anchor, h, topbar]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onSkip(); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); onNext(); return; }
      if (e.key === "ArrowLeft") { e.preventDefault(); e.stopPropagation(); onPrev(); return; }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      const current = document.activeElement as HTMLElement | null;
      const pos = current ? items.indexOf(current) : -1;
      const nextPos = e.shiftKey ? (pos <= 0 ? items.length - 1 : pos - 1) : (pos < 0 || pos === items.length - 1 ? 0 : pos + 1);
      items[nextPos].focus();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onNext, onPrev, onSkip]);

  // Spotlight box; on a phone it is clipped to the band above the card.
  let box: DOMRect | null = null;
  if (anchored && rect) {
    if (phone && h !== null) {
      // An anchor inside the fixed top bar keeps its own top, otherwise the box would be a sliver under the bar.
      const top = anchor && isFixed(anchor) ? rect.top : Math.max(rect.top, topbar);
      const bottom = Math.min(rect.bottom, window.innerHeight - h - MARGIN);
      box = bottom > top ? new DOMRect(rect.left, top, rect.width, bottom - top) : null;
    } else {
      box = rect;
    }
  }

  let cardStyle: CSSProperties | undefined;
  let hidden = h === null;
  if (!phone) {
    const place = anchored && rect && h !== null ? placeDesktop(rect, h) : null;
    if (place) {
      cardStyle = { top: place.top, left: place.left };
    } else if (h !== null) {
      cardStyle = { top: Math.max(MARGIN, (window.innerHeight - h) / 2), left: Math.max(MARGIN, (window.innerWidth - CARD_W) / 2) };
    } else {
      cardStyle = { top: MARGIN, left: MARGIN };
      hidden = true;
    }
  }

  // A hidden element refuses focus, so wait for the visible render.
  useEffect(() => {
    if (!hidden) panelRef.current?.focus({ preventScroll: true });
  }, [index, phase, hidden]);

  const card = (
    <div
      ref={panelRef}
      key={`${index}-${phase}`}
      role="dialog"
      aria-label="Visite guidée"
      tabIndex={-1}
      style={{ ...cardStyle, visibility: hidden ? "hidden" : undefined }}
      className={
        phone
          ? "fixed inset-x-0 bottom-0 z-[60] rounded-t-3xl bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-dialog outline-none motion-safe:animate-sheet"
          : "fixed z-[60] w-[320px] rounded-2xl bg-background p-4 shadow-dialog outline-none motion-safe:animate-pop"
      }
    >
      {phone && <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-divider" aria-hidden="true" />}
      <p className="text-caption text-muted-foreground">{index + 1} sur {total}</p>
      <h2 className="mt-1 text-[15px] font-semibold leading-snug">{title}</h2>
      <p id="tour-card-body" className="mt-1.5 text-sm text-foreground">{body}</p>
      <div className="mt-3 flex items-center gap-1">
        <Button variant="subtle" size="sm" onClick={onSkip}>Ignorer</Button>
        <span className="ml-auto" />
        <Button variant="subtle" size="sm" onClick={onPrev} disabled={index === 0}>Précédent</Button>
        <Button variant="primary" size="sm" onClick={onNext}>{last ? "Terminer" : "Suivant"}</Button>
      </div>
    </div>
  );

  return (
    <>
      <div role="presentation" aria-hidden="true" className={`fixed inset-0 z-50 ${box ? "" : "bg-overlay"}`}>
        {box && (
          <div
            key={`${index}-${phase}`}
            className="fixed rounded-lg pointer-events-none transition-none animate-fade-in"
            style={{ top: box.top, left: box.left, width: box.width, height: box.height, boxShadow: "0 0 0 100vmax var(--overlay)" }}
          />
        )}
      </div>
      {phase !== "loading" && card}
    </>
  );
}
