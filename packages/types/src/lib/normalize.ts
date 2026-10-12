import type { Ingredient } from "../entities/ingredient";

const STOP_WORDS = new Set(["de", "du", "des", "d", "la", "le", "les", "en"]);

export const QUALIFIERS = [
  "bio", "doux", "demisel", "sale", "entier", "ecreme", "frais", "fume", "surgele", "t45", "t55", "t65", "cru", "cuit",
] as const;
// Minimum key length for a fuzzy (Damerau-Levenshtein) link.
const FUZZY_MIN_LEN = 5;

const QUANTITY_RE = /\b(\d+\s*x\s*)?\d+([.,]\d+)?\s*(g|gr|kg|ml|cl|l|%)?(?![\p{L}\p{N}])/gu;
const PACKAGING_RE = /\b(pieces?|pcs?|bottes?|sachet|boite|bte|paquet|x\d+)\b/gu;

export function singularize(token: string): string {
  if (token.length < 4) return token;
  if (token.endsWith("x")) return /(au|eu|ou)x$/.test(token) ? token.slice(0, -1) : token;
  if (token.endsWith("s")) return /(ss|is|as|us|os)$/.test(token) ? token : token.slice(0, -1);
  return token;
}

export function normalizeIngredientTokens(raw: string): string[] {
  let s = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .trim();
  s = s.replace(/\([^)]*\)?/g, " ").replace(/\[[^\]]*\]?/g, " ");
  s = s.split(" - ")[0].split(",")[0];
  s = s.replace(QUANTITY_RE, " ").replace(PACKAGING_RE, " ");
  // A hyphen between letters is dropped so chou-fleur stays one token.
  s = s.replace(/(?<=\p{L})-(?=\p{L})/gu, "");
  s = s.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  return s
    .split(" ")
    .filter((t) => t.length > 0)
    .map(singularize)
    .filter((t) => !STOP_WORDS.has(t))
    .sort();
}

export function normalizeIngredientName(raw: string): string {
  return normalizeIngredientTokens(raw).join(" ");
}

// Keys hold singularised tokens, so "doux" must match as "dou".
const QUALIFIER_SET = new Set<string>(QUALIFIERS.flatMap((q) => [q, singularize(q)]));

// Optimal string alignment distance: insert, delete, substitute, or swap two adjacent characters.
export function damerauLevenshtein(a: string, b: string): number {
  const n = a.length;
  const m = b.length;
  if (n === 0) return m;
  if (m === 0) return n;
  const d: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 0; i <= n; i++) d[i][0] = i;
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[n][m];
}

export type DuplicateConfidence = "identique" | "proche" | "a_verifier";

export interface DuplicateMember {
  ingredientId: string;
  name: string;
  unit: Ingredient["unit"];
  key: string;
  confidence: DuplicateConfidence;
  recipeCount: number;
  listCount: number;
}

export interface DuplicateGroup {
  key: string;
  suggestedSurvivorId: string;
  members: DuplicateMember[];
}

export interface RefCounts {
  recipeCount: number;
  listCount: number;
}

export interface GroupDuplicatesOptions {
  ignoredKeys?: string[];
  refCounts?: Map<string, RefCounts>;
}

type Candidate = Pick<Ingredient, "ingredientId" | "name" | "unit" | "updatedAt">;

export function isFuzzyMatch(a: string, b: string): boolean {
  if (a === b) return false;
  if (a.length < FUZZY_MIN_LEN || b.length < FUZZY_MIN_LEN) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  return damerauLevenshtein(a, b) <= 1;
}

// True when `longer` has every token of `shorter` plus at least one token, all extras being qualifiers.
function isQualifierSuperset(shorter: string[], longer: string[]): boolean {
  if (longer.length <= shorter.length) return false;
  const base = new Set(shorter);
  if (!shorter.every((t) => longer.includes(t))) return false;
  const extras = longer.filter((t) => !base.has(t));
  return extras.length > 0 && extras.every((t) => QUALIFIER_SET.has(t));
}

export function isQualifierVariant(a: string, b: string): boolean {
  const ta = a.split(" ");
  const tb = b.split(" ");
  return isQualifierSuperset(ta, tb) || isQualifierSuperset(tb, ta);
}

function confidenceOf(memberKey: string, survivorKey: string): DuplicateConfidence {
  if (memberKey === survivorKey) return "identique";
  if (isFuzzyMatch(memberKey, survivorKey)) return "proche";
  return "a_verifier";
}

const CONFIDENCE_RANK: Record<DuplicateConfidence, number> = { identique: 0, proche: 1, a_verifier: 2 };

export function groupDuplicates(ingredients: Candidate[], opts: GroupDuplicatesOptions = {}): DuplicateGroup[] {
  const ignored = new Set(opts.ignoredKeys ?? []);
  const refCounts = opts.refCounts ?? new Map<string, RefCounts>();

  const byKey = new Map<string, Candidate[]>();
  for (const ing of ingredients) {
    const key = normalizeIngredientName(ing.name);
    if (!key || ignored.has(key)) continue;
    const bucket = byKey.get(key);
    if (bucket) bucket.push(ing);
    else byKey.set(key, [ing]);
  }

  const keys = [...byKey.keys()];
  const parent = new Map<string, string>(keys.map((k) => [k, k]));
  const find = (k: string): string => {
    let root = k;
    while (parent.get(root) !== root) root = parent.get(root) as string;
    parent.set(k, root);
    return root;
  };
  const union = (a: string, b: string) => parent.set(find(a), find(b));

  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = keys[i];
      const b = keys[j];
      if (isFuzzyMatch(a, b) || isQualifierVariant(a, b)) union(a, b);
    }
  }

  const clusters = new Map<string, Candidate[]>();
  for (const key of keys) {
    const root = find(key);
    const list = clusters.get(root) ?? [];
    list.push(...(byKey.get(key) as Candidate[]));
    clusters.set(root, list);
  }

  const groups: DuplicateGroup[] = [];
  for (const members of clusters.values()) {
    if (members.length < 2) continue;
    const counts = (id: string): RefCounts => refCounts.get(id) ?? { recipeCount: 0, listCount: 0 };
    const survivor = [...members].sort((x, y) => {
      const byRefs = counts(y.ingredientId).recipeCount - counts(x.ingredientId).recipeCount;
      if (byRefs !== 0) return byRefs;
      const byDate = (y.updatedAt ?? "").localeCompare(x.updatedAt ?? "");
      if (byDate !== 0) return byDate;
      const byLen = x.name.length - y.name.length;
      if (byLen !== 0) return byLen;
      return x.ingredientId.localeCompare(y.ingredientId);
    })[0];
    const survivorKey = normalizeIngredientName(survivor.name);
    const out: DuplicateMember[] = members.map((m) => {
      const key = normalizeIngredientName(m.name);
      const c = counts(m.ingredientId);
      return {
        ingredientId: m.ingredientId,
        name: m.name,
        unit: m.unit,
        key,
        confidence: confidenceOf(key, survivorKey),
        recipeCount: c.recipeCount,
        listCount: c.listCount,
      };
    });
    out.sort((x, y) => {
      if (x.ingredientId === survivor.ingredientId) return -1;
      if (y.ingredientId === survivor.ingredientId) return 1;
      const byConf = CONFIDENCE_RANK[x.confidence] - CONFIDENCE_RANK[y.confidence];
      if (byConf !== 0) return byConf;
      return x.name.localeCompare(y.name, "fr");
    });
    groups.push({ key: survivorKey, suggestedSurvivorId: survivor.ingredientId, members: out });
  }

  groups.sort((a, b) => a.key.localeCompare(b.key, "fr"));
  return groups;
}
