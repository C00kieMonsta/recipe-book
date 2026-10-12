import { fmtQty, fmtQtyText, scaleStepText } from "./quantity";

describe("fmtQty", () => {
  it("shows grams as kg from 1000 with one trimmed decimal", () => {
    expect(fmtQtyText(5400, "g")).toBe("5,4 kg");
    expect(fmtQtyText(1000, "g")).toBe("1 kg");
    expect(fmtQtyText(2000, "g")).toBe("2 kg");
    expect(fmtQtyText(1250, "g")).toBe("1,3 kg");
  });
  it("shows whole grams between 10 and 999", () => {
    expect(fmtQtyText(999, "g")).toBe("999 g");
    expect(fmtQtyText(45.3, "g")).toBe("45 g");
    expect(fmtQty(45.3, "g")).toEqual({ value: "45", unit: "g" });
  });
  it("shows one decimal under 10 g", () => {
    expect(fmtQtyText(2.5, "g")).toBe("2,5 g");
  });
  it("applies the same thresholds to ml and l", () => {
    expect(fmtQtyText(1500, "ml")).toBe("1,5 l");
    expect(fmtQtyText(150, "ml")).toBe("150 ml");
    expect(fmtQtyText(5, "ml")).toBe("5 ml");
  });
  it("pluralises pièce and botte", () => {
    expect(fmtQtyText(7.5, "pièce")).toBe("7,5 pièces");
    expect(fmtQtyText(1, "pièce")).toBe("1 pièce");
    expect(fmtQtyText(3, "pièce")).toBe("3 pièces");
    expect(fmtQtyText(2, "botte")).toBe("2 bottes");
    expect(fmtQtyText(1, "botte")).toBe("1 botte");
  });
  it("keeps other units as stored with one decimal", () => {
    expect(fmtQtyText(2.25, "cs")).toBe("2,3 cs");
    expect(fmtQtyText(3, "cs")).toBe("3 cs");
  });
});

describe("scaleStepText", () => {
  it("returns the step untouched at ratio 1", () => {
    expect(scaleStepText("Ajouter 125 g de beurre", 1)).toEqual({ parts: ["Ajouter 125 g de beurre"], changed: false });
  });
  it("scales grams", () => {
    const r = scaleStepText("Ajouter 125 g de beurre", 6);
    expect(r.changed).toBe(true);
    expect(r.parts).toEqual(["Ajouter ", { from: "125 g", to: "750 g" }, " de beurre"]);
  });
  it("re-expresses litres through fmtQty", () => {
    expect(scaleStepText("1,5 l de lait", 2).parts).toEqual([{ from: "1,5 l", to: "3 l" }, " de lait"]);
    expect(scaleStepText("500 ml de crème", 4).parts).toEqual([{ from: "500 ml", to: "2 l" }, " de crème"]);
    expect(scaleStepText("2 kg de farine", 0.25).parts).toEqual([{ from: "2 kg", to: "500 g" }, " de farine"]);
  });
  it("leaves temperatures, times and lengths alone", () => {
    expect(scaleStepText("Cuire à 170 °C pendant 25 min", 6)).toEqual({ parts: ["Cuire à 170 °C pendant 25 min"], changed: false });
    expect(scaleStepText("Repos 2 h, abaisse de 3 mm", 2).changed).toBe(false);
    expect(scaleStepText("2 litres d'eau", 2).changed).toBe(false);
  });
  it("rounds eggs to the nearest whole", () => {
    expect(scaleStepText("5 oeufs", 6).parts).toEqual([{ from: "5 oeufs", to: "30 oeufs" }]);
    expect(scaleStepText("1 oeuf", 0.1)).toEqual({ parts: ["1 oeuf"], changed: false });
    expect(scaleStepText("4 oeufs", 0.1).parts).toEqual([{ from: "4 oeufs", to: "1 oeuf" }]);
    expect(scaleStepText("1 œuf", 2).parts).toEqual([{ from: "1 œuf", to: "2 œufs" }]);
  });
  it("keeps cl as cl", () => {
    expect(scaleStepText("20 cl de vin", 3).parts).toEqual([{ from: "20 cl", to: "60 cl" }, " de vin"]);
  });
  it("leaves words untouched", () => {
    expect(scaleStepText("Battre un oeuf", 6)).toEqual({ parts: ["Battre un oeuf"], changed: false });
    expect(scaleStepText("3 grammes", 2).changed).toBe(false);
  });
  it("handles several quantities in one step", () => {
    const r = scaleStepText("125 g de beurre et 2 oeufs", 2);
    expect(r.parts).toEqual([{ from: "125 g", to: "250 g" }, " de beurre et ", { from: "2 oeufs", to: "4 oeufs" }]);
  });
});
