import { describe, expect, it } from "vitest";
import { isStuntDouble } from "./stunt-double";

describe("a character that is a stunt double", () => {
  it("reads the approved name and the ways a card abbreviates it", () => {
    expect(isStuntDouble("Stunt Double")).toBe(true);
    expect(isStuntDouble("stunt double - lead")).toBe(true);
    expect(isStuntDouble("#X4 MARCUS STUNT DBL")).toBe(true);
    expect(isStuntDouble("Utility Stunt Double")).toBe(true);
  });

  it("leaves the other stunt roles alone", () => {
    expect(isStuntDouble("Stunt Performer")).toBe(false);
    expect(isStuntDouble("Utility Stunts")).toBe(false);
    expect(isStuntDouble("Stunt Coordinator")).toBe(false);
    expect(isStuntDouble("Double Agent")).toBe(false);
    expect(isStuntDouble("")).toBe(false);
    expect(isStuntDouble(null)).toBe(false);
  });
});
