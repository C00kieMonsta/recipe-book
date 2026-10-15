import { REVENUE_LINE_KINDS, REVENUE_LINE_KIND_LABELS, type EventRevenueLine } from "../entities/event";
import { newRevenueLine, revenueByKind, revenueByKindLabel, revenueLineKindOf, withRevenueKind } from "./revenue";

function line(label: string, amount = 100, extra: Partial<EventRevenueLine> = {}): EventRevenueLine {
  return { label, amount, vatRate: 21, ...extra };
}

describe("revenueLineKindOf", () => {
  it("infers the kind from the label", () => {
    expect(revenueLineKindOf(line("Service"))).toBe("service");
    expect(revenueLineKindOf(line("Livraison Bruxelles"))).toBe("livraison");
    expect(revenueLineKindOf(line("Location vaisselle"))).toBe("location_vaisselle");
    expect(revenueLineKindOf(line("Location de nappes"))).toBe("location_vaisselle");
    expect(revenueLineKindOf(line("Boissons soft"))).toBe("boissons");
    expect(revenueLineKindOf(line("Pourboire"))).toBe("autre");
    expect(revenueLineKindOf(line("Carte · Menu"))).toBe("autre");
    expect(revenueLineKindOf(line(""))).toBe("autre");
  });
  it("folds accents and case", () => {
    expect(revenueLineKindOf(line("Sérvice"))).toBe("service");
    expect(revenueLineKindOf(line("  LIVRAISON "))).toBe("livraison");
    expect(revenueLineKindOf(line("Vaisselle cassée"))).toBe("location_vaisselle");
  });
  it("a stored kind wins over the label", () => {
    expect(revenueLineKindOf(line("Service", 100, { kind: "autre" }))).toBe("autre");
    expect(revenueLineKindOf({ label: "Service", kind: "vin" as never })).toBe("service");
  });
});

describe("revenueByKind", () => {
  it("sums two service lines and leaves the other kinds at 0", () => {
    const e = { revenueLines: [line("Service", 300), line("Service soirée", 150.5), line("Livraison", 40)] };
    expect(revenueByKind(e)).toEqual({ service: 450.5, livraison: 40, location_vaisselle: 0, boissons: 0, autre: 0 });
    expect(revenueByKind({})).toEqual({ service: 0, livraison: 0, location_vaisselle: 0, boissons: 0, autre: 0 });
  });
});

describe("newRevenueLine and withRevenueKind", () => {
  it("newRevenueLine(\"boissons\") carries the kind label, 0 and 21 %", () => {
    expect(newRevenueLine("boissons")).toEqual({ kind: "boissons", label: "Boissons", amount: 0, vatRate: 21 });
    for (const k of REVENUE_LINE_KINDS) expect(newRevenueLine(k).label).toBe(REVENUE_LINE_KIND_LABELS[k]);
  });
  it("withRevenueKind replaces a kind label and keeps a custom one", () => {
    expect(withRevenueKind(line("Livraison", 40), "service")).toEqual({ label: "Service", amount: 40, vatRate: 21, kind: "service" });
    expect(withRevenueKind(line("Livraison Bruxelles", 40), "service")).toEqual({ label: "Livraison Bruxelles", amount: 40, vatRate: 21, kind: "service" });
    expect(withRevenueKind(line("", 40), "boissons").label).toBe("Boissons");
    expect(withRevenueKind(line("location vaisselle", 40, { kind: "location_vaisselle" }), "autre").label).toBe("Autre");
  });
});

describe("revenueByKindLabel", () => {
  it("lists the kinds in order, drops zero kinds and prints whole euros", () => {
    const e = { revenueLines: [line("Livraison", 150), line("Service", 300), line("Pourboire", 0)] };
    expect(revenueByKindLabel(e).replace(/[  ]/g, " ")).toBe("Service 300 € · Livraison 150 €");
    expect(revenueByKindLabel({ revenueLines: [] })).toBe("");
    expect(revenueByKindLabel({ revenueLines: [line("Boissons", 1250.4)] }).replace(/[  ]/g, " ")).toBe("Boissons 1 250 €");
  });
});
