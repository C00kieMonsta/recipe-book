import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { MoreHorizontal, Plus } from "lucide-react";
import type { OfferLine, Recipe } from "@packages/types";
import { courseOf, fmtEur, groupByCourse, isIncompleteRecipe, linesForGuests, recipeCategoryOf, round2 } from "@packages/types";
import { Button, IconButton, Menu, MenuItem, MenuRadio, MenuSection, MenuSeparator, SearchSelect, Tag, useMenu } from "@/components/ui";

export interface OfferMenuProps {
  lines: OfferLine[];
  courses: string[];
  recipes: Recipe[];
  // The guest count the portions and the cost per guest are computed at.
  guests: number;
  recipeCostById: Map<string, number>;
  recipePortionsById: Map<string, number>;
  onChange: (lines: OfferLine[]) => void;
  // Opens the page's NewRecipeDialog with the typed name.
  onCreateRecipe: (name: string, category?: string) => void;
  // Shows « + Depuis une autre offre… » when given.
  onAddFromOffer?: () => void;
  // Rendered above the search when the menu has no line.
  empty?: ReactNode;
  // id of the search input, so a page action can focus it.
  searchId?: string;
}

const PORTION_STEP = 0.25;

// Snaps a typed value to quarter portions, never under a quarter.
export function snapPortionsPerGuest(v: number): number {
  const n = Number.isFinite(v) ? v : PORTION_STEP;
  return round2(Math.max(PORTION_STEP, Math.round(n / PORTION_STEP) * PORTION_STEP));
}

interface MenuLine {
  lineId: string;
  recipeId: string;
  portions: number;
  course?: string;
  notes?: string;
  index: number;
}

const ROW = "group flex min-h-9 flex-wrap items-center gap-x-1 rounded px-1 hover:bg-hover touch:min-h-11";

export default function OfferMenu({
  lines,
  courses,
  recipes,
  guests,
  recipeCostById,
  recipePortionsById,
  onChange,
  onCreateRecipe,
  onAddFromOffer,
  empty,
  searchId,
}: OfferMenuProps) {
  const [noteIndex, setNoteIndex] = useState<number | null>(null);

  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.recipeId, r])), [recipes]);
  const recipeOptions = useMemo(
    () => [...recipes].sort((a, b) => a.name.localeCompare(b.name, "fr")).map((r) => ({ value: r.recipeId, label: r.name, detail: recipeCategoryOf(r) })),
    [recipes],
  );

  const grouped = useMemo(() => {
    const quote = linesForGuests(lines, guests);
    const shaped: MenuLine[] = lines.map((l, index) => ({
      lineId: String(index),
      recipeId: l.recipeId,
      portions: quote[index].portions,
      course: l.course,
      notes: l.notes,
      index,
    }));
    return groupByCourse(shaped, courses, recipeById);
  }, [lines, guests, courses, recipeById]);

  const patch = (index: number, change: Partial<OfferLine>) => {
    onChange(lines.map((l, i) => {
      if (i !== index) return l;
      const next: OfferLine = { ...l, ...change };
      if (next.notes === undefined) delete next.notes;
      if (next.course === undefined) delete next.course;
      return next;
    }));
  };

  const remove = (index: number) => {
    if (noteIndex === index) setNoteIndex(null);
    onChange(lines.filter((_, i) => i !== index));
  };

  const addRecipe = (recipeId: string) => {
    const recipe = recipeById.get(recipeId);
    if (!recipe) return;
    onChange([...lines, { recipeId, portionsPerGuest: 1, course: recipeCategoryOf(recipe) }]);
  };

  const costPerGuest = (line: MenuLine, portionsPerGuest: number): number => {
    const unit = (recipeCostById.get(line.recipeId) ?? 0) / (recipePortionsById.get(line.recipeId) || 1);
    const raw = guests > 0 ? (unit * line.portions) / guests : unit * portionsPerGuest;
    return round2(Number.isFinite(raw) ? raw : 0);
  };

  const renderLine = (line: MenuLine) => {
    const source = lines[line.index];
    const recipe = recipeById.get(line.recipeId);
    const incomplete = recipe ? isIncompleteRecipe(recipe) : false;
    const current = courseOf(line, recipe);
    return (
      <div key={line.lineId}>
        <div className={ROW}>
          <div className="min-w-0 flex-1 px-1">
            <div className="flex min-w-0 items-center gap-2">
              {recipe ? (
                <Link to={`/recipes/${line.recipeId}`} title={recipe.name} className="truncate text-sm text-foreground hover:underline touch:text-base">
                  {recipe.name}
                </Link>
              ) : (
                <span className="text-sm text-danger touch:text-base">Recette supprimée</span>
              )}
              {incomplete && <Tag colour="gray">Sans ingrédients</Tag>}
            </div>
            {line.notes && noteIndex !== line.index && <div className="text-sm text-muted-foreground">{line.notes}</div>}
          </div>
          {recipe && (
            <div className="order-3 flex basis-full items-center gap-3 px-1 text-sm tabular-nums touch:text-base md:order-none md:basis-auto md:shrink-0 md:px-0">
              <span className="whitespace-nowrap">
                × <PortionsPerGuest value={source.portionsPerGuest} onSave={(v) => patch(line.index, { portionsPerGuest: v })} />
              </span>
              <span className="whitespace-nowrap text-muted-foreground">{line.portions} port.</span>
              {!incomplete && <span className="whitespace-nowrap text-muted-foreground">{fmtEur(costPerGuest(line, source.portionsPerGuest))} / convive</span>}
            </div>
          )}
          <LineMenu
            title={recipe?.name ?? "Recette supprimée"}
            deleted={!recipe}
            courses={courses}
            current={current}
            onCourse={(c) => { if (c !== current) patch(line.index, { course: c }); }}
            onNote={() => setNoteIndex(line.index)}
            onRemove={() => remove(line.index)}
          />
        </div>
        {noteIndex === line.index && (
          <LineNote
            value={source.notes ?? ""}
            onSave={(v) => { setNoteIndex(null); if (v !== (source.notes ?? "")) patch(line.index, { notes: v || undefined }); }}
            onCancel={() => setNoteIndex(null)}
          />
        )}
      </div>
    );
  };

  return (
    <div>
      {lines.length === 0 && empty}
      {grouped.map((group) => (
        <div key={group.course} className="mt-4 first:mt-0">
          <h3 className="text-base font-semibold">{group.course}</h3>
          <div className="mt-1">{group.lines.map(renderLine)}</div>
        </div>
      ))}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchSelect
          id={searchId}
          options={recipeOptions}
          value=""
          onChange={addRecipe}
          onCreateNew={(name) => onCreateRecipe(name)}
          placeholder="Ajouter une recette…"
          className="sm:max-w-xs sm:flex-1"
        />
        {onAddFromOffer && (
          <Button variant="subtle" size="sm" icon={<Plus />} onClick={onAddFromOffer} className="self-start sm:self-auto">
            Depuis une autre offre…
          </Button>
        )}
      </div>
    </div>
  );
}

const INLINE_INPUT = "-mx-1 w-16 rounded border-0 bg-input-bg px-1 text-right font-medium tabular-nums shadow-ring outline-none";

const decimalFormat = new Intl.NumberFormat("fr-BE", { maximumFractionDigits: 2 });

// Inline quarter-portion editor; shows « 0,5 / convive », accepts a comma or a dot.
function PortionsPerGuest({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");

  const start = () => { setText(String(value).replace(".", ",")); setEditing(true); };
  const commit = () => {
    setEditing(false);
    const parsed = parseFloat(text.replace(",", "."));
    const next = snapPortionsPerGuest(Number.isNaN(parsed) ? value : parsed);
    if (next !== value) onSave(next);
  };

  if (editing) {
    return (
      <span className="inline-flex items-center gap-0.5">
        <input
          className={INLINE_INPUT}
          type="text"
          inputMode="decimal"
          value={text}
          aria-label="Portions par convive"
          onChange={(e) => { if (e.target.value === "" || /^\d*[.,]?\d*$/.test(e.target.value)) setText(e.target.value); }}
          onFocus={(e) => e.target.select()}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(); }
            if (e.key === "Escape") { e.preventDefault(); setEditing(false); }
          }}
          autoFocus
        />
        <span> / convive</span>
      </span>
    );
  }

  return (
    <strong
      role="button"
      tabIndex={0}
      title="Portions par convive"
      className="prop-value font-medium tabular-nums touch:inline-flex touch:min-h-11 touch:items-center"
      onClick={start}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); start(); } }}
    >
      {decimalFormat.format(value)} / convive
    </strong>
  );
}

function LineMenu({ title, deleted, courses, current, onCourse, onNote, onRemove }: {
  title: string;
  deleted: boolean;
  courses: string[];
  current: string;
  onCourse: (course: string) => void;
  onNote: () => void;
  onRemove: () => void;
}) {
  const menu = useMenu();
  return (
    <div ref={menu.ref} className="reveal relative inline-flex shrink-0">
      <IconButton size="sm" aria-label="Plus d'actions" aria-haspopup="menu" aria-expanded={menu.open} onClick={menu.toggle} icon={<MoreHorizontal />} />
      <Menu {...menu.props} align="right" title={title} aria-label="Plus d'actions">
        {!deleted && (
          <>
            <MenuSection label="Changer de catégorie">
              {courses.map((c) => (
                <MenuRadio key={c} checked={c === current} onSelect={() => onCourse(c)}>{c}</MenuRadio>
              ))}
            </MenuSection>
            <MenuSeparator />
            <MenuItem onSelect={onNote}>Note</MenuItem>
            <MenuSeparator />
          </>
        )}
        <MenuItem danger onSelect={onRemove}>Retirer</MenuItem>
      </Menu>
    </div>
  );
}

function LineNote({ value, onSave, onCancel }: { value: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(value);
  return (
    <div className="px-2 pb-2">
      <textarea
        autoFocus
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onSave(text.trim())}
        onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
        placeholder="Note pour cette ligne…"
        className="input-field"
      />
    </div>
  );
}
