import { Controller, Post, Body, Req, UnauthorizedException, BadRequestException, UseGuards } from "@nestjs/common";
import { compare } from "bcryptjs";
import { decode, sign, verify } from "jsonwebtoken";
import type { Request } from "express";
import { z } from "zod";
import { ConfigService } from "../config/config.service";
import { AdminGuard } from "./admin.guard";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  remember: z.boolean().optional().default(false),
});

const credentialsSchema = z.array(z.object({ email: z.string(), hash: z.string() }));

const payloadSchema = z.object({ email: z.string().min(1), remember: z.boolean().optional().default(false) });

export const TOKEN_TTL_REMEMBER_S = 30 * 24 * 3600;
export const TOKEN_TTL_S = 24 * 3600;

export type AuthTokenResponse = { ok: true; token: string; expiresAt: string };

@Controller("admin/auth")
export class AuthController {
  constructor(private config: ConfigService) {}

  @Post("login")
  async login(@Body() body: unknown): Promise<AuthTokenResponse> {
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Invalid request");

    const { email, password, remember } = parsed.data;

    const rawCredentials = this.config.get("ADMIN_CREDENTIALS");
    const credentials = credentialsSchema.parse(JSON.parse(rawCredentials));

    const admin = credentials.find((c) => c.email.toLowerCase() === email.toLowerCase());
    const passwordMatch = admin ? await compare(password, admin.hash) : false;

    if (!admin || !passwordMatch) throw new UnauthorizedException("Invalid credentials");

    console.log(JSON.stringify({ level: "info", action: "adminLogin", email: admin.email }));
    return this.issue(admin.email, remember);
  }

  // Verified a second time here so the claims can be read to reissue the same class.
  @Post("refresh")
  @UseGuards(AdminGuard)
  refresh(@Req() req: Request): AuthTokenResponse {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) throw new UnauthorizedException("Missing token");

    let decoded: unknown;
    try {
      decoded = verify(authHeader.slice(7), this.config.get("JWT_SECRET"));
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }

    const payload = payloadSchema.safeParse(decoded);
    if (!payload.success) throw new UnauthorizedException("Invalid token payload");

    console.log(JSON.stringify({ level: "info", action: "adminRefresh", email: payload.data.email }));
    return this.issue(payload.data.email, payload.data.remember);
  }

  private issue(email: string, remember: boolean): AuthTokenResponse {
    const ttl = remember ? TOKEN_TTL_REMEMBER_S : TOKEN_TTL_S;
    const token = sign({ email, remember }, this.config.get("JWT_SECRET"), { expiresIn: ttl });
    const exp = (decode(token) as { exp: number }).exp;
    return { ok: true, token, expiresAt: new Date(exp * 1000).toISOString() };
  }
}
