import { useEffect, useMemo, useState } from "react";
import type { Offer, OfferLine, Recipe } from "@packages/types";
import { courseOf } from "@packages/types";
import { plural } from "@/lib/use-planning-data";
import { Button, Checkbox, Dialog, FieldLabel, SelectPill } from "@/components/ui";

export interface AddFromOfferDialogProps {
  open: boolean;
  onClose: () => void;
  offers: Offer[];
  // The offer being edited, left out of the list.
  excludeOfferId?: string;
  recipeById: Map<string, Pick<Recipe, "name" | "category" | "defaultCourse" | "type">>;
  onAdd: (lines: OfferLine[]) => void;
}

const portionsFormat = new Intl.NumberFormat("fr-BE", { maximumFractionDigits: 2 });

// « 1 portion / convive », « 0,5 portion / convive », « 3 portions / convive ».
export function portionsPerGuestLabel(n: number): string {
  return `${portionsFormat.format(n)} ${n >= 2 ? "portions" : "portion"} / convive`;
}

export default function AddFromOfferDialog({ open, onClose, offers, excludeOfferId, recipeById, onAdd }: AddFromOfferDialogProps) {
  const candidates = useMemo(
    () => offers.filter((o) => !o.archived && o.offerId !== excludeOfferId),
    [offers, excludeOfferId],
  );
  const [offerId, setOfferId] = useState<string>("");
  const [picked, setPicked] = useState<Set<number>>(() => new Set());

  // The first other offer is preselected each time the dialog opens; a vanished offer falls back to it too.
  useEffect(() => {
    if (!open) return;
    setPicked(new Set());
    setOfferId((current) => (candidates.some((o) => o.offerId === current) ? current : candidates[0]?.offerId ?? ""));
  }, [open, candidates]);

  const offer = candidates.find((o) => o.offerId === offerId);
  const lines = offer?.lines ?? [];
  const selectable = lines.map((l, i) => (recipeById.has(l.recipeId) ? i : -1)).filter((i) => i >= 0);
  const count = picked.size;
  const allPicked = selectable.length > 0 && selectable.every((i) => picked.has(i));

  const pickOffer = (id: string) => {
    setOfferId(id);
    setPicked(new Set());
  };

  const toggle = (index: number, on: boolean) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(index);
      else next.delete(index);
      return next;
    });
  };

  const add = () => {
    if (count === 0) return;
    onAdd(lines.filter((_, i) => picked.has(i)).map((l) => ({ ...l })));
    onClose();
  };

  const empty = candidates.length === 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title="Ajouter depuis une offre"
      footer={
        <>
          <Button variant="default" onClick={onClose}>Annuler</Button>
          {!empty && (
            <Button variant="primary" disabled={count === 0} onClick={add}>
              Ajouter {plural(count, "recette")}
            </Button>
          )}
        </>
      }
    >
      {empty ? (
        <p className="text-sm text-muted-foreground touch:text-base">Aucune autre offre.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <FieldLabel>Offre</FieldLabel>
            <SelectPill
              value={offerId}
              options={candidates.map((o) => ({ value: o.offerId, label: o.name }))}
              onChange={pickOffer}
              colour="gray"
              aria-label="Offre"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">Recettes</span>
            <button
              type="button"
              onClick={() => setPicked(new Set(selectable))}
              disabled={allPicked}
              className="rounded px-1 text-sm text-primary hover:underline disabled:pointer-events-none disabled:opacity-50 touch:min-h-11 touch:text-base"
            >
              Tout cocher
            </button>
          </div>
          <div className="-mx-1 flex flex-col">
            {lines.map((line, i) => {
              const recipe = recipeById.get(line.recipeId);
              return (
                <Checkbox
                  key={`${line.recipeId}-${i}`}
                  checked={picked.has(i)}
                  disabled={!recipe}
                  onChange={(on) => toggle(i, on)}
                  className="flex h-auto min-h-9 w-full py-1 touch:h-auto touch:min-h-11 [&>span:last-child]:flex-1 [&>span:last-child]:whitespace-normal"
                  label={
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="min-w-0 flex-1">
                        {recipe ? recipe.name : <span className="text-danger">Recette supprimée</span>}
                        <span className="text-muted-foreground"> · {portionsPerGuestLabel(line.portionsPerGuest)}</span>
                      </span>
                      {recipe && <span className="shrink-0 text-caption text-muted-foreground">{courseOf(line, recipe)}</span>}
                    </span>
                  }
                />
              );
            })}
          </div>
        </div>
      )}
    </Dialog>
  );
}
