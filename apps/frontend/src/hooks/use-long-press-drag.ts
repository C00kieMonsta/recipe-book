import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

export interface DragPoint {
  x: number;
  y: number;
}

export interface LongPressDragOptions<T> {
  // Hold time before the row lifts, in ms.
  delay?: number;
  // Finger travel that cancels the hold, in px; the page scrolls as usual.
  slop?: number;
  enabled?: boolean;
  onStart?: (item: T) => void;
  onMove?: (point: DragPoint, target: string | null) => void;
  // Null when released off every [data-drop-day] cell or when the browser cancelled the gesture.
  onEnd: (target: string | null, item: T) => void;
}

export interface LongPressDragHandlers {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void;
}

export interface LongPressDrag<T> {
  handlers: (item: T) => LongPressDragHandlers;
  dragging: boolean;
  // Pointer position while lifted; the DragGhost applies its own offset.
  ghost: DragPoint | null;
  // The [data-drop-day] value under the finger.
  target: string | null;
  // The lifted item.
  item: T | null;
}

export const DRAG_CLASS = "touch-dragging";
const EDGE_PX = 56;
const EDGE_FAST_PX = 24;
const SCROLL_STEP = 8;
const SCROLL_STEP_FAST = 16;

export function dropDayAt(x: number, y: number): string | null {
  return document.elementFromPoint(x, y)?.closest("[data-drop-day]")?.getAttribute("data-drop-day") ?? null;
}

// React's root touch listeners are passive, so a native one is needed to stop the scroll.
function preventTouch(e: TouchEvent) {
  if (e.cancelable) e.preventDefault();
}

function preventDefault(e: Event) {
  e.preventDefault();
}

function swallowClick(e: Event) {
  e.preventDefault();
  e.stopPropagation();
}

// iOS starts a text selection and the link callout at about the hold delay, so both go off at pointerdown.
function protect(el: HTMLElement) {
  el.style.userSelect = "none";
  el.style.webkitUserSelect = "none";
  el.style.setProperty("-webkit-touch-callout", "none");
}

function unprotect(el: HTMLElement) {
  el.style.userSelect = "";
  el.style.webkitUserSelect = "";
  el.style.setProperty("-webkit-touch-callout", "");
}

interface Gesture<T> {
  el: HTMLElement;
  pointerId: number;
  item: T;
  start: DragPoint;
  last: DragPoint;
  timer: number | null;
  lifted: boolean;
  target: string | null;
  raf: number | null;
  // The pointer moved since the last frame.
  dirty: boolean;
}

// Hold a row 450 ms, it lifts and follows the finger; release on a [data-drop-day] cell.
export function useLongPressDrag<T>(options: LongPressDragOptions<T>): LongPressDrag<T> {
  const { delay = 450, slop = 8, enabled = true } = options;
  const opts = useRef(options);
  opts.current = options;

  const [dragging, setDragging] = useState(false);
  const [ghost, setGhost] = useState<DragPoint | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [item, setItem] = useState<T | null>(null);
  const gesture = useRef<Gesture<T> | null>(null);

  const cancelHold = useCallback(() => {
    const g = gesture.current;
    if (!g) return;
    if (g.timer !== null) window.clearTimeout(g.timer);
    g.el.removeEventListener("contextmenu", preventDefault);
    unprotect(g.el);
    gesture.current = null;
  }, []);

  const publish = useCallback(() => {
    const g = gesture.current;
    if (!g || !g.lifted) return;
    const { x, y } = g.last;
    const next = dropDayAt(x, y);
    g.target = next;
    setGhost({ x, y });
    setTarget(next);
    opts.current.onMove?.({ x, y }, next);
  }, []);

  const tick = useCallback(() => {
    const g = gesture.current;
    if (!g || !g.lifted) return;
    const y = g.last.y;
    const h = window.innerHeight;
    let dy = 0;
    if (y < EDGE_FAST_PX) dy = -SCROLL_STEP_FAST;
    else if (y < EDGE_PX) dy = -SCROLL_STEP;
    else if (y > h - EDGE_FAST_PX) dy = SCROLL_STEP_FAST;
    else if (y > h - EDGE_PX) dy = SCROLL_STEP;
    if (dy) window.scrollBy(0, dy);
    if (dy || g.dirty) {
      g.dirty = false;
      publish();
    }
    g.raf = window.requestAnimationFrame(tick);
  }, [publish]);

  const finish = useCallback((dropTarget: string | null) => {
    const g = gesture.current;
    if (!g) return;
    gesture.current = null;
    if (g.raf !== null) window.cancelAnimationFrame(g.raf);
    const { el } = g;
    el.removeEventListener("touchmove", preventTouch);
    el.removeEventListener("contextmenu", preventDefault);
    el.classList.remove(DRAG_CLASS);
    el.style.touchAction = "";
    unprotect(el);
    try {
      el.releasePointerCapture(g.pointerId);
    } catch {
      /* already released */
    }
    // The browser's click lands after pointerup; the listener goes once it has passed.
    window.setTimeout(() => el.removeEventListener("click", swallowClick, true), 400);
    setDragging(false);
    setGhost(null);
    setTarget(null);
    setItem(null);
    opts.current.onEnd(dropTarget, g.item);
  }, []);

  const lift = useCallback(() => {
    const g = gesture.current;
    if (!g || g.lifted) return;
    g.timer = null;
    g.lifted = true;
    const { el } = g;
    try {
      el.setPointerCapture(g.pointerId);
    } catch {
      /* the pointer is gone */
    }
    navigator.vibrate?.(10);
    el.addEventListener("touchmove", preventTouch, { passive: false });
    el.addEventListener("click", swallowClick, true);
    // Inline copies of the class, for a row re-rendered by a child component between two renders here.
    el.classList.add(DRAG_CLASS);
    el.style.touchAction = "none";
    protect(el);
    setDragging(true);
    setItem(g.item);
    opts.current.onStart?.(g.item);
    publish();
    g.raf = window.requestAnimationFrame(tick);
  }, [publish, tick]);

  useEffect(() => () => {
    const g = gesture.current;
    if (!g) return;
    if (g.lifted) finish(null);
    else cancelHold();
  }, [cancelHold, finish]);

  // A re-render rewrites the row's className, so the class is put back before paint.
  useLayoutEffect(() => {
    const g = gesture.current;
    if (g?.lifted) g.el.classList.add(DRAG_CLASS);
  });

  const handlers = useCallback((rowItem: T): LongPressDragHandlers => ({
    onPointerDown: (e) => {
      if (!enabled || gesture.current) return;
      if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
      if (!e.isPrimary) return;
      const el = e.currentTarget;
      const start = { x: e.clientX, y: e.clientY };
      el.addEventListener("contextmenu", preventDefault);
      protect(el);
      gesture.current = {
        el,
        pointerId: e.pointerId,
        item: rowItem,
        start,
        last: start,
        timer: window.setTimeout(lift, delay),
        lifted: false,
        target: null,
        raf: null,
        dirty: false,
      };
    },
    onPointerMove: (e) => {
      const g = gesture.current;
      if (!g || e.pointerId !== g.pointerId) return;
      g.last = { x: e.clientX, y: e.clientY };
      if (!g.lifted) {
        if (Math.hypot(g.last.x - g.start.x, g.last.y - g.start.y) > slop) cancelHold();
        return;
      }
      g.dirty = true;
    },
    onPointerUp: (e) => {
      const g = gesture.current;
      if (!g || e.pointerId !== g.pointerId) return;
      if (!g.lifted) {
        cancelHold();
        return;
      }
      finish(dropDayAt(e.clientX, e.clientY));
    },
    onPointerCancel: (e) => {
      const g = gesture.current;
      if (!g || e.pointerId !== g.pointerId) return;
      if (!g.lifted) {
        cancelHold();
        return;
      }
      finish(null);
    },
  }), [enabled, delay, slop, lift, cancelHold, finish]);

  return { handlers, dragging, ghost, target, item };
}
