import { defaultGroceryStorage } from "./grocery";

describe("defaultGroceryStorage", () => {
  it("classifies common fresh and dry ingredients", () => {
    expect(defaultGroceryStorage("Fromage de chèvre frais")).toBe("fresh");
    expect(defaultGroceryStorage("Farine de blé")).toBe("dry");
  });

  it("leaves unfamiliar names unclassified for a person to choose", () => {
    expect(defaultGroceryStorage("Perlimpinpin")).toBe("unclassified");
  });
});
