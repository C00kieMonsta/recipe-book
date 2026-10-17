import { Controller, Get, Post, Query, Res, UnauthorizedException, UseGuards } from "@nestjs/common";
import { pipeline } from "node:stream/promises";
import type { Response } from "express";
import { decode, sign, verify } from "jsonwebtoken";
import { AdminGuard } from "../auth/admin.guard";
import { ConfigService } from "../config/config.service";
import { BackupPreflight, BackupService } from "./backup.service";

export const BACKUP_SCOPE = "backup";
export const BACKUP_TOKEN_TTL_S = 120;

export type BackupTicket = BackupPreflight & { token: string; expiresAt: string };

// la-table-amelie-2026-10-17-1030.zip, in UTC.
export function backupFilename(now: Date): string {
  const stamp = now.toISOString().slice(0, 16).replace("T", "-").replace(":", "");
  return `la-table-amelie-${stamp}.zip`;
}

@Controller("admin/backup")
export class BackupController {
  constructor(private backup: BackupService, private config: ConfigService) {}

  // Checks the bucket can be listed, then answers a ticket the browser puts in the download URL.
  @Post()
  @UseGuards(AdminGuard)
  async prepare(): Promise<BackupTicket> {
    const summary = await this.backup.preflight();
    const token = sign({ scope: BACKUP_SCOPE }, this.config.get("JWT_SECRET"), { expiresIn: BACKUP_TOKEN_TTL_S });
    const exp = (decode(token) as { exp: number }).exp;
    console.log(JSON.stringify({ level: "info", action: "backupPrepare", ...summary }));
    return { ...summary, token, expiresAt: new Date(exp * 1000).toISOString() };
  }

  // A navigation cannot carry the Authorization header, so the ticket travels in the query string.
  @Get()
  async download(@Query("token") token: unknown, @Res() res: Response): Promise<void> {
    this.verifyTicket(token);
    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${backupFilename(new Date())}"`,
      "Cache-Control": "private, no-store",
      // nginx and CloudFront pass the chunks along instead of spooling the archive.
      "X-Accel-Buffering": "no",
    });
    try {
      await pipeline(this.backup.write(), res);
    } catch (err) {
      console.error(JSON.stringify({ action: "backupDownload", error: String(err) }));
    }
  }

  private verifyTicket(token: unknown): void {
    if (typeof token !== "string" || token === "") throw new UnauthorizedException("Missing token");
    let payload: unknown;
    try {
      payload = verify(token, this.config.get("JWT_SECRET"));
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }
    if ((payload as { scope?: unknown } | null)?.scope !== BACKUP_SCOPE) throw new UnauthorizedException("Invalid token");
  }
}
