import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import type {
  AddEventLineRequest,
  AppEvent,
  CreateEventRequest,
  EventRecipeLine,
  PatchEventLineRequest,
  PutEventLinesRequest,
  UpdateEventRequest,
} from "@packages/types";
import { DdbService } from "../shared/ddb.service";

type IncomingLine = Omit<EventRecipeLine, "lineId"> & { lineId?: string };

// Drops undefined values so a spread never clears a stored field the caller did not send.
const definedEntries = <T extends object>(obj: T): Partial<T> =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;

const fillLineIds = (lines: IncomingLine[]): EventRecipeLine[] =>
  lines.map((l) => ({ ...l, lineId: l.lineId ?? randomUUID() }));

@Injectable()
export class EventsService {
  private get table() { return this.ddb.tables.events; }

  constructor(private ddb: DdbService) {}

  async getAll(): Promise<AppEvent[]> {
    const items = (await this.ddb.scanAll(this.table)) as unknown as AppEvent[];
    return Promise.all(items.map((e) => this.withLineIds(e)));
  }

  async get(eventId: string): Promise<AppEvent | null> {
    const item = (await this.ddb.get(this.table, { eventId })) as AppEvent | null;
    return item ? this.withLineIds(item) : null;
  }

  async getOrFail(eventId: string): Promise<AppEvent> {
    const item = await this.get(eventId);
    if (!item) throw new NotFoundException("Event not found");
    return item;
  }

  async create(data: CreateEventRequest): Promise<AppEvent> {
    const now = new Date().toISOString();
    const { costSnapshot, ...rest } = data;
    const event: AppEvent = {
      eventId: randomUUID(),
      ...rest,
      recipes: fillLineIds(data.recipes),
      ...(costSnapshot && { costSnapshot: { ...costSnapshot, takenAt: now } }),
      nameLower: data.name.toLowerCase(),
      createdAt: now,
      updatedAt: now,
    };
    await this.ddb.put(this.table, event as unknown as Record<string, unknown>);
    return event;
  }

  async update(eventId: string, fields: UpdateEventRequest): Promise<AppEvent> {
    const stored = await this.getOrFail(eventId);
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { ...fields, updatedAt: now };
    if (fields.name) updates.nameLower = fields.name.toLowerCase();
    if (fields.recipes) updates.recipes = this.mergeLines(stored.recipes, fields.recipes);
    if (fields.costSnapshot) updates.costSnapshot = { ...fields.costSnapshot, takenAt: now };
    await this.ddb.update(this.table, { eventId }, updates);
    return this.getOrFail(eventId);
  }

  async delete(eventId: string): Promise<void> {
    await this.ddb.delete(this.table, { eventId });
  }

  async addLine(eventId: string, line: AddEventLineRequest): Promise<AppEvent> {
    const stored = await this.getOrFail(eventId);
    return this.writeLines(eventId, [...stored.recipes, { ...line, lineId: randomUUID() }]);
  }

  async patchLine(eventId: string, lineId: string, patch: PatchEventLineRequest): Promise<AppEvent> {
    const stored = await this.getOrFail(eventId);
    const index = stored.recipes.findIndex((l) => l.lineId === lineId);
    if (index === -1) throw new NotFoundException("Line not found");
    const recipes = stored.recipes.map((l, i) => (i === index ? { ...l, ...definedEntries(patch) } : l));
    return this.writeLines(eventId, recipes);
  }

  async putLines(eventId: string, body: PutEventLinesRequest): Promise<AppEvent> {
    const stored = await this.getOrFail(eventId);
    const byId = new Map(stored.recipes.map((l) => [l.lineId, l]));
    const missing = body.lines.filter((l) => !byId.has(l.lineId)).map((l) => l.lineId);
    if (missing.length > 0 || body.lines.length !== stored.recipes.length) {
      throw new ConflictException({ code: "LINES_CHANGED", missing });
    }
    const recipes = body.lines.map((l) => ({
      ...(byId.get(l.lineId) as EventRecipeLine),
      ...(l.course !== undefined && { course: l.course }),
    }));
    return this.writeLines(eventId, recipes);
  }

  async removeLine(eventId: string, lineId: string): Promise<AppEvent> {
    const stored = await this.getOrFail(eventId);
    if (!stored.recipes.some((l) => l.lineId === lineId)) throw new NotFoundException("Line not found");
    return this.writeLines(eventId, stored.recipes.filter((l) => l.lineId !== lineId));
  }

  private async writeLines(eventId: string, recipes: EventRecipeLine[]): Promise<AppEvent> {
    await this.ddb.update(this.table, { eventId }, { recipes, updatedAt: new Date().toISOString() });
    return this.getOrFail(eventId);
  }

  // Keeps stored line fields the editor did not send; unknown ids get a fresh one; absent lines are dropped.
  private mergeLines(stored: EventRecipeLine[], incoming: IncomingLine[]): EventRecipeLine[] {
    const byId = new Map(stored.map((l) => [l.lineId, l]));
    return incoming.map((l) => {
      const prev = l.lineId ? byId.get(l.lineId) : undefined;
      if (!prev) return { ...l, lineId: randomUUID() };
      return { ...prev, ...definedEntries(l), lineId: prev.lineId };
    });
  }

  // Backfills lineId on events written before the field existed, once per event.
  private async withLineIds(event: AppEvent): Promise<AppEvent> {
    const lines = (event.recipes ?? []) as IncomingLine[];
    if (lines.every((l) => l.lineId)) return event;
    const recipes = fillLineIds(lines);
    try {
      await this.ddb.update(this.table, { eventId: event.eventId }, { recipes }, {
        condition: "attribute_not_exists(#r[0].#lid)",
        names: { "#r": "recipes", "#lid": "lineId" },
      });
    } catch (err) {
      if ((err as { name?: string }).name !== "ConditionalCheckFailedException") throw err;
      const fresh = (await this.ddb.get(this.table, { eventId: event.eventId })) as AppEvent | null;
      return fresh ?? { ...event, recipes };
    }
    return { ...event, recipes };
  }
}
