import { StockService } from "./stock.service";
import type {
  AppEvent,
  Ingredient,
  Recipe,
  StockMovementRequest,
} from "@packages/types";

function setup() {
  const rows = new Map<string, any>();
  const ingredients = [
    { ingredientId: "onion", name: "Oignons", unit: "€/kg" },
    { ingredientId: "salt", name: "Sel", unit: "€/kg" },
  ] as Ingredient[];
  const recipes = [
    {
      recipeId: "soup",
      portions: 10,
      ingredients: [
        { ingredientId: "onion", qty: 1000, unit: "g", lossPct: 10 },
      ],
    },
  ] as Recipe[];
  const ddb = {
    requireTable: () => "stock",
    get: jest.fn(async (_table, key) =>
      structuredClone(rows.get(key.stockId) ?? null),
    ),
    scanAll: jest.fn(async () => [...rows.values()]),
    transactWrite: jest.fn(async (writes) => {
      for (const { Put: p } of writes) {
        const row = rows.get(p.Item.stockId);
        if (
          p.ExpressionAttributeValues
            ? row?.updatedAt !== p.ExpressionAttributeValues[":old"]
            : row
        )
          throw Object.assign(new Error("Conflict"), {
            name: "TransactionCanceledException",
          });
      }
      for (const { Put: p } of writes)
        rows.set(p.Item.stockId, structuredClone(p.Item));
    }),
  };
  const ledger = {
    getOrFail: jest.fn(async () => ({
      book: "achats",
      purchaseItems: [{ lineId: "1", label: "Oignon" }],
    })),
  };
  const service = new StockService(
    ddb as any,
    { getAll: async () => ingredients } as any,
    { getAll: async () => recipes } as any,
    ledger as any,
    { get: async () => ({}) } as any,
  );
  const move = (patch: Partial<StockMovementRequest> = {}) =>
    service.move({
      requestId: "one",
      kind: "count",
      occurredAt: "2026-01-02T12:00:00Z",
      lines: [{ ingredientId: "onion", quantity: 5000, unit: "g" }],
      ...patch,
    });
  const event = {
    eventId: "event",
    name: "Buffet",
    recipes: [{ lineId: "line", recipeId: "soup", portions: 20 }],
  } as AppEvent;
  return { service, rows, ddb, ledger, move, event, recipes };
}

describe("Physical stock", () => {
  it("requires a count before consumption and uses portions and losses exactly once", async () => {
    const { service, move, event, rows } = setup();
    await expect(service.consume(event)).rejects.toThrow("Inventaire initial");
    await move();
    await service.consume(event);
    await service.consume(event);
    expect(rows.get("balance#onion").quantity).toBe(2800);
    expect(
      [...rows.values()].filter((row) => row.movementKind === "production"),
    ).toHaveLength(1);
    await expect(
      service.consume({
        ...event,
        recipes: [{ ...event.recipes[0], portions: 10 }],
      }),
    ).rejects.toThrow("recettes ont changé");
  });
  it("imports historical receipts as audit movements without adding stock already counted", async () => {
    const { service, move, rows } = setup();
    await move();
    await service.receive({
      entryId: "invoice",
      occurredAt: "2026-01-01T12:00:00Z",
      lines: [
        { lineId: "1", ingredientId: "onion", quantity: 10000, unit: "g" },
      ],
    });
    expect(rows.get("balance#onion").quantity).toBe(5000);
    expect(rows.get("move#invoice:invoice:1#onion")).toMatchObject({
      delta: 0,
      includedInCount: true,
    });
    await service.receive({
      entryId: "invoice",
      occurredAt: "2026-01-01T12:00:00Z",
      lines: [
        { lineId: "1", ingredientId: "onion", quantity: 10000, unit: "g" },
      ],
    });
    expect(rows.get("balance#onion").quantity).toBe(5000);
  });
  it("leaves receipts unverified before the first physical count", async () => {
    const { service, move, rows } = setup();
    await move({ kind: "receipt" });
    expect(rows.get("balance#onion")).toMatchObject({
      verified: false,
      quantity: 5000,
    });
    await expect(
      move({
        requestId: "loss",
        kind: "waste",
        lines: [{ ingredientId: "onion", quantity: 1, unit: "g" }],
      }),
    ).rejects.toThrow("Inventaire initial");
    expect((await service.overview()).autoConsume).toBe(false);
  });
  it("rejects negative balances, incompatible units, invalid lines and future movements", async () => {
    const { move, service, rows } = setup();
    await move();
    await expect(
      move({
        requestId: "loss",
        kind: "waste",
        lines: [{ ingredientId: "onion", quantity: 6000, unit: "g" }],
        occurredAt: "2026-01-03T12:00:00Z",
      }),
    ).rejects.toThrow("Stock insuffisant");
    await expect(
      move({
        requestId: "unit",
        lines: [{ ingredientId: "onion", quantity: 5, unit: "ml" }],
      }),
    ).rejects.toThrow("Unité attendue");
    await expect(
      service.receive({
        entryId: "invoice",
        occurredAt: "2026-01-03T12:00:00Z",
        lines: [
          { lineId: "unknown", ingredientId: "onion", quantity: 1, unit: "g" },
        ],
      }),
    ).rejects.toThrow("introuvable");
    await expect(
      move({ requestId: "future", occurredAt: "2099-01-01T12:00:00Z" }),
    ).rejects.toThrow("futur");
    expect(rows.get("balance#onion").quantity).toBe(5000);
  });
  it("retries a transaction conflict and rejects reusing an operation with different quantities", async () => {
    const { move, ddb, rows } = setup();
    ddb.transactWrite.mockRejectedValueOnce(
      Object.assign(new Error("raced"), {
        name: "TransactionCanceledException",
      }),
    );
    await move();
    expect(ddb.transactWrite).toHaveBeenCalledTimes(2);
    await move();
    expect(rows.size).toBe(2);
    await expect(
      move({ lines: [{ ingredientId: "onion", quantity: 4000, unit: "g" }] }),
    ).rejects.toThrow("autres quantités");
  });
  it("preflights every ingredient before deducting any and rejects a backdated count", async () => {
    const { move, service, recipes, event, rows } = setup();
    await move();
    recipes[0].ingredients.push({
      ingredientId: "salt",
      qty: 10,
      unit: "g",
      lossPct: 0,
    });
    await expect(service.consume(event)).rejects.toThrow("Inventaire initial");
    expect(rows.get("balance#onion").quantity).toBe(5000);
    await move({
      kind: "receipt",
      requestId: "new",
      occurredAt: "2026-01-05T12:00:00Z",
    });
    await expect(
      move({ requestId: "oldcount", occurredAt: "2026-01-04T12:00:00Z" }),
    ).rejects.toThrow("mouvement plus récent");
  });
});
