import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { TransactWriteCommandInput } from "@aws-sdk/lib-dynamodb";
import type {
  AppEvent,
  StockBalance,
  StockMovement,
  StockMovementRequest,
  StockOverview,
  StockReceiptRequest,
  UnitQty,
} from "@packages/types";
import { PRICE_TO_QTY_UNIT } from "@packages/types";
import { DdbService } from "../shared/ddb.service";
import { IngredientsService } from "../ingredients/ingredients.service";
import { RecipesService } from "../recipes/recipes.service";
import { LedgerService } from "../ledger/ledger.service";
import { SettingsService } from "../settings/settings.service";

type Change = {
  ingredientId: string;
  quantity: number;
  unit: UnitQty;
  kind: StockMovement["movementKind"];
  sourceId: string;
  occurredAt: string;
  note?: string;
  minimum?: number;
  entryId?: string;
  lineId?: string;
  eventId?: string;
  direction?: "in" | "out";
};
const balanceId = (id: string) => `balance#${id}`;
const movementId = (source: string, id: string) => `move#${source}#${id}`;
const precision = (quantity: number) => Math.round(quantity * 1000) / 1000;

@Injectable()
export class StockService {
  constructor(
    private ddb: DdbService,
    private ingredients: IngredientsService,
    private recipes: RecipesService,
    private ledger: LedgerService,
    private settings: SettingsService,
  ) {}
  private get table() {
    return this.ddb.requireTable("stock");
  }

  async overview(): Promise<StockOverview> {
    const [records, settings] = await Promise.all([
      this.ddb.scanAll(this.table),
      this.settings.get(),
    ]);
    return {
      balances: records.filter(
        (item) => item.kind === "balance",
      ) as unknown as StockBalance[],
      movements: (
        records.filter(
          (item) => item.kind === "movement",
        ) as unknown as StockMovement[]
      )
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
        .slice(0, 500),
      autoConsume: settings.stockAutoConsume ?? false,
      receivedLines: records
        .filter(
          (item) => item.kind === "movement" && item.entryId && item.lineId,
        )
        .map((item) => `${item.entryId}:${item.lineId}`),
    };
  }

  async move(request: StockMovementRequest): Promise<StockBalance[]> {
    return this.apply(
      request.lines.map((line) => ({
        ...line,
        sourceId: `manual:${request.requestId}`,
        kind: request.kind,
        occurredAt: request.occurredAt,
        note: request.note,
      })),
    );
  }

  async receive(request: StockReceiptRequest): Promise<StockBalance[]> {
    const entry = await this.ledger.getOrFail(request.entryId);
    if (entry.book !== "achats")
      throw new BadRequestException(
        "Seuls les achats peuvent entrer en stock.",
      );
    const known = new Set(entry.purchaseItems?.map((item) => item.lineId));
    if (request.lines.some((line) => !known.has(line.lineId)))
      throw new BadRequestException(
        "Ligne d'achat introuvable dans la facture.",
      );
    return this.apply(
      request.lines.map((line) => ({
        ...line,
        entryId: request.entryId,
        sourceId: `invoice:${request.entryId}:${line.lineId}`,
        kind: "receipt",
        occurredAt: request.occurredAt,
      })),
    );
  }

  async consume(event: AppEvent): Promise<StockBalance[]> {
    const [recipes, ingredients] = await Promise.all([
      this.recipes.getAll(),
      this.ingredients.getAll(),
    ]);
    const recipeById = new Map(
      recipes.map((recipe) => [recipe.recipeId, recipe]),
    );
    const ingredientById = new Map(
      ingredients.map((ingredient) => [ingredient.ingredientId, ingredient]),
    );
    const quantities = new Map<string, { quantity: number; unit: UnitQty }>();
    for (const line of event.recipes) {
      const recipe = recipeById.get(line.recipeId);
      if (!recipe || recipe.portions <= 0)
        throw new BadRequestException(
          "Une recette de l'événement est introuvable.",
        );
      for (const ingredient of recipe.ingredients) {
        const catalog = ingredientById.get(ingredient.ingredientId);
        if (!catalog || PRICE_TO_QTY_UNIT[catalog.unit] !== ingredient.unit)
          throw new BadRequestException(
            "Vérifiez les unités des ingrédients avant la sortie de stock.",
          );
        const current = quantities.get(ingredient.ingredientId) ?? {
          quantity: 0,
          unit: ingredient.unit,
        };
        current.quantity +=
          ((ingredient.qty * line.portions) / recipe.portions) *
          (1 + (ingredient.lossPct ?? 0) / 100);
        quantities.set(ingredient.ingredientId, current);
      }
    }
    const changes: Change[] = [...quantities]
      .filter(([, line]) => line.quantity > 0)
      .map(([ingredientId, line]) => ({
        ...line,
        ingredientId,
        eventId: event.eventId,
        sourceId: `event:${event.eventId}`,
        kind: "production",
        occurredAt: new Date().toISOString(),
        note: event.name,
      }));
    const previous = (await this.ddb.scanAll(this.table)).filter(
      (row) => row.kind === "movement" && row.eventId === event.eventId,
    );
    if (previous.some((row) => !quantities.has(String(row.ingredientId))))
      throw new ConflictException(
        "Les recettes ont changé depuis la sortie. Faites une correction de stock.",
      );
    await Promise.all(
      changes.map(async (change) => {
        const [movement, record] = await Promise.all([
          this.ddb.get(this.table, {
            stockId: movementId(change.sourceId, change.ingredientId),
          }),
          this.ddb.get(this.table, { stockId: balanceId(change.ingredientId) }),
        ]);
        if (movement) {
          if (
            Math.abs(Number(movement.quantity) - precision(change.quantity)) >
            0.001
          )
            throw new ConflictException(
              "Les recettes ont changé depuis la sortie. Faites une correction de stock.",
            );
          return;
        }
        const balance = record as unknown as StockBalance | null;
        const name =
          ingredientById.get(change.ingredientId)?.name ?? change.ingredientId;
        if (!balance?.verified)
          throw new ConflictException(
            `Inventaire initial requis pour ${name}.`,
          );
        if (balance.quantity + 0.001 < precision(change.quantity))
          throw new ConflictException(`Stock insuffisant : ${name}.`);
      }),
    );
    const out: StockBalance[] = [];
    for (let offset = 0; offset < changes.length; offset += 40)
      out.push(...(await this.apply(changes.slice(offset, offset + 40))));
    return out;
  }

  private async apply(changes: Change[]): Promise<StockBalance[]> {
    if (!changes.length) return [];
    if (
      changes.some((change) => change.kind !== "count" && change.quantity <= 0)
    )
      throw new BadRequestException(
        "La quantité du mouvement doit être positive.",
      );
    if (
      changes.some(
        (change) =>
          new Date(change.occurredAt).getTime() > Date.now() + 300_000,
      )
    )
      throw new BadRequestException(
        "La date du mouvement ne peut pas être dans le futur.",
      );
    if (
      new Set(changes.map((change) => change.ingredientId)).size !==
      changes.length
    )
      throw new BadRequestException(
        "Regroupez les quantités d'un même ingrédient avant validation.",
      );
    const ingredients = new Map(
      (await this.ingredients.getAll()).map((ingredient) => [
        ingredient.ingredientId,
        ingredient,
      ]),
    );
    for (let attempt = 0; attempt < 4; attempt++) {
      const writes: NonNullable<TransactWriteCommandInput["TransactItems"]> =
        [];
      const balances: StockBalance[] = [];
      for (const change of changes) {
        const ingredient = ingredients.get(change.ingredientId);
        if (!ingredient) throw new NotFoundException("Ingrédient introuvable.");
        if (change.unit !== PRICE_TO_QTY_UNIT[ingredient.unit])
          throw new BadRequestException(
            `Unité attendue pour ${ingredient.name} : ${PRICE_TO_QTY_UNIT[ingredient.unit]}`,
          );
        const movementKey = movementId(change.sourceId, change.ingredientId);
        const [oldMovement, oldBalance] = (await Promise.all([
          this.ddb.get(this.table, { stockId: movementKey }),
          this.ddb.get(this.table, { stockId: balanceId(change.ingredientId) }),
        ])) as unknown as [StockMovement | null, StockBalance | null];
        if (oldMovement) {
          if (
            oldMovement.movementKind !== change.kind ||
            Math.abs(oldMovement.quantity - precision(change.quantity)) >
              0.001 ||
            oldMovement.unit !== change.unit
          )
            throw new ConflictException(
              "Cette opération existe avec d'autres quantités. Faites une correction de stock.",
            );
          if (oldBalance) balances.push(oldBalance);
          continue;
        }
        if (
          (change.kind === "production" ||
            change.kind === "waste" ||
            change.direction === "out") &&
          !oldBalance?.verified
        )
          throw new ConflictException(
            `Inventaire initial requis pour ${ingredient.name}.`,
          );
        if (
          change.kind === "count" &&
          oldBalance?.lastCountAt &&
          change.occurredAt < oldBalance.lastCountAt
        )
          throw new ConflictException("Un inventaire plus récent existe déjà.");
        if (
          change.kind === "count" &&
          oldBalance?.asOf &&
          change.occurredAt < oldBalance.asOf
        )
          throw new ConflictException(
            "Un mouvement plus récent existe. Faites l'inventaire à la date actuelle.",
          );
        const includedInCount =
          change.kind !== "count" &&
          Boolean(
            oldBalance?.lastCountAt &&
              change.occurredAt <= oldBalance.lastCountAt,
          );
        const quantity = precision(change.quantity);
        const sign =
          change.kind === "production" ||
          change.kind === "waste" ||
          change.direction === "out"
            ? -1
            : 1;
        const delta = includedInCount
          ? 0
          : change.kind === "count"
            ? quantity - (oldBalance?.quantity ?? 0)
            : sign * quantity;
        const nextQuantity = precision((oldBalance?.quantity ?? 0) + delta);
        if (nextQuantity < -0.001)
          throw new ConflictException(
            `Stock insuffisant : ${ingredient.name}. Corrigez l'inventaire ou réceptionnez l'achat.`,
          );
        const now = new Date(
          Math.max(
            Date.now(),
            oldBalance ? new Date(oldBalance.updatedAt).getTime() + 1 : 0,
          ),
        ).toISOString();
        const next: StockBalance = {
          stockId: balanceId(change.ingredientId),
          kind: "balance",
          ingredientId: change.ingredientId,
          quantity: Math.max(0, nextQuantity),
          unit: change.unit,
          verified: change.kind === "count" || (oldBalance?.verified ?? false),
          ...(oldBalance?.lastCountAt
            ? { lastCountAt: oldBalance.lastCountAt }
            : {}),
          ...(change.kind === "count"
            ? { lastCountAt: change.occurredAt }
            : {}),
          ...(change.minimum !== undefined
            ? { minimum: change.minimum }
            : oldBalance?.minimum !== undefined
              ? { minimum: oldBalance.minimum }
              : {}),
          updatedAt: now,
          asOf:
            oldBalance?.asOf && oldBalance.asOf > change.occurredAt
              ? oldBalance.asOf
              : change.occurredAt,
        };
        const movement: StockMovement = {
          stockId: movementKey,
          kind: "movement",
          ingredientId: change.ingredientId,
          movementKind: change.kind,
          quantity,
          delta: precision(delta),
          unit: change.unit,
          occurredAt: change.occurredAt,
          createdAt: now,
          sourceId: change.sourceId,
          ...(change.note ? { note: change.note } : {}),
          ...(change.entryId ? { entryId: change.entryId } : {}),
          ...(change.lineId ? { lineId: change.lineId } : {}),
          ...(change.eventId ? { eventId: change.eventId } : {}),
          ...(includedInCount ? { includedInCount: true } : {}),
        };
        writes.push({
          Put: {
            TableName: this.table,
            Item: next,
            ConditionExpression: oldBalance
              ? "#updated = :old"
              : "attribute_not_exists(stockId)",
            ...(oldBalance
              ? {
                  ExpressionAttributeNames: { "#updated": "updatedAt" },
                  ExpressionAttributeValues: { ":old": oldBalance.updatedAt },
                }
              : {}),
          },
        });
        writes.push({
          Put: {
            TableName: this.table,
            Item: movement,
            ConditionExpression: "attribute_not_exists(stockId)",
          },
        });
        balances.push(next);
      }
      if (!writes.length) return balances;
      try {
        await this.ddb.transactWrite(writes);
        return balances;
      } catch (error) {
        if (
          (error as { name?: string }).name !==
            "TransactionCanceledException" ||
          attempt === 3
        )
          throw error;
      }
    }
    throw new ConflictException("Le stock a changé. Rechargez puis réessayez.");
  }
}
