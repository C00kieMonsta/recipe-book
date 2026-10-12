import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { todayIso } from "@/lib/dates";
import { readTour, writeTour, type TourRecord } from "@/lib/tour-storage";
import { useTouchScreen } from "@/hooks/use-touch-screen";
import Tour, { findAnyAnchor, isFixed, waitForAnyAnchor } from "./Tour";
import { TOUR_STEPS, type TourContext, type TourStep } from "./tour-steps";

export interface TourState {
  active: boolean;
  // 0-based step index while active.
  index: number;
  seenAt: string | null;
  dismissedOffer: boolean;
  // index 0, navigates to the first route.
  start: () => void;
  // last step: finish()
  next: () => void;
  // index 0: no-op
  prev: () => void;
  // "Ignorer" and Escape: writeTour({ seenAt }) then close.
  skip: () => void;
  // "Terminer": writeTour({ seenAt }) then close.
  finish: () => void;
  // "Plus tard": writeTour({ dismissedOffer: true }).
  dismissOffer: () => void;
}

type Phase = "loading" | "anchored" | "centred";

const PAD = 6;
const ROUTE_TIMEOUT = 3000;
const ANCHOR_TIMEOUT = 2000;
const PHONE_WIDTH = 768;

const noop = () => {};
const TourCtx = createContext<TourState>({ active: false, index: 0, seenAt: null, dismissedOffer: false, start: noop, next: noop, prev: noop, skip: noop, finish: noop, dismissOffer: noop });

export function useTour(): TourState {
  return useContext(TourCtx);
}

function anchorNames(step: TourStep, phone: boolean): string[] {
  const names: string[] = [];
  if (phone && step.phone?.anchor) names.push(step.phone.anchor);
  if (step.anchor) names.push(step.anchor);
  return names;
}

function padRect(el: HTMLElement): DOMRect {
  const r = el.getBoundingClientRect();
  const left = Math.max(0, r.left - PAD);
  const top = Math.max(0, r.top - PAD);
  const right = Math.min(window.innerWidth, r.right + PAD);
  const bottom = Math.min(window.innerHeight, r.bottom + PAD);
  return new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = window.setTimeout(() => resolve(fallback), ms);
    p.then((v) => { window.clearTimeout(t); resolve(v); }, () => { window.clearTimeout(t); resolve(fallback); });
  });
}

// "/semaine" is already shown when the page is "/semaine/2026-W42".
function samePage(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function TourProvider({ children }: { children: ReactNode }): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const touch = useTouchScreen();
  const [narrow, setNarrow] = useState(() => window.innerWidth < PHONE_WIDTH);
  const phone = touch || narrow;
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [record, setRecord] = useState<TourRecord>(() => readTour());
  const [phase, setPhase] = useState<Phase>("loading");
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const runId = useRef(0);
  const indexRef = useRef(0);
  const activeRef = useRef(false);
  const phaseRef = useRef<Phase>("loading");
  const phoneRef = useRef(phone);
  const pathRef = useRef(location.pathname);
  const settledPath = useRef<string | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  pathRef.current = location.pathname;
  phoneRef.current = phone;
  phaseRef.current = phase;
  activeRef.current = active;

  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < PHONE_WIDTH);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const adopt = useCallback((el: HTMLElement) => {
    if (!phoneRef.current && !isFixed(el)) {
      const fits = el.getBoundingClientRect().height <= window.innerHeight - 2 * 16;
      el.scrollIntoView({ block: fits ? "center" : "start", behavior: "instant" });
    }
    setAnchorEl(el);
    setRect(padRect(el));
    setPhase("anchored");
  }, []);

  const settle = useCallback((el: HTMLElement | null) => {
    settledPath.current = pathRef.current;
    if (el) adopt(el);
    else { setAnchorEl(null); setRect(null); setPhase("centred"); }
  }, [adopt]);

  const goTo = useCallback(async (i: number) => {
    const id = ++runId.current;
    const step = TOUR_STEPS[i];
    indexRef.current = i;
    setIndex(i);
    setPhase("loading");
    setAnchorEl(null);
    setRect(null);
    let route: string | null;
    if (typeof step.route === "string") {
      route = step.route;
    } else {
      const ctx: TourContext = { events: () => api.events.list(), today: todayIso() };
      route = await withTimeout(step.route(ctx), ROUTE_TIMEOUT, null);
      if (runId.current !== id) return;
    }
    let navigated = false;
    if (route && !samePage(pathRef.current, route)) {
      navigate(route);
      navigated = true;
    }
    step.before?.();
    const resolvedNull = typeof step.route !== "string" && route === null;
    const names = resolvedNull ? [] : anchorNames(step, phoneRef.current);
    const el = names.length > 0 ? await waitForAnyAnchor(names, ANCHOR_TIMEOUT, step.loadedMark) : null;
    if (runId.current !== id) return;
    // The page may have mounted after the first call.
    if (navigated && el) step.before?.();
    settle(el);
  }, [navigate, settle]);

  const close = useCallback(() => {
    runId.current += 1;
    setActive(false);
    setPhase("loading");
    setAnchorEl(null);
    setRect(null);
    settledPath.current = null;
    previousFocus.current?.focus?.();
    previousFocus.current = null;
  }, []);

  const start = useCallback(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setActive(true);
    void goTo(0);
  }, [goTo]);

  const markSeen = useCallback(() => {
    setRecord(writeTour({ seenAt: new Date().toISOString() }));
    close();
  }, [close]);

  const next = useCallback(() => {
    if (!activeRef.current) return;
    if (indexRef.current >= TOUR_STEPS.length - 1) markSeen();
    else void goTo(indexRef.current + 1);
  }, [goTo, markSeen]);

  const prev = useCallback(() => {
    if (!activeRef.current || indexRef.current === 0) return;
    void goTo(indexRef.current - 1);
  }, [goTo]);

  const dismissOffer = useCallback(() => {
    setRecord(writeTour({ dismissedOffer: true }));
  }, []);

  // A location change the provider did not start (browser back) re-runs the anchor wait.
  useEffect(() => {
    if (!activeRef.current || phaseRef.current === "loading") return;
    if (location.pathname === settledPath.current) return;
    const id = ++runId.current;
    setPhase("loading");
    setAnchorEl(null);
    setRect(null);
    const step = TOUR_STEPS[indexRef.current];
    const names = anchorNames(step, phoneRef.current);
    (names.length > 0 ? waitForAnyAnchor(names, ANCHOR_TIMEOUT, step.loadedMark) : Promise.resolve(null)).then((el) => {
      if (runId.current !== id) return;
      settle(el);
    });
  }, [location.pathname, settle]);

  // Keep the rect in step with the page: resize, scroll and the anchor's own size.
  useEffect(() => {
    if (!active || phase !== "anchored" || !anchorEl) return;
    let raf = 0;
    const measure = () => { raf = 0; setRect(padRect(anchorEl)); };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(measure); };
    const onResize = () => {
      const names = anchorNames(TOUR_STEPS[indexRef.current], phoneRef.current);
      const el = findAnyAnchor(names);
      if (!el) { setAnchorEl(null); setRect(null); setPhase("centred"); return; }
      if (el !== anchorEl) { setAnchorEl(el); setRect(padRect(el)); return; }
      schedule();
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    const ro = new ResizeObserver(schedule);
    ro.observe(anchorEl);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", schedule, { capture: true });
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [active, phase, anchorEl]);

  // A centred step keeps looking for its anchor in case the page finishes loading late.
  useEffect(() => {
    if (!active || phase !== "centred") return;
    const names = anchorNames(TOUR_STEPS[index], phone);
    if (names.length === 0) return;
    const t = window.setInterval(() => {
      const el = findAnyAnchor(names);
      if (el) adopt(el);
    }, 500);
    return () => window.clearInterval(t);
  }, [active, phase, index, phone, adopt]);

  const value = useMemo<TourState>(() => ({
    active,
    index,
    seenAt: record.seenAt ?? null,
    dismissedOffer: Boolean(record.dismissedOffer),
    start,
    next,
    prev,
    skip: markSeen,
    finish: markSeen,
    dismissOffer,
  }), [active, index, record, start, next, prev, markSeen, dismissOffer]);

  return (
    <TourCtx.Provider value={value}>
      {children}
      {active && createPortal(
        <Tour
          step={TOUR_STEPS[index]}
          index={index}
          total={TOUR_STEPS.length}
          phase={phase}
          rect={rect}
          anchor={anchorEl}
          phone={phone}
          onPrev={prev}
          onNext={next}
          onSkip={markSeen}
        />,
        document.body,
      )}
    </TourCtx.Provider>
  );
}
