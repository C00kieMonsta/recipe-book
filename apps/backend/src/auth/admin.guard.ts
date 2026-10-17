import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { verify, type JwtPayload } from "jsonwebtoken";
import type { Request } from "express";
import { ConfigService } from "../config/config.service";

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) throw new UnauthorizedException("Missing token");

    const token = authHeader.slice(7);
    let payload: string | JwtPayload;
    try {
      payload = verify(token, this.config.get("JWT_SECRET"));
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }
    // A backup ticket is signed with the same secret but opens one download, not a session.
    if (typeof payload === "object" && "scope" in payload) throw new UnauthorizedException("Invalid or expired token");
    return true;
  }
}
