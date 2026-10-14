import { ConflictException, NotFoundException } from "@nestjs/common";
import type { AppEvent } from "@packages/types";
import { DdbService, UpdateOptions } from "../shared/ddb.service";
import { EventsService } from "./events.service";

type Item = Record<string, unknown>;
type UpdateCall = { table: string; key: Record<string, string>; fields: Item; options: UpdateOptions };

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const conditionFailure = () => Object.assign(new Error("cond"), { name: "ConditionalCheckFailedException" });

class FakeDdb {
  tables = { events: "events", ingredients: "", recipes: "", settings: "", groceryLists: "" };
  store = new Map<string, Map<string, Item>>();
  updates: UpdateCall[] = [];
  failUpdatesWith: Error[] = [];
  beforeUpdate?: (call: UpdateCall) => void;

  rows(table: string) {
    if (!this.store.has(table)) this.store.set(table, new Map());
    return this.store.get(table) as Map<string, Item>;
  }

  requireTable(name: "clients" | "ledger") { return name; }

  async get(table: string, key: Record<string, string>) {
    const item = this.rows(table).get(Object.values(key)[0]);
    return item ? clone(item) : null;
  }

  async put(table: string, item: Item) {
    const [keyAttr] = Object.keys(item);
    this.rows(table).set(String(item[keyAttr]), clone(item));
  }

  async update(table: string, key: Record<string, string>, fields: Item, options: UpdateOptions = {}) {
    const call = { table, key, fields: clone(fields), options };
    this.updates.push(call);
    this.beforeUpdate?.(call);
    const queued = this.failUpdatesWith.shift();
    if (queued) throw queued;
    const id = Object.values(key)[0];
    const item = this.rows(table).get(id);
    if (!item) throw conditionFailure();
    if (options.condition === "#ua = :expected" && item.updatedAt !== options.values?.[":expected"]) throw conditionFailure();
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined) continue;
      if (v === null) delete item[k];
      else item[k] = clone(v);
    }
  }

  async scanAll(table: string) {
    return [...this.rows(table).values()].map(clone);
  }

  async delete(table: string, key: Record<string, string>) {
    this.rows(table).delete(Object.values(key)[0]);
  }

  async batchWrite(table: string, items: Item[]) {
    for (const item of items) await this.put(table, item);
  }

  async batchDelete(table: string, keys: Record<string, string>[]) {
    for (const key of keys) await this.delete(table, key);
  }
}

const baseEvent = (overrides: Omit<Partial<AppEvent>, "recipes"> & { recipes?: unknown[] } = {}): Item => ({
  eventId: "e1",
  name: "Mariage",
  nameLower: "mariage",
  date: "2026-06-01",
  guestCount: 40,
  recipes: [],
  extraCosts: [],
  sellingPricePerGuest: 50,
  status: "upcoming",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const createBody = {
  name: "Mariage",
  date: "2026-06-01",
  guestCount: 40,
  recipes: [
    { recipeId: "r1", portions: 10 },
    { lineId: "keep-me", recipeId: "r2", portions: 5 },
  ],
  extraCosts: [],
  tasks: [],
  sellingPricePerGuest: 50,
  status: "upcoming" as const,
};

describe("EventsService", () => {
  let ddb: FakeDdb;
  let service: EventsService;

  beforeEach(() => {
    ddb = new FakeDdb();
    service = new EventsService(ddb as unknown as DdbService);
  });

  describe("lazy line ids", () => {
    it("fills and persists missing ids once, with the backfill condition and no updatedAt", async () => {
      await ddb.put("events", baseEvent({ recipes: [{ recipeId: "r1", portions: 2 }, { recipeId: "r2", portions: 3 }] }));

      const first = await service.get("e1");
      expect(first?.recipes.every((l) => typeof l.lineId === "string" && l.lineId.length > 0)).toBe(true);
      expect(ddb.updates).toHaveLength(1);
      expect(ddb.updates[0].fields).toEqual({ recipes: first?.recipes });
      expect(ddb.updates[0].fields.updatedAt).toBeUndefined();
      expect(ddb.updates[0].options).toEqual({
        condition: "attribute_not_exists(#r[0].#lid)",
        names: { "#r": "recipes", "#lid": "lineId" },
      });

      const second = await service.get("e1");
      expect(second).toEqual(first);
      expect(ddb.updates).toHaveLength(1);
    });

    it("re-reads the item when the backfill condition fails", async () => {
      await ddb.put("events", baseEvent({ recipes: [{ recipeId: "r1", portions: 2 }] }));
      ddb.failUpdatesWith.push(conditionFailure());
      const stored = baseEvent({ recipes: [{ lineId: "winner", recipeId: "r1", portions: 2 }] });
      ddb.rows("events").set("e1", stored);

      const event = await service.get("e1");
      expect(event?.recipes[0].lineId).toBe("winner");
    });

    it("rethrows other update errors", async () => {
      await ddb.put("events", baseEvent({ recipes: [{ recipeId: "r1", portions: 2 }] }));
      ddb.failUpdatesWith.push(new Error("boom"));
      await expect(service.get("e1")).rejects.toThrow("boom");
    });

    it("leaves events with no lines or complete ids untouched", async () => {
      await ddb.put("events", baseEvent({ eventId: "e1", recipes: [] }));
      await ddb.put("events", baseEvent({ eventId: "e2", recipes: [{ lineId: "a", recipeId: "r1", portions: 1 }] }));
      await ddb.put("events", baseEvent({ eventId: "e3", recipes: [{ recipeId: "r1", portions: 1 }] }));

      const all = await service.getAll();
      expect(all).toHaveLength(3);
      expect(all.every((e) => e.recipes.every((l) => l.lineId))).toBe(true);
      expect(ddb.updates).toHaveLength(1);
      expect(ddb.updates[0].key).toEqual({ eventId: "e3" });
    });
  });

  describe("create", () => {
    it("fills missing line ids and keeps provided ones", async () => {
      const event = await service.create(createBody);
      expect(event.recipes[0].lineId).toEqual(expect.any(String));
      expect(event.recipes[0].lineId).not.toBe("");
      expect(event.recipes[1].lineId).toBe("keep-me");
      expect(event.nameLower).toBe("mariage");
      expect(await ddb.get("events", { eventId: event.eventId })).toEqual(event);
    });

    it("stamps takenAt on a cost snapshot", async () => {
      const event = await service.create({
        ...createBody,
        costSnapshot: { rawMaterial: 12.5, extrasTotal: 0, lines: [{ lineId: "keep-me", recipeId: "r2", portions: 5, unitCost: 2.5 }] },
      });
      expect(event.costSnapshot?.takenAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(event.costSnapshot?.rawMaterial).toBe(12.5);
    });
  });

  describe("update", () => {
    beforeEach(async () => {
      await ddb.put(
        "events",
        baseEvent({
          recipes: [
            { lineId: "a", recipeId: "r1", portions: 2, prepStatus: "done", notes: "cut small", course: "Entrée" },
            { lineId: "b", recipeId: "r2", portions: 3 },
          ],
        }),
      );
    });

    it("keeps stored prepStatus, notes and course when the editor omits them", async () => {
      const event = await service.update("e1", {
        recipes: [
          { lineId: "a", recipeId: "r1", portions: 8 },
          { lineId: "b", recipeId: "r2", portions: 3 },
        ],
      });
      expect(event.recipes[0]).toEqual({
        lineId: "a", recipeId: "r1", portions: 8, prepStatus: "done", notes: "cut small", course: "Entrée",
      });
    });

    it("overwrites prepStatus when the editor sends it", async () => {
      const event = await service.update("e1", {
        recipes: [
          { lineId: "a", recipeId: "r1", portions: 2, prepStatus: "todo" },
          { lineId: "b", recipeId: "r2", portions: 3 },
        ],
      });
      expect(event.recipes[0].prepStatus).toBe("todo");
    });

    it("appends unknown lines with a fresh id and drops stored lines the editor removed", async () => {
      const event = await service.update("e1", {
        recipes: [
          { lineId: "b", recipeId: "r2", portions: 3 },
          { recipeId: "r3", portions: 1 },
        ],
      });
      expect(event.recipes).toHaveLength(2);
      expect(event.recipes[0].lineId).toBe("b");
      expect(event.recipes[1].lineId).toEqual(expect.any(String));
      expect(event.recipes[1].recipeId).toBe("r3");
      expect(event.recipes.some((l) => l.lineId === "a")).toBe(false);
    });

    it("stamps takenAt on the cost snapshot and bumps updatedAt and nameLower", async () => {
      const event = await service.update("e1", {
        name: "Baptême",
        costSnapshot: { rawMaterial: 5, extrasTotal: 1, lines: [] },
      });
      expect(event.costSnapshot?.takenAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(event.nameLower).toBe("baptême");
      expect(event.updatedAt).not.toBe("2026-01-01T00:00:00.000Z");
    });

    it("404s on an unknown event", async () => {
      await expect(service.update("nope", { name: "x" })).rejects.toBeInstanceOf(NotFoundException);
    });

    it("guards the write on the updatedAt it read and bumps it", async () => {
      const event = await service.update("e1", { name: "Baptême" });
      expect(ddb.updates).toHaveLength(1);
      expect(ddb.updates[0].options.condition).toBe("#ua = :expected");
      expect(ddb.updates[0].options.values?.[":expected"]).toBe("2026-01-01T00:00:00.000Z");
      expect(ddb.updates[0].fields.updatedAt).toBe(event.updatedAt);
      expect(event.updatedAt > "2026-01-01T00:00:00.000Z").toBe(true);
    });

    it("re-reads and retries when a line tick landed between its read and its write", async () => {
      // The phone marks line a done while the editor's date change is in flight.
      ddb.beforeUpdate = () => {
        const row = ddb.rows("events").get("e1") as Item;
        row.recipes = (row.recipes as Item[]).map((l) => (l.lineId === "b" ? { ...l, prepStatus: "done" } : l));
        row.updatedAt = "2026-01-02T00:00:00.000Z";
        ddb.beforeUpdate = undefined;
      };
      const reads = jest.spyOn(service, "getOrFail");
      const event = await service.update("e1", { date: "2026-06-02" });
      expect(ddb.updates).toHaveLength(2);
      expect(ddb.updates[1].options.values).toEqual({ ":expected": "2026-01-02T00:00:00.000Z" });
      // Two fresh reads before the writes, one re-read after the write that went through.
      expect(reads).toHaveBeenCalledTimes(3);
      expect(event.date).toBe("2026-06-02");
      expect(event.recipes[1].prepStatus).toBe("done");
    });

    it("succeeds after three condition failures within the five-attempt budget", async () => {
      ddb.failUpdatesWith.push(conditionFailure(), conditionFailure(), conditionFailure());
      const event = await service.update("e1", { name: "Baptême" });
      expect(ddb.updates).toHaveLength(4);
      expect(event.nameLower).toBe("baptême");
    });
  });

  describe("line operations", () => {
    beforeEach(async () => {
      await ddb.put(
        "events",
        baseEvent({
          recipes: [
            { lineId: "a", recipeId: "r1", portions: 2, prepStatus: "done", course: "Entrée" },
            { lineId: "b", recipeId: "r2", portions: 3, notes: "spicy" },
            { lineId: "c", recipeId: "r3", portions: 4 },
          ],
        }),
      );
    });

    it("addLine appends with a fresh id", async () => {
      const event = await service.addLine("e1", { recipeId: "r9", portions: 7, course: "Dessert" });
      expect(event.recipes).toHaveLength(4);
      const added = event.recipes[3];
      expect(added.lineId).toEqual(expect.any(String));
      expect(added).toMatchObject({ recipeId: "r9", portions: 7, course: "Dessert" });
      expect(event.updatedAt).not.toBe("2026-01-01T00:00:00.000Z");
    });

    it("patchLine merges the patch and keeps the rest", async () => {
      const event = await service.patchLine("e1", "b", { prepStatus: "doing", portions: 10 });
      expect(event.recipes[1]).toEqual({ lineId: "b", recipeId: "r2", portions: 10, notes: "spicy", prepStatus: "doing" });
    });

    it("writeLines guards on the updatedAt it read and bumps it", async () => {
      const event = await service.patchLine("e1", "a", { notes: "x" });
      expect(ddb.updates).toHaveLength(1);
      expect(ddb.updates[0].options).toEqual({
        condition: "#ua = :expected",
        names: { "#ua": "updatedAt" },
        values: { ":expected": "2026-01-01T00:00:00.000Z" },
      });
      expect(event.updatedAt > "2026-01-01T00:00:00.000Z").toBe(true);
    });

    it("patchLine re-reads and retries when updatedAt moved under it", async () => {
      // The phone ticks line a between the laptop's read and its write.
      ddb.beforeUpdate = () => {
        const row = ddb.rows("events").get("e1") as Item;
        row.recipes = (row.recipes as Item[]).map((l) => (l.lineId === "a" ? { ...l, prepStatus: "doing" } : l));
        row.updatedAt = "2026-01-02T00:00:00.000Z";
        ddb.beforeUpdate = undefined;
      };
      const event = await service.patchLine("e1", "b", { notes: "mild" });
      expect(ddb.updates).toHaveLength(2);
      expect(ddb.updates[1].options?.values).toEqual({ ":expected": "2026-01-02T00:00:00.000Z" });
      expect(event.recipes[0].prepStatus).toBe("doing");
      expect(event.recipes[1].notes).toBe("mild");
    });

    it("line writes 409 LINES_CHANGED when the event keeps moving", async () => {
      let n = 0;
      ddb.beforeUpdate = () => {
        const row = ddb.rows("events").get("e1") as Item;
        row.updatedAt = `2026-01-0${++n + 1}T00:00:00.000Z`;
      };
      const call = service.removeLine("e1", "c");
      await expect(call).rejects.toBeInstanceOf(ConflictException);
      await call.catch((err: ConflictException) => {
        expect(err.getResponse()).toEqual({ code: "LINES_CHANGED", missing: [] });
      });
      expect(ddb.updates).toHaveLength(5);
      expect((await service.getOrFail("e1")).recipes).toHaveLength(3);
    });

    it("line writes succeed when the event stops moving before the budget runs out", async () => {
      ddb.failUpdatesWith.push(conditionFailure(), conditionFailure(), conditionFailure());
      const event = await service.patchLine("e1", "b", { prepStatus: "done" });
      expect(ddb.updates).toHaveLength(4);
      expect(event.recipes[1].prepStatus).toBe("done");
    });

    it("line endpoints work on an event stored without a recipes attribute", async () => {
      const bare = baseEvent({ eventId: "e2" });
      delete bare.recipes;
      await ddb.put("events", bare);
      expect((await service.getOrFail("e2")).recipes).toEqual([]);
      const event = await service.addLine("e2", { recipeId: "r1", portions: 1 });
      expect(event.recipes).toHaveLength(1);
      await expect(service.removeLine("e2", "nope")).rejects.toBeInstanceOf(NotFoundException);
    });

    it("patchLine sets assignedTo and clears it with an empty list", async () => {
      const set = await service.patchLine("e1", "b", { assignedTo: ["kristoff"] });
      expect(set.recipes[1]).toEqual({ lineId: "b", recipeId: "r2", portions: 3, notes: "spicy", assignedTo: ["kristoff"] });
      const cleared = await service.patchLine("e1", "b", { assignedTo: [] });
      expect(cleared.recipes[1]).toEqual({ lineId: "b", recipeId: "r2", portions: 3, notes: "spicy", assignedTo: [] });
      const untouched = await service.patchLine("e1", "b", { notes: "mild" });
      expect(untouched.recipes[1].assignedTo).toEqual([]);
    });

    it("putLines keeps assignedTo through a reorder", async () => {
      await service.patchLine("e1", "c", { assignedTo: ["amelie", "kristoff"] });
      const event = await service.putLines("e1", { lines: [{ lineId: "c", course: "Plat" }, { lineId: "a" }, { lineId: "b" }] });
      expect(event.recipes[0]).toEqual({ lineId: "c", recipeId: "r3", portions: 4, course: "Plat", assignedTo: ["amelie", "kristoff"] });
    });

    it("patchLine 404s on an unknown line", async () => {
      await expect(service.patchLine("e1", "zz", { portions: 1 })).rejects.toBeInstanceOf(NotFoundException);
    });

    it("putLines reorders, applies course when sent, and keeps every other stored field", async () => {
      const event = await service.putLines("e1", {
        lines: [{ lineId: "c", course: "Plat" }, { lineId: "a" }, { lineId: "b" }],
      });
      expect(event.recipes.map((l) => l.lineId)).toEqual(["c", "a", "b"]);
      expect(event.recipes[0]).toEqual({ lineId: "c", recipeId: "r3", portions: 4, course: "Plat" });
      expect(event.recipes[1]).toEqual({ lineId: "a", recipeId: "r1", portions: 2, prepStatus: "done", course: "Entrée" });
      expect(event.recipes[2].notes).toBe("spicy");
    });

    it("putLines 409s with the missing ids when the id set differs", async () => {
      const call = service.putLines("e1", { lines: [{ lineId: "a" }, { lineId: "b" }, { lineId: "ghost" }] });
      await expect(call).rejects.toBeInstanceOf(ConflictException);
      await call.catch((err: ConflictException) => {
        expect(err.getResponse()).toEqual({ code: "LINES_CHANGED", missing: ["ghost"] });
      });
      expect(ddb.updates).toHaveLength(0);
    });

    it("putLines 409s when a stored line is absent from the body", async () => {
      const call = service.putLines("e1", { lines: [{ lineId: "a" }, { lineId: "b" }] });
      await expect(call).rejects.toBeInstanceOf(ConflictException);
    });

    it("removeLine drops the line and 404s when unknown", async () => {
      const event = await service.removeLine("e1", "b");
      expect(event.recipes.map((l) => l.lineId)).toEqual(["a", "c"]);
      await expect(service.removeLine("e1", "b")).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("tasks", () => {
    beforeEach(async () => {
      await ddb.put(
        "events",
        baseEvent({
          recipes: [{ lineId: "a", recipeId: "r1", portions: 2 }],
          tasks: [
            { taskId: "t1", label: "Dégeler le poisson", date: "2026-05-30", prepStatus: "done" },
            { taskId: "t2", label: "Cuire les sablés", date: "2026-05-31", assignedTo: ["kristoff"] },
          ],
        }),
      );
    });

    it("get on an event without tasks returns tasks: [] and makes no update call", async () => {
      await ddb.put("events", baseEvent({ eventId: "e2", recipes: [{ lineId: "a", recipeId: "r1", portions: 1 }] }));
      const event = await service.getOrFail("e2");
      expect(event.tasks).toEqual([]);
      expect(ddb.updates).toHaveLength(0);
      expect(ddb.rows("events").get("e2")).not.toHaveProperty("tasks");
    });

    it("addTask fills taskId, bumps updatedAt and guards on the updatedAt it read", async () => {
      const event = await service.addTask("e1", { label: "Acheter le pain", date: "2026-06-01" });
      expect(event.tasks).toHaveLength(3);
      const added = event.tasks?.[2];
      expect(added?.taskId).toEqual(expect.any(String));
      expect(added?.taskId).not.toBe("");
      expect(added).toMatchObject({ label: "Acheter le pain", date: "2026-06-01" });
      expect(event.updatedAt > "2026-01-01T00:00:00.000Z").toBe(true);
      expect(ddb.updates).toHaveLength(1);
      expect(ddb.updates[0].fields).not.toHaveProperty("recipes");
      expect(ddb.updates[0].options).toEqual({
        condition: "#ua = :expected",
        names: { "#ua": "updatedAt" },
        values: { ":expected": "2026-01-01T00:00:00.000Z" },
      });
    });

    it("patchTask merges the patch and keeps the other fields", async () => {
      const event = await service.patchTask("e1", "t2", { prepStatus: "doing", date: "2026-06-01" });
      expect(event.tasks?.[1]).toEqual({
        taskId: "t2", label: "Cuire les sablés", date: "2026-06-01", prepStatus: "doing", assignedTo: ["kristoff"],
      });
      expect(event.tasks?.[0]).toEqual({ taskId: "t1", label: "Dégeler le poisson", date: "2026-05-30", prepStatus: "done" });
      expect(event.recipes).toEqual([{ lineId: "a", recipeId: "r1", portions: 2 }]);
    });

    it("patchTask 404s on an unknown task", async () => {
      await expect(service.patchTask("e1", "zz", { label: "x" })).rejects.toBeInstanceOf(NotFoundException);
      expect(ddb.updates).toHaveLength(0);
    });

    it("removeTask drops the task and 404s when unknown", async () => {
      const event = await service.removeTask("e1", "t1");
      expect(event.tasks?.map((t) => t.taskId)).toEqual(["t2"]);
      await expect(service.removeTask("e1", "t1")).rejects.toBeInstanceOf(NotFoundException);
    });

    it("task writes 409 LINES_CHANGED when the event keeps moving", async () => {
      let n = 0;
      ddb.beforeUpdate = () => {
        const row = ddb.rows("events").get("e1") as Item;
        row.updatedAt = `2026-01-0${++n + 1}T00:00:00.000Z`;
      };
      const call = service.addTask("e1", { label: "x", date: "2026-06-01" });
      await expect(call).rejects.toBeInstanceOf(ConflictException);
      await call.catch((err: ConflictException) => {
        expect(err.getResponse()).toEqual({ code: "LINES_CHANGED", missing: [] });
      });
      expect(ddb.updates).toHaveLength(5);
      expect((await service.getOrFail("e1")).tasks).toHaveLength(2);
    });

    it("task endpoints work on an event stored without a tasks attribute", async () => {
      await ddb.put("events", baseEvent({ eventId: "e2" }));
      const event = await service.addTask("e2", { label: "x", date: "2026-06-01" });
      expect(event.tasks).toHaveLength(1);
      await expect(service.removeTask("e2", "nope")).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("prep dates", () => {
    const storedLine = (index: number) => ((ddb.rows("events").get("e1") as Item).recipes as Item[])[index];

    beforeEach(async () => {
      await ddb.put(
        "events",
        baseEvent({
          recipes: [
            { lineId: "a", recipeId: "r1", portions: 2, prepDate: "2026-05-29" },
            { lineId: "b", recipeId: "r2", portions: 3, notes: "spicy" },
          ],
        }),
      );
    });

    it("patchLine with prepDate null leaves the stored line without a prepDate key", async () => {
      const event = await service.patchLine("e1", "a", { prepDate: null });
      expect(event.recipes[0]).toEqual({ lineId: "a", recipeId: "r1", portions: 2 });
      expect(storedLine(0)).not.toHaveProperty("prepDate");
    });

    it("patchLine with prepDate equal to the event day leaves the stored line without prepDate", async () => {
      const event = await service.patchLine("e1", "a", { prepDate: "2026-06-01" });
      expect(event.recipes[0]).toEqual({ lineId: "a", recipeId: "r1", portions: 2 });
      expect(storedLine(0)).not.toHaveProperty("prepDate");
    });

    it("patchLine with prepDate two days before stores it", async () => {
      const event = await service.patchLine("e1", "b", { prepDate: "2026-05-30" });
      expect(event.recipes[1]).toEqual({ lineId: "b", recipeId: "r2", portions: 3, notes: "spicy", prepDate: "2026-05-30" });
      expect(storedLine(1).prepDate).toBe("2026-05-30");
    });

    it("addLine drops a prepDate equal to the event day and keeps another day", async () => {
      const same = await service.addLine("e1", { recipeId: "r3", portions: 1, prepDate: "2026-06-01" });
      expect(same.recipes[2]).toEqual({ lineId: same.recipes[2].lineId, recipeId: "r3", portions: 1 });
      expect(storedLine(2)).not.toHaveProperty("prepDate");
      const other = await service.addLine("e1", { recipeId: "r4", portions: 1, prepDate: "2026-05-31" });
      expect(other.recipes[3].prepDate).toBe("2026-05-31");
    });

    it("putLines keeps a prepDate through a reorder", async () => {
      const event = await service.putLines("e1", { lines: [{ lineId: "b" }, { lineId: "a" }] });
      expect(event.recipes[1]).toEqual({ lineId: "a", recipeId: "r1", portions: 2, prepDate: "2026-05-29" });
    });

    it("create fills taskIds and drops a line prepDate equal to the event day", async () => {
      const event = await service.create({
        ...createBody,
        recipes: [
          { recipeId: "r1", portions: 10, prepDate: "2026-06-01" },
          { recipeId: "r2", portions: 5, prepDate: "2026-05-30" },
        ],
        tasks: [
          { label: "Dégeler le poisson", date: "2026-05-30" },
          { taskId: "keep-me", label: "Cuire les sablés", date: "2026-05-31" },
        ],
      });
      expect(event.recipes[0]).not.toHaveProperty("prepDate");
      expect(event.recipes[1].prepDate).toBe("2026-05-30");
      expect(event.tasks?.[0].taskId).toEqual(expect.any(String));
      expect(event.tasks?.[0].taskId).not.toBe("");
      expect(event.tasks?.[1].taskId).toBe("keep-me");
      const stored = await ddb.get("events", { eventId: event.eventId });
      expect(stored).toEqual(event);
      expect((stored?.recipes as Item[])[0]).not.toHaveProperty("prepDate");
    });
  });

  describe("update with tasks and a new date", () => {
    beforeEach(async () => {
      await ddb.put(
        "events",
        baseEvent({
          recipes: [
            { lineId: "a", recipeId: "r1", portions: 2, prepDate: "2026-05-30" },
            { lineId: "b", recipeId: "r2", portions: 3 },
          ],
          tasks: [
            { taskId: "t1", label: "Dégeler le poisson", date: "2026-05-30", prepStatus: "done" },
            { taskId: "t2", label: "Cuire les sablés", date: "2026-05-31" },
          ],
        }),
      );
    });

    it("a new date shifts line prepDates and task dates by the delta and leaves a line without prepDate alone", async () => {
      const event = await service.update("e1", { date: "2026-06-08" });
      expect(event.date).toBe("2026-06-08");
      expect(event.recipes[0].prepDate).toBe("2026-06-06");
      expect(event.recipes[1]).toEqual({ lineId: "b", recipeId: "r2", portions: 3 });
      expect(event.tasks?.map((t) => t.date)).toEqual(["2026-06-06", "2026-06-07"]);
      expect(event.tasks?.[0]).toMatchObject({ taskId: "t1", label: "Dégeler le poisson", prepStatus: "done" });
    });

    it("a date moved backwards shifts the same way", async () => {
      const event = await service.update("e1", { date: "2026-05-25" });
      expect(event.recipes[0].prepDate).toBe("2026-05-23");
      expect(event.tasks?.map((t) => t.date)).toEqual(["2026-05-23", "2026-05-24"]);
    });

    it("a date equal to the stored date does not touch recipes or tasks", async () => {
      const event = await service.update("e1", { date: "2026-06-01", name: "Baptême" });
      expect(ddb.updates).toHaveLength(1);
      expect(ddb.updates[0].fields).not.toHaveProperty("recipes");
      expect(ddb.updates[0].fields).not.toHaveProperty("tasks");
      expect(event.recipes[0].prepDate).toBe("2026-05-30");
      expect(event.tasks?.[1].date).toBe("2026-05-31");
    });

    it("tasks merge by taskId and keep a stored prepStatus the caller omitted", async () => {
      const event = await service.update("e1", {
        tasks: [
          { taskId: "t1", label: "Dégeler le poisson", date: "2026-05-29" },
          { taskId: "t2", label: "Cuire les sablés", date: "2026-05-31", prepStatus: "doing" },
        ],
      });
      expect(event.tasks?.[0]).toEqual({ taskId: "t1", label: "Dégeler le poisson", date: "2026-05-29", prepStatus: "done" });
      expect(event.tasks?.[1]).toEqual({ taskId: "t2", label: "Cuire les sablés", date: "2026-05-31", prepStatus: "doing" });
      expect(ddb.updates[0].fields).not.toHaveProperty("recipes");
    });

    it("tasks append unknown ids with a fresh one and drop absent tasks", async () => {
      const event = await service.update("e1", {
        tasks: [
          { taskId: "t2", label: "Cuire les sablés", date: "2026-05-31" },
          { label: "Acheter le pain", date: "2026-06-01" },
        ],
      });
      expect(event.tasks).toHaveLength(2);
      expect(event.tasks?.[0].taskId).toBe("t2");
      expect(event.tasks?.[1].taskId).toEqual(expect.any(String));
      expect(event.tasks?.[1]).toMatchObject({ label: "Acheter le pain", date: "2026-06-01" });
      expect(event.tasks?.some((t) => t.taskId === "t1")).toBe(false);
    });

    it("a new date sent with recipes and tasks shifts the merged arrays and then normalizes", async () => {
      const event = await service.update("e1", {
        date: "2026-06-03",
        recipes: [
          { lineId: "a", recipeId: "r1", portions: 4 },
          { lineId: "b", recipeId: "r2", portions: 3, prepDate: "2026-06-01" },
        ],
        tasks: [{ taskId: "t1", label: "Dégeler le poisson", date: "2026-05-30" }],
      });
      expect(event.recipes[0]).toEqual({ lineId: "a", recipeId: "r1", portions: 4, prepDate: "2026-06-01" });
      expect(event.recipes[1]).toEqual({ lineId: "b", recipeId: "r2", portions: 3 });
      expect(event.tasks).toEqual([{ taskId: "t1", label: "Dégeler le poisson", date: "2026-06-01", prepStatus: "done" }]);
    });

    it("a new date on an event without tasks or prepDates writes an empty tasks list and unchanged lines", async () => {
      await ddb.put("events", baseEvent({ eventId: "e2", recipes: [{ lineId: "a", recipeId: "r1", portions: 2 }] }));
      const event = await service.update("e2", { date: "2026-06-08" });
      expect(event.recipes).toEqual([{ lineId: "a", recipeId: "r1", portions: 2 }]);
      expect(event.tasks).toEqual([]);
    });
  });
});
