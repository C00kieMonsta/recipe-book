// Only an in-app path is honoured as a return target; the login page itself is refused so a redirect cannot loop.
export function safeReturn(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;
  if (raw === "/login" || raw.startsWith("/login?")) return null;
  return raw;
}
