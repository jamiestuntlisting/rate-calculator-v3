import { describe, it, expect } from "vitest";
import { RATES } from "@/lib/rate-constants";
import {
  additionalContractPay,
  MAX_CONTRACTS,
  MIN_CONTRACTS_FOR_FIELD,
} from "./multi-contract";

const DAY = RATES.theatrical_basic.daily;

describe("a day worked under more than one contract", () => {
  it("asks about it only once there are two", () => {
    expect(MIN_CONTRACTS_FOR_FIELD).toBe(2);
    expect(MAX_CONTRACTS).toBeGreaterThan(MIN_CONTRACTS_FOR_FIELD);
  });

  it("owes nothing extra for a single contract", () => {
    const result = additionalContractPay(1, "theatrical_basic", false);
    expect(result.count).toBe(0);
    expect(result.pay).toBe(0);
  });

  it("owes a day rate for each contract past the first", () => {
    // Four contracts: one calculated day, then three day rates.
    const result = additionalContractPay(4, "theatrical_basic", false);
    expect(result.count).toBe(3);
    expect(result.dayRate).toBe(DAY);
    expect(result.pay).toBe(3 * DAY);
  });

  it("uses the day rate of the agreement worked", () => {
    expect(additionalContractPay(2, "stunt_coordinator", false).dayRate).toBe(
      RATES.stunt_coordinator.daily
    );
    expect(additionalContractPay(2, "television", false).dayRate).toBe(
      RATES.television.daily
    );
  });

  it("stacks nothing on a multiple-episode weekly", () => {
    const result = additionalContractPay(4, "theatrical_basic", true);
    expect(result.pay).toBe(0);
    expect(result.count).toBe(0);
    // Still says why, so the form can explain itself.
    expect(result.absorbedByWeekly).toBe(true);
  });

  it("does not claim a weekly absorbed anything on a single contract", () => {
    expect(additionalContractPay(1, "theatrical_basic", true).absorbedByWeekly)
      .toBe(false);
  });

  it.each([
    [0, 0],
    [-3, 0],
    [null, 0],
    [undefined, 0],
    [2.7, 1], // a stray decimal counts whole contracts, never part of one
  ])("treats %s contracts as %d extra", (contracts, expected) => {
    expect(
      additionalContractPay(contracts as number, "theatrical_basic", false).count
    ).toBe(expected);
  });

  it("falls back to the theatrical day rate when no agreement is set", () => {
    expect(additionalContractPay(2, null, false).dayRate).toBe(DAY);
  });

  it("owes a second contract the flat rate, not scale", () => {
    // On a $2,500 flat deal the second contract is worth $2,500. Reaching
    // for the schedule here would pay it $1,283 and lose the difference in
    // silence — the flat number is this performer's day rate.
    const flat = additionalContractPay(2, "theatrical_basic", false, 2500);
    expect(flat.dayRate).toBe(2500);
    expect(flat.pay).toBe(2500);

    const scale = additionalContractPay(2, "theatrical_basic", false);
    expect(scale.pay).toBe(DAY);
  });

  it("still stacks flat-deal contracts, and still lets a weekly absorb them", () => {
    expect(additionalContractPay(4, "theatrical_basic", false, 2500).pay).toBe(7500);
    expect(additionalContractPay(4, "theatrical_basic", true, 2500).pay).toBe(0);
  });

  it("ignores a flat rate of nothing, which is how the form says there is none", () => {
    for (const none of [0, null, undefined]) {
      expect(additionalContractPay(2, "theatrical_basic", false, none).dayRate)
        .toBe(DAY);
    }
  });
});
