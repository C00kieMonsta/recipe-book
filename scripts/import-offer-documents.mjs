// Imports Dalia's seven 2026 offer documents into a stack through the API. Node 20+, fetch only.
// API base from API (default http://localhost:3101), credentials from SMOKE_EMAIL and SMOKE_PASSWORD
// (defaults smoke@example.com / smoke). Safe to re-run: a document whose title and year already exist is skipped.

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

const result = await must("POST", "/api/admin/offer-documents/import-2026");
const created = Array.isArray(result?.created) ? result.created : [];
const skipped = Array.isArray(result?.skipped) ? result.skipped : [];

// The endpoint answers with titles; the list gives the year printed after each title.
const documents = await must("GET", "/api/admin/offer-documents");
const yearOf = (title) => documents.find((d) => d.title === title)?.year;
const label = (title) => (yearOf(title) ? `${title} ${yearOf(title)}` : title);

for (const title of created) console.log(`${label(title)} · créée`);
for (const title of skipped) console.log(`${label(title)} · déjà présente`);
console.log(`${created.length} créée(s), ${skipped.length} déjà présente(s), ${documents.length} document(s) au total`);
