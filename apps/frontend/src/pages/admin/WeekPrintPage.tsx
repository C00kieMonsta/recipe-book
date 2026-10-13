import { useMemo } from "react";
import { Link, Navigate, useLocation, useParams, useSearchParams } from "react-router-dom";
import { ChevronLeft, Printer, SlidersHorizontal } from "lucide-react";
import type { PrestationTypeSetting, PrintPage, PrintRow } from "@packages/types";
import { datesOfIsoWeek, DEFAULT_PRESTATION_TYPES, fmtQtyText, isoWeekOf, parseIsoWeek, weekPrintPages } from "@packages/types";
import { todayIso } from "@/lib/dates";
import { usePlanningData } from "@/lib/use-planning-data";
import { cn } from "@/lib/utils";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useTouchScreen } from "@/hooks/use-touch-screen";
import { useBackLink, useFullBleed, useTopTitle } from "@/components/admin/AdminLayout";
import { Button, EmptyState, Menu, MenuCheck, MenuRadio, MenuSection, MenuSeparator, useMenu } from "@/components/ui";

const STORAGE_KEY = "recipe-book:print-week";

interface PrintOptions {
  byPerson: boolean;
  withIngredients: boolean;
  onePagePerDay: boolean;
}

const DEFAULT_OPTIONS: PrintOptions = { byPerson: false, withIngredients: false, onePagePerDay: true };

interface ResolvedOptions extends PrintOptions {
  personId?: string;
}

// URL wins, then the stored choices, then the defaults; `?personne=` alone means that person's page.
function resolveOptions(params: URLSearchParams, stored: PrintOptions): ResolvedOptions {
  const par = params.get("par");
  const personne = params.get("personne") ?? "";
  const ingredients = params.get("ingredients");
  const pages = params.get("pages");
  const byPerson = par ? par === "personne" : personne ? true : stored.byPerson;
  return {
    byPerson,
    personId: byPerson && personne ? personne : undefined,
    withIngredients: ingredients ? ingredients === "1" : stored.withIngredients,
    onePagePerDay: pages ? pages === "jour" : stored.onePagePerDay,
  };
}

export default function WeekPrintPage() {
  const { isoWeek = "" } = useParams<{ isoWeek: string }>();
  const { search } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const touch = useTouchScreen();
  const menu = useMenu();
  useFullBleed(true);

  const valid = /^\d{4}-W\d{2}$/.test(isoWeek);
  const today = todayIso();
  const safeWeek = valid ? isoWeek : isoWeekOf(today);
  const dates = useMemo(() => datesOfIsoWeek(safeWeek), [safeWeek]);
  const weekNo = parseIsoWeek(safeWeek).week;
  const client = searchParams.get("client") ?? "";
  const backUrl = `/semaine/${safeWeek}${client ? `?client=${encodeURIComponent(client)}` : ""}`;
  useBackLink({ to: backUrl, label: `Semaine ${weekNo}` });
  useTopTitle(`Imprimer · Semaine ${weekNo}`);

  const [storedRaw, setStored] = useLocalStorage<Partial<PrintOptions>>(STORAGE_KEY, {});
  const stored = useMemo<PrintOptions>(() => ({ ...DEFAULT_OPTIONS, ...storedRaw }), [storedRaw]);
  const options = useMemo(() => resolveOptions(searchParams, stored), [searchParams, stored]);
  const { byPerson, personId, withIngredients, onePagePerDay } = options;

  const { events, recipeById, clientById, ingredientById, people, courses, settings, loading, error } = usePlanningData();
  const activePeople = useMemo(() => people.filter((p) => p.active), [people]);
  const prestationTypes: PrestationTypeSetting[] = settings?.prestationTypes?.length ? settings.prestationTypes : DEFAULT_PRESTATION_TYPES;

  const pages = useMemo<PrintPage[]>(
    () => weekPrintPages({
      events, weekDates: dates, courses, recipeById, clientById, people, prestationTypes, ingredientById,
      byPerson, personId, withIngredients, onePagePerDay,
    }),
    [events, dates, courses, recipeById, clientById, people, prestationTypes, ingredientById, byPerson, personId, withIngredients, onePagePerDay],
  );

  const update = (patch: Partial<PrintOptions>, nextPersonId?: string) => {
    const next = new URLSearchParams(searchParams);
    if (patch.onePagePerDay !== undefined) next.set("pages", patch.onePagePerDay ? "jour" : "suite");
    if (patch.withIngredients !== undefined) next.set("ingredients", patch.withIngredients ? "1" : "0");
    if (patch.byPerson !== undefined) {
      next.set("par", patch.byPerson ? "personne" : "equipe");
      if (patch.byPerson && nextPersonId) next.set("personne", nextPersonId); else next.delete("personne");
    }
    setSearchParams(next, { replace: true });
    setStored({
      byPerson: patch.byPerson ?? byPerson,
      withIngredients: patch.withIngredients ?? withIngredients,
      onePagePerDay: patch.onePagePerDay ?? onePagePerDay,
    });
  };

  if (!valid) return <Navigate to={`/semaine/${isoWeekOf(today)}/imprimer${search}`} replace />;

  const empty = !loading && pages.length === 0;
  const backLabel = (
    <>
      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      Semaine {weekNo}
    </>
  );

  return (
    <div className="pb-24 print:pb-0">
      <div className="no-print mx-auto max-w-doc">
        <div className="flex items-center gap-2">
          {!touch && (
            <Button as={Link} to={backUrl} variant="ghost" size="sm" icon={<ChevronLeft />}>Semaine {weekNo}</Button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <div ref={menu.ref} className="relative inline-flex">
              <Button variant="ghost" size="sm" icon={<SlidersHorizontal />} aria-haspopup="menu" aria-expanded={menu.open} onClick={menu.toggle}>
                Options
              </Button>
              <Menu {...menu.props} align="right" title="Options" aria-label="Options">
                <MenuSection label="Pages">
                  <MenuRadio checked={onePagePerDay} onSelect={() => update({ onePagePerDay: true })}>Une page par jour</MenuRadio>
                  <MenuRadio checked={!onePagePerDay} onSelect={() => update({ onePagePerDay: false })}>À la suite</MenuRadio>
                </MenuSection>
                <MenuSeparator />
                <MenuCheck checked={withIngredients} onChange={(v) => update({ withIngredients: v })}>Avec les ingrédients de chaque recette</MenuCheck>
                <MenuSeparator />
                <MenuSection label="Par personne">
                  <MenuRadio checked={!byPerson} onSelect={() => update({ byPerson: false })}>Toute l'équipe sur une feuille</MenuRadio>
                  <MenuRadio checked={byPerson && !personId} onSelect={() => update({ byPerson: true })}>Une page par personne</MenuRadio>
                  {activePeople.map((p) => (
                    <MenuRadio key={p.personId} checked={byPerson && personId === p.personId} onSelect={() => update({ byPerson: true }, p.personId)}>
                      {p.name}
                    </MenuRadio>
                  ))}
                </MenuSection>
              </Menu>
            </div>
            <Button variant="primary" size="lg" icon={<Printer />} disabled={loading || pages.length === 0} onClick={() => window.print()}>
              {touch ? "Imprimer / Partager" : "Imprimer"}
            </Button>
          </div>
        </div>
        {touch && <p className="mt-1 text-caption text-muted-foreground">L'impression propose aussi l'enregistrement en PDF.</p>}
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        {loading && <p className="mt-6 text-sm text-muted-foreground">Chargement…</p>}
        {empty && <EmptyState message="Rien à imprimer cette semaine." action={{ label: backLabel, to: backUrl }} />}
      </div>

      {pages.length > 0 && (
        <div className="print-sheet mx-auto mt-6 max-w-doc print:mt-0">
          {pages.map((page, i) => (
            <section key={`${page.title}-${i}`} className={i > 0 ? "mt-10 print-break print:mt-0" : ""}>
              <h1 className="text-h2">{page.title}</h1>
              {page.caption && <p className="text-sm text-muted-foreground">{page.caption}</p>}
              {page.sections.map((section) => (
                <div key={section.heading}>
                  <h2 className="mt-6 text-h3">{section.heading}</h2>
                  {section.caption && <p className="text-sm text-muted-foreground">{section.caption}</p>}
                  {section.blocks.map((block, b) => (
                    <div key={`${block.heading}-${b}`}>
                      <h3 className={cn("mt-4 text-base font-semibold", block.movedIn && "text-muted-foreground")}>{block.heading}</h3>
                      {block.movedOutNote && <p className="text-sm text-muted-foreground">{block.movedOutNote}</p>}
                      <ul className="mt-1 divide-y divide-border">
                        {block.rows.map((row, r) => <PrintRowItem key={`${row.label}-${r}`} row={row} />)}
                      </ul>
                    </div>
                  ))}
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function PrintRowItem({ row }: { row: PrintRow }) {
  return (
    <li className={cn("print-row flex flex-wrap items-start gap-2 py-1", row.done && "text-muted-foreground")}>
      <span className={cn("mt-1 inline-block h-3 w-3 shrink-0 rounded-[2px] border border-divider", row.done && "bg-foreground")} aria-hidden="true" />
      <span className="min-w-0 flex-1 break-words text-base">
        {row.label}
        {row.with && row.with.length > 0 && <span className="text-sm text-muted-foreground"> · avec {row.with.join(", ")}</span>}
        {row.note && <span className="block text-sm text-muted-foreground">{row.note}</span>}
      </span>
      <span className="w-24 text-sm text-muted-foreground">{row.course}</span>
      <span className="w-10 text-right tabular-nums">{row.portions ?? ""}</span>
      <span className="w-16 text-right text-sm text-muted-foreground">{row.initials.join(", ")}</span>
      {row.ingredients && row.ingredients.length > 0 && (
        <ul className="ml-5 grid basis-full grid-cols-2 gap-x-6 text-sm">
          {row.ingredients.map((it, i) => (
            <li key={`${it.name}-${it.unit}-${i}`} className="flex justify-between gap-2">
              <span className="min-w-0">{it.name}</span>
              <span className="shrink-0 tabular-nums">{fmtQtyText(it.qty, it.unit)}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
