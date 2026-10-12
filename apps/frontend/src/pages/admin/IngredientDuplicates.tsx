import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import type { AppSettings, DuplicateConfidence, GroceryList, Ingredient, Recipe, UnitPrice, UnitQty } from "@packages/types";
import { PRICE_TO_QTY_UNIT, damerauLevenshtein, normalizeIngredientName } from "@packages/types";
import { api, ApiError } from "@/lib/api";
import type { DuplicateGroupDetail, DuplicateMemberDetail } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { fmt } from "@/lib/recipe-helpers";
import { useBackLink, useTopTitle } from "@/components/admin/AdminLayout";
import { PageHeader, Tag, SearchSelect, SupplierTag, Section, Button, Callout, Checkbox, EmptyState, type TagColour } from "@/components/ui";

const NOTICE_KEY = "ingredientMergeNoticeSeen";
const FUZZY_MIN_LEN = 5;

const QTY_LABEL: Record<UnitQty, string> = { g: "grammes", "pièce": "pièces", ml: "millilitres", botte: "bottes" };

const CONFIDENCE: Record<DuplicateConfidence, { label: string; colour: TagColour }> = {
  identique: { label: "Identique", colour: "green" },
  proche: { label: "Proche", colour: "yellow" },
  a_verifier: { label: "À vérifier", colour: "gray" },
};

interface GroupState {
  id: string;
  key: string;
  manual: boolean;
  members: DuplicateMemberDetail[];
  survivorId: string;
  included: Set<string>;
  merging: boolean;
  failures: unknown[] | null;
  error: string | null;
}

function confidenceFor(memberKey: string, survivorKey: string): DuplicateConfidence {
  if (memberKey === survivorKey) return "identique";
  if (memberKey.length >= FUZZY_MIN_LEN && survivorKey.length >= FUZZY_MIN_LEN && damerauLevenshtein(memberKey, survivorKey) <= 1) return "proche";
  return "a_verifier";
}

function sameFamily(a: UnitPrice, b: UnitPrice): boolean {
  return PRICE_TO_QTY_UNIT[a] === PRICE_TO_QTY_UNIT[b];
}

function withSurvivor(members: DuplicateMemberDetail[], survivorId: string): { members: DuplicateMemberDetail[]; included: Set<string> } {
  const survivor = members.find((m) => m.ingredientId === survivorId) ?? members[0];
  const survivorKey = normalizeIngredientName(survivor.name);
  const next = members.map((m) => ({ ...m, confidence: confidenceFor(m.key || normalizeIngredientName(m.name), survivorKey) }));
  const included = new Set(
    next.filter((m) => m.ingredientId !== survivor.ingredientId && m.confidence === "identique" && sameFamily(m.unit, survivor.unit)).map((m) => m.ingredientId),
  );
  return { members: next, included };
}

function initGroup(g: DuplicateGroupDetail, manual = false): GroupState {
  const { members, included } = withSurvivor(g.members, g.suggestedSurvivorId);
  return { id: manual ? `manual-${g.members.map((m) => m.ingredientId).join("-")}` : g.key, key: g.key, manual, members, survivorId: g.suggestedSurvivorId, included, merging: false, failures: null, error: null };
}

function failureLabel(f: unknown): string {
  if (typeof f === "string") return f;
  if (f && typeof f === "object") {
    const o = f as Record<string, unknown>;
    const parts = [o.name, o.recipeId ?? o.listId ?? o.id, o.message ?? o.error ?? o.reason].filter((p) => typeof p === "string" && p);
    return parts.length ? parts.join(" · ") : JSON.stringify(f);
  }
  return String(f);
}

function conflictMessage(body: unknown): string {
  const b = (body ?? {}) as { code?: string; names?: unknown; message?: unknown };
  const names = Array.isArray(b.names) ? b.names.filter((n) => typeof n === "string").join(", ") : "";
  if (b.code === "UNIT_MISMATCH") return `Unités incompatibles, rien n'a été modifié${names ? ` : ${names}` : ""}.`;
  if (b.code === "STILL_REFERENCED") return `Des recettes ou listes référencent encore ces ingrédients (modification concurrente), rien n'a été supprimé${names ? ` : ${names}` : ""}. Rechargez puis réessayez.`;
  return typeof b.message === "string" ? b.message : "Conflit lors de la fusion.";
}

export default function IngredientDuplicates() {
  const [groups, setGroups] = useState<GroupState[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [lists, setLists] = useState<GroceryList[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [noticeSeen, setNoticeSeen] = useState(() => localStorage.getItem(NOTICE_KEY) === "1");
  const [noticeFor, setNoticeFor] = useState<string | null>(null);
  const [manualA, setManualA] = useState("");
  const [manualB, setManualB] = useState("");
  const { toast } = useToast();

  useBackLink({ to: "/ingredients", label: "Ingrédients" });
  useTopTitle("Doublons");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [dups, ings] = await Promise.all([api.ingredients.duplicates(), api.ingredients.list()]);
        if (cancelled) return;
        setGroups(dups.groups.map((g) => initGroup(g)));
        setIngredients(ings);
      } catch (e) {
        if (!cancelled) setLoadError((e as Error).message || "Impossible de charger les doublons");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    api.recipes.list().then((r) => { if (!cancelled) setRecipes(r); }).catch(() => {});
    api.groceryLists.list().then((l) => { if (!cancelled) setLists(l); }).catch(() => {});
    api.settings.get().then((s) => { if (!cancelled) setSettings(s); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const recipesUsing = useMemo(() => {
    const map = new Map<string, Recipe[]>();
    for (const r of recipes ?? []) {
      for (const line of r.ingredients) {
        const arr = map.get(line.ingredientId) ?? [];
        if (!arr.includes(r)) arr.push(r);
        map.set(line.ingredientId, arr);
      }
    }
    return map;
  }, [recipes]);

  const listsUsing = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of lists) {
      const seen = new Set<string>();
      for (const item of l.items) {
        if (seen.has(item.ingredientId)) continue;
        seen.add(item.ingredientId);
        map.set(item.ingredientId, (map.get(item.ingredientId) ?? 0) + 1);
      }
    }
    return map;
  }, [lists]);

  const patch = (id: string, fn: (g: GroupState) => Partial<GroupState>) =>
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, ...fn(g) } : g)));
  const removeGroup = (id: string) => setGroups((prev) => prev.filter((g) => g.id !== id));

  const setSurvivor = (id: string, survivorId: string) =>
    patch(id, (g) => ({ survivorId, ...withSurvivor(g.members, survivorId), failures: null, error: null }));

  const toggleInclude = (id: string, memberId: string) =>
    patch(id, (g) => {
      const included = new Set(g.included);
      if (included.has(memberId)) included.delete(memberId);
      else included.add(memberId);
      return { included };
    });

  const runMerge = async (g: GroupState) => {
    patch(g.id, () => ({ merging: true, failures: null, error: null }));
    try {
      const res = await api.ingredients.merge({ survivorId: g.survivorId, mergedIds: [...g.included] });
      if (res.ok) {
        toast({ title: `${res.recipesUpdated} recettes et ${res.listsUpdated} listes mises à jour, ${res.removed} ingrédients supprimés` });
        removeGroup(g.id);
        api.ingredients.list().then(setIngredients).catch(() => {});
        api.recipes.list().then(setRecipes).catch(() => {});
        api.groceryLists.list().then(setLists).catch(() => {});
      } else {
        patch(g.id, () => ({ merging: false, failures: res.failures }));
        toast({ title: `${res.recipesUpdated} recettes et ${res.listsUpdated} listes mises à jour, ${res.failures.length} échecs`, variant: "destructive" });
      }
    } catch (e) {
      const msg = e instanceof ApiError && e.status === 409 ? conflictMessage(e.body) : (e as Error).message || "Erreur lors de la fusion";
      patch(g.id, () => ({ merging: false, error: msg }));
    }
  };

  const merge = (id: string) => {
    const g = groups.find((x) => x.id === id);
    if (!g || g.included.size === 0 || g.merging) return;
    if (!noticeSeen) { setNoticeFor(id); return; }
    runMerge(g);
  };

  const acknowledgeNotice = () => {
    localStorage.setItem(NOTICE_KEY, "1");
    setNoticeSeen(true);
    const g = groups.find((x) => x.id === noticeFor);
    setNoticeFor(null);
    if (g && g.included.size > 0 && !g.merging) runMerge(g);
  };

  const ignore = async (id: string) => {
    const g = groups.find((x) => x.id === id);
    if (!g) return;
    if (g.manual) { removeGroup(id); return; }
    try {
      const current = settings ?? (await api.settings.get());
      const existing = current.ignoredDuplicateGroups ?? [];
      const updated = await api.settings.update({ ignoredDuplicateGroups: existing.includes(g.key) ? existing : [...existing, g.key] });
      setSettings(updated);
      removeGroup(id);
      toast({ title: "Groupe ignoré" });
    } catch (e) {
      toast({ title: (e as Error).message || "Impossible d'ignorer ce groupe", variant: "destructive" });
    }
  };

  const addManualGroup = () => {
    const a = ingredients.find((i) => i.ingredientId === manualA);
    const b = ingredients.find((i) => i.ingredientId === manualB);
    if (!a || !b || a.ingredientId === b.ingredientId) return;
    const toMember = (i: Ingredient): DuplicateMemberDetail => ({
      ingredientId: i.ingredientId,
      name: i.name,
      unit: i.unit,
      key: normalizeIngredientName(i.name),
      confidence: "a_verifier",
      recipeCount: recipesUsing.get(i.ingredientId)?.length ?? 0,
      listCount: listsUsing.get(i.ingredientId) ?? 0,
      price: i.price,
      supplier: i.supplier,
      updatedAt: i.updatedAt,
    });
    const members = [toMember(a), toMember(b)];
    const survivor = [...members].sort((x, y) => {
      if (y.recipeCount !== x.recipeCount) return y.recipeCount - x.recipeCount;
      const byDate = (y.updatedAt ?? "").localeCompare(x.updatedAt ?? "");
      if (byDate !== 0) return byDate;
      return x.name.length - y.name.length;
    })[0];
    const group = initGroup({ key: survivor.key, suggestedSurvivorId: survivor.ingredientId, members }, true);
    setGroups((prev) => (prev.some((g) => g.id === group.id) ? prev : [group, ...prev]));
    setManualA(""); setManualB("");
  };

  const totalMembers = groups.reduce((n, g) => n + g.members.length, 0);
  const ingredientOptions = useMemo(
    () => [...ingredients].sort((a, b) => a.name.localeCompare(b.name, "fr")).map((i) => ({ value: i.ingredientId, label: i.name, detail: `${fmt(i.price)} ${i.unit}` })),
    [ingredients],
  );

  if (loading) return <div className="p-8 text-muted-foreground">Chargement…</div>;

  return (
    <div className="mx-auto max-w-doc">
      <PageHeader
        breadcrumb={[{ label: "Ingrédients", to: "/ingredients" }, { label: "Doublons" }]}
        iconKey="ingredients"
        title="Doublons d'ingrédients"
        meta={`${groups.length} groupe${groups.length > 1 ? "s" : ""} · ${totalMembers} ingrédient${totalMembers > 1 ? "s" : ""}`}
      />

      {loadError && <Callout emoji="⚠️" tone="danger">{loadError}</Callout>}

      <Section title="Comparer deux ingrédients" meta="construit un groupe manuel" className="!mt-0">
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
          <SearchSelect options={ingredientOptions} value={manualA} onChange={setManualA} placeholder="Premier ingrédient…" />
          <SearchSelect options={ingredientOptions} value={manualB} onChange={setManualB} placeholder="Second ingrédient…" />
          <Button variant="default" size="md" onClick={addManualGroup} disabled={!manualA || !manualB || manualA === manualB}>Comparer</Button>
        </div>
      </Section>

      {groups.length === 0 && !loadError && (
        <EmptyState message="Aucun doublon probable." action={{ label: "Retour aux ingrédients", to: "/ingredients" }} />
      )}

      {groups.map((g) => {
        const survivor = g.members.find((m) => m.ingredientId === g.survivorId) ?? g.members[0];
        const recipeTotal = recipes
          ? new Set(g.members.flatMap((m) => (recipesUsing.get(m.ingredientId) ?? []).map((r) => r.recipeId))).size
          : g.members.reduce((n, m) => n + m.recipeCount, 0);
        return (
          <section key={g.id} className="mt-block">
            <Callout
              emoji="🧅"
              title={
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{survivor.name}</span>
                  <span className="truncate font-normal text-muted-foreground">{g.members.length} variantes · {recipeTotal} recette{recipeTotal > 1 ? "s" : ""}</span>
                  {g.manual && <Tag colour="blue">Groupe manuel</Tag>}
                </span>
              }
              count={g.members.length}
            >
              <div className="-mx-1 mt-1">
                {g.members.map((m) => {
                  const isSurvivor = m.ingredientId === survivor.ingredientId;
                  const mismatch = !isSurvivor && !sameFamily(m.unit, survivor.unit);
                  const usedBy = recipesUsing.get(m.ingredientId);
                  const recipeCount = usedBy ? usedBy.length : m.recipeCount;
                  const listCount = listsUsing.get(m.ingredientId) ?? m.listCount;
                  const conf = CONFIDENCE[m.confidence];
                  return (
                    <div key={m.ingredientId} className="flex flex-wrap items-start gap-x-2 gap-y-1 rounded px-1 py-1 hover:bg-hover">
                      <div className="flex shrink-0 items-center">
                        <Checkbox shape="circle" checked={isSurvivor} onChange={() => setSurvivor(g.id, m.ingredientId)} disabled={g.merging} label={<span className="hidden sm:inline">Conserver</span>} aria-label="Conserver" className="w-auto" />
                        {isSurvivor ? (
                          <span className="inline-block w-7 sm:w-[84px]" aria-hidden="true" />
                        ) : (
                          <Checkbox checked={g.included.has(m.ingredientId)} onChange={() => toggleInclude(g.id, m.ingredientId)} disabled={mismatch || g.merging} label={<span className="hidden sm:inline">Inclure</span>} aria-label="Inclure" className="w-auto" />
                        )}
                      </div>

                      <div className={`min-w-0 flex-1 basis-56 ${mismatch ? "opacity-60" : ""}`}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-medium">{m.name}</span>
                          {isSurvivor ? <Tag colour="blue">Conservé</Tag> : <Tag colour={conf.colour}>{conf.label}</Tag>}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
                          <span className="tabular-nums">{fmt(m.price)} {m.unit}</span>
                          {m.supplier && (<><span aria-hidden="true">·</span><SupplierTag name={m.supplier} /></>)}
                          <span aria-hidden="true">·</span>
                          <span>dans {recipeCount} recette{recipeCount > 1 ? "s" : ""} · {listCount} liste{listCount > 1 ? "s" : ""}</span>
                          {m.updatedAt && (<><span aria-hidden="true">·</span><span>maj {new Date(m.updatedAt).toLocaleDateString("fr-BE")}</span></>)}
                        </div>
                      </div>

                      {mismatch && (
                        <div className="basis-full pl-1 text-sm sm:pl-[136px]">
                          <p className="font-medium text-warning">Unité différente ({m.unit} vs {survivor.unit})</p>
                          {usedBy && usedBy.length > 0 && (
                            <details className="mt-1">
                              <summary className="inline-flex min-h-7 cursor-pointer items-center text-primary touch:min-h-11">Voir {usedBy.length > 1 ? `les ${usedBy.length} recettes` : "la recette"}</summary>
                              <ul className="mt-1 list-disc pl-5">
                                {usedBy.map((r) => (
                                  <li key={r.recipeId}><Link to={`/recipes/${r.recipeId}`} className="text-primary">{r.name}</Link></li>
                                ))}
                              </ul>
                            </details>
                          )}
                          <p className="mt-1 text-muted-foreground">
                            Ces recettes utilisent cet ingrédient en {QTY_LABEL[PRICE_TO_QTY_UNIT[m.unit]]}. Convertissez leurs quantités en {QTY_LABEL[PRICE_TO_QTY_UNIT[survivor.unit]]}, puis revenez fusionner.
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Callout>

            {g.error && (
              <div className="mt-3">
                <Callout emoji="⚠️" tone="danger">{g.error}</Callout>
              </div>
            )}

            {g.failures && g.failures.length > 0 && (
              <div className="mt-3">
                <Callout emoji="⚠️" tone="danger" title={`${g.failures.length} élément${g.failures.length > 1 ? "s" : ""} n'ont pas pu être mis à jour. Rien n'a été supprimé.`}>
                  <ul className="list-disc pl-5">
                    {g.failures.map((f, i) => <li key={i}>{failureLabel(f)}</li>)}
                  </ul>
                </Callout>
              </div>
            )}

            {noticeFor === g.id && (
              <div className="mt-3">
                <Callout emoji="⚠️" tone="warning" title="Fermez les autres onglets de l'application avant de fusionner.">
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button variant="primary" size="sm" onClick={acknowledgeNotice}>Continuer la fusion</Button>
                    <Button variant="default" size="sm" onClick={() => setNoticeFor(null)}>Annuler</Button>
                  </div>
                </Callout>
              </div>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-1">
              <Button
                variant="default"
                size="sm"
                onClick={() => merge(g.id)}
                disabled={g.included.size === 0 || g.merging}
                icon={g.failures ? <RefreshCw /> : undefined}
              >
                {g.failures ? "Réessayer" : g.merging ? "Fusion en cours…" : `Fusionner dans ${survivor.name}`}
              </Button>
              <Button variant="subtle" size="sm" onClick={() => ignore(g.id)} disabled={g.merging}>Ignorer ce groupe</Button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
