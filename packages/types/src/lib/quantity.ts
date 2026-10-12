import type { UnitQty } from "../entities/recipe";

export interface QtyParts {
  value: string;
  unit: string;
}

const fmt0 = new Intl.NumberFormat("fr-BE", { maximumFractionDigits: 0 });
const fmt1 = new Intl.NumberFormat("fr-BE", { maximumFractionDigits: 1 });

function plural(n: number, singular: string, pluralForm: string): string {
  return n > 1 ? pluralForm : singular;
}

// kg and l get one decimal with the trailing zero trimmed; grams and ml are whole above 10.
export function fmtQty(qty: number, unit: UnitQty | string): QtyParts {
  const n = Number.isFinite(qty) ? qty : 0;
  if (unit === "g" || unit === "ml") {
    const big = unit === "g" ? "kg" : "l";
    if (n >= 1000) return { value: fmt1.format(n / 1000), unit: big };
    if (n >= 10) return { value: fmt0.format(n), unit };
    return { value: fmt1.format(n), unit };
  }
  if (unit === "pièce" || unit === "pièces") {
    return { value: fmt1.format(n), unit: plural(n, "pièce", "pièces") };
  }
  if (unit === "botte" || unit === "bottes") {
    return { value: fmt1.format(n), unit: plural(n, "botte", "bottes") };
  }
  return { value: fmt1.format(n), unit };
}

export function fmtQtyText(qty: number, unit: UnitQty | string): string {
  const p = fmtQty(qty, unit);
  return p.unit ? `${p.value} ${p.unit}` : p.value;
}

export type StepPart = string | { from: string; to: string };

const STEP_QTY = /(\d+(?:[.,]\d+)?)\s*(kg|g|cl|ml|l|oeufs?|œufs?|pièces?|pcs?)(?![\p{L}])/giu;

function scaledText(raw: string, unit: string, ratio: number): string {
  const n = parseFloat(raw.replace(",", "."));
  const lower = unit.toLowerCase();
  if (lower === "kg") return fmtQtyText(n * 1000 * ratio, "g");
  if (lower === "g") return fmtQtyText(n * ratio, "g");
  if (lower === "l") return fmtQtyText(n * 1000 * ratio, "ml");
  if (lower === "ml") return fmtQtyText(n * ratio, "ml");
  if (lower === "cl") return `${fmt1.format(n * ratio)} cl`;
  // Eggs and pieces are whole, never below one, and keep the word as written.
  const whole = Math.max(1, Math.round(n * ratio));
  const singular = unit.replace(/s$/i, "");
  const word = whole > 1 ? (/s$/i.test(unit) ? unit : `${unit}s`) : singular;
  return `${fmt0.format(whole)} ${word}`;
}

// Splits a step into plain text and scaled quantity parts; ratio 1 returns the step untouched.
export function scaleStepText(step: string, ratio: number): { parts: StepPart[]; changed: boolean } {
  if (ratio === 1 || !Number.isFinite(ratio) || ratio <= 0) return { parts: [step], changed: false };
  const parts: StepPart[] = [];
  let last = 0;
  let changed = false;
  for (const m of step.matchAll(STEP_QTY)) {
    const index = m.index ?? 0;
    const from = m[0];
    const to = scaledText(m[1], m[2], ratio);
    if (index > last) parts.push(step.slice(last, index));
    if (to === from.replace(/\s+/g, " ")) parts.push(from);
    else {
      parts.push({ from, to });
      changed = true;
    }
    last = index + from.length;
  }
  if (last < step.length) parts.push(step.slice(last));
  if (!changed) return { parts: [step], changed: false };
  return { parts, changed };
}
