import { describe, it, expect } from "vitest";
import { wrapOrderWarning } from "./wrap-check";

describe("wrap order", () => {
  it("accepts a wrap shortly after dismissal", () => {
    expect(wrapOrderWarning("17:24", "17:39")).toBeNull();
  });

  it("accepts a wrap at exactly the dismissal minute", () => {
    // Dismissed and out of wardrobe in one go — the card writes a
    // dash. calculateDuration would read the equal pair as a
    // 24-hour overnight stretch, which must not warn.
    expect(wrapOrderWarning("20:42", "20:42")).toBeNull();
    // A record from before the fields were native can carry an
    // unpadded hour; the pair is still the same minute.
    expect(wrapOrderWarning("9:30", "09:30")).toBeNull();
  });

  it("flags a wrap entered before the dismissal", () => {
    // Dismissed 5:24 PM, wrapped "1:24 PM" — the picker opened at the
    // current clock and the time stuck; read overnight this pays a
    // twenty-hour wrap.
    expect(wrapOrderWarning("17:24", "13:24")).toContain("before");
  });

  it("still allows an after-midnight wrap on a night shoot", () => {
    expect(wrapOrderWarning("23:50", "00:10")).toBeNull();
  });

  it("says nothing while either time is missing", () => {
    expect(wrapOrderWarning("17:24", null)).toBeNull();
    expect(wrapOrderWarning(null, "17:39")).toBeNull();
  });
});
