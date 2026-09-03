import { describe, expect, it } from "vitest";
import { planAttach } from "./attach-upload";

const doc = (filename: string, documentType: "exhibit_g" | "call_sheet" = "exhibit_g") => ({
  filename,
  originalName: filename,
  documentType,
  uploadedAt: "2026-09-01T00:00:00.000Z",
});

describe("attaching a file to the day it belongs to", () => {
  it("a placeholder day that was only the file is deleted, and the file is retyped", () => {
    const plan = planAttach({ recordStatus: "attachment_only", documents: [doc("a.jpg")] }, "a.jpg", "call_sheet");
    expect(plan.remaining).toEqual([]);
    expect(plan.moved).toEqual({ ...doc("a.jpg"), documentType: "call_sheet" });
    expect(plan.deleteOld).toBe(true);
  });

  it("a day with another file on it keeps that file and stays", () => {
    const plan = planAttach(
      { recordStatus: "attachment_only", documents: [doc("a.jpg"), doc("b.jpg")] },
      "a.jpg",
      "call_sheet"
    );
    expect(plan.remaining).toEqual([doc("b.jpg")]);
    expect(plan.deleteOld).toBe(false);
  });

  it("a day with times on it is never deleted, even emptied of files", () => {
    const plan = planAttach({ recordStatus: "complete", documents: [doc("a.jpg")] }, "a.jpg", "contract");
    expect(plan.remaining).toEqual([]);
    expect(plan.deleteOld).toBe(false);
  });

  it("a file the old day never listed still lands on the new one", () => {
    const plan = planAttach({ recordStatus: "attachment_only", documents: [] }, "x.jpg", "photo", "2026-09-03T00:00:00.000Z");
    expect(plan.moved).toEqual({ filename: "x.jpg", originalName: "x.jpg", documentType: "photo", uploadedAt: "2026-09-03T00:00:00.000Z" });
    expect(plan.deleteOld).toBe(true);
  });
});
