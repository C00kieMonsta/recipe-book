import { useCallback, useEffect, useState } from "react";

export const MEP_KEY_PREFIX = "recipe-book:mep:";

export function miseEnPlaceKey(lineId: string): string {
  return `${MEP_KEY_PREFIX}${lineId}`;
}

function read(lineId: string | undefined): Set<number> {
  if (!lineId) return new Set();
  try {
    const raw = localStorage.getItem(miseEnPlaceKey(lineId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((n): n is number => typeof n === "number") : []);
  } catch {
    return new Set();
  }
}

function write(lineId: string | undefined, ticked: Set<number>) {
  if (!lineId) return;
  try {
    if (ticked.size === 0) localStorage.removeItem(miseEnPlaceKey(lineId));
    else localStorage.setItem(miseEnPlaceKey(lineId), JSON.stringify([...ticked].sort((a, b) => a - b)));
  } catch {
    // Storage full or blocked: the ticks stay in memory for this view.
  }
}

export interface MiseEnPlace {
  ticked: Set<number>;
  toggle: (index: number) => void;
  clear: () => void;
}

// Ticked ingredient indexes of a prep line, kept in localStorage per line; in memory only without a lineId.
export function useMiseEnPlace(lineId?: string): MiseEnPlace {
  const [ticked, setTicked] = useState<Set<number>>(() => read(lineId));

  useEffect(() => {
    setTicked(read(lineId));
  }, [lineId]);

  const toggle = useCallback((index: number) => {
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      write(lineId, next);
      return next;
    });
  }, [lineId]);

  const clear = useCallback(() => {
    setTicked(new Set());
    write(lineId, new Set());
  }, [lineId]);

  return { ticked, toggle, clear };
}

// Drops the stored ticks of a line without mounting the hook, for the day view and cook mode.
export function clearMiseEnPlace(lineId: string) {
  try {
    localStorage.removeItem(miseEnPlaceKey(lineId));
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}
