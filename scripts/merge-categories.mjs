// Persists the merged recipe category on every recipe and the served category list in settings. Node 20+, fetch only.
// Dry run by default: prints one line per recipe "name · type · defaultCourse → category" and the resulting courses list.
// With --apply it PATCHes every recipe whose category is not stored yet and PATCHes settings { courses } with the served list.
// Idempotent: a second run with --apply writes the settings list again (same value) and no recipe.
// API base from API (default http://localhost:3101), credentials from SMOKE_EMAIL and SMOKE_PASSWORD
// (defaults smoke@example.com / smoke), same as seed-local.mjs.

const API = process.env.API ?? "http://localhost:3101";
const EMAIL = process.env.SMOKE_EMAIL ?? "smoke@example.com";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "smoke";
const APPLY = process.argv.includes("--apply");

// Mirror of recipeCategoryOf in packages/types, for an API build that does not serve category yet.
const FALLBACK_COURSE = "Autre";
const LEGACY_TYPE_TO_CATEGORY = { Lunch: "Plat", "Menu semaine": "Plat" };
function categoryOf(r) {
  if (r.category) return r.category;
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

const login = await call("POST", "/api/admin/auth/login", { email: EMAIL, password: PASSWORD });
if (login.status !== 201 || typeof login.body?.token !== "string") {
  console.error(`login failed: ${login.status} ${JSON.stringify(login.body)}`);
  process.exit(1);
}
token = login.body.token;

const settings = await must("GET", "/api/admin/settings");
const recipes = await must("GET", "/api/admin/recipes");
recipes.sort((a, b) => a.name.localeCompare(b.name, "fr"));

// The API serves category on every read, so a stored one is only visible through type, which the service writes equal to it.
const pending = [];
for (const r of recipes) {
  const category = categoryOf(r);
  const stored = r.type === category;
  if (!stored) pending.push({ recipeId: r.recipeId, name: r.name, category });
  console.log(`${r.name} · ${r.type ?? "-"} · ${r.defaultCourse ?? "-"} → ${category}${stored ? "" : "  (à écrire)"}`);
}
const courses = Array.isArray(settings.courses) && settings.courses.length > 0 ? settings.courses : [];
console.log(`courses: ${courses.join(", ")}`);
console.log(`${recipes.length} recette(s), ${pending.length} à mettre à jour`);

if (!APPLY) {
  console.log("dry run, nothing written (add --apply)");
  process.exit(0);
}

for (const p of pending) {
  await must("PATCH", `/api/admin/recipes/${p.recipeId}`, { category: p.category });
  console.log(`written ${p.name} → ${p.category}`);
}
if (courses.length > 0) {
  await must("PATCH", "/api/admin/settings", { courses });
  console.log(`settings courses written (${courses.length})`);
}
console.log(pending.length === 0 ? "nothing to do for recipes" : `done: ${pending.length} recette(s) mise(s) à jour`);
