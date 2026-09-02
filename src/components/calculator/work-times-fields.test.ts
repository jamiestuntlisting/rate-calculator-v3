import { describe, it, expect } from "vitest";
import { mealBoundsWarning } from "./work-times-fields";

const warn = (
  call: string,
  end: string | null,
  time: string | null,
  endName = "wrap"
) => mealBoundsWarning(call, end, endName, "The 1st Meal In", time);

describe("a meal sits between call and the day's end", () => {
  it("says nothing about a meal inside the day", () => {
    expect(warn("07:00", "19:00", "13:00")).toBeNull();
  });

  it("equal to call or to the end is fine — between is inclusive", () => {
    expect(warn("07:00", "19:00", "07:00")).toBeNull();
    expect(warn("07:00", "19:00", "19:00")).toBeNull();
  });

  it("flags James's case: a 7:24 PM call with a 1:39 PM lunch", () => {
    // No end entered yet — the clock reading is eighteen hours after
    // call, which is really a lunch entered on the wrong meridiem.
    const message = warn("19:24", null, "13:39");
    expect(message).toContain("reads as before your 7:24 PM call");
    expect(message).toContain("Did you mean 1:39 AM?");
  });

  it("with a wrap the check is exact, and quotes both ends", () => {
    const message = warn("19:24", "08:00", "13:39");
    expect(message).toContain("isn't between your 7:24 PM call");
    expect(message).toContain("8:00 AM wrap");
    expect(message).toContain("Did you mean 1:39 AM?");
  });

  it("a night shoot crossing midnight keeps its meals", () => {
    // 7:24 PM call, 1:39 AM lunch, 8:00 AM wrap — a real night day.
    expect(warn("19:24", "08:00", "01:39")).toBeNull();
    // And before the wrap exists, a meal under twelve hours in is
    // trusted rather than argued with.
    expect(warn("19:24", null, "01:39")).toBeNull();
  });

  it("does not offer a flip that would still sit outside the day", () => {
    // 6:00 AM call, 5:00 PM wrap; 5:30 PM flips to 5:30 AM — before
    // call, so no suggestion, just the fact.
    const message = warn("06:00", "17:00", "17:30");
    expect(message).toContain("isn't between");
    expect(message).not.toContain("Did you mean");
  });

  it("says nothing while call or the meal time is missing", () => {
    expect(warn("", "19:00", "13:00")).toBeNull();
    expect(warn("07:00", "19:00", null)).toBeNull();
    expect(warn("07:00", "19:00", "")).toBeNull();
  });
});
