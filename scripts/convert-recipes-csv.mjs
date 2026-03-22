import { readFileSync, writeFileSync } from "fs";

const csv = readFileSync(process.argv[2] || "/Users/antoineboxho/Downloads/recipes_simple (1).csv", "utf-8");

function parseCsvLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === "," && !inQuotes) { fields.push(current.trim()); current = ""; continue; }
    current += ch;
  }
  fields.push(current.trim());
  return fields;
}

const lines = csv.split("\n").filter((l) => l.trim());
const SKIP_PRODUCTS = new Set(["total (g)", "total (kg)", "produit"]);

const recipes = new Map();

for (let i = 1; i < lines.length; i++) {
  const [recipeName, productName, rawQty] = parseCsvLine(lines[i]);
  if (!recipeName || recipeName === "Ingrédients") continue;
  if (!productName || SKIP_PRODUCTS.has(productName.toLowerCase())) continue;

  const { qty, unit } = parseQuantity(rawQty || "");
  if (qty <= 0) continue;

  if (!recipes.has(recipeName)) {
    recipes.set(recipeName, { name: recipeName, ingredients: [] });
  }

  const existing = recipes.get(recipeName).ingredients;
  const dup = existing.find((i) => i.name.toLowerCase() === productName.toLowerCase() && i.unit === unit);
  if (dup) {
    dup.qty = Math.round((dup.qty + qty) * 100) / 100;
  } else {
    existing.push({ name: productName, qty, unit });
  }
}

function parseQuantity(raw) {
  if (!raw) return { qty: 0, unit: "g" };
  const cleaned = raw.replace(/\s+/g, " ").trim();

  const rangeMatch = cleaned.match(/^(\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)\s*(.*)/);
  if (rangeMatch) {
    const lo = parseFloat(rangeMatch[1].replace(",", "."));
    const hi = parseFloat(rangeMatch[2].replace(",", "."));
    return { qty: Math.round((lo + hi) / 2), unit: resolveUnit(rangeMatch[3]) };
  }

  const match = cleaned.match(/^(\d+(?:[.,]\d+)?)\s*(.*)/);
  if (!match) return { qty: 0, unit: "g" };

  return { qty: parseFloat(match[1].replace(",", ".")), unit: resolveUnit(match[2]) };
}

function resolveUnit(token) {
  const t = (token || "").toLowerCase().replace(/s$/, "");
  if (t.includes("pièce") || t.includes("piece")) return "pièce";
  if (t.includes("botte")) return "botte";
  return "g";
}

const output = [];
for (const [, recipe] of recipes) {
  const totalG = recipe.ingredients
    .filter((i) => i.unit === "g")
    .reduce((s, i) => s + i.qty, 0);

  output.push({
    name: recipe.name,
    type: "Buffet",
    portions: 1,
    portionWeight: Math.round(totalG) || 150,
    ingredients: recipe.ingredients,
  });
}

const outPath = process.argv[3] || "/Users/antoineboxho/Downloads/recipes-import.json";
writeFileSync(outPath, JSON.stringify(output, null, 2), "utf-8");
console.log(`Converted ${output.length} recipes → ${outPath}`);

const sampleNames = output.slice(0, 5).map((r) => `  ${r.name} (${r.ingredients.length} ingredients)`);
console.log("Samples:\n" + sampleNames.join("\n"));
