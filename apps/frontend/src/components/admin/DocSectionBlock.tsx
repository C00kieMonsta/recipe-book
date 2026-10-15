import { useState } from "react";
import { Link } from "react-router-dom";
import { MoreHorizontal } from "lucide-react";
import type { DocMinimum, DocRow as DocRowData, DocSection } from "@packages/types";
import { DEFAULT_SECTION_UNIT_LABEL, fmtEur, minimumLabelOf, unitKindOf } from "@packages/types";
import { cn } from "@/lib/utils";
import { plural } from "@/lib/use-planning-data";
import { Button, Dialog, IconButton, Menu, MenuCheck, MenuItem, MenuRadio, MenuSeparator, NumericInput, useMenu } from "@/components/ui";
import { ChipMenu, DocRows, InlinePrice, InlineText, MenuField, UnitPill, type RecipeOption, type SectionOption } from "./DocRow";

// none: no offerId. linked: the 07 offer exists. dangling: offerId set but the offer is gone.
export type SectionOfferState = "none" | "linked" | "dangling";

export interface SectionCosting {
  costPerGuest: number;
  marginPct: number;
}

export interface DocSectionBlockProps {
  documentId: string;
  section: DocSection;
  // company.accent, the 3 px bar on the left.
  accent: string;
  index: number;
  count: number;
  readOnly?: boolean;
  recipes?: RecipeOption[];
  categories?: string[];
  // Every section of the document; this one is filtered out of « Déplacer vers… ».
  sections: SectionOption[];
  offerState: SectionOfferState;
  // offerSummary of the linked offer, when it has lines.
  costing?: SectionCosting;
  // Opens the title editor (a section just created).
  focusTitle?: boolean;
  onFocusTitleEnd?: () => void;
  onChange: (section: DocSection) => void;
  onMoveRowTo?: (row: DocRowData, sectionId: string) => void;
  onCreateRecipe?: (rowId: string, name: string, category?: string) => void;
  onCost?: () => void;
  onSync?: () => void;
  onUnlink?: () => void;
  onUseInEvent?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDuplicate?: () => void;
  // Called after the confirmation dialog.
  onRemove?: () => void;
  className?: string;
}

const MINIMUM_UNITS: { value: DocMinimum["unit"]; label: string }[] = [
  { value: "personnes", label: "personnes" },
  { value: "pieces", label: "pièces" },
  { value: "unites", label: "unités" },
];

function withoutUndefined<T extends object>(o: T): T {
  const next = { ...o } as Record<string, unknown>;
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
  return next as T;
}

// Empty header reveals take no space on pointer devices; the hover or a focus in the header shows them.
const EMPTY_REVEAL = "pointer:hidden pointer:group-hover:inline-flex pointer:group-focus-within:inline-flex";

function MinimumChip({ minimum, onChange, readOnly, addClassName }: { minimum?: DocMinimum; onChange: (m: DocMinimum | undefined) => void; readOnly?: boolean; addClassName?: string }) {
  const current: DocMinimum = minimum ?? { qty: 8, unit: "personnes" };
  return (
    <ChipMenu label={minimum ? minimumLabelOf(minimum) : undefined} addLabel="+ Minimum" addClassName={addClassName} title="Minimum" readOnly={readOnly} onAdd={() => onChange(current)}>
      <MenuField label="Quantité">
        <NumericInput value={current.qty} min={1} aria-label="Quantité" className="input-field input-compact w-16 text-right" onChange={(v) => onChange({ ...current, qty: Math.max(1, v) })} />
      </MenuField>
      {MINIMUM_UNITS.map((u) => (
        <MenuRadio key={u.value} checked={current.unit === u.value} onSelect={() => onChange({ ...current, unit: u.value })}>{u.label}</MenuRadio>
      ))}
      <MenuCheck checked={Boolean(current.perSort)} onChange={(v) => onChange(withoutUndefined({ ...current, perSort: v || undefined }))}>par sorte</MenuCheck>
      <MenuField label="Texte imprimé">
        <InlineText
          value={current.label ?? ""}
          placeholder={minimumLabelOf({ ...current, label: undefined })}
          className="max-w-40 text-sm"
          aria-label="Texte imprimé"
          onSave={(v) => onChange(withoutUndefined({ ...current, label: v.trim() || undefined }))}
        />
      </MenuField>
      <MenuSeparator />
      <MenuItem danger onSelect={() => onChange(undefined)}>Retirer</MenuItem>
    </ChipMenu>
  );
}

export default function DocSectionBlock({
  documentId, section, accent, index, count, readOnly, recipes, categories, sections, offerState, costing, focusTitle, onFocusTitleEnd,
  onChange, onMoveRowTo, onCreateRecipe, onCost, onSync, onUnlink, onUseInEvent, onMoveUp, onMoveDown, onDuplicate, onRemove, className,
}: DocSectionBlockProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isFormula = section.price !== undefined;
  const unitLabel = section.unitLabel ?? DEFAULT_SECTION_UNIT_LABEL;
  const otherSections = sections.filter((s) => s.sectionId !== section.sectionId);
  const platRows = section.rows.filter((r) => r.kind === "plat");
  const linkedRows = platRows.filter((r) => r.recipeId).length;
  const unlinkedRows = platRows.length - linkedRows;
  const devisTo = `/devis?document=${encodeURIComponent(documentId)}&section=${encodeURIComponent(section.sectionId)}`;

  const patch = (change: Partial<DocSection>) => onChange(withoutUndefined({ ...section, ...change }));

  return (
    <div className={cn("group", className)}>
      <div className="flex min-h-10 flex-wrap items-center gap-x-2 rounded pr-1 hover:bg-hover touch:min-h-11">
        <span aria-hidden="true" className="w-[3px] self-stretch rounded-full" style={{ background: accent }} />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 py-1 pl-2">
          <InlineText
            value={section.title}
            placeholder="Titre de la section"
            className="text-sm font-semibold touch:text-base"
            aria-label="Titre de la section"
            readOnly={readOnly}
            focused={focusTitle}
            onEditEnd={onFocusTitleEnd}
            onSave={(v) => patch({ title: v.trim() || section.title })}
          />
          <span className={cn("min-w-0", !section.intro && EMPTY_REVEAL)}>
            <InlineText
              value={section.intro ?? ""}
              placeholder={section.intro ? "Mention sous le titre" : "+ Mention"}
              className="text-sm text-muted-foreground touch:text-base"
              aria-label="Mention sous le titre"
              readOnly={readOnly}
              onSave={(v) => patch({ intro: v.trim() || undefined })}
            />
          </span>
          <MinimumChip minimum={section.minimum} readOnly={readOnly} addClassName={EMPTY_REVEAL} onChange={(minimum) => patch({ minimum })} />
        </div>
        <div className="order-3 flex basis-full items-center gap-2 pb-1 pl-3 text-sm tabular-nums touch:text-base md:order-none md:basis-auto md:shrink-0 md:pb-0 md:pl-0">
          <InlinePrice value={section.price} readOnly={readOnly} aria-label="Prix de la section" onSave={(price) => patch({ price })} />
          <UnitPill
            value={unitLabel}
            readOnly={readOnly}
            aria-label="Unité de la section"
            onChange={(label) => { if (label) patch({ unitLabel: label, unitKind: unitKindOf(label) }); }}
          />
        </div>
        {!readOnly && (
          <SectionMenu
            title={section.title || "Section"}
            isFormula={isFormula}
            offerState={offerState}
            hasLinkedRow={linkedRows > 0}
            offerId={section.offerId}
            devisTo={devisTo}
            canMoveUp={index > 0}
            canMoveDown={index < count - 1}
            onCost={onCost}
            onSync={onSync}
            onUnlink={onUnlink}
            onUseInEvent={onUseInEvent}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            onDuplicate={onDuplicate}
            onRemove={() => setConfirmDelete(true)}
          />
        )}
      </div>
      {!isFormula && <p className="pl-3 text-caption text-muted-foreground">Liste de prix : chaque ligne a son prix.</p>}
      <DocRows
        className="mt-0.5 pl-3"
        rows={section.rows}
        priceList={!isFormula}
        sectionUnitLabel={unitLabel}
        readOnly={readOnly}
        recipes={recipes}
        categories={categories}
        otherSections={otherSections}
        onMoveRowTo={onMoveRowTo}
        onCreateRecipe={onCreateRecipe}
        onChange={(rows) => patch({ rows })}
      />
      {offerState === "linked" && section.offerId && (
        <p className="mt-1 pl-3 text-caption text-muted-foreground">
          {costing && <>Coût moyen {fmtEur(costing.costPerGuest)} / conv. · marge food {Math.round(costing.marginPct)} % · </>}
          {unlinkedRows > 0 && <>{plural(unlinkedRows, "plat sans recette", "plats sans recette")} · </>}
          <Link to={`/offres/${section.offerId}`} className="text-primary hover:underline">Ouvrir la formule</Link>
        </p>
      )}
      {offerState === "dangling" && (
        <p className="mt-1 flex items-center gap-2 pl-3 text-caption text-danger">
          Formule supprimée
          {!readOnly && onUnlink && (
            <button type="button" className="text-primary hover:underline" onClick={onUnlink}>Retirer le lien</button>
          )}
        </p>
      )}
      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Supprimer « ${section.title || "Section"} »${section.rows.length ? ` et ${section.rows.length === 1 ? "sa ligne" : `ses ${section.rows.length} lignes`}` : ""} ?`}
        size="md"
        footer={
          <>
            <Button variant="default" onClick={() => setConfirmDelete(false)}>Annuler</Button>
            <Button variant="danger" onClick={() => { setConfirmDelete(false); onRemove?.(); }}>Supprimer</Button>
          </>
        }
      >
        <p className="text-muted-foreground">La formule costée, si elle existe, n'est pas supprimée.</p>
      </Dialog>
    </div>
  );
}

function SectionMenu({ title, isFormula, offerState, hasLinkedRow, offerId, devisTo, canMoveUp, canMoveDown, onCost, onSync, onUnlink, onUseInEvent, onMoveUp, onMoveDown, onDuplicate, onRemove }: {
  title: string;
  isFormula: boolean;
  offerState: SectionOfferState;
  hasLinkedRow: boolean;
  offerId?: string;
  devisTo: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onCost?: () => void;
  onSync?: () => void;
  onUnlink?: () => void;
  onUseInEvent?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDuplicate?: () => void;
  onRemove: () => void;
}) {
  const menu = useMenu();
  return (
    <div ref={menu.ref} className={cn("reveal relative inline-flex shrink-0", menu.open && "!opacity-100")}>
      <IconButton size="sm" aria-label="Actions de la section" aria-haspopup="menu" aria-expanded={menu.open} onClick={menu.toggle} icon={<MoreHorizontal />} />
      <Menu {...menu.props} align="right" title={title} aria-label="Actions de la section">
        {isFormula && offerState === "none" && (
          <div title={hasLinkedRow ? undefined : "Liez d'abord un plat à une recette"}>
            <MenuItem onSelect={onCost} disabled={!hasLinkedRow}>Coster cette formule</MenuItem>
          </div>
        )}
        {offerState === "linked" && (
          <>
            <MenuItem onSelect={onSync}>Mettre à jour la formule</MenuItem>
            {offerId && <MenuItem to={`/offres/${offerId}`}>Ouvrir la formule</MenuItem>}
          </>
        )}
        {offerState === "dangling" && <MenuItem onSelect={onUnlink}>Retirer le lien</MenuItem>}
        {isFormula ? (
          <>
            <MenuItem to={devisTo}>Créer un devis depuis cette formule</MenuItem>
            <MenuItem onSelect={onUseInEvent}>Utiliser dans un événement…</MenuItem>
          </>
        ) : (
          <MenuItem to={devisTo}>Ajouter au devis…</MenuItem>
        )}
        <MenuSeparator />
        <MenuItem onSelect={onMoveUp} disabled={!canMoveUp}>Monter</MenuItem>
        <MenuItem onSelect={onMoveDown} disabled={!canMoveDown}>Descendre</MenuItem>
        <MenuItem onSelect={onDuplicate}>Dupliquer la section</MenuItem>
        <MenuSeparator />
        <MenuItem danger onSelect={onRemove}>Supprimer la section</MenuItem>
      </Menu>
    </div>
  );
}
