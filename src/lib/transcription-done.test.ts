import { describe, expect, it } from "vitest";
import { doneBlockers, listMissing } from "./transcription-done";

const complete = {
  showName: "Grown Ups 3",
  workDate: "2026-08-11",
  callTime: "07:30",
  dismissMakeupWardrobe: "17:40",
  lunch: "yes" as const,
  firstMealStart: "14:35",
  firstMealFinish: "15:05",
};

describe("what a G needs before it is done", () => {
  it("a full day passes", () => {
    expect(doneBlockers(complete)).toEqual([]);
  });

  it("the show, the date, the call and the wrap are each required, in form order", () => {
    expect(
      doneBlockers({ ...complete, showName: "", workDate: "", callTime: "", dismissMakeupWardrobe: "" })
    ).toEqual(["the show", "the work date", "the call time", "the wrap"]);
    expect(doneBlockers({ ...complete, showName: "  " })).toEqual(["the show"]);
  });

  it("lunch has to be answered", () => {
    expect(
      doneBlockers({ ...complete, lunch: "", firstMealStart: "", firstMealFinish: "" })
    ).toEqual(["whether you got lunch"]);
  });

  it("yes to lunch needs the In and Out; no does not", () => {
    expect(doneBlockers({ ...complete, firstMealFinish: "" })).toEqual([
      "the lunch In and Out",
    ]);
    expect(
      doneBlockers({ ...complete, lunch: "no", firstMealStart: "", firstMealFinish: "" })
    ).toEqual([]);
  });

  it("a row saved before the question existed: lunch times mean yes", () => {
    expect(doneBlockers({ ...complete, lunch: undefined })).toEqual([]);
    expect(doneBlockers({ ...complete, lunch: null, firstMealFinish: "" })).toEqual([
      "whether you got lunch",
    ]);
  });

  it("reads the list out as a sentence", () => {
    expect(listMissing(["the show"])).toBe("the show");
    expect(listMissing(["the show", "the wrap"])).toBe("the show and the wrap");
    expect(listMissing(["the show", "the call time", "the wrap"])).toBe(
      "the show, the call time and the wrap"
    );
  });
});
