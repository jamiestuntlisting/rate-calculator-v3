import { describe, expect, it } from "vitest";
import { anchorFraction, lockedScrollTop } from "./use-focal-zoom";

/**
 * The row lock's arithmetic: which line of the card sits under the
 * highlight, and where to scroll to keep it there once the card's size
 * or the pane's size changes.
 */
describe("the row lock", () => {
  it("grabs the line under the pane's centre", () => {
    // 400px pane, scrolled 300 down, 2000px card: the centre is at 500.
    expect(anchorFraction(300, 400, 2000)).toBe(0.25);
  });

  it("puts that line back under the centre after a zoom", () => {
    // Card doubles to 4000px: the same line is at 1000, so 800 scroll.
    expect(lockedScrollTop(0.25, 4000, 400)).toBe(800);
  });

  it("holds the line through a pane resize", () => {
    // A phone turning: pane 400 → 300 tall; the line stays at 500.
    expect(lockedScrollTop(0.25, 2000, 300)).toBe(350);
  });

  it("follows the highlight when it sits above the middle, as on a desktop", () => {
    // Line at 40% of a 1000px pane: the card line at 500 wants scroll 100.
    expect(anchorFraction(100, 1000, 2000, 0.4)).toBe(0.25);
    expect(lockedScrollTop(0.25, 2000, 1000, 0.4)).toBe(100);
    // Zoomed to double, the same line lands at 1000 − 400.
    expect(lockedScrollTop(0.25, 4000, 1000, 0.4)).toBe(600);
  });

  it("never scrolls above the top, and clamps the fraction", () => {
    expect(lockedScrollTop(0.05, 2000, 400)).toBe(0);
    expect(anchorFraction(5000, 400, 2000)).toBe(1);
    expect(anchorFraction(0, 400, 0)).toBe(0);
  });
});
