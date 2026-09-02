import { describe, expect, it } from "vitest";
import { battingAverage, scoreField, scoreReading } from "./score";

describe("scoring one field", () => {
  it("times: exact, within fifteen minutes, twelve hours out, or wrong", () => {
    expect(scoreField("time", "06:00", "06:00")).toEqual({ outcome: "exact", delta: 0 });
    expect(scoreField("time", "06:00", "06:12")).toEqual({ outcome: "small", delta: 12 });
    expect(scoreField("time", "06:00", "18:00")).toEqual({ outcome: "meridiem", delta: 720 });
    expect(scoreField("time", "18:00", "06:00")).toEqual({ outcome: "meridiem", delta: -720 });
    expect(scoreField("time", "06:00", "07:30")).toEqual({ outcome: "large", delta: 90 });
    // Across midnight the short way round counts.
    expect(scoreField("time", "23:55", "00:05")).toEqual({ outcome: "small", delta: 10 });
  });

  it("a blank on either side is a miss or a spurious read; both blank is nothing", () => {
    expect(scoreField("time", null, "06:00").outcome).toBe("missed");
    expect(scoreField("time", "06:00", "").outcome).toBe("spurious");
    expect(scoreField("time", null, "").outcome).toBe("blank");
  });

  it("money: to the dollar, within fifty, or wrong; zero is blank", () => {
    expect(scoreField("money", 100, "100")).toEqual({ outcome: "exact", delta: 0 });
    expect(scoreField("money", 100, 150)).toEqual({ outcome: "small", delta: 50 });
    expect(scoreField("money", 100, 500)).toEqual({ outcome: "large", delta: 400 });
    expect(scoreField("money", null, 0).outcome).toBe("blank");
    expect(scoreField("money", 100, 0).outcome).toBe("spurious");
  });

  it("text: case and spacing do not count; a contained name is close", () => {
    expect(scoreField("text", "Stunt Double", "stunt  double").outcome).toBe("exact");
    expect(scoreField("text", "Grown Ups 3 (Stunts)", "Grown Ups 3").outcome).toBe("small");
    expect(scoreField("text", "The Equalizer", "Grown Ups 3").outcome).toBe("large");
  });

  it("dates: the day, a day or two out, or wrong", () => {
    expect(scoreField("date", "2026-08-11", "2026-08-11").outcome).toBe("exact");
    expect(scoreField("date", "2026-08-10", "2026-08-11")).toEqual({ outcome: "small", delta: 1 });
    expect(scoreField("date", "2026-07-11", "2026-08-11").outcome).toBe("large");
  });
});

describe("scoring a reading and averaging it", () => {
  it("covers every judged field and tallies the average", () => {
    const scores = scoreReading(
      {
        showName: "Grown Ups 3",
        workDate: "2026-08-11",
        character: "Stunt Double",
        callTime: "07:30",
        firstMealStart: "14:35",
        firstMealFinish: "15:05",
        dismissOnSet: "17:25",
        dismissMakeupWardrobe: "05:40",
        stuntAdjustment: null,
      },
      {
        showName: "Grown Ups 3",
        workDate: "2026-08-11",
        character: "Stunt Double",
        callTime: "07:30",
        firstMealStart: "14:35",
        firstMealFinish: "15:05",
        dismissOnSet: "17:25",
        dismissMakeupWardrobe: "17:40",
        stuntAdjustment: 0,
      }
    );
    expect(scores).toHaveLength(12);
    const wrap = scores.find((s) => s.field === "dismissMakeupWardrobe")!;
    expect(wrap.outcome).toBe("meridiem");
    const avg = battingAverage(scores);
    // Three both-blank fields (ND, 2nd meal ×2 — plus money zero) drop out.
    expect(avg.counted).toBe(8);
    expect(avg.exact).toBe(7);
    expect(avg.meridiem).toBe(1);
    expect(avg.average).toBeCloseTo(7 / 8, 5);
    expect(avg.closeEnough).toBeCloseTo(7 / 8, 5);
  });

  it("an empty set has no average", () => {
    expect(battingAverage([]).average).toBeNull();
  });
});
