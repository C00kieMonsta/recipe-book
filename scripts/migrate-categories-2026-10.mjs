// Rewrites the legacy categories Zakouskis and Mignardises into Apéritif and Dessert everywhere they are stored:
// recipes, event lines, offer lines, client template lines and the settings courses list. Node 20+, fetch only.
// Dry run by default: prints one line per pending item and the counts. With --apply it writes them through the
// existing PATCH routes, one event line at a time (guarded per write). Idempotent: a second --apply run prints
// "rien à faire" for every data step and writes the settings list again (same value), as merge-categories.mjs does.
// API base from API (default http://localhost:3101), credentials from SMOKE_EMAIL and SMOKE_PASSWORD
// (defaults smoke@example.com / smoke), same as seed-local.mjs.

const API = process.env.API ?? "http://localhost:3101";
const EMAIL = process.env.SMOKE_EMAIL ?? "smoke@example.com";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "smoke";
const APPLY = process.argv.includes("--apply");

// Mirror of LEGACY_CATEGORY_ALIASES in packages/types: any case, singular or plural.
const ALIAS = /^(zakouskis?|mignardises?)$/i;
function aliasOf(value) {
  if (typeof value !== "string") return undefined;
  const m = ALIAS.exec(value.trim());
  if (!m) return undefined;
  return m[1].toLowerCase().startsWith("z") ? "Apéritif" : "Dessert";
}
const aliasCategory = (value) => aliasOf(value) ?? value;

// Mirror of recipeCategoryOf before the alias. The API serves category already aliased, and the stored category is
// mirrored into type on every write (merge-categories.mjs), so the raw value is read from type first, then from the
// legacy fields of a recipe that stores no category yet. A recipe written by this script reads its new category from
// type on the next run, so a stale defaultCourse never flags it again.
const FALLBACK_COURSE = "Autre";
const LEGACY_TYPE_TO_CATEGORY = { Lunch: "Plat", "Menu semaine": "Plat", Zakouskis: "Apéritif", Mignardises: "Dessert" };
function rawCategoryOf(r) {
  if (aliasOf(r.category)) return r.category;
  if (r.type && aliasCategory(r.type) === r.category) return r.type;
  if (r.defaultCourse && r.defaultCourse !== FALLBACK_COURSE) return r.defaultCourse;
  if (r.type) return LEGACY_TYPE_TO_CATEGORY[r.type] ?? r.type;
  return FALLBACK_COURSE;
}

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

// Copies the listed keys when they are defined, so a strict schema never sees an unknown or null key.
function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null) out[k] = obj[k];
  return out;
}

const shortDate = (iso) => (typeof iso === "string" && iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "-");
const plural = (n, word) => `${n} ${word}(s)`;
// "1 ligne", "2 lignes": the per-item lines; the summary keeps the "(s)" form.
const count = (n, word) => `${n} ${word}${n > 1 ? "s" : ""}`;
// "Mignardises → Dessert", or "Zakouskis → Apéritif, Mignardises → Dessert" when a group mixes both.
const changes = (courses) => [...new Set(courses)].map((c) => `${c} → ${aliasOf(c)}`).join(", ");

const login = await call("POST", "/api/admin/auth/login", { email: EMAIL, password: PASSWORD });
if (login.status !== 201 || typeof login.body?.token !== "string") {
  console.error(`login failed: ${login.status} ${JSON.stringify(login.body)}`);
  process.exit(1);
}
token = login.body.token;

// 1. Recipes
console.log("recettes");
const recipes = await must("GET", "/api/admin/recipes");
recipes.sort((a, b) => a.name.localeCompare(b.name, "fr"));
const recipeNameById = new Map(recipes.map((r) => [r.recipeId, r.name]));
const pendingRecipes = [];
for (const r of recipes) {
  const raw = rawCategoryOf(r);
  const target = aliasOf(raw);
  if (!target) continue;
  pendingRecipes.push({ recipeId: r.recipeId, name: r.name, category: target });
  console.log(`${r.name} · ${raw} → ${target}`);
}
if (pendingRecipes.length === 0) console.log("rien à faire");

// 2. Event lines
console.log("lignes d'événement");
const events = await must("GET", "/api/admin/events");
events.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "fr"));
const pendingLines = [];
for (const e of events) {
  for (const line of e.recipes ?? []) {
    const target = aliasOf(line.course);
    if (!target) continue;
    const recipeName = recipeNameById.get(line.recipeId) ?? line.recipeId;
    pendingLines.push({ eventId: e.eventId, eventName: e.name, lineId: line.lineId, recipeName, course: target });
    console.log(`${e.name} · ${shortDate(e.date)} · ligne ${recipeName} · ${line.course} → ${target}`);
  }
}
if (pendingLines.length === 0) console.log("rien à faire");

// 3. Offers
console.log("formules");
const offers = await must("GET", "/api/admin/offers");
offers.sort((a, b) => a.name.localeCompare(b.name, "fr"));
const pendingOffers = [];
for (const o of offers) {
  const lines = o.lines ?? [];
  const hit = lines.filter((l) => aliasOf(l.course));
  if (hit.length === 0) continue;
  const next = lines.map((l) => ({ ...pick(l, ["recipeId", "portionsPerGuest", "course", "notes"]), ...(typeof l.course === "string" && { course: aliasCategory(l.course) }) }));
  pendingOffers.push({ offerId: o.offerId, name: o.name, lines: next });
  console.log(`${o.name} · ${count(hit.length, "ligne")} · ${changes(hit.map((l) => l.course))}`);
}
if (pendingOffers.length === 0) console.log("rien à faire");

// 4. Client templates
console.log("modèles client");
const TEMPLATE_KEYS = ["templateId", "name", "weekday", "guestCount", "sellingPricePerGuest", "prestationType", "vatRate", "notes", "assignedTo"];
const pendingClients = [];
let templatesPending = 0;
const clientsRes = await call("GET", "/api/admin/clients");
if (clientsRes.status === 503) {
  console.log("clients non configurés, étape ignorée");
} else {
  if (clientsRes.status !== 200) throw new Error(`GET /api/admin/clients -> ${clientsRes.status}: ${JSON.stringify(clientsRes.body)}`);
  const clients = [...clientsRes.body].sort((a, b) => a.name.localeCompare(b.name, "fr"));
  for (const c of clients) {
    const templates = c.templates ?? [];
    let hits = 0;
    for (const t of templates) {
      const hit = (t.recipes ?? []).filter((l) => aliasOf(l.course));
      if (hit.length === 0) continue;
      hits++;
      console.log(`${c.name} · modèle ${t.name} · ${count(hit.length, "ligne")} · ${changes(hit.map((l) => l.course))}`);
    }
    if (hits === 0) continue;
    templatesPending += hits;
    // The whole array is written, every template copied on the keys of clientTemplateSchema (strict).
    const next = templates.map((t) => ({
      ...pick(t, TEMPLATE_KEYS),
      recipes: (t.recipes ?? []).map((l) => ({ ...pick(l, ["recipeId", "portions", "course", "notes"]), ...(typeof l.course === "string" && { course: aliasCategory(l.course) }) })),
      extraCosts: (t.extraCosts ?? []).map((x) => pick(x, ["label", "amount", "kind"])),
    }));
    pendingClients.push({ clientId: c.clientId, name: c.name, templates: next });
  }
  if (pendingClients.length === 0) console.log("rien à faire");
}

// 5. Settings courses: served without the alias keys already; writing the served list persists the removal.
console.log("paramètres");
const settings = await must("GET", "/api/admin/settings");
const courses = Array.isArray(settings.courses) && settings.courses.length > 0 ? settings.courses : [];
console.log(`courses : ${courses.join(", ")}`);

// 6. Summary
console.log(`${plural(pendingRecipes.length, "recette")}, ${plural(pendingLines.length, "ligne")} d'événement, ${plural(pendingOffers.length, "formule")}, ${plural(templatesPending, "modèle")} client à mettre à jour`);

if (!APPLY) {
  console.log("dry run, nothing written (add --apply)");
  process.exit(0);
}

for (const p of pendingRecipes) {
  await must("PATCH", `/api/admin/recipes/${p.recipeId}`, { category: p.category });
  console.log(`written ${p.name} → ${p.category}`);
}

// One PATCH per line, guarded by the server on updatedAt. On 409 LINES_CHANGED the event is re-read once and the
// line retried; a second 409 is reported and the run continues, a later --apply picks the line up.
async function patchLine(p) {
  const path = `/api/admin/events/${p.eventId}/lines/${p.lineId}`;
  const first = await call("PATCH", path, { course: p.course });
  if (first.status === 200) return "written";
  if (first.status === 404) return "ligne disparue, ignorée";
  if (first.status !== 409) throw new Error(`PATCH ${path} -> ${first.status}: ${JSON.stringify(first.body)}`);
  const fresh = await must("GET", `/api/admin/events/${p.eventId}`);
  const line = (fresh.recipes ?? []).find((l) => l.lineId === p.lineId);
  if (!line) return "ligne disparue, ignorée";
  if (!aliasOf(line.course)) return "déjà à jour";
  const second = await call("PATCH", path, { course: p.course });
  if (second.status === 200) return "written";
  if (second.status === 409) return "conflit, à relancer";
  throw new Error(`PATCH ${path} -> ${second.status}: ${JSON.stringify(second.body)}`);
}
let linesWritten = 0;
let linesConflict = 0;
for (const p of pendingLines) {
  const outcome = await patchLine(p);
  if (outcome === "written") linesWritten++;
  if (outcome === "conflit, à relancer") linesConflict++;
  console.log(`${outcome} ${p.eventName} · ligne ${p.recipeName} → ${p.course}`);
}

for (const p of pendingOffers) {
  await must("PATCH", `/api/admin/offers/${p.offerId}`, { lines: p.lines });
  console.log(`written ${p.name} · ${plural(p.lines.length, "ligne")}`);
}

for (const p of pendingClients) {
  await must("PATCH", `/api/admin/clients/${p.clientId}`, { templates: p.templates });
  console.log(`written ${p.name} · ${plural(p.templates.length, "modèle")}`);
}

if (courses.length > 0) {
  await must("PATCH", "/api/admin/settings", { courses });
  console.log(`settings courses written (${courses.length})`);
}

const total = pendingRecipes.length + linesWritten + pendingOffers.length + pendingClients.length;
console.log(total === 0 ? "rien à faire" : `done: ${total} élément(s) mis à jour${linesConflict > 0 ? `, ${plural(linesConflict, "ligne")} en conflit, à relancer` : ""}`);
