// Reads the JWT payload without verifying it; the server stays the judge of validity.
export const AUTH_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

export interface TokenInfo {
  email: string;
  remember: boolean;
  iat: number;
  exp: number;
}

function decodeBase64Url(part: string): string {
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function tokenInfo(token: string | null | undefined): TokenInfo | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(decodeBase64Url(parts[1])) as Record<string, unknown>;
    if (typeof payload.email !== "string" || typeof payload.iat !== "number" || typeof payload.exp !== "number") return null;
    return { email: payload.email, remember: payload.remember === true, iat: payload.iat, exp: payload.exp };
  } catch {
    return null;
  }
}

// True once less than half of the token's life is left, so an active session is renewed well before it expires.
export function shouldRefresh(info: TokenInfo | null, nowMs: number = Date.now()): boolean {
  if (!info) return false;
  const life = info.exp - info.iat;
  if (life <= 0) return false;
  const remaining = info.exp - nowMs / 1000;
  return remaining < life / 2;
}
