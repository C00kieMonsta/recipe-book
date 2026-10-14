import { parseStepMarkup, scaleStepSegments, stripStepMarkup, toggleWrap } from "./step-markup";

describe("parseStepMarkup", () => {
  it("returns one plain span for a step without markers", () => {
    expect(parseStepMarkup("Ajouter la farine")).toEqual([{ text: "Ajouter la farine", bold: false, mark: false }]);
  });
  it("returns no span for an empty step", () => {
    expect(parseStepMarkup("")).toEqual([]);
  });
  it("parses bold and mark spans", () => {
    expect(parseStepMarkup("Ajouter **200 g** de farine et ==bien mélanger==")).toEqual([
      { text: "Ajouter ", bold: false, mark: false },
      { text: "200 g", bold: true, mark: false },
      { text: " de farine et ", bold: false, mark: false },
      { text: "bien mélanger", bold: false, mark: true },
    ]);
  });
  it("nests bold inside mark", () => {
    expect(parseStepMarkup("==Ajouter **200 g** de farine==")).toEqual([
      { text: "Ajouter ", bold: false, mark: true },
      { text: "200 g", bold: true, mark: true },
      { text: " de farine", bold: false, mark: true },
    ]);
  });
  it("nests mark inside bold", () => {
    expect(parseStepMarkup("**Cuire ==10 min== à feu doux**")).toEqual([
      { text: "Cuire ", bold: true, mark: false },
      { text: "10 min", bold: true, mark: true },
      { text: " à feu doux", bold: true, mark: false },
    ]);
  });
  it("keeps an unclosed ** literal", () => {
    expect(parseStepMarkup("Ajouter **200 g de farine")).toEqual([{ text: "Ajouter **200 g de farine", bold: false, mark: false }]);
  });
  it("keeps an unclosed == literal after a closed bold", () => {
    expect(parseStepMarkup("**Sel** ==et poivre")).toEqual([
      { text: "Sel", bold: true, mark: false },
      { text: " ==et poivre", bold: false, mark: false },
    ]);
  });
  it("keeps an empty pair literal", () => {
    expect(parseStepMarkup("Ajouter **** de sel")).toEqual([{ text: "Ajouter **** de sel", bold: false, mark: false }]);
    expect(parseStepMarkup("==== puis **sel**")).toEqual([
      { text: "==== puis ", bold: false, mark: false },
      { text: "sel", bold: true, mark: false },
    ]);
  });
  it("keeps an inner marker literal when it closes outside the enclosing span", () => {
    expect(parseStepMarkup("==a **b== c**")).toEqual([
      { text: "a **b", bold: false, mark: true },
      { text: " c**", bold: false, mark: false },
    ]);
  });
});

describe("stripStepMarkup", () => {
  it("removes matched markers", () => {
    expect(stripStepMarkup("Ajouter **200 g** de ==farine==")).toBe("Ajouter 200 g de farine");
    expect(stripStepMarkup("==Ajouter **200 g** de farine==")).toBe("Ajouter 200 g de farine");
  });
  it("keeps unmatched markers", () => {
    expect(stripStepMarkup("Ajouter **200 g de farine")).toBe("Ajouter **200 g de farine");
  });
  it("is idempotent", () => {
    const steps = [
      "Ajouter **200 g** de ==farine==",
      "==Ajouter **200 g** de farine==",
      "Ajouter **200 g de farine",
      "Ajouter **** de sel",
      "**Sel** ==et poivre",
      "Sans marqueur",
      "",
    ];
    for (const step of steps) {
      const once = stripStepMarkup(step);
      expect(stripStepMarkup(once)).toBe(once);
    }
  });
});

describe("toggleWrap", () => {
  it("wraps the selection in bold and keeps the word selected", () => {
    expect(toggleWrap("Ajouter 200 g de farine", 8, 13, "**")).toEqual({
      text: "Ajouter **200 g** de farine",
      selStart: 10,
      selEnd: 15,
    });
  });
  it("wraps the selection in a highlight", () => {
    expect(toggleWrap("Ajouter 200 g de farine", 17, 23, "==")).toEqual({
      text: "Ajouter 200 g de ==farine==",
      selStart: 19,
      selEnd: 25,
    });
  });
  it("unwraps when the markers sit around the selection", () => {
    expect(toggleWrap("Ajouter **200 g** de farine", 10, 15, "**")).toEqual({
      text: "Ajouter 200 g de farine",
      selStart: 8,
      selEnd: 13,
    });
  });
  it("unwraps when the selection includes the markers", () => {
    expect(toggleWrap("Ajouter **200 g** de farine", 8, 17, "**")).toEqual({
      text: "Ajouter 200 g de farine",
      selStart: 8,
      selEnd: 13,
    });
  });
  it("does not unwrap with the other marker", () => {
    expect(toggleWrap("Ajouter **200 g** de farine", 10, 15, "==")).toEqual({
      text: "Ajouter **==200 g==** de farine",
      selStart: 12,
      selEnd: 17,
    });
  });
  it("inserts a pair on an empty selection with the caret between", () => {
    expect(toggleWrap("Ajouter ", 8, 8, "**")).toEqual({ text: "Ajouter ****", selStart: 10, selEnd: 10 });
    expect(toggleWrap("Ajouter ", 8, 8, "==")).toEqual({ text: "Ajouter ====", selStart: 10, selEnd: 10 });
    expect(toggleWrap("", 0, 0, "**")).toEqual({ text: "****", selStart: 2, selEnd: 2 });
  });
  it("accepts a reversed selection and clamps out-of-range offsets", () => {
    expect(toggleWrap("Sel et poivre", 3, 0, "**")).toEqual({ text: "**Sel** et poivre", selStart: 2, selEnd: 5 });
    expect(toggleWrap("Sel", 0, 50, "**")).toEqual({ text: "**Sel**", selStart: 2, selEnd: 5 });
  });
});

describe("scaleStepSegments", () => {
  it("scales a bold quantity as a qty segment carrying the style", () => {
    expect(scaleStepSegments("Ajouter **200 g** de farine", 2)).toEqual({
      segments: [
        { kind: "text", text: "Ajouter ", bold: false, mark: false },
        { kind: "qty", from: "200 g", to: "400 g", bold: true, mark: false },
        { kind: "text", text: " de farine", bold: false, mark: false },
      ],
      changed: true,
    });
  });
  it("leaves a number split from its unit by a marker unscaled and literal", () => {
    expect(scaleStepSegments("**200** g", 2)).toEqual({
      segments: [
        { kind: "text", text: "200", bold: true, mark: false },
        { kind: "text", text: " g", bold: false, mark: false },
      ],
      changed: false,
    });
  });
  it("returns the spans unchanged at ratio 1", () => {
    expect(scaleStepSegments("Ajouter **200 g** de ==farine==", 1)).toEqual({
      segments: [
        { kind: "text", text: "Ajouter ", bold: false, mark: false },
        { kind: "text", text: "200 g", bold: true, mark: false },
        { kind: "text", text: " de ", bold: false, mark: false },
        { kind: "text", text: "farine", bold: false, mark: true },
      ],
      changed: false,
    });
  });
  it("keeps bold and mark on a quantity nested in both", () => {
    expect(scaleStepSegments("==Cuire **2 oeufs**==", 3)).toEqual({
      segments: [
        { kind: "text", text: "Cuire ", bold: false, mark: true },
        { kind: "qty", from: "2 oeufs", to: "6 oeufs", bold: true, mark: true },
      ],
      changed: true,
    });
  });
  it("scales plain text with no markers like scaleStepText", () => {
    expect(scaleStepSegments("Ajouter 125 g de beurre", 2)).toEqual({
      segments: [
        { kind: "text", text: "Ajouter ", bold: false, mark: false },
        { kind: "qty", from: "125 g", to: "250 g", bold: false, mark: false },
        { kind: "text", text: " de beurre", bold: false, mark: false },
      ],
      changed: true,
    });
  });
});
