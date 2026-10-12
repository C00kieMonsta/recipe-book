import { ConflictException } from "@nestjs/common";
import type { Client, CreateClientRequest } from "@packages/types";
import { ClientsService, isoWeekday } from "./clients.service";
import { EventsService } from "../events/events.service";
import type { DdbService } from "../shared/ddb.service";

type Item = Record<string, unknown>;

class FakeDdb {
  readonly tables = { events: "events", clients: "clients" } as DdbService["tables"];
  private store = new Map<string, Map<string, Item>>();

  private rows(table: string) {
    let rows = this.store.get(table);
    if (!rows) {
      rows = new Map();
      this.store.set(table, rows);
    }
    return rows;
  }

  private keyOf(key: Record<string, string>) {
    return Object.values(key)[0];
  }

  requireTable(name: "clients" | "ledger") {
    const table = this.tables[name];
    if (!table) throw new Error(`Table ${name} non configurée`);
    return table;
  }

  async get(table: string, key: Record<string, string>) {
    return this.rows(table).get(this.keyOf(key)) ?? null;
  }

  async put(table: string, item: Item) {
    const keyAttr = table === "clients" ? "clientId" : "eventId";
    this.rows(table).set(item[keyAttr] as string, { ...item });
  }

  async update(table: string, key: Record<string, string>, fields: Item) {
    const rows = this.rows(table);
    const current = rows.get(this.keyOf(key));
    if (!current) throw new Error("ConditionalCheckFailedException");
    const next = { ...current };
    for (const [k, v] of Object.entries(fields)) {
      if (v === null) delete next[k];
      else if (v !== undefined) next[k] = v;
    }
    rows.set(this.keyOf(key), next);
  }

  async scanAll(table: string) {
    return [...this.rows(table).values()];
  }

  async delete(table: string, key: Record<string, string>) {
    this.rows(table).delete(this.keyOf(key));
  }

  async batchWrite(table: string, items: Item[]) {
    for (const item of items) await this.put(table, item);
  }

  async batchDelete(table: string, keys: Record<string, string>[]) {
    for (const key of keys) await this.delete(table, key);
  }
}

const hoona: CreateClientRequest = {
  name: "Hoona",
  kind: "entreprise",
  contactName: "Marie",
  email: "Marie@Hoona.be",
  phone: "+32 470 00 00 00",
  defaultPrestationType: "menu_a_emporter",
  defaultVatRate: 6,
  templates: [
    {
      name: "Mardi",
      weekday: 2,
      guestCount: 30,
      sellingPricePerGuest: 12,
      recipes: [
        { recipeId: "quiche", portions: 30, course: "plat" },
        { recipeId: "salade", portions: 15 },
      ],
      extraCosts: [{ label: "Livraison", amount: 10 }],
    },
    {
      templateId: "tpl-jeudi",
      name: "Jeudi",
      weekday: 4,
      guestCount: 20,
      sellingPricePerGuest: 14,
      vatRate: 12,
      prestationType: "buffet",
      recipes: [{ recipeId: "lasagne", portions: 20 }],
      extraCosts: [],
      notes: "Livrer avant 11h",
    },
  ],
  active: true,
};

// 2026-10-12 is a Monday; the week runs to Sunday 2026-10-18.
const week = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"];

function setup() {
  const ddb = new FakeDdb();
  const events = new EventsService(ddb as unknown as DdbService);
  const service = new ClientsService(ddb as unknown as DdbService, events);
  return { ddb, events, service };
}

describe("isoWeekday", () => {
  it("maps Monday to 1 and Sunday to 7", () => {
    expect(isoWeekday("2026-10-12")).toBe(1);
    expect(isoWeekday("2026-10-18")).toBe(7);
  });
});

describe("ClientsService", () => {
  it("create fills templateIds and keeps the ones given", async () => {
    const { service } = setup();
    const client = await service.create(hoona);
    expect(client.clientId).toBeTruthy();
    expect(client.nameLower).toBe("hoona");
    expect(client.active).toBe(true);
    expect(client.templates[0].templateId).toBeTruthy();
    expect(client.templates[1].templateId).toBe("tpl-jeudi");
    const stored = await service.getOrFail(client.clientId);
    expect(stored.templates[0].templateId).toBe(client.templates[0].templateId);
  });

  it("update fills templateIds on new templates and refreshes nameLower", async () => {
    const { service } = setup();
    const client = await service.create(hoona);
    const updated = await service.update(client.clientId, {
      name: "Hoona SA",
      templates: [
        ...client.templates,
        { name: "Vendredi", weekday: 5, guestCount: 10, sellingPricePerGuest: 9, recipes: [], extraCosts: [] },
      ],
    });
    expect(updated.nameLower).toBe("hoona sa");
    expect(updated.templates).toHaveLength(3);
    expect(updated.templates[2].templateId).toBeTruthy();
    expect(updated.templates[1].templateId).toBe("tpl-jeudi");
  });

  it("update removes a field sent as null and returns no null values", async () => {
    const { service } = setup();
    const client = await service.create(hoona);
    const updated = await service.update(client.clientId, { contactName: null, defaultVatRate: null });
    expect("contactName" in updated).toBe(false);
    expect("defaultVatRate" in updated).toBe(false);
    expect(Object.values(updated)).not.toContain(null);
    expect(updated.email).toBe("Marie@Hoona.be");
  });

  it("instantiate creates one event per matching weekday with client and template fields", async () => {
    const { service } = setup();
    const client = await service.create(hoona);
    const result = await service.instantiate(client.clientId, { dates: week });
    expect(result.skipped).toEqual([]);
    expect(result.created.map((e) => e.date)).toEqual(["2026-10-13", "2026-10-15"]);

    const mardi = result.created[0];
    expect(mardi.name).toBe("Hoona · mardi 13 oct.");
    expect(mardi.clientId).toBe(client.clientId);
    expect(mardi.templateId).toBe(client.templates[0].templateId);
    expect(mardi.guestCount).toBe(30);
    expect(mardi.recipes.map((l) => l.portions)).toEqual([30, 15]);
    expect(mardi.recipes[0].course).toBe("plat");
    expect(mardi.recipes.some((l) => "prepStatus" in l && l.prepStatus !== undefined)).toBe(false);
    expect(mardi.extraCosts).toEqual([{ label: "Livraison", amount: 10 }]);
    expect(mardi.sellingPricePerGuest).toBe(12);
    expect(mardi.prestationType).toBe("menu_a_emporter");
    expect(mardi.vatRate).toBe(6);
    expect(mardi.contactName).toBe("Marie");
    expect(mardi.contactEmail).toBe("Marie@Hoona.be");
    expect(mardi.contactPhone).toBe("+32 470 00 00 00");
    expect(mardi.status).toBe("upcoming");

    const jeudi = result.created[1];
    expect(jeudi.templateId).toBe("tpl-jeudi");
    expect(jeudi.prestationType).toBe("buffet");
    expect(jeudi.vatRate).toBe(12);
    expect(jeudi.notes).toBe("Livrer avant 11h");
    expect("notes" in mardi).toBe(false);
  });

  it("instantiate skips a date where the client already has a hand-made event", async () => {
    const { service, events } = setup();
    const client = await service.create(hoona);
    await events.create({
      name: "Hoona manuel", date: "2026-10-13", guestCount: 10, recipes: [], extraCosts: [],
      sellingPricePerGuest: 0, status: "upcoming", clientId: client.clientId,
    });
    const result = await service.instantiate(client.clientId, { dates: week });
    expect(result.created.map((e) => e.date)).toEqual(["2026-10-15"]);
    expect(result.skipped).toEqual([`${client.templates[0].templateId}|2026-10-13`]);
    expect(await events.getAll()).toHaveLength(2);
  });

  it("instantiate scales portions on a guest override", async () => {
    const { service } = setup();
    const client = await service.create(hoona);
    const result = await service.instantiate(client.clientId, { dates: ["2026-10-13"], guestCount: 45 });
    expect(result.created).toHaveLength(1);
    expect(result.created[0].guestCount).toBe(45);
    expect(result.created[0].recipes.map((l) => l.portions)).toEqual([45, 23]);
  });

  it("instantiate never scales a line below one portion", async () => {
    const { service } = setup();
    const client = await service.create(hoona);
    const result = await service.instantiate(client.clientId, { dates: ["2026-10-13"], guestCount: 1 });
    expect(result.created[0].recipes.map((l) => l.portions)).toEqual([1, 1]);
  });

  it("instantiate skips pairs already present and is idempotent", async () => {
    const { service, events } = setup();
    const client = await service.create(hoona);
    const first = await service.instantiate(client.clientId, { dates: week });
    expect(first.created).toHaveLength(2);

    const second = await service.instantiate(client.clientId, { dates: week });
    expect(second.created).toEqual([]);
    expect(second.skipped).toEqual([
      `${client.templates[0].templateId}|2026-10-13`,
      "tpl-jeudi|2026-10-15",
    ]);
    expect(await events.getAll()).toHaveLength(2);
  });

  it("delete refuses with IN_USE when an event references the client", async () => {
    const { service } = setup();
    const client = await service.create(hoona);
    await service.instantiate(client.clientId, { dates: ["2026-10-13"] });

    const error = await service.delete(client.clientId).catch((e) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toEqual({ code: "IN_USE", events: 1 });
    expect(await service.get(client.clientId)).not.toBeNull();
  });

  it("delete removes a client without events", async () => {
    const { service } = setup();
    const client = await service.create(hoona);
    await service.delete(client.clientId);
    expect(await service.get(client.clientId)).toBeNull();
  });

  it("linkEvents matches contactEmail case-insensitively and contactName", async () => {
    const { service, events } = setup();
    const client = await service.create(hoona);
    const base = { date: "2026-09-01", guestCount: 10, recipes: [], extraCosts: [], sellingPricePerGuest: 0, status: "upcoming" as const };
    const byEmail = await events.create({ ...base, name: "A", contactEmail: "MARIE@hoona.BE" });
    const byName = await events.create({ ...base, name: "B", contactName: "marie" });
    const other = await events.create({ ...base, name: "C", contactEmail: "someone@else.be", contactName: "Paul" });

    const result = await service.linkEvents(client.clientId, { contactEmail: "marie@hoona.be", contactName: "Marie" });
    expect(result).toEqual({ linked: 2 });
    expect((await events.getOrFail(byEmail.eventId)).clientId).toBe(client.clientId);
    expect((await events.getOrFail(byName.eventId)).clientId).toBe(client.clientId);
    expect((await events.getOrFail(other.eventId)).clientId).toBeUndefined();
  });

  it("linkEvents links nothing when no criterion is given", async () => {
    const { service } = setup();
    const client = await service.create(hoona);
    expect(await service.linkEvents(client.clientId, {})).toEqual({ linked: 0 });
  });
});
