import { useEffect, useMemo, useState } from "react";
import type { DocRow, DocSection, DocUnitKind, EventRevenueLine, OfferDocument, OfferLine, PrestationTypeSetting, VatRate } from "@packages/types";
import { fmtEur, foodVatRateOf, mergeOfferLines, minimumLabelOf, priceLabelOf, revenueLinesFromRows, round2, rowMinimumWarnings, unitKindOf } from "@packages/types";
import { plural } from "@/lib/use-planning-data";
import { Button, Callout, Checkbox, Dialog, FieldLabel, NumericInput, SelectPill } from "@/components/ui";

export interface AddFromDocumentResult {
  // Picked rows with a recipe, merged by recipe.
  lines: OfferLine[];
  // Picked rows without a recipe, as revenue at the document's food rate.
  revenueLines: EventRevenueLine[];
  vatRate: VatRate;
  document: OfferDocument;
}

export interface AddFromDocumentDialogProps {
  open: boolean;
  onClose: () => void;
  documents: OfferDocument[];
  prestationTypes: PrestationTypeSetting[];
  // The devis guests; per-guest rows are bought for them.
  guests: number;
  // Document (and section) to open on, from ?document=&section=.
  initial?: { documentId: string; sectionId?: string };
  onAdd: (result: AddFromDocumentResult) => void;
}

const DEFAULT_PIECES = 20;
const DEFAULT_UNITS = 1;

function rowUnitKind(section: DocSection, row: DocRow): DocUnitKind {
  return row.unitKind ?? unitKindOf(row.unitLabel, section.unitKind ?? unitKindOf(section.unitLabel));
}

function rowUnitLabel(section: DocSection, row: DocRow): string | undefined {
  return row.unitLabel?.trim() || section.unitLabel?.trim() || undefined;
}

// The minimum when it is a count of pieces or units, else 20 pieces or 1 unit.
export function defaultQty(section: DocSection, kind: DocUnitKind): number {
  const m = section.minimum;
  if (m && m.unit !== "personnes" && m.qty > 0) return m.qty;
  return kind === "piece" ? DEFAULT_PIECES : DEFAULT_UNITS;
}

function selectable(row: DocRow): boolean {
  return row.kind === "plat" && row.price !== undefined;
}

export default function AddFromDocumentDialog({ open, onClose, documents, prestationTypes, guests, initial, onAdd }: AddFromDocumentDialogProps) {
  const candidates = useMemo(() => documents.filter((d) => !d.archived), [documents]);
  const [documentId, setDocumentId] = useState("");
  const [picked, setPicked] = useState<Map<string, number>>(() => new Map());

  // Each opening starts from the requested document, else the first one; a vanished document falls back too.
  useEffect(() => {
    if (!open) return;
    setPicked(new Map());
    setDocumentId((current) => {
      const wanted = initial?.documentId && candidates.some((d) => d.documentId === initial.documentId) ? initial.documentId : current;
      return candidates.some((d) => d.documentId === wanted) ? wanted : candidates[0]?.documentId ?? "";
    });
  }, [open, candidates, initial?.documentId]);

  const document = candidates.find((d) => d.documentId === documentId);
  const sections = document?.sections ?? [];
  const safeGuests = Number.isFinite(guests) && guests > 0 ? guests : 1;
  const hasPriced = sections.some((s) => s.rows.some(selectable));

  const pickDocument = (id: string) => {
    setDocumentId(id);
    setPicked(new Map());
  };

  const toggle = (section: DocSection, row: DocRow, on: boolean) => {
    setPicked((prev) => {
      const next = new Map(prev);
      if (on) {
        const kind = rowUnitKind(section, row);
        next.set(row.rowId, kind === "convive" ? safeGuests : defaultQty(section, kind));
      } else {
        next.delete(row.rowId);
      }
      return next;
    });
  };

  const setQty = (rowId: string, qty: number) => {
    setPicked((prev) => new Map(prev).set(rowId, Math.max(0, qty)));
  };

  const picks = useMemo(() => {
    const out: { section: DocSection; row: DocRow; qty: number }[] = [];
    for (const section of sections) {
      for (const row of section.rows) {
        const qty = picked.get(row.rowId);
        if (qty !== undefined && selectable(row)) out.push({ section, row, qty });
      }
    }
    return out;
  }, [sections, picked]);

  const warnings = useMemo(() => {
    const out: string[] = [];
    for (const section of sections) {
      const own = picks.filter((p) => p.section === section).map(({ row, qty }) => ({ row, qty }));
      if (own.length) out.push(...rowMinimumWarnings(section, own, safeGuests));
    }
    return out;
  }, [sections, picks, safeGuests]);

  const count = picks.length;

  const add = () => {
    if (!document || count === 0) return;
    const vatRate = foodVatRateOf(document, prestationTypes);
    const incoming: OfferLine[] = [];
    const unlinked: { row: DocRow; qty: number }[] = [];
    for (const { section, row, qty } of picks) {
      const perGuest = rowUnitKind(section, row) === "convive";
      if (row.recipeId) {
        incoming.push({ recipeId: row.recipeId, portionsPerGuest: perGuest ? 1 : Math.max(0.01, round2(qty / safeGuests)) });
      } else {
        unlinked.push({ row, qty: perGuest ? safeGuests : qty });
      }
    }
    onAdd({ lines: mergeOfferLines([], incoming), revenueLines: revenueLinesFromRows(unlinked, vatRate), vatRate, document });
    onClose();
  };

  const empty = candidates.length === 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title="Ajouter depuis un document"
      footer={
        <>
          <Button variant="default" onClick={onClose}>Annuler</Button>
          {!empty && (
            <Button variant="primary" disabled={count === 0} onClick={add}>
              Ajouter {plural(count, "ligne")}
            </Button>
          )}
        </>
      }
    >
      {empty ? (
        <p className="text-sm text-muted-foreground touch:text-base">Aucun document.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <FieldLabel>Document</FieldLabel>
            <SelectPill
              value={documentId}
              options={candidates.map((d) => ({ value: d.documentId, label: `${d.title} ${d.year}` }))}
              onChange={pickDocument}
              colour="gray"
              aria-label="Document"
            />
          </div>
          {!hasPriced && <p className="text-sm text-muted-foreground touch:text-base">Aucune ligne avec un prix dans ce document.</p>}
          {sections.map((section) => (
            <SectionGroup
              key={section.sectionId}
              section={section}
              picked={picked}
              guests={safeGuests}
              highlighted={initial?.sectionId === section.sectionId && initial.documentId === documentId}
              onToggle={(row, on) => toggle(section, row, on)}
              onQty={setQty}
            />
          ))}
          {warnings.length > 0 && (
            <Callout tone="warning">
              {warnings.map((w) => <p key={w}>{w}</p>)}
            </Callout>
          )}
        </div>
      )}
    </Dialog>
  );
}

function SectionGroup({ section, picked, guests, highlighted, onToggle, onQty }: {
  section: DocSection;
  picked: Map<string, number>;
  guests: number;
  highlighted: boolean;
  onToggle: (row: DocRow, on: boolean) => void;
  onQty: (rowId: string, qty: number) => void;
}) {
  const rows = section.rows.filter((r) => r.kind === "plat");
  if (rows.length === 0) return null;
  const formula = section.price !== undefined;
  const sectionUnit = section.unitLabel?.trim() || "par personne";
  return (
    <div className={highlighted ? "rounded-lg bg-callout px-2 py-1" : undefined}>
      <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
        <span className="font-medium">{section.title}</span>
        {section.minimum && <span className="text-muted-foreground">· {minimumLabelOf(section.minimum)}</span>}
        {formula && <span className="text-muted-foreground">· {fmtEur(section.price ?? 0)} {sectionUnit}</span>}
      </div>
      <div className="-mx-1 flex flex-col">
        {rows.map((row) => {
          const can = selectable(row);
          const qty = picked.get(row.rowId);
          const on = qty !== undefined;
          const kind = rowUnitKind(section, row);
          const unit = rowUnitLabel(section, row);
          const price = priceLabelOf(row);
          return (
            <div key={row.rowId} className="flex flex-wrap items-center gap-x-2">
              <Checkbox
                checked={on}
                disabled={!can}
                onChange={(v) => onToggle(row, v)}
                className="flex h-auto min-h-9 min-w-0 flex-1 py-1 touch:h-auto touch:min-h-11 [&>span:last-child]:flex-1 [&>span:last-child]:whitespace-normal"
                label={
                  <span className={can ? undefined : "text-muted-foreground"}>
                    {row.text}
                    {price && <span className="text-muted-foreground"> · {price}{unit ? ` ${unit}` : ""}</span>}
                  </span>
                }
              />
              {on && (kind === "convive" ? (
                <span className="shrink-0 text-sm text-muted-foreground touch:text-base">× {plural(guests, "convive")}</span>
              ) : (
                <label className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground touch:text-base">
                  Quantité
                  <NumericInput value={qty} min={0} onChange={(v) => onQty(row.rowId, v)} className="input-field w-16 text-right tabular-nums" aria-label={`Quantité · ${row.text}`} />
                </label>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
