import { BadRequestException, Body, Controller, Post, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { applyRequestSchema, chatRequestSchema } from "@packages/types";
import { AdminGuard } from "../auth/admin.guard";
import { AssistantService } from "./assistant.service";

@UseGuards(AdminGuard)
@Controller("admin/assistant")
export class AssistantController {
  constructor(private assistant: AssistantService) {}

  // NDJSON: one event per line. A 400 or 503 is still a plain HTTP error because nothing is written before the generator exists.
  @Post("chat")
  async chat(@Body() body: unknown, @Res() res: Response): Promise<void> {
    const parsed = chatRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);

    const aborter = new AbortController();
    res.on("close", () => aborter.abort());

    const events = await this.assistant.stream(parsed.data, aborter.signal);

    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    for await (const event of events) {
      if (aborter.signal.aborted) break;
      res.write(`${JSON.stringify(event)}\n`);
    }
    if (!res.writableEnded) res.end();
  }

  @Post("apply")
  async apply(@Body() body: unknown) {
    const parsed = applyRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return { results: await this.assistant.apply(parsed.data.actions) };
  }
}
