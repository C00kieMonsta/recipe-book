import { UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { hashSync } from "bcryptjs";
import { decode, sign } from "jsonwebtoken";
import type { ConfigService } from "../config/config.service";
import { AdminGuard } from "./admin.guard";
import { AuthController, TOKEN_TTL_REMEMBER_S, TOKEN_TTL_S } from "./auth.controller";

const JWT_SECRET = "test-secret-with-at-least-thirty-two-characters";
const EMAIL = "amelie@example.com";
const PASSWORD = "correct horse battery staple";

type Payload = { email: string; remember: boolean; iat: number; exp: number };

const fakeConfig = {
  get: (key: string) => {
    if (key === "JWT_SECRET") return JWT_SECRET;
    if (key === "ADMIN_CREDENTIALS") return JSON.stringify([{ email: EMAIL, hash: hashSync(PASSWORD, 4) }]);
    throw new Error(`unexpected key ${key}`);
  },
} as unknown as ConfigService;

const requestWith = (token: string) => ({ headers: { authorization: `Bearer ${token}` } }) as never;

const contextWith = (token?: string) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ headers: token === undefined ? {} : { authorization: `Bearer ${token}` } }) }),
  }) as unknown as ExecutionContext;

const read = (token: string) => decode(token) as Payload;

describe("AuthController", () => {
  let controller: AuthController;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    controller = new AuthController(fakeConfig);
    logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => logSpy.mockRestore());

  describe("login", () => {
    it("signs a 24 h token with remember false by default", async () => {
      const res = await controller.login({ email: EMAIL, password: PASSWORD });
      expect(res.ok).toBe(true);
      const payload = read(res.token);
      expect(payload.email).toBe(EMAIL);
      expect(payload.remember).toBe(false);
      expect(payload.exp - payload.iat).toBe(TOKEN_TTL_S);
      expect(payload.exp - payload.iat).toBe(86400);
      expect(res.expiresAt).toBe(new Date(payload.exp * 1000).toISOString());
    });

    it("signs a 30 day token when remember is true", async () => {
      const res = await controller.login({ email: EMAIL, password: PASSWORD, remember: true });
      const payload = read(res.token);
      expect(payload.remember).toBe(true);
      expect(payload.exp - payload.iat).toBe(TOKEN_TTL_REMEMBER_S);
      expect(payload.exp - payload.iat).toBe(2592000);
    });

    it("rejects a wrong password with 401", async () => {
      await expect(controller.login({ email: EMAIL, password: "nope" })).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it("logs adminLogin without the token", async () => {
      const res = await controller.login({ email: EMAIL, password: PASSWORD });
      const line = logSpy.mock.calls.map((c) => String(c[0])).find((l) => l.includes("adminLogin"));
      expect(line).toBeDefined();
      expect(JSON.parse(line as string)).toEqual({ level: "info", action: "adminLogin", email: EMAIL });
      expect(line).not.toContain(res.token);
    });
  });

  describe("refresh", () => {
    it("returns a fresh remember token with a later exp", async () => {
      const old = sign({ email: EMAIL, remember: true }, JWT_SECRET, { expiresIn: TOKEN_TTL_REMEMBER_S - 3600 });
      const res = controller.refresh(requestWith(old));
      expect(res.ok).toBe(true);
      expect(res.token).not.toBe(old);
      const before = read(old);
      const after = read(res.token);
      expect(after.exp).toBeGreaterThan(before.exp);
      expect(after.remember).toBe(true);
      expect(after.email).toBe(EMAIL);
      expect(after.exp - after.iat).toBe(TOKEN_TTL_REMEMBER_S);
      expect(res.expiresAt).toBe(new Date(after.exp * 1000).toISOString());
    });

    it("keeps the short class for a token without remember", () => {
      const old = sign({ email: EMAIL, remember: false }, JWT_SECRET, { expiresIn: 60 });
      const after = read(controller.refresh(requestWith(old)).token);
      expect(after.remember).toBe(false);
      expect(after.exp - after.iat).toBe(TOKEN_TTL_S);
    });

    it("logs adminRefresh without the token", () => {
      const old = sign({ email: EMAIL, remember: false }, JWT_SECRET, { expiresIn: 60 });
      const res = controller.refresh(requestWith(old));
      const line = logSpy.mock.calls.map((c) => String(c[0])).find((l) => l.includes("adminRefresh"));
      expect(JSON.parse(line as string)).toEqual({ level: "info", action: "adminRefresh", email: EMAIL });
      expect(line).not.toContain(old);
      expect(line).not.toContain(res.token);
    });

    it("rejects a token signed by another secret with 401", () => {
      const forged = sign({ email: EMAIL, remember: true }, "another-secret-that-is-also-long-enough-for-hs256", { expiresIn: 60 });
      expect(() => new AdminGuard(fakeConfig).canActivate(contextWith(forged))).toThrow(UnauthorizedException);
      expect(() => controller.refresh(requestWith(forged))).toThrow(UnauthorizedException);
    });

    it("rejects an expired token with 401", () => {
      const expired = sign({ email: EMAIL, remember: true }, JWT_SECRET, { expiresIn: -10 });
      expect(() => controller.refresh(requestWith(expired))).toThrow(UnauthorizedException);
    });

    it("rejects a valid token whose payload has no email with 401", () => {
      const noEmail = sign({ remember: true }, JWT_SECRET, { expiresIn: 60 });
      expect(new AdminGuard(fakeConfig).canActivate(contextWith(noEmail))).toBe(true);
      expect(() => controller.refresh(requestWith(noEmail))).toThrow(UnauthorizedException);
    });

    it("rejects a missing Authorization header with 401", () => {
      expect(() => controller.refresh({ headers: {} } as never)).toThrow(UnauthorizedException);
    });
  });
});

describe("AdminGuard", () => {
  const guard = new AdminGuard(fakeConfig);

  it("passes a valid unexpired token", () => {
    const token = sign({ email: EMAIL, remember: false }, JWT_SECRET, { expiresIn: TOKEN_TTL_S });
    expect(guard.canActivate(contextWith(token))).toBe(true);
  });

  it("rejects a token signed with expiresIn -10s", () => {
    const expired = sign({ email: EMAIL, remember: true }, JWT_SECRET, { expiresIn: -10 });
    expect(() => guard.canActivate(contextWith(expired))).toThrow(UnauthorizedException);
  });

  it("rejects a missing header", () => {
    expect(() => guard.canActivate(contextWith())).toThrow(UnauthorizedException);
  });
});
