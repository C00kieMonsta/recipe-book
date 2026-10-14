export const TOUR_KEY = "recipe-book:tour";

export interface TourRecord {
  // ISO date-time, set when the tour is finished or skipped.
  seenAt?: string;
  // Set by "Plus tard" on the first-run callout.
  dismissedOffer?: boolean;
  // Set after the first touch lift of a line or task; the hint caption then stays hidden.
  touchDragHintSeen?: boolean;
}

// {} when the key is absent, unparsable or storage is unavailable.
export function readTour(): TourRecord {
  try {
    const raw = localStorage.getItem(TOUR_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const rec = parsed as Record<string, unknown>;
    const out: TourRecord = {};
    if (typeof rec.seenAt === "string") out.seenAt = rec.seenAt;
    if (rec.dismissedOffer === true) out.dismissedOffer = true;
    if (rec.touchDragHintSeen === true) out.touchDragHintSeen = true;
    return out;
  } catch {
    return {};
  }
}

// Merges the patch into the stored record; the write error (private mode) is swallowed.
export function writeTour(patch: Partial<TourRecord>): TourRecord {
  const next = { ...readTour(), ...patch };
  try {
    localStorage.setItem(TOUR_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
  return next;
}
