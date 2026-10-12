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

type NonNullFields<T> = { [K in keyof T]: Exclude<T[K], null> };

// A null on create means "not set", so it is not stored as a NULL attribute.
const withoutNull = <T extends object>(obj: T): NonNullFields<T> =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null)) as NonNullFields<T>;

const fillLineIds = (lines: IncomingLine[]): EventRecipeLine[] =>
  lines.map((l) => ({ ...l, lineId: l.lineId ?? randomUUID() }));

const isConditionFailure = (err: unknown) => (err as { name?: string }).name === "ConditionalCheckFailedException";

// Strictly later than the previous stamp so two writes in one millisecond never share it.
const nextStamp = (previous?: string): string => {
  const now = new Date().toISOString();
  if (!previous || now > previous || Number.isNaN(Date.parse(previous))) return now;
  return new Date(Date.parse(previous) + 1).toISOString();
};

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
      ...withoutNull(rest),
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
    return this.withFreshEvent(eventId, (stored) =>
      this.writeLines(stored, [...stored.recipes, { ...line, lineId: randomUUID() }]));
  }

  async patchLine(eventId: string, lineId: string, patch: PatchEventLineRequest): Promise<AppEvent> {
    return this.withFreshEvent(eventId, (stored) => {
      const index = stored.recipes.findIndex((l) => l.lineId === lineId);
      if (index === -1) throw new NotFoundException("Line not found");
      const recipes = stored.recipes.map((l, i) => (i === index ? { ...l, ...definedEntries(patch) } : l));
      return this.writeLines(stored, recipes);
    });
  }

  async putLines(eventId: string, body: PutEventLinesRequest): Promise<AppEvent> {
    return this.withFreshEvent(eventId, (stored) => {
      const byId = new Map(stored.recipes.map((l) => [l.lineId, l]));
      const missing = body.lines.filter((l) => !byId.has(l.lineId)).map((l) => l.lineId);
      if (missing.length > 0 || body.lines.length !== stored.recipes.length) {
        throw new ConflictException({ code: "LINES_CHANGED", missing });
      }
      const recipes = body.lines.map((l) => ({
        ...(byId.get(l.lineId) as EventRecipeLine),
        ...(l.course !== undefined && { course: l.course }),
      }));
      return this.writeLines(stored, recipes);
    });
  }

  async removeLine(eventId: string, lineId: string): Promise<AppEvent> {
    return this.withFreshEvent(eventId, (stored) => {
      if (!stored.recipes.some((l) => l.lineId === lineId)) throw new NotFoundException("Line not found");
      return this.writeLines(stored, stored.recipes.filter((l) => l.lineId !== lineId));
    });
  }

  // Runs op on a fresh read and retries once when another write moved updatedAt in between.
  private async withFreshEvent(eventId: string, op: (stored: AppEvent) => Promise<AppEvent>): Promise<AppEvent> {
    for (let attempt = 0; ; attempt++) {
      const stored = await this.getOrFail(eventId);
      try {
        return await op(stored);
      } catch (err) {
        if (!isConditionFailure(err)) throw err;
        if (attempt >= 1) throw new ConflictException({ code: "LINES_CHANGED", missing: [] });
      }
    }
  }

  // Writes the array only when updatedAt still matches the read the lines were computed from.
  private async writeLines(stored: AppEvent, recipes: EventRecipeLine[]): Promise<AppEvent> {
    const guard = stored.updatedAt
      ? { condition: "#ua = :expected", names: { "#ua": "updatedAt" }, values: { ":expected": stored.updatedAt } }
      : { condition: "attribute_not_exists(#ua)", names: { "#ua": "updatedAt" } };
    const updates = { recipes, updatedAt: nextStamp(stored.updatedAt) };
    await this.ddb.update(this.table, { eventId: stored.eventId }, updates, guard);
    return this.getOrFail(stored.eventId);
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
    if (lines.every((l) => l.lineId)) return { ...event, recipes: lines as EventRecipeLine[] };
    const recipes = fillLineIds(lines);
    try {
      await this.ddb.update(this.table, { eventId: event.eventId }, { recipes }, {
        condition: "attribute_not_exists(#r[0].#lid)",
        names: { "#r": "recipes", "#lid": "lineId" },
      });
    } catch (err) {
      if (!isConditionFailure(err)) throw err;
      const fresh = (await this.ddb.get(this.table, { eventId: event.eventId })) as AppEvent | null;
      return fresh ?? { ...event, recipes };
    }
    return { ...event, recipes };
  }
}
