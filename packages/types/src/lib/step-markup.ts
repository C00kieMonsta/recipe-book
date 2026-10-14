import { scaleStepText } from "./quantity";

export interface StepSpan {
  text: string;
  bold: boolean;
  mark: boolean;
}

export type StepMarker = "**" | "==";

export type StepSegment =
  | { kind: "text"; text: string; bold: boolean; mark: boolean }
  | { kind: "qty"; from: string; to: string; bold: boolean; mark: boolean };

const MARKERS: StepMarker[] = ["**", "=="];

// Index of the closing marker for an opener at `at`, or -1 when none sits before `limit` or the pair would be empty.
function closingIndex(step: string, at: number, marker: StepMarker, limit: number): number {
  const found = step.indexOf(marker, at + marker.length);
  if (found === -1 || found >= limit) return -1;
  if (found === at + marker.length) return -1;
  return found;
}

// "**" and "==" open a span that closes at the next identical marker; an unmatched or empty pair is literal; one level of nesting each way.
export function parseStepMarkup(step: string): StepSpan[] {
  const spans: StepSpan[] = [];
  const open: { marker: StepMarker; closeAt: number }[] = [];
  let buffer = "";
  let bold = false;
  let mark = false;

  const flush = () => {
    if (buffer) spans.push({ text: buffer, bold, mark });
    buffer = "";
  };

  let i = 0;
  while (i < step.length) {
    const marker = MARKERS.find((m) => step.startsWith(m, i));
    if (!marker) {
      buffer += step[i];
      i += 1;
      continue;
    }
    const isBold = marker === "**";
    const isOpen = isBold ? bold : mark;
    if (isOpen) {
      flush();
      if (isBold) bold = false;
      else mark = false;
      open.pop();
      i += marker.length;
      continue;
    }
    const limit = open.length ? open[open.length - 1].closeAt : step.length;
    const closeAt = closingIndex(step, i, marker, limit);
    if (closeAt === -1) {
      buffer += marker;
      i += marker.length;
      continue;
    }
    flush();
    if (isBold) bold = true;
    else mark = true;
    open.push({ marker, closeAt });
    i += marker.length;
  }
  flush();
  return spans;
}

export function stripStepMarkup(step: string): string {
  return parseStepMarkup(step)
    .map((s) => s.text)
    .join("");
}

// Wraps [selStart, selEnd) in the marker, unwraps it when both ends already carry it, or inserts an empty pair with the caret between.
export function toggleWrap(
  text: string,
  selStart: number,
  selEnd: number,
  marker: StepMarker,
): { text: string; selStart: number; selEnd: number } {
  const len = marker.length;
  const clamp = (n: number) => Math.max(0, Math.min(text.length, Math.trunc(n)));
  const start = clamp(Math.min(selStart, selEnd));
  const end = clamp(Math.max(selStart, selEnd));

  if (start === end) {
    const next = text.slice(0, start) + marker + marker + text.slice(start);
    return { text: next, selStart: start + len, selEnd: start + len };
  }

  const selected = text.slice(start, end);
  const inside = selected.length > 2 * len && selected.startsWith(marker) && selected.endsWith(marker);
  if (inside) {
    const inner = selected.slice(len, selected.length - len);
    const next = text.slice(0, start) + inner + text.slice(end);
    return { text: next, selStart: start, selEnd: start + inner.length };
  }

  const outside = text.slice(start - len, start) === marker && text.slice(end, end + len) === marker && start >= len;
  if (outside) {
    const next = text.slice(0, start - len) + selected + text.slice(end + len);
    return { text: next, selStart: start - len, selEnd: end - len };
  }

  const next = text.slice(0, start) + marker + selected + marker + text.slice(end);
  return { text: next, selStart: start + len, selEnd: end + len };
}

// Parses the markup first and scales each span on its own, so a quantity never spans a marker.
export function scaleStepSegments(step: string, ratio: number): { segments: StepSegment[]; changed: boolean } {
  const segments: StepSegment[] = [];
  let changed = false;
  for (const span of parseStepMarkup(step)) {
    const scaled = scaleStepText(span.text, ratio);
    if (scaled.changed) changed = true;
    for (const part of scaled.parts) {
      if (typeof part === "string") segments.push({ kind: "text", text: part, bold: span.bold, mark: span.mark });
      else segments.push({ kind: "qty", from: part.from, to: part.to, bold: span.bold, mark: span.mark });
    }
  }
  return { segments, changed };
}
