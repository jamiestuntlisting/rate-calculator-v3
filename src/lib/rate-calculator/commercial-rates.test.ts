import { describe, it, expect } from "vitest";
import { commercialSessionFee } from "./rate-constants";

describe("commercial session fee — the Commercials Contract's own calendar", () => {
  it("pays the 2022 contract figure through March 2025", () => {
    expect(commercialSessionFee("2024-08-31")).toBe(783.1);
    expect(commercialSessionFee("2025-03-31")).toBe(783.1);
  });
  it("steps to $822.30 on April 1, 2025 (+5.0%)", () => {
    expect(commercialSessionFee("2025-04-01")).toBe(822.3);
    expect(commercialSessionFee("2026-03-31")).toBe(822.3);
  });
  it("steps to $855.20 on April 1, 2026 (+4.0%)", () => {
    expect(commercialSessionFee("2026-04-01")).toBe(855.2);
    // The cheat sheet's own overtime figures lock this: 855.20/8 = 106.90,
    // 1.5x = 160.35, 2x = 213.80 — printed exactly so on the sheet.
    expect(855.2 / 8).toBe(106.9);
  });
  it("dates before the earliest entry use it rather than a guess", () => {
    expect(commercialSessionFee("2021-06-01")).toBe(783.1);
  });
});
