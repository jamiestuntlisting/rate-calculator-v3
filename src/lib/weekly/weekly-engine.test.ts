import { describe, it, expect } from "vitest";
import { calculateWeekly, type WeeklyInput } from "./weekly-engine";
import fixtures from "./__fixtures__/showbiz-weekly-cards.json";

/**
 * Fixtures are real ShowBiz SAG cards; the card id names each test and the
 * expected totals are what payroll actually paid. Derivations are in
 * docs/weekly-rules.md §8.
 */
const base: WeeklyInput = {
  scaleWeeklyRate: 3936,
  contractWeeklyRate: 4400,
  daysWorked: 5,
};

describe("weekly gross — real ShowBiz cards", () => {
  it("S1022: base + daily overtime + adjustment", () => {
    const result = calculateWeekly({
      ...base,
      adjustments: 400,
      dailyOvertimeHours: 0.5,
    });
    expect(result.hourlyRate).toBeCloseTo(98.545455, 5);
    expect(result.prorationFactor).toBe(1);
    expect(result.overtimeAbsorbed).toBe(false);
    expect(result.subtotal).toBe(4409.91);
    expect(result.grandTotal).toBe(4409.91);
  });

  it("S894: the contract rate caps the overtime hourly", () => {
    const result = calculateWeekly({
      ...base,
      contractWeeklyRate: 5500,
      adjustments: 200,
      doubleTimeHours: 1.7,
    });
    // 3936 + 200 is below the 5500 contract, so the adjusted rate is used.
    expect(result.hourlyRate).toBe(94);
    expect(result.subtotal).toBe(4455.6);
    expect(result.grandTotal).toBe(4455.6);
  });

  it("S934: distant week — overtime still divides by 44, plus 4 hours allowance", () => {
    const result = calculateWeekly({
      ...base,
      contractWeeklyRate: 5500,
      daysWorked: 6, // two of them hold days, absorbed by the guarantee
      adjustments: 400,
      doubleTimeHours: 1.6,
      penaltyOvertimeHours: 6.7,
      extra: "loc_allowance",
      postSubtotalAdjustments: 1457.2,
    });
    expect(result.hourlyRate).toBeCloseTo(98.545455, 5);
    expect(result.prorationFactor).toBe(1);
    expect(result.subtotal).toBe(6035.91);
    expect(result.grandTotal).toBe(7493.11);
  });

  it("S1415: 6th and 7th day premiums on top of a full week", () => {
    const result = calculateWeekly({
      scaleWeeklyRate: 4646,
      contractWeeklyRate: 5500,
      daysWorked: 7,
      adjustments: 700,
      weeklyOvertimeHours: 6,
      doubleTimeHours: 14,
      sixthDay: true,
      seventhDay: true,
      postSubtotalAdjustments: 5575.2,
    });
    expect(result.hourlyRate).toBe(121.5);
    // Days six and seven pay as premiums, so the base stays at one week.
    expect(result.prorationFactor).toBe(1);
    expect(result.subtotal).toBe(13303.7);
    expect(result.grandTotal).toBe(18878.9);
  });

  it("S1231: a four-day week prorates the base to 0.8", () => {
    const result = calculateWeekly({
      scaleWeeklyRate: 4489,
      contractWeeklyRate: 5500,
      daysWorked: 4,
      adjustments: 150,
      doubleTimeHours: 3.5,
      penaltyOvertimeHours: 1.4,
      postSubtotalAdjustments: 1327.8,
    });
    expect(result.prorationFactor).toBe(0.8);
    expect(result.subtotal).toBe(4700.63);
    expect(result.grandTotal).toBe(6028.43);
  });

  it("S1383: heavy adjustments absorb weekly overtime", () => {
    const result = calculateWeekly({
      scaleWeeklyRate: 4646,
      contractWeeklyRate: 5500,
      daysWorked: 5,
      adjustments: 2500,
      weeklyOvertimeHours: 6,
    });
    expect(result.hourlyRate).toBe(125);
    expect(result.overtimeAbsorbed).toBe(true);
    expect(result.absorbedOvertime).toBe(1125);
    expect(result.subtotal).toBe(7146);
  });

  it("S1384: double time is never absorbed", () => {
    const absorbed = calculateWeekly({
      scaleWeeklyRate: 4646,
      contractWeeklyRate: 5500,
      daysWorked: 5,
      adjustments: 2500,
      weeklyOvertimeHours: 6,
      doubleTimeHours: 5,
    });
    // Same card as S1383 plus five hours of double time: 5 × 125 × 2.
    expect(absorbed.overtimeAbsorbed).toBe(true);
    expect(absorbed.subtotal).toBe(8396);
  });
});

describe("weekly gross — rules", () => {
  it("sums at full precision and rounds once", () => {
    // S1210, where 4034/44 repeats: rounding each line first gives 5775.96,
    // a cent more than payroll paid.
    const result = calculateWeekly({
      scaleWeeklyRate: 4034,
      contractWeeklyRate: 5500,
      daysWorked: 5,
      doubleTimeHours: 5,
      weeklyOvertimeHours: 6,
    });
    const summedRounded = result.lineItems.reduce((s, i) => s + i.amount, 0);
    expect(result.subtotal).toBe(5775.95);
    expect(Math.round(summedRounded * 100) / 100).toBe(5775.96);
  });

  it("a worked holiday adds a day at scale to the base", () => {
    const result = calculateWeekly({ ...base, daysWorked: 5, holidayDays: 1 });
    expect(result.prorationFactor).toBeCloseTo(1.2, 10);
    expect(result.subtotal).toBe(4723.2);
  });

  it("a seventh day pays double a day, a sixth day time and a half", () => {
    const result = calculateWeekly({
      ...base,
      daysWorked: 7,
      sixthDay: true,
      seventhDay: true,
    });
    const sixth = result.lineItems.find((i) => i.label === "6th day");
    const seventh = result.lineItems.find((i) => i.label === "7th day");
    expect(sixth?.amount).toBeCloseTo(1.5 * (3936 / 5), 2);
    expect(seventh?.amount).toBeCloseTo(2 * (3936 / 5), 2);
  });

  it("rejects a missing scale rate rather than paying zero", () => {
    expect(() => calculateWeekly({ ...base, scaleWeeklyRate: 0 })).toThrow();
  });
});

/**
 * The whole ShowBiz sample, so a change to the model shows up as a drop in
 * the match rate rather than as a subtly different paycheque.
 */
describe("weekly gross — all 133 ShowBiz cards", () => {
  const cards = fixtures as Array<{
    card: string;
    input: WeeklyInput;
    expectedSubtotal: number;
    expectedGross: number;
  }>;

  /**
   * S1234 is malformed rather than a rule we are missing: its HOLIDAY line
   * carries units and a multiplier but no rate, so payroll charged nothing
   * for it, while its sibling S1235 — same production, same week, same
   * HOLIDAY flag — prices that line at a day of scale. The two cards
   * contradict each other and only they exercise this path. Encoding the
   * opposite rule would fail S1235 instead. See docs/weekly-rules.md §7.
   */
  const KNOWN_MISS = "S1234";

  it("has the full sample", () => {
    expect(cards).toHaveLength(133);
  });

  it("matches payroll to the cent on every card but the malformed one", () => {
    const misses = cards.filter(
      (c) =>
        Math.abs(calculateWeekly(c.input).grandTotal - c.expectedGross) >= 0.005
    );
    expect(misses.map((m) => m.card)).toEqual([KNOWN_MISS]);
  });

  it("matches the subtotal before adjustments just as closely", () => {
    const misses = cards.filter(
      (c) =>
        Math.abs(calculateWeekly(c.input).subtotal - c.expectedSubtotal) >= 0.005
    );
    expect(misses.map((m) => m.card)).toEqual([KNOWN_MISS]);
  });

  it("documents what the malformed card costs us", () => {
    const card = cards.find((c) => c.card === KNOWN_MISS)!;
    const result = calculateWeekly(card.input);
    // We pay the holiday; payroll did not. One day at scale.
    expect(result.grandTotal - card.expectedGross).toBeCloseTo(
      card.input.scaleWeeklyRate / 5,
      2
    );
  });
});

describe("weekly minimum — the contract floors the week", () => {
  it("a 1-day week tops up to the full weekly with a guarantee line", () => {
    const result = calculateWeekly({
      scaleWeeklyRate: 4785,
      contractWeeklyRate: 4785,
      daysWorked: 1,
      minimumWeekly: 4785,
    });
    // 0.2 × 4785 = 957 of base, 3828 of guarantee, one full week owed.
    expect(result.prorationFactor).toBe(0.2);
    const guarantee = result.lineItems.find(
      (l) => l.label === "Weekly guarantee"
    );
    expect(guarantee?.amount).toBe(3828);
    expect(result.subtotal).toBe(4785);
    expect(result.grandTotal).toBe(4785);
  });

  it("a week that works out over the minimum keeps the larger figure", () => {
    const result = calculateWeekly({
      scaleWeeklyRate: 4785,
      contractWeeklyRate: 4785,
      daysWorked: 5,
      weeklyOvertimeHours: 6,
      minimumWeekly: 4785,
    });
    expect(
      result.lineItems.some((l) => l.label === "Weekly guarantee")
    ).toBe(false);
    expect(result.grandTotal).toBeGreaterThan(4785);
  });

  it("penalties are not wages: they land on top of the floored week", () => {
    const result = calculateWeekly({
      scaleWeeklyRate: 4785,
      contractWeeklyRate: 4785,
      daysWorked: 2,
      postSubtotalAdjustments: 120,
      minimumWeekly: 4785,
    });
    expect(result.subtotal).toBe(4785);
    expect(result.grandTotal).toBe(4905);
  });

  it("without a minimum the proration stands, as the payroll cards demand", () => {
    const result = calculateWeekly({
      scaleWeeklyRate: 4785,
      contractWeeklyRate: 4785,
      daysWorked: 1,
    });
    expect(result.subtotal).toBe(957);
  });
});
