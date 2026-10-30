import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { randomUUID } from "crypto";
import type {
  AddEventLineRequest,
  AddEventTaskRequest,
  AppEvent,
  EventStaffEntry,
  CreateEventRequest,
  EventAttachment,
  EventRecipeLine,
  EventTask,
  PatchEventLineRequest,
  PatchEventTaskRequest,
  PutEventLinesRequest,
  UpdateEventRequest,
} from "@packages/types";
import { ATTACHMENT_TYPES, MAX_ATTACHMENTS, hoursBetween, round2, recipePreparationTasks, shiftPrepDates, tasksOf } from "@packages/types";
import { DdbService, UpdateOptions } from "../shared/ddb.service";
import { S3Service } from "../shared/s3.service";
import { RecipesService } from "../recipes/recipes.service";

type IncomingLine = Omit<EventRecipeLine, "lineId"> & { lineId?: string };
type IncomingTask = Omit<EventTask, "taskId"> & { taskId?: string };
// A line before normalizeLines: a patch may carry prepDate null to clear it.
type LooseLine = Omit<EventRecipeLine, "prepDate"> & { prepDate?: string | null };

function staffWithDerivedHours(staff: EventStaffEntry[] | undefined): EventStaffEntry[] | undefined {
  if (!staff) return undefined;
  return staff.map((entry) => {
    const hours = hoursBetween(entry.startTime, entry.endTime);
    return hours === undefined ? entry : { ...entry, hours };
  });
}

// The multer fields the service reads; the controller passes the uploaded file as is.
export type UploadedAttachment = { originalname: string; mimetype: string; size: number; buffer: Buffer };

type PricingFields = Pick<UpdateEventRequest, "pricingMode" | "sellingTotal" | "sellingPricePerGuest" | "guestCount">;
type PricingWrite = { sellingPricePerGuest?: number; sellingTotal?: number | null };

// Text fields the editor can clear; an empty value is stored as a REMOVE.
const CLEARABLE_TEXT = ["contactName", "contactPhone", "contactEmail", "deliveryAddress", "deliveryTime", "billingDetails", "invoiceRef"] as const;

// Drops undefined values so a spread never clears a stored field the caller did not send.
const definedEntries = <T extends object>(obj: T): Partial<T> =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;

type NonNullFields<T> = { [K in keyof T]: Exclude<T[K], null> };

// A null on create means "not set", so it is not stored as a NULL attribute.
const withoutNull = <T extends object>(obj: T): NonNullFields<T> =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null)) as NonNullFields<T>;

// Maps "" to null for the clearable text fields and drops the server-owned attachments key.
const sanitizeFields = <T extends object>(fields: T): T => {
  const copy = { ...fields } as Record<string, unknown>;
  delete copy.attachments;
  for (const key of CLEARABLE_TEXT) if (copy[key] === "") copy[key] = null;
  return copy as T;
};

const fillLineIds = (lines: IncomingLine[]): EventRecipeLine[] =>
  lines.map((l) => ({ ...l, lineId: l.lineId ?? randomUUID() }));

const fillTaskIds = (tasks: IncomingTask[]): EventTask[] =>
  tasks.map((t) => ({ ...t, taskId: t.taskId ?? randomUUID() }));

// Drops prepDate when it is null or equal to the event day; the attribute lives inside the array, so a top-level REMOVE cannot reach it.
function normalizeLines(lines: LooseLine[], eventDate: string): EventRecipeLine[] {
  const day = eventDate.slice(0, 10);
  return lines.map((line) => {
    if (line.prepDate && line.prepDate !== day) return line as EventRecipeLine;
    const copy = { ...line };
    delete copy.prepDate;
    return copy as EventRecipeLine;
  });
}

const isConditionFailure = (err: unknown) => (err as { name?: string }).name === "ConditionalCheckFailedException";

// Strictly later than the previous stamp so two writes in one millisecond never share it.
const nextStamp = (previous?: string): string => {
  const now = new Date().toISOString();
  if (!previous || now > previous || Number.isNaN(Date.parse(previous))) return now;
  return new Date(Date.parse(previous) + 1).toISOString();
};

const attachmentsOf = (event: AppEvent): EventAttachment[] => event.attachments ?? [];

@Injectable()
export class EventsService {
  private get table() { return this.ddb.tables.events; }

  constructor(private ddb: DdbService, private s3: S3Service, @Optional() private recipesService?: RecipesService) {}

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
    const { costSnapshot, ...rest } = sanitizeFields(data);
    const staff = staffWithDerivedHours(data.staff);
    const recipes = normalizeLines(fillLineIds(data.recipes), data.date);
    const event: AppEvent = {
      eventId: randomUUID(),
      ...withoutNull({ ...rest, ...this.applyPricing(undefined, data) }),
      ...(staff ? { staff } : {}),
      recipes,
      tasks: await this.withPreparationTasks(recipes, fillTaskIds(data.tasks), data.date),
      ...(costSnapshot && { costSnapshot: { ...costSnapshot, takenAt: now } }),
      nameLower: data.name.toLowerCase(),
      createdAt: now,
      updatedAt: now,
    };
    await this.ddb.put(this.table, event as unknown as Record<string, unknown>);
    return event;
  }

  // Guarded like the line and task writes, so a stale editor save cannot overwrite a status tick that landed in between.
  async update(eventId: string, fields: UpdateEventRequest): Promise<AppEvent> {
    return this.withFreshEvent(eventId, async (stored) => {
      const now = new Date().toISOString();
      const updates: Record<string, unknown> = { ...sanitizeFields(fields), ...this.applyPricing(stored, fields) };
      if (fields.staff !== undefined) updates.staff = staffWithDerivedHours(fields.staff);
      if (fields.name) updates.nameLower = fields.name.toLowerCase();
      let recipes = fields.recipes ? this.mergeLines(stored.recipes, fields.recipes) : undefined;
      let tasks = fields.tasks ? this.mergeTasks(tasksOf(stored), fields.tasks) : undefined;
      if (fields.date && fields.date !== stored.date.slice(0, 10)) {
        const shifted = shiftPrepDates(
          { date: stored.date, recipes: recipes ?? stored.recipes, tasks: tasks ?? tasksOf(stored) },
          fields.date,
        );
        recipes = shifted.recipes;
        tasks = shifted.tasks;
      }
      if (recipes) {
        recipes = normalizeLines(recipes, fields.date ?? stored.date);
        tasks = await this.withPreparationTasks(recipes, tasks ?? tasksOf(stored), fields.date ?? stored.date);
      }
      if (recipes) updates.recipes = normalizeLines(recipes, fields.date ?? stored.date);
      if (tasks) updates.tasks = tasks;
      if (fields.costSnapshot) updates.costSnapshot = { ...fields.costSnapshot, takenAt: now };
      updates.updatedAt = nextStamp(stored.updatedAt);
      await this.ddb.update(this.table, { eventId }, updates, this.guardFor(stored));
      return this.getOrFail(eventId);
    });
  }

  // Deletes the attachment objects best-effort before the item; an unknown event is a no-op.
  async delete(eventId: string): Promise<void> {
    const stored = (await this.ddb.get(this.table, { eventId })) as AppEvent | null;
    for (const a of stored ? attachmentsOf(stored) : []) await this.deleteObject(a.key);
    await this.ddb.delete(this.table, { eventId });
  }

  async addLine(eventId: string, line: AddEventLineRequest): Promise<AppEvent> {
    return this.withFreshEvent(eventId, async (stored) => {
      const recipes = [...stored.recipes, { ...line, lineId: randomUUID() }];
      const normalized = normalizeLines(recipes, stored.date);
      const tasks = await this.withPreparationTasks(normalized, tasksOf(stored), stored.date);
      return this.writeFields(stored, { recipes: normalized, tasks });
    });
  }

  async patchLine(eventId: string, lineId: string, patch: PatchEventLineRequest): Promise<AppEvent> {
    return this.withFreshEvent(eventId, (stored) => {
      const index = stored.recipes.findIndex((l) => l.lineId === lineId);
      if (index === -1) throw new NotFoundException("Line not found");
      const recipes = stored.recipes.map((l, i) => (i === index ? { ...l, ...definedEntries(patch) } : l));
      return this.writeFields(stored, { recipes: normalizeLines(recipes, stored.date) });
    });
  }

  async putLines(eventId: string, body: PutEventLinesRequest): Promise<AppEvent> {
    return this.withFreshEvent(eventId, async (stored) => {
      const byId = new Map(stored.recipes.map((l) => [l.lineId, l]));
      const missing = body.lines.filter((l) => !byId.has(l.lineId)).map((l) => l.lineId);
      if (missing.length > 0 || body.lines.length !== stored.recipes.length) {
        throw new ConflictException({ code: "LINES_CHANGED", missing });
      }
      const recipes = body.lines.map((l) => ({
        ...(byId.get(l.lineId) as EventRecipeLine),
        ...(l.course !== undefined && { course: l.course }),
      }));
      const normalized = normalizeLines(recipes, stored.date);
      const tasks = await this.withPreparationTasks(normalized, tasksOf(stored), stored.date);
      return this.writeFields(stored, { recipes: normalized, tasks });
    });
  }

  async removeLine(eventId: string, lineId: string): Promise<AppEvent> {
    return this.withFreshEvent(eventId, (stored) => {
      if (!stored.recipes.some((l) => l.lineId === lineId)) throw new NotFoundException("Line not found");
      return this.writeFields(stored, {
        recipes: stored.recipes.filter((l) => l.lineId !== lineId),
        tasks: tasksOf(stored).filter((task) => task.recipeLineId !== lineId),
      });
    });
  }

  async addTask(eventId: string, task: AddEventTaskRequest): Promise<AppEvent> {
    return this.withFreshEvent(eventId, async (stored) => {
      const tasks = tasksOf(stored);
      if (task.recipeLineId && task.preparationId && tasks.some((current) => current.recipeLineId === task.recipeLineId && current.preparationId === task.preparationId)) return stored;
      return this.writeFields(stored, { tasks: [...tasks, { ...task, taskId: randomUUID() }] });
    });
  }

  async patchTask(eventId: string, taskId: string, patch: PatchEventTaskRequest): Promise<AppEvent> {
    return this.withFreshEvent(eventId, (stored) => {
      const tasks = tasksOf(stored);
      const index = tasks.findIndex((t) => t.taskId === taskId);
      if (index === -1) throw new NotFoundException("Task not found");
      const next = tasks.map((t, i) => (i === index ? { ...t, ...definedEntries(patch) } : t));
      return this.writeFields(stored, { tasks: next });
    });
  }

  async removeTask(eventId: string, taskId: string): Promise<AppEvent> {
    return this.withFreshEvent(eventId, (stored) => {
      const tasks = tasksOf(stored);
      if (!tasks.some((t) => t.taskId === taskId)) throw new NotFoundException("Task not found");
      return this.writeFields(stored, { tasks: tasks.filter((t) => t.taskId !== taskId) });
    });
  }

  // Uploads to S3 first, then appends under the guard; the object is removed when the write fails.
  async addAttachment(eventId: string, file: UploadedAttachment): Promise<AppEvent> {
    return this.withFreshEvent(eventId, async (stored) => {
      const current = attachmentsOf(stored);
      if (current.length >= MAX_ATTACHMENTS) throw new BadRequestException(`${MAX_ATTACHMENTS} pièces jointes maximum`);
      const ext = ATTACHMENT_TYPES[file.mimetype];
      if (ext === undefined) throw new BadRequestException("Format non pris en charge");
      const attachmentId = randomUUID();
      const key = `event-files/${eventId}/${attachmentId}${ext}`;
      await this.s3.upload(key, file.buffer, file.mimetype);
      const attachment: EventAttachment = {
        attachmentId,
        key,
        name: file.originalname.trim().slice(0, 120) || `fichier${ext}`,
        contentType: file.mimetype,
        size: file.size,
        addedAt: new Date().toISOString(),
      };
      try {
        return await this.writeFields(stored, { attachments: [...current, attachment] });
      } catch (err) {
        await this.deleteObject(key);
        throw err;
      }
    });
  }

  async renameAttachment(eventId: string, attachmentId: string, name: string): Promise<AppEvent> {
    return this.withFreshEvent(eventId, (stored) => {
      const current = attachmentsOf(stored);
      if (!current.some((a) => a.attachmentId === attachmentId)) throw new NotFoundException("Attachment not found");
      const attachments = current.map((a) => (a.attachmentId === attachmentId ? { ...a, name } : a));
      return this.writeFields(stored, { attachments });
    });
  }

  async removeAttachment(eventId: string, attachmentId: string): Promise<AppEvent> {
    return this.withFreshEvent(eventId, async (stored) => {
      const current = attachmentsOf(stored);
      const target = current.find((a) => a.attachmentId === attachmentId);
      if (!target) throw new NotFoundException("Attachment not found");
      await this.deleteObject(target.key);
      return this.writeFields(stored, { attachments: current.filter((a) => a.attachmentId !== attachmentId) });
    });
  }

  async attachmentUrl(eventId: string, attachmentId: string): Promise<{ url: string }> {
    const stored = await this.getOrFail(eventId);
    const target = attachmentsOf(stored).find((a) => a.attachmentId === attachmentId);
    if (!target) throw new NotFoundException("Attachment not found");
    return { url: await this.s3.presignedUrl(target.key, { filename: target.name }) };
  }

  // In total mode the per-guest price is derived from the total; back in par_convive the total is removed.
  private applyPricing(stored: AppEvent | undefined, fields: PricingFields): PricingWrite {
    const mode = fields.pricingMode ?? stored?.pricingMode ?? "par_convive";
    if (mode === "total") {
      const touched = ["pricingMode", "sellingTotal", "guestCount", "sellingPricePerGuest"].some((k) => k in fields);
      if (!touched) return {};
      const total = fields.sellingTotal ?? stored?.sellingTotal ?? 0;
      const guests = (fields.guestCount ?? stored?.guestCount) || 1;
      return { sellingPricePerGuest: round2(total / guests) };
    }
    const hadTotal = stored?.pricingMode === "total" || stored?.sellingTotal !== undefined;
    if (!hadTotal && fields.sellingTotal === undefined) return {};
    return {
      sellingTotal: null,
      ...(fields.sellingPricePerGuest !== undefined && { sellingPricePerGuest: fields.sellingPricePerGuest }),
    };
  }

  // Best-effort: a missing object must not block the event write.
  private async deleteObject(key: string): Promise<void> {
    try {
      await this.s3.delete(key);
    } catch (err) {
      console.warn(JSON.stringify({ action: "deleteAttachmentObject", key, error: String(err) }));
    }
  }

  // Runs op on a fresh read and retries up to four times, with a short jittered pause, when another write moved updatedAt in between.
  private async withFreshEvent(eventId: string, op: (stored: AppEvent) => Promise<AppEvent>): Promise<AppEvent> {
    for (let attempt = 0; ; attempt++) {
      const stored = await this.getOrFail(eventId);
      try {
        return await op(stored);
      } catch (err) {
        if (!isConditionFailure(err)) throw err;
        if (attempt >= 4) throw new ConflictException({ code: "LINES_CHANGED", missing: [] });
        await new Promise((r) => setTimeout(r, 20 + Math.random() * 30));
      }
    }
  }

  // Condition that passes only when updatedAt is still the one read; rows written before the field existed must still lack it.
  private guardFor(stored: AppEvent): UpdateOptions {
    return stored.updatedAt
      ? { condition: "#ua = :expected", names: { "#ua": "updatedAt" }, values: { ":expected": stored.updatedAt } }
      : { condition: "attribute_not_exists(#ua)", names: { "#ua": "updatedAt" } };
  }

  // Writes the arrays only when updatedAt still matches the read they were computed from.
  private async writeFields(
    stored: AppEvent,
    fields: { recipes?: EventRecipeLine[]; tasks?: EventTask[]; attachments?: EventAttachment[] },
  ): Promise<AppEvent> {
    const updates = { ...definedEntries(fields), updatedAt: nextStamp(stored.updatedAt) };
    await this.ddb.update(this.table, { eventId: stored.eventId }, updates, this.guardFor(stored));
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

  // Mirrors mergeLines for tasks.
  private mergeTasks(stored: EventTask[], incoming: IncomingTask[]): EventTask[] {
    const byId = new Map(stored.map((t) => [t.taskId, t]));
    return incoming.map((t) => {
      const prev = t.taskId ? byId.get(t.taskId) : undefined;
      if (!prev) return { ...t, taskId: randomUUID() };
      return { ...prev, ...definedEntries(t), taskId: prev.taskId };
    });
  }

  private async withPreparationTasks(lines: EventRecipeLine[], existingTasks: EventTask[], eventDate: string): Promise<EventTask[]> {
    const lineIds = new Set(lines.map((line) => line.lineId));
    const tasks = existingTasks.filter((task) => !task.recipeLineId || lineIds.has(task.recipeLineId));
    const existingByLine = new Map<string, Set<string>>();
    for (const task of tasks) {
      if (!task.recipeLineId || !task.preparationId) continue;
      const ids = existingByLine.get(task.recipeLineId) ?? new Set<string>();
      ids.add(task.preparationId);
      existingByLine.set(task.recipeLineId, ids);
    }
    const recipes = await this.recipesService?.getPreparationDefinitions(lines.map((line) => line.recipeId)) ?? [];
    for (const line of lines) {
      const recipe = recipes.find((candidate) => candidate.recipeId === line.recipeId);
      if (!recipe?.preparations?.length) continue;
      const generated = recipePreparationTasks(recipe, line, eventDate, [...(existingByLine.get(line.lineId) ?? [])]);
      tasks.push(...generated.map((task) => ({ ...task, taskId: randomUUID() })));
    }
    return tasks;
  }

  // Backfills lineId on events written before the field existed, once per event; tasks default to [] in memory only.
  private async withLineIds(event: AppEvent): Promise<AppEvent> {
    const lines = (event.recipes ?? []) as IncomingLine[];
    if (lines.every((l) => l.lineId)) return { ...event, recipes: lines as EventRecipeLine[], tasks: tasksOf(event) };
    const recipes = fillLineIds(lines);
    try {
      await this.ddb.update(this.table, { eventId: event.eventId }, { recipes }, {
        condition: "attribute_not_exists(#r[0].#lid)",
        names: { "#r": "recipes", "#lid": "lineId" },
      });
    } catch (err) {
      if (!isConditionFailure(err)) throw err;
      const fresh = (await this.ddb.get(this.table, { eventId: event.eventId })) as AppEvent | null;
      return fresh ? { ...fresh, tasks: tasksOf(fresh) } : { ...event, recipes, tasks: tasksOf(event) };
    }
    return { ...event, recipes, tasks: tasksOf(event) };
  }
}
