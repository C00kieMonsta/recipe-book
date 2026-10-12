import { fmtEur, round2, splitTvac, sumMoney } from "./money";

describe("round2", () => {
  it("rounds to two decimals", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.345)).toBe(2.35);
    expect(round2(10)).toBe(10);
    expect(round2(-1.235)).toBe(-1.23);
  });
});

describe("sumMoney", () => {
  it("sums floating amounts exactly", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
    expect(0.1 + 0.7).not.toBe(0.8);
    expect(sumMoney([0.1, 0.7])).toBe(0.8);
    expect(sumMoney([0.1, 0.2, 0.7])).toBe(1);
    expect(sumMoney([19.99, 0.01, 1234.56])).toBe(1254.56);
    expect(sumMoney([])).toBe(0);
    expect(sumMoney([-5.5, 5.5])).toBe(0);
  });
});

describe("splitTvac", () => {
  it("splits 106 at 6 %", () => {
    expect(splitTvac(106, 6)).toEqual({ htva: 100, vatAmount: 6 });
  });
  it("splits 112 at 12 %", () => {
    expect(splitTvac(112, 12)).toEqual({ htva: 100, vatAmount: 12 });
  });
  it("splits 121 at 21 %", () => {
    expect(splitTvac(121, 21)).toEqual({ htva: 100, vatAmount: 21 });
  });
  it("keeps everything in htva at rate 0", () => {
    expect(splitTvac(50.25, 0)).toEqual({ htva: 50.25, vatAmount: 0 });
  });
  it("satisfies htva + vatAmount === tvac on random amounts", () => {
    for (let i = 0; i < 200; i++) {
      const tvac = round2(Math.random() * 10000);
      const rate = [0, 6, 12, 21][i % 4];
      const { htva, vatAmount } = splitTvac(tvac, rate);
      expect(sumMoney([htva, vatAmount])).toBe(tvac);
    }
  });
});

describe("fmtEur", () => {
  it("formats 1234.56 as 1 234,56 €", () => {
    const out = fmtEur(1234.56).replace(/[  ]/g, " ");
    expect(out).toBe("1 234,56 €");
  });
  it("formats negatives", () => {
    const out = fmtEur(-3).replace(/[  ]/g, " ");
    expect(out).toBe("-3,00 €");
  });
});
