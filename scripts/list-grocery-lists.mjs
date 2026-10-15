// Read-only diagnostic: prints every grocery list with its events and range, and counts the lists without eventIds.
// A list without eventIds covers an event when its range contains the event date; a list with eventIds [] covers
// nothing, so the week box reports the courses as not created for that week. Node 20+, fetch only, nothing written.
// API base from API (default http://localhost:3101), credentials from SMOKE_EMAIL and SMOKE_PASSWORD
// (defaults smoke@example.com / smoke), same as seed-local.mjs.

const API = process.env.API ?? "http://localhost:3101";
const EMAIL = process.env.SMOKE_EMAIL ?? "smoke@example.com";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "smoke";

let token = "";

async function call(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { "content-type": "application/json", ...(token && { authorization: `Bearer ${token}` }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

async function must(method, path, body) {
  const r = await call(method, path, body);
  if (r.status < 200 || r.status >= 300) {
    throw new Error(`${method} ${path} -> ${r.status}: ${typeof r.body === "string" ? r.body : JSON.stringify(r.body)}`);
  }
  return r.body;
}

const login = await call("POST", "/api/admin/auth/login", { email: EMAIL, password: PASSWORD });
if (login.status !== 201 || typeof login.body?.token !== "string") {
  console.error(`login failed: ${login.status} ${JSON.stringify(login.body)}`);
  process.exit(1);
}
token = login.body.token;

const lists = await must("GET", "/api/admin/grocery-lists");
lists.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));

let withoutEvents = 0;
let withoutEventsWithRange = 0;
let emptyEvents = 0;
let withoutRange = 0;
for (const l of lists) {
  const hasEvents = Array.isArray(l.eventIds);
  const hasRange = Boolean(l.range?.from && l.range?.to);
  if (!hasEvents) { withoutEvents++; if (hasRange) withoutEventsWithRange++; }
  if (hasEvents && l.eventIds.length === 0) emptyEvents++;
  if (!hasRange) withoutRange++;
  const created = typeof l.createdAt === "string" ? l.createdAt.slice(0, 10) : "-";
  const events = hasEvents ? `${l.eventIds.length} événement(s)` : "sans événements";
  const range = hasRange ? `plage ${l.range.from} → ${l.range.to}` : "sans plage";
  console.log(`${created} · ${l.title} · ${events} · ${range}`);
}

console.log(`${lists.length} liste(s)`);
console.log(`${withoutEvents} sans événements, dont ${withoutEventsWithRange} avec une plage (couvrent les événements de la plage) et ${withoutEvents - withoutEventsWithRange} sans plage (ne couvrent rien)`);
console.log(`${emptyEvents} avec eventIds vide (ne couvrent rien), ${withoutRange} sans plage`);
