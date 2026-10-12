import {
  addDays,
  datesOfIsoWeek,
  dayLabel,
  endOfWeekSunday,
  isoWeekOf,
  longDayLabel,
  monthLabel,
  mondayOfIsoWeek,
  parseIsoWeek,
  rangeLabel,
  startOfWeekMonday,
  weekLabel,
  weekdayOf,
  ymOf,
} from "./dates";

describe("isoWeekOf", () => {
  it("2026-01-01 is 2026-W01", () => {
    expect(isoWeekOf("2026-01-01")).toBe("2026-W01");
  });
  it("2026-12-31 and 2027-01-03 are 2026-W53", () => {
    expect(isoWeekOf("2026-12-31")).toBe("2026-W53");
    expect(isoWeekOf("2027-01-03")).toBe("2026-W53");
  });
  it("2024-12-30 is 2025-W01", () => {
    expect(isoWeekOf("2024-12-30")).toBe("2025-W01");
  });
  it("2026-10-12 to 2026-10-18 are 2026-W42 and 19 October starts W43", () => {
    expect(isoWeekOf("2026-10-12")).toBe("2026-W42");
    expect(isoWeekOf("2026-10-18")).toBe("2026-W42");
    expect(isoWeekOf("2026-10-19")).toBe("2026-W43");
  });
  it("accepts a full ISO timestamp and ignores the time", () => {
    expect(isoWeekOf("2026-10-18T23:59:59.000Z")).toBe("2026-W42");
  });
});

describe("datesOfIsoWeek", () => {
  it("2026-W01 runs 2025-12-29 to 2026-01-04", () => {
    expect(datesOfIsoWeek("2026-W01")).toEqual([
      "2025-12-29", "2025-12-30", "2025-12-31", "2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04",
    ]);
  });
  it("2026-W42 runs 2026-10-12 to 2026-10-18", () => {
    expect(datesOfIsoWeek("2026-W42")).toEqual([
      "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18",
    ]);
  });
  it("2026-W53 ends on 2027-01-03 and 2025-W01 starts on 2024-12-30", () => {
    expect(datesOfIsoWeek("2026-W53")[6]).toBe("2027-01-03");
    expect(mondayOfIsoWeek("2025-W01")).toBe("2024-12-30");
  });
  it("rejects a malformed week", () => {
    expect(() => parseIsoWeek("2026-42")).toThrow();
  });
});

describe("round trips", () => {
  it("every date of a week maps back to that week", () => {
    for (const w of ["2026-W01", "2026-W42", "2026-W53", "2025-W01", "2024-W52", "2020-W53"]) {
      for (const d of datesOfIsoWeek(w)) expect(isoWeekOf(d)).toBe(w);
    }
  });
  it("every day of 2026 belongs to the week it is listed in", () => {
    let d = "2026-01-01";
    while (d <= "2026-12-31") {
      expect(datesOfIsoWeek(isoWeekOf(d))).toContain(d);
      d = addDays(d, 1);
    }
  });
});

describe("week bounds", () => {
  it("startOfWeekMonday and endOfWeekSunday", () => {
    expect(startOfWeekMonday("2026-10-15")).toBe("2026-10-12");
    expect(startOfWeekMonday("2026-10-12")).toBe("2026-10-12");
    expect(startOfWeekMonday("2026-10-18")).toBe("2026-10-12");
    expect(endOfWeekSunday("2026-10-15")).toBe("2026-10-18");
    expect(endOfWeekSunday("2026-01-01")).toBe("2026-01-04");
    expect(startOfWeekMonday("2026-01-01")).toBe("2025-12-29");
  });
  it("weekdayOf is ISO (Monday 1, Sunday 7)", () => {
    expect(weekdayOf("2026-10-12")).toBe(1);
    expect(weekdayOf("2026-10-18")).toBe(7);
  });
});

describe("addDays and ymOf", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
  });
  it("ymOf keeps the year and month", () => {
    expect(ymOf("2026-10-13")).toBe("2026-10");
    expect(ymOf("2026-10-13T10:00:00Z")).toBe("2026-10");
  });
});

describe("French labels", () => {
  it("dayLabel", () => {
    expect(dayLabel("2026-10-13")).toBe("Mar 13");
    expect(dayLabel("2026-10-18")).toBe("Dim 18");
  });
  it("longDayLabel", () => {
    expect(longDayLabel("2026-10-13")).toBe("Mardi 13 octobre");
  });
  it("rangeLabel", () => {
    expect(rangeLabel("2026-10-12", "2026-10-18")).toBe("12 au 18 octobre");
    expect(rangeLabel("2026-09-28", "2026-10-04")).toBe("28 septembre au 4 octobre");
    expect(rangeLabel("2025-12-29", "2026-01-04")).toBe("29 décembre 2025 au 4 janvier 2026");
    expect(weekLabel("2026-W42")).toBe("12 au 18 octobre");
  });
  it("monthLabel", () => {
    expect(monthLabel("2026-10")).toBe("Octobre 2026");
    expect(monthLabel("2026-10-13")).toBe("Octobre 2026");
  });
});
