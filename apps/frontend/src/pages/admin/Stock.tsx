import { useEffect, useMemo, useState } from "react";
import type {
  AppEvent,
  Ingredient,
  LedgerEntry,
  StockMovementKind,
  StockOverview,
} from "@packages/types";
import { PRICE_TO_QTY_UNIT, fmtQtyText } from "@packages/types";
import { api, errorReason } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  Button,
  Callout,
  Checkbox,
  Dialog,
  PageHeader,
  Tag,
} from "@/components/ui";

const labels: Record<StockMovementKind, string> = {
  count: "Inventaire",
  receipt: "Achat reçu",
  waste: "Perte",
  adjustment: "Correction",
  production: "Recette préparée",
};
const blank: StockOverview = {
  balances: [],
  movements: [],
  autoConsume: false,
  receivedLines: [],
};
type Form = {
  ingredientId: string;
  kind: "count" | "receipt" | "waste";
  quantity: string;
  minimum: string;
  unit: string;
  occurredAt: string;
  entryId?: string;
  lineId?: string;
  note: string;
  requestId: string;
};

export default function Stock() {
  const { toast } = useToast();
  const [stock, setStock] = useState(blank);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [eventId, setEventId] = useState("");
  const [query, setQuery] = useState("");
  const load = async () => {
    try {
      const [overview, catalog, ledger, eventList] = await Promise.all([
        api.stock.list(),
        api.ingredients.list(),
        api.ledger.list(),
        api.events.list(),
      ]);
      setStock(overview);
      setIngredients(catalog);
      setEntries(ledger);
      setEvents(eventList);
      setError("");
    } catch (cause) {
      setError(errorReason(cause) || "Impossible de charger le stock.");
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const balances = new Map(
    stock.balances.map((balance) => [balance.ingredientId, balance]),
  );
  const received = new Set(stock.receivedLines);
  const receipts = entries
    .filter((entry) => entry.book === "achats")
    .flatMap((entry) =>
      (entry.purchaseItems ?? [])
        .filter((line) => !received.has(`${entry.entryId}:${line.lineId}`))
        .map((line) => ({ entry, line })),
    );
  const shown = useMemo(
    () =>
      ingredients
        .filter((ingredient) =>
          ingredient.name
            .toLocaleLowerCase("fr")
            .includes(query.toLocaleLowerCase("fr")),
        )
        .sort((a, b) => a.name.localeCompare(b.name, "fr")),
    [ingredients, query],
  );
  const selected = ingredients.find(
    (ingredient) => ingredient.ingredientId === form?.ingredientId,
  );
  const baseUnit = selected ? PRICE_TO_QTY_UNIT[selected.unit] : "g";
  const factor = form?.unit === "kg" || form?.unit === "l" ? 1000 : 1;
  const localTime = (value = new Date()) =>
    new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16);
  const open = (ingredientId: string, kind: Form["kind"]) => {
    const ingredient = ingredients.find(
      (candidate) => candidate.ingredientId === ingredientId,
    );
    const unit =
      ingredient?.unit === "€/kg"
        ? "kg"
        : ingredient?.unit === "€/l"
          ? "l"
          : ingredient
            ? PRICE_TO_QTY_UNIT[ingredient.unit]
            : "g";
    const scale = unit === "kg" || unit === "l" ? 1000 : 1;
    const balance = balances.get(ingredientId);
    setForm({
      ingredientId,
      kind,
      quantity:
        kind === "count" && balance?.verified
          ? String(balance.quantity / scale)
          : "",
      minimum:
        balance?.minimum !== undefined ? String(balance.minimum / scale) : "",
      unit,
      occurredAt: localTime(),
      note: "",
      requestId: crypto.randomUUID(),
    });
  };
  const save = async () => {
    if (!form || !selected) return;
    const quantity = Number(form.quantity.replace(",", "."));
    if (!form.quantity.trim() || !Number.isFinite(quantity) || quantity < 0) {
      toast({
        title: "Indiquez une quantité positive ou zéro.",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      const line = {
        ingredientId: selected.ingredientId,
        quantity: quantity * factor,
        unit: PRICE_TO_QTY_UNIT[selected.unit],
      };
      const occurredAt = new Date(form.occurredAt).toISOString();
      if (form.entryId && form.lineId)
        await api.stock.receive({
          entryId: form.entryId,
          occurredAt,
          lines: [{ ...line, lineId: form.lineId }],
        });
      else
        await api.stock.move({
          requestId: form.requestId,
          kind: form.kind,
          occurredAt,
          note: form.note || undefined,
          lines: [
            {
              ...line,
              ...(form.minimum.trim()
                ? { minimum: Number(form.minimum.replace(",", ".")) * factor }
                : {}),
            },
          ],
        });
      setForm(null);
      await load();
      toast({ title: "Stock enregistré" });
    } catch (cause) {
      toast({
        title: "Stock non modifié",
        description: errorReason(cause),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mx-auto max-w-wide space-y-5">
      <PageHeader iconKey="stock" title="Stock" />
      {error && <Callout emoji="📦">{error}</Callout>}
      <p className="text-sm text-muted-foreground">
        L'inventaire confirme ce qui est physiquement présent. Les achats
        anciens sont conservés dans l'historique et ne sont pas ajoutés une
        seconde fois après un inventaire plus récent.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <input
          className="input-field max-w-sm"
          placeholder="Chercher un ingrédient"
          aria-label="Chercher dans le stock"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Checkbox
          className="max-w-full"
          label="Déduire le stock des événements terminés"
          checked={stock.autoConsume}
          onChange={async (value) => {
            try {
              await api.settings.update({ stockAutoConsume: value });
              setStock((previous) => ({ ...previous, autoConsume: value }));
            } catch (cause) {
              toast({
                title: "Réglage non enregistré",
                description: errorReason(cause),
                variant: "destructive",
              });
            }
          }}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Ingrédient</th>
              <th>Quantité</th>
              <th>État</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((ingredient) => {
              const balance = balances.get(ingredient.ingredientId);
              return (
                <tr key={ingredient.ingredientId}>
                  <td>{ingredient.name}</td>
                  <td className="tabular-nums">
                    {balance
                      ? fmtQtyText(balance.quantity, balance.unit)
                      : "Non compté"}
                  </td>
                  <td>
                    {!balance?.verified ? (
                      <Tag colour="yellow">À inventorier</Tag>
                    ) : balance.minimum !== undefined &&
                      balance.quantity < balance.minimum ? (
                      <Tag colour="red">Sous le minimum</Tag>
                    ) : (
                      <Tag colour="green">Inventorié</Tag>
                    )}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      <Button
                        size="sm"
                        variant="link"
                        onClick={() => open(ingredient.ingredientId, "count")}
                      >
                        Inventaire
                      </Button>
                      <Button
                        size="sm"
                        variant="link"
                        onClick={() => open(ingredient.ingredientId, "receipt")}
                      >
                        Entrée
                      </Button>
                      <Button
                        size="sm"
                        variant="link"
                        onClick={() => open(ingredient.ingredientId, "waste")}
                      >
                        Perte
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Achats à réceptionner</h2>
        <p className="text-sm text-muted-foreground">
          Vérifiez le produit, la quantité et l'unité avant l'entrée en stock.
          Les factures de vente ne créent aucune entrée.
        </p>
        {receipts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucune ligne d'achat en attente. Les lignes lues sur les factures
            d'achat apparaîtront ici.
          </p>
        ) : (
          receipts.map(({ entry, line }) => (
            <div
              key={`${entry.entryId}:${line.lineId}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-border p-3"
            >
              <span>
                {entry.number ?? entry.label} · {line.label} ·{" "}
                {line.quantity ?? "?"} {line.unit ?? ""}
              </span>
              <Button
                size="sm"
                variant="default"
                onClick={() =>
                  setForm({
                    ingredientId: "",
                    kind: "receipt",
                    quantity: "",
                    minimum: "",
                    unit: "g",
                    occurredAt: localTime(new Date(`${entry.date}T12:00:00`)),
                    note: entry.label,
                    entryId: entry.entryId,
                    lineId: line.lineId,
                    requestId: crypto.randomUUID(),
                  })
                }
              >
                Réceptionner
              </Button>
            </div>
          ))
        )}
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Sortie pour un événement</h2>
        <p className="text-sm text-muted-foreground">
          Les quantités des recettes et leurs pertes sont cumulées. Une même
          sortie ne peut pas être déduite deux fois.
        </p>
        <div className="flex flex-wrap gap-2">
          <select
            className="input-field max-w-md"
            aria-label="Événement à déduire"
            value={eventId}
            onChange={(event) => setEventId(event.target.value)}
          >
            <option value="">Choisir l'événement</option>
            {events.map((event) => (
              <option key={event.eventId} value={event.eventId}>
                {event.date.slice(0, 10)} · {event.name}
              </option>
            ))}
          </select>
          <Button
            variant="default"
            disabled={!eventId || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api.stock.consume(eventId);
                await load();
                toast({ title: "Sortie enregistrée" });
              } catch (cause) {
                toast({
                  title: "Sortie à vérifier",
                  description: errorReason(cause),
                  variant: "destructive",
                });
              } finally {
                setBusy(false);
              }
            }}
          >
            Déduire les ingrédients
          </Button>
        </div>
      </section>
      <section>
        <h2 className="mb-2 text-lg font-semibold">Derniers mouvements</h2>
        <div className="space-y-1">
          {stock.movements.slice(0, 60).map((movement) => (
            <div
              key={movement.stockId}
              className="flex flex-wrap gap-x-3 rounded px-2 py-1 text-sm"
            >
              <span>
                {new Date(movement.occurredAt).toLocaleString("fr-BE")}
              </span>
              <span>{labels[movement.movementKind]}</span>
              <span>
                {ingredients.find(
                  (ingredient) =>
                    ingredient.ingredientId === movement.ingredientId,
                )?.name ?? movement.ingredientId}
              </span>
              <span className="tabular-nums">
                {movement.delta >= 0 ? "+" : ""}
                {fmtQtyText(movement.delta, movement.unit)}
              </span>
              {movement.includedInCount && (
                <span className="text-muted-foreground">
                  Déjà couvert par l'inventaire
                </span>
              )}
              {movement.note && (
                <span className="text-muted-foreground">{movement.note}</span>
              )}
            </div>
          ))}
        </div>
      </section>
      {form && (
        <Dialog
          open
          onClose={() => !busy && setForm(null)}
          title={
            form.entryId ? "Réception d'une facture d'achat" : labels[form.kind]
          }
          footer={
            <>
              <Button
                variant="default"
                disabled={busy}
                onClick={() => setForm(null)}
              >
                Annuler
              </Button>
              <Button
                variant="primary"
                disabled={busy || !selected}
                onClick={() => void save()}
              >
                Enregistrer
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <label className="block text-sm">
              Ingrédient
              <select
                className="input-field mt-1"
                value={form.ingredientId}
                onChange={(event) => {
                  const ingredient = ingredients.find(
                    (item) => item.ingredientId === event.target.value,
                  );
                  const unit =
                    ingredient?.unit === "€/kg"
                      ? "kg"
                      : ingredient?.unit === "€/l"
                        ? "l"
                        : ingredient
                          ? PRICE_TO_QTY_UNIT[ingredient.unit]
                          : "g";
                  setForm({ ...form, ingredientId: event.target.value, unit });
                }}
              >
                <option value="">Choisir le produit du catalogue</option>
                {ingredients.map((ingredient) => (
                  <option
                    key={ingredient.ingredientId}
                    value={ingredient.ingredientId}
                  >
                    {ingredient.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-sm">
                {form.kind === "count"
                  ? "Quantité comptée"
                  : form.kind === "waste"
                    ? "Quantité perdue"
                    : "Quantité reçue"}
                <input
                  aria-label="Quantité de stock"
                  className="input-field mt-1"
                  inputMode="decimal"
                  value={form.quantity}
                  onChange={(event) =>
                    setForm({ ...form, quantity: event.target.value })
                  }
                />
              </label>
              <label className="block text-sm">
                Unité
                <select
                  className="input-field mt-1"
                  value={form.unit}
                  onChange={(event) =>
                    setForm({ ...form, unit: event.target.value })
                  }
                >
                  {(baseUnit === "g"
                    ? ["g", "kg"]
                    : baseUnit === "ml"
                      ? ["ml", "l"]
                      : [baseUnit]
                  ).map((unit) => (
                    <option key={unit}>{unit}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-sm">
              Date et heure
              <input
                type="datetime-local"
                className="input-field mt-1"
                value={form.occurredAt}
                onChange={(event) =>
                  setForm({ ...form, occurredAt: event.target.value })
                }
              />
            </label>
            {form.kind === "count" && (
              <label className="block text-sm">
                Minimum souhaité ({form.unit}, facultatif)
                <input
                  className="input-field mt-1"
                  inputMode="decimal"
                  value={form.minimum}
                  onChange={(event) =>
                    setForm({ ...form, minimum: event.target.value })
                  }
                />
              </label>
            )}
            <label className="block text-sm">
              Note
              <input
                className="input-field mt-1"
                value={form.note}
                onChange={(event) =>
                  setForm({ ...form, note: event.target.value })
                }
              />
            </label>
          </div>
        </Dialog>
      )}
    </div>
  );
}
