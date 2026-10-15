import { personSchema } from "./settings";

const base = { personId: "kristoff", name: "Kristoff", active: true };

describe("personSchema rates and payment mode", () => {
  it("accepts hourlyRate, kmRate and paymentMode", () => {
    const r = personSchema.safeParse({ ...base, hourlyRate: 18, kmRate: 0.3, paymentMode: "nowjobs" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({ ...base, hourlyRate: 18, kmRate: 0.3, paymentMode: "nowjobs" });
    expect(personSchema.safeParse({ ...base, paymentMode: "cash" }).success).toBe(true);
    expect(personSchema.safeParse({ ...base, paymentMode: "facture" }).success).toBe(true);
  });
  it("refuses a negative hourly rate", () => {
    expect(personSchema.safeParse({ ...base, hourlyRate: -1 }).success).toBe(false);
  });
  it("refuses an hourly rate with more than two decimals", () => {
    expect(personSchema.safeParse({ ...base, hourlyRate: 18.123 }).success).toBe(false);
    expect(personSchema.safeParse({ ...base, hourlyRate: 18.12 }).success).toBe(true);
  });
  it("accepts a km rate with three decimals", () => {
    expect(personSchema.safeParse({ ...base, kmRate: 0.345 }).success).toBe(true);
  });
  it("refuses a km rate above 10 or negative", () => {
    expect(personSchema.safeParse({ ...base, kmRate: 11 }).success).toBe(false);
    expect(personSchema.safeParse({ ...base, kmRate: -0.1 }).success).toBe(false);
  });
  it("refuses an unknown payment mode", () => {
    expect(personSchema.safeParse({ ...base, paymentMode: "virement" }).success).toBe(false);
  });
  it("still accepts a person without the three fields", () => {
    const r = personSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual(base);
  });
});
