import { costSnapshotSchema } from "./events";
import { normalizePrice, normalizePriceUnit } from "../entities/ingredient";
import {
  createLedgerEntrySchema,
  importLedgerRowSchema,
  importLedgerSchema,
  lockMonthSchema,
  patchLedgerEntrySchema,
  purchaseEntrySchema,
  salesEntrySchema,
} from "./ledger";
import { isoDate, money, moneyNonnegative, yearMonth } from "./primitives";
import {
  addEventLineSchema,
  addEventTaskSchema,
  createEventRequestSchema,
  eventRevenueLineSchema,
  eventTaskSchema,
  patchEventLineSchema,
  patchEventTaskSchema,
  putEventLinesSchema,
  renameAttachmentSchema,
  updateEventRequestSchema,
} from "./events";
import { createOfferSchema, offerLineSchema, updateOfferSchema } from "./offers";
import { importIngredientRowSchema, importIngredientsOptionsSchema, mergeIngredientsSchema } from "./ingredients";
import { createRecipeRequestSchema, importRecipeIngredientSchema, listRecipesQuerySchema, updateRecipeRequestSchema } from "./recipes";
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
  it("ca_mensuel is a sales kind only", () => {
    expect(salesEntrySchema.safeParse({ ...sale, kind: "ca_mensuel" }).success).toBe(true);
    expect(createLedgerEntrySchema.safeParse({ ...sale, kind: "ca_mensuel", paid: true }).success).toBe(true);
    expect(purchaseEntrySchema.safeParse({ ...sale, book: "achats", kind: "ca_mensuel" }).success).toBe(false);
  });
  it("import rows need the VAT identity and a number", () => {
    const row = { number: "INV/2026/0042", date: "2026-10-03", label: "Hoona", htva: 100, vatRate: 6, vatAmount: 6, totalTvac: 106 };
    const r = importLedgerRowSchema.safeParse(row);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.paid).toBe(false);
    expect(importLedgerRowSchema.safeParse({ ...row, totalTvac: 110 }).success).toBe(false);
    expect(importLedgerRowSchema.safeParse({ ...row, number: " " }).success).toBe(false);
    expect(importLedgerRowSchema.safeParse({ ...row, eventIds: ["e"] }).success).toBe(false);
    expect(importLedgerRowSchema.safeParse({ ...row, htva: -100, vatAmount: -6, totalTvac: -106 }).success).toBe(true);
    expect(importLedgerSchema.safeParse({ rows: [row] }).success).toBe(true);
    expect(importLedgerSchema.safeParse({ rows: [] }).success).toBe(false);
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
  it("total mode needs sellingTotal on create and on update", () => {
    const base = { name: "Brunch Pirson", date: "2026-10-18", guestCount: 30 };
    expect(createEventRequestSchema.safeParse({ ...base, pricingMode: "total" }).success).toBe(false);
    expect(createEventRequestSchema.safeParse({ ...base, pricingMode: "total", sellingTotal: 900 }).success).toBe(true);
    expect(createEventRequestSchema.safeParse({ ...base, pricingMode: "par_convive" }).success).toBe(true);
    expect(updateEventRequestSchema.safeParse({ pricingMode: "total" }).success).toBe(false);
    expect(updateEventRequestSchema.safeParse({ pricingMode: "total", sellingTotal: null }).success).toBe(false);
    expect(updateEventRequestSchema.safeParse({ pricingMode: "total", sellingTotal: 900 }).success).toBe(true);
  });

  it("clears deliveryTime on null or an empty string", () => {
    expect(updateEventRequestSchema.safeParse({ deliveryTime: "" }).success).toBe(true);
    expect(updateEventRequestSchema.safeParse({ deliveryTime: null }).success).toBe(true);
    expect(updateEventRequestSchema.safeParse({ deliveryTime: "9h30" }).success).toBe(false);
    expect(updateEventRequestSchema.safeParse({ pricingMode: "par_convive", sellingTotal: null }).success).toBe(true);
    expect(updateEventRequestSchema.safeParse({ guestCount: 40 }).success).toBe(true);
  });
  it("update accepts null to clear delivery, billing and contact fields", () => {
    const r = updateEventRequestSchema.safeParse({
      deliveryTime: null,
      deliveryAddress: null,
      billingDetails: null,
      contactName: null,
      contactPhone: null,
      contactEmail: null,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.deliveryTime).toBeNull();
    expect(createEventRequestSchema.safeParse({ name: "x", date: "2026-10-18", guestCount: 1, deliveryTime: null }).success).toBe(false);
  });
  it("deliveryTime is HH:MM on 24 hours", () => {
    const base = { name: "x", date: "2026-10-18", guestCount: 1 };
    expect(createEventRequestSchema.safeParse({ ...base, deliveryTime: "09:05" }).success).toBe(true);
    expect(createEventRequestSchema.safeParse({ ...base, deliveryTime: "23:59" }).success).toBe(true);
    expect(createEventRequestSchema.safeParse({ ...base, deliveryTime: "9h30" }).success).toBe(false);
    expect(createEventRequestSchema.safeParse({ ...base, deliveryTime: "24:00" }).success).toBe(false);
    expect(createEventRequestSchema.safeParse({ ...base, deliveryTime: "9:05" }).success).toBe(false);
    expect(updateEventRequestSchema.safeParse({ deliveryTime: "11:30" }).success).toBe(true);
  });
  it("revenueLines default to [] on create, stay undefined on update and stop at 10", () => {
    const base = { name: "x", date: "2026-10-18", guestCount: 1 };
    const created = createEventRequestSchema.safeParse(base);
    expect(created.success).toBe(true);
    if (created.success) expect(created.data.revenueLines).toEqual([]);
    const line = { label: "Service", amount: 450, vatRate: 21 };
    const withLines = createEventRequestSchema.safeParse({ ...base, revenueLines: [line] });
    expect(withLines.success).toBe(true);
    if (withLines.success) expect(withLines.data.revenueLines).toEqual([line]);
    expect(createEventRequestSchema.safeParse({ ...base, revenueLines: Array.from({ length: 11 }, () => line) }).success).toBe(false);
    expect(updateEventRequestSchema.safeParse({ revenueLines: Array.from({ length: 11 }, () => line) }).success).toBe(false);
    const updated = updateEventRequestSchema.safeParse({ name: "y" });
    expect(updated.success).toBe(true);
    if (updated.success) expect(updated.data.revenueLines).toBeUndefined();
    expect(eventRevenueLineSchema.safeParse({ label: " ", amount: 1, vatRate: 21 }).success).toBe(false);
    expect(eventRevenueLineSchema.safeParse({ label: "Livraison", amount: -1, vatRate: 21 }).success).toBe(false);
    expect(eventRevenueLineSchema.safeParse({ label: "Livraison", amount: 1, vatRate: 7 }).success).toBe(false);
    expect(eventRevenueLineSchema.safeParse({ label: "Livraison", amount: 1, vatRate: 21, kind: "x" }).success).toBe(false);
  });
  it("attachments in a body are stripped, rename is strict", () => {
    const attachments = [{ attachmentId: "a", key: "k", name: "n", contentType: "application/pdf", size: 1, addedAt: "x" }];
    const created = createEventRequestSchema.safeParse({ name: "x", date: "2026-10-18", guestCount: 1, attachments });
    expect(created.success).toBe(true);
    if (created.success) expect("attachments" in created.data).toBe(false);
    const updated = updateEventRequestSchema.safeParse({ attachments });
    expect(updated.success).toBe(true);
    if (updated.success) expect("attachments" in updated.data).toBe(false);
    const renamed = renameAttachmentSchema.safeParse({ name: " Plan de salle.pdf " });
    expect(renamed.success).toBe(true);
    if (renamed.success) expect(renamed.data.name).toBe("Plan de salle.pdf");
    expect(renameAttachmentSchema.safeParse({ name: "" }).success).toBe(false);
    expect(renameAttachmentSchema.safeParse({ name: "x".repeat(121) }).success).toBe(false);
    expect(renameAttachmentSchema.safeParse({ name: "x", key: "k" }).success).toBe(false);
  });
});

describe("offer schemas", () => {
  it("create defaults guestCountRef to 20 and pricingMode to par_convive", () => {
    const r = createOfferSchema.safeParse({ name: "Buffet 1" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.guestCountRef).toBe(20);
      expect(r.data.pricingMode).toBe("par_convive");
      expect(r.data).toMatchObject({ lines: [], extraCosts: [], revenueLines: [], sellingPricePerGuest: 0 });
    }
    expect(createOfferSchema.safeParse({ name: "Buffet 1", pricingMode: "total" }).success).toBe(false);
    expect(createOfferSchema.safeParse({ name: "Buffet 1", pricingMode: "total", sellingTotal: 900 }).success).toBe(true);
    expect(createOfferSchema.safeParse({ name: "Buffet 1", foo: 1 }).success).toBe(false);
    expect(createOfferSchema.safeParse({ name: " " }).success).toBe(false);
  });
  it("offerLineSchema refuses portionsPerGuest 0 and unknown keys", () => {
    expect(offerLineSchema.safeParse({ recipeId: "r", portionsPerGuest: 0 }).success).toBe(false);
    expect(offerLineSchema.safeParse({ recipeId: "r", portionsPerGuest: 0.5 }).success).toBe(true);
    expect(offerLineSchema.safeParse({ recipeId: "r", portionsPerGuest: 51 }).success).toBe(false);
    expect(offerLineSchema.safeParse({ recipeId: "r", portionsPerGuest: 1, portions: 3 }).success).toBe(false);
  });
  it("update accepts null to clear scalars and keeps the total rule", () => {
    const r = updateOfferSchema.safeParse({ notes: null, prestationType: null, vatRate: null, sellingTotal: null });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.notes).toBeNull();
    expect(updateOfferSchema.safeParse({ pricingMode: "total" }).success).toBe(false);
    expect(updateOfferSchema.safeParse({ pricingMode: "total", sellingTotal: 500 }).success).toBe(true);
    expect(updateOfferSchema.safeParse({ archived: true }).success).toBe(true);
    expect(updateOfferSchema.safeParse({ offerId: "o1" }).success).toBe(false);
    const partial = updateOfferSchema.safeParse({ name: "Buffet 2" });
    expect(partial.success).toBe(true);
    if (partial.success) expect(partial.data.guestCountRef).toBeUndefined();
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
  it("import options default mode to all", () => {
    const r = importIngredientsOptionsSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({ mode: "all" });
    const prices = importIngredientsOptionsSchema.safeParse({ mode: "prices", supplier: " Vds " });
    expect(prices.success).toBe(true);
    if (prices.success) expect(prices.data).toEqual({ mode: "prices", supplier: "Vds" });
    expect(importIngredientsOptionsSchema.safeParse({ mode: "units" }).success).toBe(false);
  });
  it("recipe category is optional on create and update, and a query filter", () => {
    const r = createRecipeRequestSchema.safeParse({ name: "Houmous", category: " Apéritif " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toMatchObject({ category: "Apéritif", type: "Buffet" });
    expect(createRecipeRequestSchema.safeParse({ name: "Houmous", category: "" }).success).toBe(false);
    expect(listRecipesQuerySchema.safeParse({ category: "Plat" }).success).toBe(true);
    expect(updateRecipeRequestSchema.safeParse({ category: "Plat" }).success).toBe(true);
    expect(updateRecipeRequestSchema.safeParse({ category: "" }).success).toBe(false);
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
  it("settings invoicing is app or externe", () => {
    expect(updateSettingsRequestSchema.safeParse({ invoicing: "externe" }).success).toBe(true);
    expect(updateSettingsRequestSchema.safeParse({ invoicing: "app" }).success).toBe(true);
    expect(updateSettingsRequestSchema.safeParse({ invoicing: "odoo" }).success).toBe(false);
  });
});

describe("ingredient normalisers", () => {
  it("maps old spellings to the price unit enum and prices to finite numbers", () => {
    expect(normalizePriceUnit("€/kilo")).toBe("€/kg");
    expect(normalizePriceUnit("Kilo")).toBe("€/kg");
    expect(normalizePriceUnit("€/pc")).toBe("€/pièce");
    expect(normalizePriceUnit("€/sachet")).toBe("€/pièce");
    expect(normalizePriceUnit(undefined)).toBe("€/pièce");
    expect(normalizePrice("4,20")).toBe(4.2);
    expect(normalizePrice("abc")).toBe(0);
    expect(normalizePrice(-1)).toBe(0);
    expect(normalizePrice(3)).toBe(3);
  });
});

describe("cost snapshot", () => {
  it("accepts a client takenAt stamp and still rejects unknown keys", () => {
    const base = { rawMaterial: 1.5, extrasTotal: 0, lines: [] };
    expect(costSnapshotSchema.safeParse({ ...base, takenAt: "2026-10-14T10:00:00.000Z" }).success).toBe(true);
    expect(costSnapshotSchema.safeParse({ ...base, foo: 1 }).success).toBe(false);
  });
});
