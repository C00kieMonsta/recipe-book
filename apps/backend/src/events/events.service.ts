import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { AppEvent } from "@packages/types";
import { DdbService } from "../shared/ddb.service";

@Injectable()
export class EventsService {
  private get table() { return this.ddb.tables.events; }

  constructor(private ddb: DdbService) {}

  async getAll(): Promise<AppEvent[]> {
    const items = await this.ddb.scanAll(this.table);
    return items as unknown as AppEvent[];
  }

  async get(eventId: string): Promise<AppEvent | null> {
    const item = await this.ddb.get(this.table, { eventId });
    return item as AppEvent | null;
  }

  async getOrFail(eventId: string): Promise<AppEvent> {
    const item = await this.get(eventId);
    if (!item) throw new NotFoundException("Event not found");
    return item;
  }

  async create(data: Omit<AppEvent, "eventId" | "nameLower" | "createdAt" | "updatedAt">): Promise<AppEvent> {
    const now = new Date().toISOString();
    const event: AppEvent = {
      eventId: randomUUID(),
      ...data,
      nameLower: data.name.toLowerCase(),
      createdAt: now,
      updatedAt: now,
    };
    await this.ddb.put(this.table, event as unknown as Record<string, unknown>);
    return event;
  }

  async update(eventId: string, fields: Partial<AppEvent>): Promise<AppEvent> {
    await this.getOrFail(eventId);
    const updates: Record<string, unknown> = {
      ...fields,
      updatedAt: new Date().toISOString(),
    };
    if (fields.name) updates.nameLower = fields.name.toLowerCase();
    await this.ddb.update(this.table, { eventId }, updates);
    return this.getOrFail(eventId);
  }

  async delete(eventId: string): Promise<void> {
    await this.ddb.delete(this.table, { eventId });
  }
}
