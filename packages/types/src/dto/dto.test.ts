import { createLedgerEntrySchema, patchLedgerEntrySchema, lockMonthSchema } from "./ledger";
import { isoDate, money, moneyNonnegative, yearMonth } from "./primitives";
import {
  addEventLineSchema,
  addEventTaskSchema,
  createEventRequestSchema,
  eventTaskSchema,
  patchEventLineSchema,
  patchEventTaskSchema,
  putEventLinesSchema,
  updateEventRequestSchema,
} from "./events";
import { importIngredientRowSchema, mergeIngredientsSchema } from "./ingredients";
import { importRecipeIngredientSchema } from "./recipes";
import { clientTemplateSchema, createClientSchema, templateLineSchema, updateClientSchema } from "./clients";
import { personSchema, updateSettingsRequestSchema } from "./settings";

const sale = {
  book: "ventes" as const,
  kind: "facture" as const,
  date: "2026-10-03",
  label: "Hoona",
  totalTvac: 106,
  htva: 100,
  vatRate: 6 as const,
  vatAmount: 6,
};

describe("primitives", () => {
  it("money accepts two decimals and rejects three", () => {
    expect(money.safeParse(12.34).success).toBe(true);
    expect(money.safeParse(12.345).success).toBe(false);
    expect(money.safeParse(-12.34).success).toBe(true);
    expect(moneyNonnegative.safeParse(-12.34).success).toBe(false);
  });
  it("isoDate and yearMonth reject impossible dates", () => {
    expect(isoDate.safeParse("2026-02-28").success).toBe(true);
    expect(isoDate.safeParse("2024-02-29").success).toBe(true);
    expect(isoDate.safeParse("2026-02-30").success).toBe(false);
    expect(isoDate.safeParse("2026-13-45").success).toBe(false);
    expect(yearMonth.safeParse("2026-12").success).toBe(true);
    expect(yearMonth.safeParse("2026-13").success).toBe(false);
    expect(yearMonth.safeParse("2026-00").success).toBe(false);
  });
});

describe("createLedgerEntrySchema", () => {
  it("accepts a sale and defaults paid", () => {
    const r = createLedgerEntrySchema.safeParse(sale);
    expect(r.success).toBe(true);
    if (r.success && r.data.book === "ventes") expect(r.data.paid).toBe(false);
  });
  it("accepts a 0.01 mismatch and rejects 0.02", () => {
    expect(createLedgerEntrySchema.safeParse({ ...sale, vatAmount: 6.01 }).success).toBe(true);
    expect(createLedgerEntrySchema.safeParse({ ...sale, vatAmount: 6.02 }).success).toBe(false);
  });
  it("rejects negatives unless note_de_credit with a number", () => {
    const neg = { ...sale, totalTvac: -106, htva: -100, vatAmount: -6 };
    expect(createLedgerEntrySchema.safeParse(neg).success).toBe(false);
    expect(createLedgerEntrySchema.safeParse({ ...neg, kind: "note_de_credit" }).success).toBe(false);
    expect(createLedgerEntrySchema.safeParse({ ...neg, kind: "note_de_credit", number: "NC-1" }).success).toBe(true);
  });
  it("reports kind errors by name and rejects sales fields on purchases", () => {
    const r = createLedgerEntrySchema.safeParse({ ...sale, kind: "mp" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.path.includes("kind"))).toBe(true);
    expect(createLedgerEntrySchema.safeParse({ ...sale, book: "achats", kind: "mp", paid: true }).success).toBe(false);
    expect(createLedgerEntrySchema.safeParse({ ...sale, book: "achats", kind: "mp", supplier: "Barn" }).success).toBe(true);
  });
  it("patch and lock schemas", () => {
    expect(patchLedgerEntrySchema.safeParse({ paid: true }).success).toBe(true);
    expect(patchLedgerEntrySchema.safeParse({ label: "x" }).success).toBe(false);
    expect(patchLedgerEntrySchema.safeParse({ paid: false, paidAt: null, paymentMethod: null }).success).toBe(true);
    expect(lockMonthSchema.safeParse({ ym: "2026-10", mpSource: "saisi" }).success).toBe(false);
    expect(lockMonthSchema.safeParse({ ym: "2026-10", mpSource: "saisi", rawMaterial: 10 }).success).toBe(true);
  });
});

describe("event schemas", () => {
  it("putEventLinesSchema rejects duplicate ids", () => {
    expect(putEventLinesSchema.safeParse({ lines: [{ lineId: "a" }, { lineId: "a" }] }).success).toBe(false);
    expect(putEventLinesSchema.safeParse({ lines: [{ lineId: "a" }, { lineId: "b", course: "Plat" }] }).success).toBe(true);
  });
  it("line schemas are strict", () => {
    expect(addEventLineSchema.safeParse({ recipeId: "r", portions: 2, lineId: "x" }).success).toBe(false);
    expect(patchEventLineSchema.safeParse({ prepStatus: "done" }).success).toBe(true);
    expect(patchEventLineSchema.safeParse({ recipeId: "r" }).success).toBe(false);
  });
  it("update keeps new line fields and tolerates actualCost null", () => {
    const r = updateEventRequestSchema.safeParse({
      actualCost: null,
      recipes: [{ lineId: "l1", recipeId: "r", portions: 1, prepStatus: "doing" }],
      vatRate: 12,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.recipes?.[0].prepStatus).toBe("doing");
    expect(updateEventRequestSchema.safeParse({ vatRate: 7 }).success).toBe(false);
  });
  it("update accepts null to clear client, template, prestation and VAT", () => {
    const r = updateEventRequestSchema.safeParse({ clientId: null, templateId: null, prestationType: null, vatRate: null });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.clientId).toBeNull();
  });
  it("assignedTo is accepted on the event, on a line and on a line patch", () => {
    const r = updateEventRequestSchema.safeParse({
      assignedTo: ["kristoff"],
      recipes: [{ lineId: "l1", recipeId: "r", portions: 1, assignedTo: ["amelie", "kristoff"] }],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.recipes?.[0].assignedTo).toEqual(["amelie", "kristoff"]);
    expect(addEventLineSchema.safeParse({ recipeId: "r", portions: 2, assignedTo: [] }).success).toBe(true);
    expect(patchEventLineSchema.safeParse({ assignedTo: [] }).success).toBe(true);
    expect(patchEventLineSchema.safeParse({ assignedTo: [""] }).success).toBe(false);
    expect(patchEventLineSchema.safeParse({ assignedTo: Array.from({ length: 11 }, (_, i) => `p${i}`) }).success).toBe(false);
  });
  it("task schema rejects an empty label and a bad date", () => {
    expect(eventTaskSchema.safeParse({ label: "Cuire les sablés", date: "2026-10-16" }).success).toBe(true);
    expect(eventTaskSchema.safeParse({ label: "  ", date: "2026-10-16" }).success).toBe(false);
    expect(eventTaskSchema.safeParse({ label: "Cuire les sablés", date: "16/10/2026" }).success).toBe(false);
    expect(eventTaskSchema.safeParse({ label: "x".repeat(121), date: "2026-10-16" }).success).toBe(false);
    expect(eventTaskSchema.safeParse({ label: "Cuire", date: "2026-10-16", course: "Plat" }).success).toBe(false);
    const r = eventTaskSchema.safeParse({ taskId: "t1", label: " Dégeler le poisson ", date: "2026-10-15", prepStatus: "doing", assignedTo: ["kristoff"] });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.label).toBe("Dégeler le poisson");
  });
  it("add and patch task schemas omit taskId and stay strict", () => {
    expect(addEventTaskSchema.safeParse({ label: "Cuire", date: "2026-10-16" }).success).toBe(true);
    expect(addEventTaskSchema.safeParse({ label: "Cuire", date: "2026-10-16", taskId: "t" }).success).toBe(false);
    expect(addEventTaskSchema.safeParse({ date: "2026-10-16" }).success).toBe(false);
    expect(patchEventTaskSchema.safeParse({ prepStatus: "done" }).success).toBe(true);
    expect(patchEventTaskSchema.safeParse({ date: "2026-10-17", assignedTo: [] }).success).toBe(true);
    expect(patchEventTaskSchema.safeParse({ label: "" }).success).toBe(false);
    expect(patchEventTaskSchema.safeParse({ taskId: "t" }).success).toBe(false);
  });
  it("create defaults tasks to [] and update leaves them undefined", () => {
    const created = createEventRequestSchema.safeParse({ name: "Mariage Dupont", date: "2026-10-17", guestCount: 60 });
    expect(created.success).toBe(true);
    if (created.success) expect(created.data.tasks).toEqual([]);
    const withTasks = createEventRequestSchema.safeParse({
      name: "Mariage Dupont",
      date: "2026-10-17",
      guestCount: 60,
      tasks: [{ label: "Dégeler le poisson", date: "2026-10-15" }],
    });
    expect(withTasks.success).toBe(true);
    if (withTasks.success) expect(withTasks.data.tasks).toEqual([{ label: "Dégeler le poisson", date: "2026-10-15" }]);
    const updated = updateEventRequestSchema.safeParse({ name: "x" });
    expect(updated.success).toBe(true);
    if (updated.success) expect(updated.data.tasks).toBeUndefined();
    expect(updateEventRequestSchema.safeParse({ tasks: [{ label: "", date: "2026-10-15" }] }).success).toBe(false);
  });
  it("line patch accepts prepDate null, add line and template line do not", () => {
    expect(patchEventLineSchema.safeParse({ prepDate: null }).success).toBe(true);
    expect(patchEventLineSchema.safeParse({ prepDate: "2026-10-15" }).success).toBe(true);
    expect(patchEventLineSchema.safeParse({ prepDate: "15/10/2026" }).success).toBe(false);
    expect(addEventLineSchema.safeParse({ recipeId: "r", portions: 2, prepDate: null }).success).toBe(false);
    expect(addEventLineSchema.safeParse({ recipeId: "r", portions: 2, prepDate: "2026-10-15" }).success).toBe(true);
    expect(templateLineSchema.safeParse({ recipeId: "r", portions: 1, prepDate: "2026-10-15" }).success).toBe(false);
  });
});

describe("other schemas", () => {
  it("merge refuses survivor in mergedIds", () => {
    expect(mergeIngredientsSchema.safeParse({ survivorId: "a", mergedIds: ["a"] }).success).toBe(false);
    expect(mergeIngredientsSchema.safeParse({ survivorId: "a", mergedIds: ["b"] }).success).toBe(true);
  });
  it("import rows normalise the unit and reject a bad one", () => {
    const r = importIngredientRowSchema.safeParse({ nom: " Oeufs ", prix_htva: "0,35", unite: "piece", fournisseur: "Vds", _status: "new" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({ nom: "Oeufs", prix_htva: 0.35, unite: "€/pièce", fournisseur: "Vds" });
    expect(importIngredientRowSchema.safeParse({ nom: "X", prix_htva: 1, unite: "tonne", fournisseur: "" }).success).toBe(false);
    expect(importIngredientRowSchema.safeParse({ prix_htva: 1 }).success).toBe(false);
    expect(importRecipeIngredientSchema.safeParse({ name: "Oeuf", qty: 2, unit: "pièce" }).success).toBe(true);
    expect(importRecipeIngredientSchema.safeParse({ name: "Oeuf", qty: 2, unit: "kg" }).success).toBe(false);
    expect(importRecipeIngredientSchema.safeParse({ qty: 2 }).success).toBe(false);
  });
  it("client defaults", () => {
    const r = createClientSchema.safeParse({ name: "Hoona" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toMatchObject({ templates: [], active: true });
    expect(updateClientSchema.safeParse({ foo: 1 }).success).toBe(false);
  });
  it("template accepts assignedTo, template lines do not", () => {
    const tpl = { name: "Mardi", weekday: 2, guestCount: 10, sellingPricePerGuest: 12, assignedTo: ["kristoff"] };
    const r = clientTemplateSchema.safeParse(tpl);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.assignedTo).toEqual(["kristoff"]);
    expect(templateLineSchema.safeParse({ recipeId: "r", portions: 1, assignedTo: ["kristoff"] }).success).toBe(false);
  });
  it("person schema and settings.people", () => {
    expect(personSchema.safeParse({ personId: "kristoff", name: "Kristoff", active: true }).success).toBe(true);
    expect(personSchema.safeParse({ personId: "kristoff", name: "Kristoff", initials: "KR", active: false }).success).toBe(true);
    expect(personSchema.safeParse({ personId: "Kristoff", name: "Kristoff", active: true }).success).toBe(false);
    expect(personSchema.safeParse({ personId: "kristoff", name: "Kristoff", initials: "KRIS", active: true }).success).toBe(false);
    expect(personSchema.safeParse({ personId: "kristoff", name: "Kristoff" }).success).toBe(false);
    expect(personSchema.safeParse({ personId: "kristoff", name: "Kristoff", active: true, extra: 1 }).success).toBe(false);
    const r = updateSettingsRequestSchema.safeParse({ people: [{ personId: "amelie", name: "Amélie", active: true }] });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.people?.[0].personId).toBe("amelie");
  });
  it("settings accept the new keys", () => {
    const r = updateSettingsRequestSchema.safeParse({
      courses: ["Plat"],
      fixedCharges: [{ chargeId: "c1", label: "UCM", category: "social", monthlyAmount: 100.5, from: "2026-01" }],
      objectives: { "2026": { annualRevenue: 150000, monthsActive: 10 } },
      yearActuals: { "2025": { monthly: { "01": 1000 } } },
      monthCloses: { "2026-10": { mpSource: "saisi", rawMaterial: 500 } },
      ledgerStartYm: "2026-12",
      company: { name: "SRL", vatNumber: "BE0", address: "Rue" },
    });
    expect(r.success).toBe(true);
    expect(updateSettingsRequestSchema.safeParse({ objectives: { "2026": { annualRevenue: 1 } } }).success).toBe(false);
    expect(updateSettingsRequestSchema.safeParse({ fixedCharges: [{ chargeId: "c", label: "x", category: "social", monthlyAmount: 1, from: "2026-1" }] }).success).toBe(false);
  });
});
