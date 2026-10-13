import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import type {
  AppEvent,
  Client,
  ClientTemplate,
  CreateClientRequest,
  CreateEventRequest,
  InstantiateRequest,
  LinkEventsRequest,
  UpdateClientRequest,
  Weekday,
} from "@packages/types";
import { isWeekdayLabel } from "@packages/types";
import { DdbService } from "../shared/ddb.service";
import { EventsService } from "../events/events.service";

type TemplateInput = CreateClientRequest["templates"][number];

// The client name alone when the template is only named after its weekday; the date shows elsewhere.
export function eventNameFor(client: Pick<Client, "name">, template: Pick<ClientTemplate, "name">): string {
  return isWeekdayLabel(template.name) ? client.name : `${client.name} · ${template.name.trim()}`;
}

// ISO weekday of a YYYY-MM-DD date, Monday = 1 and Sunday = 7.
export function isoWeekday(date: string): Weekday {
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return (day === 0 ? 7 : day) as Weekday;
}

function withTemplateIds(templates: TemplateInput[]): ClientTemplate[] {
  return templates.map((t) => ({
    ...t,
    templateId: t.templateId ?? randomUUID(),
    weekday: t.weekday as Weekday,
  }));
}

@Injectable()
export class ClientsService {
  constructor(private ddb: DdbService, private events: EventsService) {}

  private get table() { return this.ddb.requireTable("clients"); }

  async getAll(): Promise<Client[]> {
    const items = await this.ddb.scanAll(this.table);
    return items as unknown as Client[];
  }

  async get(clientId: string): Promise<Client | null> {
    const item = await this.ddb.get(this.table, { clientId });
    return item as Client | null;
  }

  async getOrFail(clientId: string): Promise<Client> {
    const item = await this.get(clientId);
    if (!item) throw new NotFoundException("Client introuvable");
    return item;
  }

  async create(data: CreateClientRequest): Promise<Client> {
    const now = new Date().toISOString();
    const client: Client = {
      ...data,
      clientId: randomUUID(),
      nameLower: data.name.toLowerCase(),
      templates: withTemplateIds(data.templates ?? []),
      active: data.active ?? true,
      createdAt: now,
      updatedAt: now,
    };
    await this.ddb.put(this.table, client as unknown as Record<string, unknown>);
    return client;
  }

  async update(clientId: string, fields: UpdateClientRequest): Promise<Client> {
    await this.getOrFail(clientId);
    // Null fields reach ddb.update unchanged, which removes the attribute.
    const updates: Record<string, unknown> = { ...fields, updatedAt: new Date().toISOString() };
    if (fields.name) updates.nameLower = fields.name.toLowerCase();
    if (fields.templates) updates.templates = withTemplateIds(fields.templates);
    await this.ddb.update(this.table, { clientId }, updates);
    const saved = await this.getOrFail(clientId);
    return Object.fromEntries(Object.entries(saved).filter(([, v]) => v !== null)) as Client;
  }

  async delete(clientId: string): Promise<void> {
    await this.getOrFail(clientId);
    const events = await this.scanEvents();
    const inUse = events.filter((e) => e.clientId === clientId).length;
    if (inUse > 0) throw new ConflictException({ code: "IN_USE", events: inUse });
    await this.ddb.delete(this.table, { clientId });
  }

  async instantiate(
    clientId: string,
    { dates, guestCount }: InstantiateRequest,
  ): Promise<{ created: AppEvent[]; skipped: string[] }> {
    const client = await this.getOrFail(clientId);
    const events = await this.scanEvents();
    const mine = events.filter((e) => e.clientId === clientId);
    const existing = new Set(mine.filter((e) => e.templateId).map((e) => `${e.templateId}|${e.date}`));
    // A hand-made event of this client on a date counts as that day being covered.
    const datesTaken = new Set(mine.filter((e) => !e.templateId).map((e) => e.date.slice(0, 10)));
    const created: AppEvent[] = [];
    const skipped: string[] = [];

    for (const date of dates) {
      const weekday = isoWeekday(date);
      for (const template of client.templates.filter((t) => t.weekday === weekday)) {
        const key = `${template.templateId}|${date}`;
        if (existing.has(key) || datesTaken.has(date)) {
          skipped.push(key);
          continue;
        }
        const event = await this.events.create(this.eventFromTemplate(client, template, date, guestCount));
        existing.add(key);
        created.push(event);
      }
    }
    return { created, skipped };
  }

  async linkEvents(clientId: string, { contactEmail, contactName }: LinkEventsRequest): Promise<{ linked: number }> {
    await this.getOrFail(clientId);
    const email = contactEmail?.toLowerCase();
    const name = contactName?.toLowerCase();
    if (!email && !name) return { linked: 0 };
    const events = await this.scanEvents();
    const matches = events.filter(
      (e) =>
        (email !== undefined && e.contactEmail?.toLowerCase() === email) ||
        (name !== undefined && e.contactName?.toLowerCase() === name),
    );
    const updatedAt = new Date().toISOString();
    for (const event of matches) {
      await this.ddb.update(this.ddb.tables.events, { eventId: event.eventId }, { clientId, updatedAt });
    }
    return { linked: matches.length };
  }

  private async scanEvents(): Promise<AppEvent[]> {
    const items = await this.ddb.scanAll(this.ddb.tables.events);
    return items as unknown as AppEvent[];
  }

  private eventFromTemplate(
    client: Client,
    template: ClientTemplate,
    date: string,
    guestCount: number | undefined,
  ): CreateEventRequest {
    const guests = guestCount ?? template.guestCount;
    const ratio = guests / template.guestCount;
    return {
      name: eventNameFor(client, template),
      date,
      clientId: client.clientId,
      templateId: template.templateId,
      guestCount: guests,
      recipes: template.recipes.map((line) => ({
        recipeId: line.recipeId,
        portions: Math.max(1, Math.round(line.portions * ratio)),
        ...(line.course !== undefined && { course: line.course }),
        ...(line.notes !== undefined && { notes: line.notes }),
      })),
      tasks: [],
      extraCosts: template.extraCosts,
      ...(template.notes !== undefined && { notes: template.notes }),
      ...(template.assignedTo && { assignedTo: template.assignedTo }),
      sellingPricePerGuest: template.sellingPricePerGuest,
      prestationType: template.prestationType ?? client.defaultPrestationType,
      vatRate: template.vatRate ?? client.defaultVatRate,
      contactName: client.contactName,
      contactPhone: client.phone,
      contactEmail: client.email,
      status: "upcoming",
    };
  }
}
