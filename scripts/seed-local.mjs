// Seeds a realistic week for a Belgian caterer into the local stack. Node 20+, fetch only.
// Section 8 imports the seven 2026 offer documents and uploads placeholder brand images.
// API base from API (default http://localhost:3101), credentials from SMOKE_EMAIL and SMOKE_PASSWORD
// (defaults smoke@example.com / smoke). Refuses to run on a database that already has recipes unless FORCE=1.
// "Today" is Monday 2026-10-12.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const API = process.env.API ?? "http://localhost:3101";
const EMAIL = process.env.SMOKE_EMAIL ?? "smoke@example.com";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "smoke";
const FORCE = process.env.FORCE === "1";

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

// Same as call, but throws on a non-2xx status with the path and body attached.
async function must(method, path, body) {
  const r = await call(method, path, body);
  if (r.status < 200 || r.status >= 300) {
    const err = new Error(`${method} ${path} -> ${r.status}: ${typeof r.body === "string" ? r.body : JSON.stringify(r.body)}`);
    err.response = r;
    throw err;
  }
  return r.body;
}

// Multipart upload of one file under the "file" field, as the brand endpoints expect.
async function upload(path, filePath, contentType) {
  const form = new FormData();
  form.append("file", new Blob([await readFile(filePath)], { type: contentType }), filePath.split("/").pop());
  const res = await fetch(API + path, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: form });
  const text = await res.text();
  if (!res.ok) throw new Error(`POST ${path} -> ${res.status}: ${text}`);
  return JSON.parse(text);
}

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

const round2 = (n) => Math.round(n * 100) / 100;
const vatOf = (htva, rate) => {
  const vatAmount = round2(htva * rate / 100);
  return { htva: round2(htva), vatRate: rate, vatAmount, totalTvac: round2(htva + vatAmount) };
};
const log = (msg) => console.log(msg);

// ── 0. Login and guard ───────────────────────────────────────────────────────
const login = await call("POST", "/api/admin/auth/login", { email: EMAIL, password: PASSWORD });
if (login.status !== 201 || typeof login.body?.token !== "string") {
  console.error(`login failed: ${login.status} ${JSON.stringify(login.body)}`);
  process.exit(1);
}
token = login.body.token;

const existingRecipes = await must("GET", "/api/admin/recipes");
if (Array.isArray(existingRecipes) && existingRecipes.length > 0 && !FORCE) {
  console.error(`refusing to seed: ${existingRecipes.length} recipe(s) already present. Wipe the tables or set FORCE=1.`);
  process.exit(1);
}

// ── 1. Settings ──────────────────────────────────────────────────────────────
// Company block of her offer sheets (docs/redesign/workings/offers-source-2026.md); the contact fields and the accent are written in section 8.
const company = {
  name: "Table d'Amélie SRL", vatNumber: "BE0766.607.232", address: "Drogenberg 55 A, 3090 Overijse", constitutedOn: "2021-04-12",
  phone: "0032486.54.60.17", email: "tabledamelie@gmail.com", website: "www.tabledamelie.be", accent: "#E8847A",
};
await must("PATCH", "/api/admin/settings", {
  courses: ["Apéritif", "Entrée", "Plat", "Dessert", "Autre"],
  recipeCategories: ["Buffet", "Walking dinner", "Lunch", "Menu semaine"],
  objectives: {
    "2026": { annualRevenue: 160000, monthsActive: 10, rawMaterialPct: 0.38, corporateTaxRate: 0.25, treasuryMonths: 3, hoursAvailablePerMonth: 160 },
  },
  fixedCharges: [
    { chargeId: "fc-ucm", label: "UCM", category: "social", monthlyAmount: 300 },
    { chargeId: "fc-comptable", label: "Comptable", category: "frais", monthlyAmount: 500 },
    { chargeId: "fc-assurance-rc", label: "Assurance RC", category: "assurance", monthlyAmount: 19.5 },
    { chargeId: "fc-loyer", label: "Loyer atelier", category: "frais", monthlyAmount: 650 },
    { chargeId: "fc-remuneration", label: "Rémunération dirigeant", category: "salaire", monthlyAmount: 1500 },
    { chargeId: "fc-falco", label: "Falco", category: "abonnement", monthlyAmount: 24 },
    { chargeId: "fc-internet", label: "Internet", category: "abonnement", monthlyAmount: 75 },
    { chargeId: "fc-investissement", label: "Remboursement investissement", category: "remboursement", monthlyAmount: 600, inResult: false },
  ],
  company: { name: company.name, vatNumber: company.vatNumber, address: company.address, constitutedOn: company.constitutedOn },
  yearActuals: {
    "2025": { monthly: { "01": 9000.73, "02": 12637.41, "03": 15311.1, "04": 22946.12, "05": 21701.5, "06": 28214.78, "09": 19974.94, "12": 10868.3 } },
  },
  ledgerStartYm: "2026-09",
});
log("settings ok");

// ── 2. Ingredients ───────────────────────────────────────────────────────────
const INGREDIENTS = [
  ["Oeuf", 0.3, "€/pièce", "Barn"],
  ["Oeufs", 0.32, "€/pièce", "Vds"],
  ["Œuf bio", 0.5, "€/pièce", "Terroirist"],
  ["Farine", 1.1, "€/kg", "Delhaize"],
  ["Beurre", 9.8, "€/kg", "Delhaize"],
  ["Crème fraîche", 4.2, "€/l", "Vds"],
  ["Lait entier", 1.15, "€/l", "Delhaize"],
  ["Sucre", 1.3, "€/kg", "Delhaize"],
  ["Chocolat noir", 14.5, "€/kg", "Vds"],
  ["Saumon fumé", 32, "€/kg", "Vds"],
  ["Citron", 0.45, "€/pièce", "Barn"],
  ["Basilic", 1.8, "€/botte", "Barn"],
  ["Tomates cerises", 6.5, "€/kg", "Barn"],
  ["Mozzarella", 11, "€/kg", "Delhaize"],
  ["Poulet fermier", 12.5, "€/kg", "Terroirist"],
  ["Riz basmati", 3.2, "€/kg", "Vds"],
  ["Riz arborio", 3.8, "€/kg", "Delhaize"],
  ["Courgette", 2.4, "€/kg", "Barn"],
  ["Pommes de terre", 1.6, "€/kg", "Barn"],
  ["Huile d'olive", 9.5, "€/l", "Delhaize"],
  ["Parmesan", 24, "€/kg", "Vds"],
  ["Pâte feuilletée", 1.9, "€/pièce", "Delhaize"],
  ["Menthe", 1.6, "€/botte", "Barn"],
  ["Betterave", 2.8, "€/kg", "Barn"],
  ["Pois chiches", 2.6, "€/kg", "Vds"],
  ["Tahini", 12, "€/kg", "Delhaize"],
  ["Oignon", 1.5, "€/kg", "Barn"],
  ["Ail", 8, "€/kg", "Barn"],
  ["Poivron rouge", 4.5, "€/kg", "Barn"],
  ["Lardons fumés", 13, "€/kg", "Delhaize"],
  ["Bouillon de volaille", 3.5, "€/l", "Delhaize"],
];
const PRICE_TO_QTY_UNIT = { "€/kg": "g", "€/pièce": "pièce", "€/l": "ml", "€/botte": "botte" };
const ing = {}; // name -> { ingredientId, unit }
for (const [name, price, unit, supplier] of INGREDIENTS) {
  const r = await must("POST", "/api/admin/ingredients", { name, price, unit, supplier });
  ing[name] = { ingredientId: r.ingredientId, qtyUnit: PRICE_TO_QTY_UNIT[r.unit] };
}
log(`ingredients ok (${INGREDIENTS.length})`);

// Recipe lines use the quantity unit that matches the ingredient's price unit.
const line = (name, qty) => {
  const i = ing[name];
  if (!i) throw new Error(`unknown ingredient ${name}`);
  return { ingredientId: i.ingredientId, qty, unit: i.qtyUnit, lossPct: 0 };
};

// ── 3. Recipes ───────────────────────────────────────────────────────────────
const RECIPES = [
  {
    name: "Mini quiches lorraines", type: "Walking dinner", defaultCourse: "Apéritif", portions: 10, portionWeight: 40,
    description: "Mini quiches individuelles, lardons et crème, servies tièdes à l'apéritif.",
    ingredients: [line("Pâte feuilletée", 2), line("Oeufs", 4), line("Crème fraîche", 300), line("Lardons fumés", 200), line("Lait entier", 100), line("Beurre", 20)],
    techniques: [
      "Préchauffer le four à 180 °C. Beurrer les moules à mini-tartelettes et dérouler la pâte feuilletée sur le plan de travail.",
      "Découper des disques de pâte de 7 cm à l'emporte-pièce. Foncer les moules et piquer le fond à la fourchette.",
      "Faire revenir les lardons à sec dans une poêle pendant 4 minutes. Les égoutter sur du papier absorbant pour retirer le gras.",
      "Battre les oeufs avec la crème et le lait. Saler peu, poivrer et ajouter une pointe de muscade.",
      "Répartir les lardons dans les fonds de tarte et verser l'appareil jusqu'à 3 mm du bord. Enfourner 18 à 20 minutes jusqu'à ce que le dessus soit doré.",
      "Laisser tiédir 5 minutes avant de démouler. Servir tiède ou à température ambiante sur le buffet.",
    ],
  },
  {
    name: "Houmous de betterave", type: "Buffet", defaultCourse: "Apéritif", portions: 10, portionWeight: 60,
    description: "Houmous rose vif à la betterave rôtie, tahini et citron, à servir avec des crudités ou du pain pita.",
    ingredients: [line("Pois chiches", 400), line("Betterave", 250), line("Tahini", 60), line("Citron", 1), line("Ail", 5), line("Huile d'olive", 40)],
    techniques: [
      "Cuire les betteraves entières dans l'eau bouillante 35 à 40 minutes jusqu'à ce qu'un couteau s'enfonce sans résistance. Les peler sous un filet d'eau froide et les couper en morceaux.",
      "Égoutter les pois chiches en gardant 100 ml de leur jus. Les rincer à l'eau claire.",
      "Mixer les pois chiches, la betterave, le tahini, l'ail et le jus du citron. Ajouter le jus réservé petit à petit jusqu'à une texture lisse.",
      "Verser l'huile d'olive en filet moteur en marche. Rectifier le sel et le citron.",
      "Dresser dans un bol, creuser le dessus à la cuillère et arroser d'un trait d'huile. Garder au frais et sortir 20 minutes avant le service.",
    ],
  },
  {
    name: "Verrines saumon fumé citron", type: "Walking dinner", defaultCourse: "Entrée", portions: 10, portionWeight: 70,
    description: "Verrine fraîche de saumon fumé, crème montée au citron et menthe.",
    ingredients: [line("Saumon fumé", 300), line("Crème fraîche", 250), line("Citron", 2), line("Menthe", 1), line("Huile d'olive", 20)],
    techniques: [
      "Zester un citron et presser les deux. Ciseler la menthe finement en gardant quelques feuilles pour le décor.",
      "Monter la crème fraîche au fouet jusqu'à ce qu'elle tienne. Incorporer le zeste, la moitié du jus et la menthe, saler et poivrer.",
      "Tailler le saumon fumé en lanières de 1 cm. En garder 10 belles tranches pour le dessus.",
      "Répartir les lanières de saumon dans le fond des verrines. Arroser du reste de jus de citron et d'un trait d'huile d'olive.",
      "Pocher la crème citronnée sur le saumon. Terminer par une rosace de saumon et une feuille de menthe, puis réserver au frais jusqu'au service.",
    ],
  },
  {
    name: "Salade caprese", type: "Buffet", defaultCourse: "Entrée", portions: 10, portionWeight: 120,
    description: "Tomates cerises, mozzarella déchirée et basilic frais, huile d'olive et fleur de sel.",
    ingredients: [line("Tomates cerises", 800), line("Mozzarella", 500), line("Basilic", 1), line("Huile d'olive", 60)],
    techniques: [
      "Laver les tomates cerises et les couper en deux. Les saler légèrement et les laisser dégorger 10 minutes dans une passoire.",
      "Égoutter la mozzarella et la déchirer à la main en morceaux de la taille d'une bouchée.",
      "Mélanger tomates et mozzarella dans un saladier. Ajouter l'huile d'olive, poivrer et ajouter une pincée de fleur de sel.",
      "Effeuiller le basilic et l'ajouter au dernier moment pour qu'il ne noircisse pas. Dresser sur plat et servir à température ambiante.",
    ],
  },
  {
    name: "Poulet basquaise", type: "Buffet", defaultCourse: "Plat", portions: 10, portionWeight: 280,
    description: "Poulet fermier mijoté aux poivrons, oignons et tomates, servi avec du riz basmati.",
    ingredients: [line("Poulet fermier", 1800), line("Poivron rouge", 600), line("Oignon", 300), line("Ail", 15), line("Tomates cerises", 500), line("Huile d'olive", 50), line("Riz basmati", 600)],
    techniques: [
      "Découper le poulet en morceaux et les saler. Les colorer dans l'huile d'olive sur toutes les faces dans une grande cocotte, puis les réserver.",
      "Émincer les oignons et les poivrons en lanières. Les faire suer 10 minutes dans la cocotte sans coloration.",
      "Ajouter l'ail haché et les tomates coupées en deux. Laisser compoter 5 minutes à feu vif.",
      "Remettre le poulet dans la cocotte, couvrir et laisser mijoter 35 minutes à feu doux. Retourner les morceaux à mi-cuisson.",
      "Rincer le riz jusqu'à ce que l'eau soit claire. Le cuire 11 minutes dans 1,5 fois son volume d'eau salée, couvert, puis laisser reposer 5 minutes.",
      "Rectifier l'assaisonnement de la sauce avec du piment d'Espelette. Dresser le poulet et sa sauce en bac gastro avec le riz à côté.",
    ],
  },
  {
    name: "Risotto aux courgettes", type: "Lunch", defaultCourse: "Plat", portions: 10, portionWeight: 300,
    description: "Risotto crémeux au parmesan et dés de courgette, cuit au bouillon de volaille.",
    ingredients: [line("Riz arborio", 700), line("Courgette", 800), line("Oignon", 150), line("Parmesan", 150), line("Beurre", 80), line("Bouillon de volaille", 2000), line("Huile d'olive", 30)],
    techniques: [
      "Porter le bouillon à frémissement et le garder chaud. Tailler les courgettes en petits dés et ciseler l'oignon.",
      "Faire suer l'oignon dans l'huile et la moitié du beurre. Ajouter le riz et le nacrer 2 minutes en remuant jusqu'à ce qu'il devienne translucide.",
      "Mouiller avec une louche de bouillon et remuer jusqu'à absorption. Répéter louche par louche pendant 16 à 18 minutes.",
      "Ajouter les courgettes à mi-cuisson pour qu'elles restent légèrement croquantes. Saler en fin de cuisson seulement.",
      "Hors du feu, incorporer le reste du beurre et le parmesan râpé. Couvrir 2 minutes puis servir immédiatement ou refroidir à plat pour le réchauffage.",
    ],
  },
  {
    name: "Gratin dauphinois", type: "Buffet", defaultCourse: "Plat", portions: 10, portionWeight: 180,
    description: "Accompagnement. Pommes de terre en fines rondelles cuites dans la crème et le lait à l'ail.",
    ingredients: [line("Pommes de terre", 2000), line("Crème fraîche", 500), line("Lait entier", 500), line("Ail", 10), line("Beurre", 30)],
    techniques: [
      "Éplucher les pommes de terre et les tailler en rondelles de 3 mm à la mandoline. Ne pas les rincer, l'amidon lie le gratin.",
      "Porter le lait et la crème à frémissement avec l'ail écrasé, du sel, du poivre et de la muscade. Y plonger les pommes de terre 10 minutes.",
      "Beurrer un plat à gratin et frotter le fond avec une gousse d'ail. Verser les pommes de terre et le liquide en tassant bien.",
      "Cuire 60 minutes à 160 °C. Le dessus doit être doré et la pointe d'un couteau s'enfoncer sans résistance.",
      "Laisser reposer 15 minutes avant de portionner. Se réchauffe très bien à 140 °C couvert d'une feuille de papier aluminium.",
    ],
  },
  {
    name: "Tarte au citron", type: "Buffet", defaultCourse: "Dessert", portions: 10, portionWeight: 110,
    description: "Pâte sablée maison et crème au citron cuite à la casserole, montée au beurre.",
    ingredients: [line("Farine", 250), line("Beurre", 250), line("Sucre", 300), line("Oeuf", 6), line("Citron", 5)],
    techniques: [
      "Sabler 125 g de beurre froid avec la farine et 50 g de sucre. Ajouter un oeuf, former une boule sans trop travailler et laisser reposer 1 heure au frais.",
      "Étaler la pâte sur 3 mm et foncer un cercle de 26 cm. Piquer le fond et cuire à blanc 20 minutes à 170 °C.",
      "Zester et presser les citrons. Mélanger le jus, les zestes, le reste du sucre et 5 oeufs dans une casserole.",
      "Cuire à feu doux en fouettant sans arrêt jusqu'à épaississement, environ 8 minutes. Ne pas laisser bouillir.",
      "Hors du feu, incorporer le reste du beurre en morceaux. Mixer au mixeur plongeant pour une crème lisse et brillante.",
      "Verser la crème sur le fond de tarte et lisser. Réserver 3 heures au frais avant de découper en 10 parts.",
    ],
  },
  {
    name: "Mousse au chocolat", type: "Menu semaine", defaultCourse: "Dessert", portions: 10, portionWeight: 90,
    description: "Mousse au chocolat noir en pots individuels, à préparer la veille.",
    ingredients: [line("Chocolat noir", 300), line("Œuf bio", 6), line("Sucre", 50), line("Beurre", 50), line("Crème fraîche", 100)],
    techniques: [
      "Hacher le chocolat et le faire fondre au bain-marie avec le beurre. Lisser et laisser tiédir à 40 °C.",
      "Séparer les blancs des jaunes. Mélanger les jaunes et la crème au chocolat tiède.",
      "Monter les blancs en neige avec une pincée de sel. Serrer avec le sucre en fin de montage.",
      "Incorporer un tiers des blancs au chocolat pour détendre la masse. Ajouter le reste délicatement à la maryse en soulevant.",
      "Répartir en pots de 90 g et filmer. Prendre au frais minimum 4 heures, idéalement la veille.",
    ],
  },
  {
    name: "Lunch bowl pois chiches tahini", type: "Menu semaine", defaultCourse: "Plat", portions: 10, portionWeight: 350,
    description: "Bowl végétarien: riz basmati, pois chiches rôtis, rubans de courgette, betterave et sauce tahini citron.",
    ingredients: [line("Pois chiches", 800), line("Riz basmati", 500), line("Courgette", 500), line("Betterave", 300), line("Tahini", 100), line("Citron", 2), line("Huile d'olive", 60), line("Menthe", 1)],
    techniques: [
      "Cuire le riz basmati à l'eau salée 11 minutes et le refroidir à plat. Cuire les betteraves 40 minutes, les peler et les tailler en dés.",
      "Égoutter les pois chiches, les sécher et les rôtir 20 minutes à 200 °C avec la moitié de l'huile, du cumin et du paprika.",
      "Tailler les courgettes en rubans à l'économe. Les mariner 10 minutes avec le jus d'un citron, sel et poivre.",
      "Préparer la sauce en fouettant le tahini avec le jus du second citron, le reste de l'huile et 80 ml d'eau froide jusqu'à une consistance nappante.",
      "Monter les bowls en sections: riz, pois chiches, courgettes, betterave. Napper de sauce et parsemer de menthe ciselée au moment du service.",
    ],
  },
  {
    name: "Sablés bretons", type: "Walking dinner", defaultCourse: "Mignardises", portions: 10, portionWeight: 15,
    description: "Petits sablés au beurre demi-sel, servis avec le café.",
    ingredients: [line("Beurre", 100), line("Farine", 150), line("Sucre", 80), line("Oeuf", 1)],
    techniques: [
      "Crémer le beurre mou avec le sucre, ajouter le jaune d'oeuf puis la farine et une pincée de sel. Former un boudin, filmer et laisser reposer 1 heure au frais.",
      "Tailler des rondelles de 1 cm, les poser dans des moules à tartelettes et cuire 15 minutes à 170 °C. Laisser refroidir dans les moules avant de démouler.",
    ],
  },
];
const rec = {}; // name -> recipeId
for (const r of RECIPES) {
  const created = await must("POST", "/api/admin/recipes", r);
  rec[r.name] = created.recipeId;
}
log(`recipes ok (${RECIPES.length})`);

const R = {
  quiches: rec["Mini quiches lorraines"],
  houmous: rec["Houmous de betterave"],
  verrines: rec["Verrines saumon fumé citron"],
  caprese: rec["Salade caprese"],
  poulet: rec["Poulet basquaise"],
  risotto: rec["Risotto aux courgettes"],
  gratin: rec["Gratin dauphinois"],
  tarte: rec["Tarte au citron"],
  mousse: rec["Mousse au chocolat"],
  bowl: rec["Lunch bowl pois chiches tahini"],
  sables: rec["Sablés bretons"],
};
const L = (recipeId, portions, course) => ({ recipeId, portions, course });

// ── 4. Clients ───────────────────────────────────────────────────────────────
const hoonaPlats = [R.bowl, R.poulet, R.risotto, R.bowl, R.poulet];
const hoonaDays = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];
const hoona = await must("POST", "/api/admin/clients", {
  name: "Hoona", kind: "entreprise", contactName: "Léa Martens", email: "lea@hoona.example",
  defaultPrestationType: "menu_a_emporter", defaultVatRate: 6, defaultPricePerGuest: 14, defaultGuestCount: 30,
  invoicing: "mensuelle",
  templates: hoonaDays.map((name, i) => ({
    name, weekday: i + 1, guestCount: 30, sellingPricePerGuest: 14,
    recipes: [
      L(hoonaPlats[i], 30, "Plat"),
      ...((i === 2 || i === 4) ? [L(R.mousse, 30, "Dessert")] : []),
    ],
    extraCosts: [],
  })),
  notes: "Livraison à 11h30 à la réception, bacs gastro récupérés le lendemain.",
});
const dupont = await must("POST", "/api/admin/clients", {
  name: "Famille Dupont", kind: "particulier", contactName: "Claire Dupont", phone: "+32 475 12 34 56", email: "claire.dupont@example.be",
  address: "Rue des Lilas 4, 1050 Ixelles",
  defaultPrestationType: "buffet_avec_service", defaultVatRate: 12, invoicing: "par_evenement",
});
// Same rule as billingFromClient: name, address and VAT number, one per line, blanks dropped.
const billingFromClient = (c) => [c.name, c.address, c.vatNumber].map((x) => (x ?? "").trim()).filter(Boolean).join("\n");
const philippson = await must("POST", "/api/admin/clients", {
  name: "Philippson", kind: "entreprise", contactName: "Marc Philippson", email: "office@philippson.example",
  defaultPrestationType: "menu_a_emporter", defaultVatRate: 6, defaultPricePerGuest: 16, defaultGuestCount: 12,
  invoicing: "mensuelle",
  templates: [
    { name: "Mardi", weekday: 2, guestCount: 12, sellingPricePerGuest: 16, recipes: [L(R.risotto, 12, "Plat")], extraCosts: [] },
    { name: "Jeudi", weekday: 4, guestCount: 12, sellingPricePerGuest: 16, recipes: [L(R.poulet, 12, "Plat")], extraCosts: [] },
  ],
});
log("clients ok (3)");

// ── 5. Events ────────────────────────────────────────────────────────────────
const W42 = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"];
const W43 = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"];
const hoonaW42 = await must("POST", `/api/admin/clients/${hoona.clientId}/instantiate`, { dates: W42 });
const hoonaW43 = await must("POST", `/api/admin/clients/${hoona.clientId}/instantiate`, { dates: W43 });
const philW42 = await must("POST", `/api/admin/clients/${philippson.clientId}/instantiate`, { dates: W42 });
const philW43 = await must("POST", `/api/admin/clients/${philippson.clientId}/instantiate`, { dates: W43 });
log(`instantiated Hoona ${hoonaW42.created.length}+${hoonaW43.created.length}, Philippson ${philW42.created.length}+${philW43.created.length}`);

const hoonaTuesday = hoonaW42.created.find((e) => e.date === "2026-10-13");
const philTuesday = philW42.created.find((e) => e.date === "2026-10-13");
if (!hoonaTuesday || !philTuesday) throw new Error("Tuesday events missing after instantiate");

const mariage = await must("POST", "/api/admin/events", {
  name: "Mariage Dupont", date: "2026-10-17", guestCount: 60, clientId: dupont.clientId,
  prestationType: "buffet_avec_service", vatRate: 12, sellingPricePerGuest: 55,
  contactName: "Claire Dupont", contactEmail: "claire.dupont@example.be",
  deliveryAddress: "Rue des Lilas 4, 1050 Ixelles", deliveryTime: "11:30", billingDetails: billingFromClient(dupont),
  revenueLines: [{ label: "Service", amount: 450, vatRate: 21 }],
  recipes: [
    L(R.quiches, 60, "Apéritif"), L(R.houmous, 60, "Apéritif"), L(R.verrines, 60, "Entrée"),
    L(R.poulet, 60, "Plat"), L(R.gratin, 60, "Plat"), L(R.tarte, 60, "Dessert"),
    { ...L(R.sables, 60, "Mignardises"), prepDate: "2026-10-15" },
  ],
  tasks: [
    { label: "Dégeler le poisson", date: "2026-10-15" },
    { label: "Cuire les sablés", date: "2026-10-16", assignedTo: ["kristoff"] },
  ],
  extraCosts: [
    { label: "Location vaisselle", amount: 180, kind: "location" },
    { label: "Extra service Kristoff 8h", amount: 240, kind: "personnel" },
  ],
  notes: "Allergie noix pour 2 invités",
});
const brunch = await must("POST", "/api/admin/events", {
  name: "Brunch Pirson", date: "2026-10-18", guestCount: 20,
  prestationType: "brunch", vatRate: 12, pricingMode: "total", sellingTotal: 900, sellingPricePerGuest: 45,
  contactName: "Sophie Pirson", contactPhone: "+32 486 22 11 00",
  recipes: [L(R.quiches, 20, "Apéritif"), L(R.caprese, 20, "Entrée"), L(R.mousse, 20, "Dessert")],
  extraCosts: [],
});
const delen = await must("POST", "/api/admin/events", {
  name: "Lunch étude Delen", date: "2026-10-15", guestCount: 25,
  prestationType: "menu_a_emporter", vatRate: 6, sellingPricePerGuest: 18,
  contactName: "Étude Delen", contactEmail: "secretariat@delen.example",
  recipes: [L(R.bowl, 25, "Plat"), L(R.tarte, 25, "Dessert")],
  extraCosts: [{ label: "Livraison Bruxelles", amount: 25, kind: "transport" }],
});
const thalia = await must("POST", "/api/admin/events", {
  name: "Walking dinner Fondation Thalia", date: "2026-10-23", guestCount: 50,
  prestationType: "walking_cocktail", vatRate: 12, sellingPricePerGuest: 48,
  contactName: "Fondation Thalia", contactEmail: "events@thalia.example",
  recipes: [
    L(R.quiches, 50, "Apéritif"), L(R.houmous, 50, "Apéritif"), L(R.verrines, 50, "Apéritif"),
    L(R.caprese, 50, "Entrée"), L(R.risotto, 50, "Entrée"), L(R.bowl, 50, "Entrée"),
  ],
  extraCosts: [{ label: "Service 2 personnes 5h", amount: 300, kind: "personnel" }],
  notes: "Portions dégustation, service debout.",
});
log("hand-made events ok (4)");

// Tuesday progress: Hoona's plat is done, Philippson's is in progress, the wedding houmous is prepped on Tuesday.
await must("PATCH", `/api/admin/events/${hoonaTuesday.eventId}/lines/${hoonaTuesday.recipes[0].lineId}`, { prepStatus: "done" });
await must("PATCH", `/api/admin/events/${philTuesday.eventId}/lines/${philTuesday.recipes[0].lineId}`, { prepStatus: "doing" });
const mariageHoumous = mariage.recipes.find((l) => l.recipeId === R.houmous);
await must("PATCH", `/api/admin/events/${mariage.eventId}/lines/${mariageHoumous.lineId}`, { prepStatus: "doing", prepDate: "2026-10-13", notes: "Se garde 4 jours au frais" });
log("tuesday line progress ok");

// Completed September events, created then completed with a cost snapshot from the live recipe costs.
const allIngredients = await must("GET", "/api/admin/ingredients");
const allRecipes = await must("GET", "/api/admin/recipes");
const ingById = new Map(allIngredients.map((i) => [i.ingredientId, i]));
const recipeById = new Map(allRecipes.map((r) => [r.recipeId, r]));
function recipeCost(recipe) {
  return recipe.ingredients.reduce((total, ri) => {
    const i = ingById.get(ri.ingredientId);
    if (!i) return total;
    const ppu = (i.unit === "€/kg" || i.unit === "€/l") ? i.price / 1000 : i.price;
    return total + ri.qty * (1 + (ri.lossPct || 0) / 100) * ppu;
  }, 0);
}
function costSnapshotFor(event) {
  const lines = event.recipes.map((l) => {
    const r = recipeById.get(l.recipeId);
    const unitCost = r ? round2(recipeCost(r) / (r.portions || 1)) : 0;
    return { lineId: l.lineId, recipeId: l.recipeId, portions: l.portions, unitCost };
  });
  const rawMaterial = round2(lines.reduce((s, l) => s + l.unitCost * l.portions, 0));
  const extrasTotal = round2((event.extraCosts ?? []).reduce((s, c) => s + (c.amount || 0), 0));
  return { rawMaterial, extrasTotal, lines };
}

const SEPTEMBER = [
  {
    name: "Buffet anniversaire Lambert", date: "2026-09-12", guestCount: 40, prestationType: "buffet_avec_service", vatRate: 12, sellingPricePerGuest: 42,
    contactName: "Anne Lambert",
    recipes: [L(R.quiches, 40, "Apéritif"), L(R.houmous, 40, "Apéritif"), L(R.poulet, 40, "Plat"), L(R.gratin, 40, "Plat"), L(R.tarte, 40, "Dessert")],
    extraCosts: [{ label: "Service Kristoff 8h", amount: 240, kind: "personnel" }],
    hoursSpent: 14,
    invoice: { number: "2026-031", paid: true, paidAt: "2026-09-25" },
  },
  {
    name: "Buffet réunion Philippson", date: "2026-09-19", guestCount: 25, prestationType: "buffet_a_emporter", vatRate: 6, sellingPricePerGuest: 28,
    clientId: philippson.clientId, contactName: "Marc Philippson",
    recipes: [L(R.caprese, 25, "Entrée"), L(R.risotto, 25, "Plat"), L(R.mousse, 25, "Dessert")],
    extraCosts: [],
    hoursSpent: 6,
    invoice: { number: "2026-032", paid: true, paidAt: "2026-10-05" },
  },
  {
    name: "Chef à domicile Van Acker", date: "2026-09-26", guestCount: 15, prestationType: "chef_a_domicile", vatRate: 12, sellingPricePerGuest: 65,
    contactName: "Pieter Van Acker",
    recipes: [L(R.verrines, 15, "Entrée"), L(R.poulet, 15, "Plat"), L(R.gratin, 15, "Plat"), L(R.tarte, 15, "Dessert")],
    extraCosts: [{ label: "Déplacement Tervuren", amount: 25, kind: "transport" }],
    hoursSpent: 9,
    invoice: { number: "2026-033", paid: false },
  },
];
const septemberEvents = [];
for (const { invoice, ...body } of SEPTEMBER) {
  const created = await must("POST", "/api/admin/events", body);
  const completed = await must("PATCH", `/api/admin/events/${created.eventId}`, { status: "completed", costSnapshot: costSnapshotFor(created) });
  septemberEvents.push({ event: completed, invoice, clientId: body.clientId });
}
log("september completed events ok (3)");

// ── 6. Ledger ────────────────────────────────────────────────────────────────
let entries = 0;
for (const { event, invoice, clientId } of septemberEvents) {
  await must("POST", "/api/admin/ledger", {
    book: "ventes", kind: "facture", date: event.date, label: event.name, number: invoice.number,
    eventIds: [event.eventId], ...(clientId && { clientId }), prestationType: event.prestationType,
    ...vatOf(event.sellingPricePerGuest * event.guestCount, event.vatRate),
    paid: invoice.paid, ...(invoice.paid && { paymentMethod: "virement", paidAt: invoice.paidAt }),
  });
  entries++;
}
// The deposit is received TVAC, so the 500 € is split at the event's 12 %.
await must("POST", "/api/admin/ledger", {
  book: "ventes", kind: "acompte", date: "2026-10-02", label: "Acompte Mariage Dupont", eventIds: [mariage.eventId], clientId: dupont.clientId,
  prestationType: "buffet_avec_service", totalTvac: 500, htva: 446.43, vatRate: 12, vatAmount: 53.57,
  paid: true, paymentMethod: "virement", paidAt: "2026-10-02",
});
entries++;
await must("POST", "/api/admin/ledger", {
  book: "ventes", kind: "comptoir", date: "2026-09-30", label: "Comptoir septembre", ...vatOf(842.92, 6),
  paid: true, paymentMethod: "bancontact", paidAt: "2026-09-30",
});
entries++;
await must("POST", "/api/admin/ledger", {
  book: "ventes", kind: "commission", date: "2026-09-30", label: "Thermomix septembre", ...vatOf(150, 0), paid: false,
});
entries++;
const shifts = [{ date: "2026-09-12", hours: 8 }, { date: "2026-09-26", hours: 6 }];
const hours = shifts.reduce((s, x) => s + x.hours, 0);
await must("POST", "/api/admin/ledger", {
  book: "achats", kind: "personnel", date: "2026-09-30", label: "Kristoff", personName: "Kristoff", hourlyRate: 30, shifts,
  ...vatOf(30 * hours, 0),
});
entries++;
await must("POST", "/api/admin/ledger", {
  book: "achats", kind: "mp", date: "2026-09-15", label: "Barn fruits et légumes", supplier: "Barn", ...vatOf(1240.5, 6),
});
entries++;
log(`ledger ok (${entries})`);

// ── 7. Offers ────────────────────────────────────────────────────────────────
const O = (recipeId, portionsPerGuest, course) => ({ recipeId, portionsPerGuest, course });
const buffet1 = await must("POST", "/api/admin/offers", {
  name: "Buffet 1", prestationType: "buffet_avec_service", vatRate: 12, guestCountRef: 20,
  lines: [O(R.houmous, 1, "Apéritif"), O(R.caprese, 1, "Entrée"), O(R.poulet, 1, "Plat"), O(R.gratin, 1, "Plat"), O(R.tarte, 1, "Dessert")],
  extraCosts: [], revenueLines: [], pricingMode: "par_convive", sellingPricePerGuest: 42,
});
const walking2 = await must("POST", "/api/admin/offers", {
  name: "Walking dinner 2", prestationType: "walking_cocktail", vatRate: 12, guestCountRef: 20,
  lines: [O(R.quiches, 3, "Apéritif"), O(R.verrines, 2, "Apéritif"), O(R.sables, 2, "Mignardises")],
  extraCosts: [], revenueLines: [], pricingMode: "par_convive", sellingPricePerGuest: 38,
});
log("offers ok (2)");

// ── 8. Offer documents ───────────────────────────────────────────────────────
// Same endpoint as scripts/import-offer-documents.mjs: skips a title and year that already exist.
const imported = await must("POST", "/api/admin/offer-documents/import-2026");
const documents = await must("GET", "/api/admin/offer-documents");
for (const d of documents) log(`document ${d.documentId} · ${d.title} ${d.year}`);
log(`offer documents ok (${imported.created.length} created, ${imported.skipped.length} skipped)`);

// Placeholder brand images drawn for the seed, never her real files.
// Without a reachable S3 (the local stack) the uploads answer 500; the rest of the seed does not depend on them.
try {
  await upload("/api/admin/settings/brand/logo", join(FIXTURES, "brand", "logo.png"), "image/png");
  await upload("/api/admin/settings/brand/banner", join(FIXTURES, "brand", "banner.jpg"), "image/jpeg");
} catch (e) {
  if (!/-> 5\d\d/.test(String(e))) throw e;
  log("brand images skipped (S3 indisponible en local)");
}
// The Société section saves company whole, so the contact fields go with the rest.
const branded = await must("PATCH", "/api/admin/settings", { company });
log(`brand ok (${branded.brandLogoKey}, ${branded.brandBannerKey}, accent ${branded.company?.accent})`);

// ── Summary ──────────────────────────────────────────────────────────────────
const [events, recipes, ingredients, ledger, offers] = await Promise.all([
  must("GET", "/api/admin/events"),
  must("GET", "/api/admin/recipes"),
  must("GET", "/api/admin/ingredients"),
  must("GET", "/api/admin/ledger?year=2026"),
  must("GET", "/api/admin/offers"),
]);
console.log(JSON.stringify({
  hoonaTuesdayEventId: hoonaTuesday.eventId,
  hoonaTuesdayFirstLineId: hoonaTuesday.recipes[0].lineId,
  mariageDupontEventId: mariage.eventId,
  mariageSablesLineId: mariage.recipes.find((l) => l.recipeId === R.sables)?.lineId,
  mariageTaskIds: (mariage.tasks ?? []).map((t) => t.taskId),
  tarteAuCitronRecipeId: R.tarte,
  hoonaClientId: hoona.clientId,
  brunchPirsonEventId: brunch.eventId,
  buffet1OfferId: buffet1.offerId,
  walkingDinner2OfferId: walking2.offerId,
  offerDocumentIds: documents.map((d) => d.documentId),
  counts: { events: events.length, recipes: recipes.length, ingredients: ingredients.length, entries: ledger.length, offers: offers.length, documents: documents.length },
}, null, 2));
