import { describe, it, expect } from "vitest";
import { extensionOf, isUploadable, storedContentType } from "./uploadable";

describe("what may be attached", () => {
  it.each([
    ["image/jpeg", "call-sheet.jpg"],
    ["image/png", "contract.png"],
    ["image/heic", "wardrobe.HEIC"],
    ["application/pdf", "deal-memo.pdf"],
  ])("takes a %s", (type, name) => {
    expect(isUploadable(type, name)).toBe(true);
  });

  it.each([
    ["video/quicktime", "gag.mov"],
    ["video/mp4", "stunt.mp4"],
    ["video/x-msvideo", "take3.avi"],
  ])("refuses a %s", (type, name) => {
    expect(isUploadable(type, name)).toBe(false);
  });

  it("refuses a video even when it is named like a photo", () => {
    expect(isUploadable("video/mp4", "definitely-a-photo.jpg")).toBe(false);
  });

  it("falls back to the name when the type is missing", () => {
    expect(isUploadable("", "call-sheet.jpeg")).toBe(true);
    expect(isUploadable("", "gag.mov")).toBe(false);
    expect(isUploadable("", "notes.txt")).toBe(false);
  });

  it("reads an extension, or says there is none", () => {
    expect(extensionOf("a/b/c.PDF")).toBe("pdf");
    expect(extensionOf("no-extension")).toBe("");
  });

  it("stores a HEIC photo under a type a browser will show", () => {
    expect(storedContentType("", "shot.heic")).toBe("image/heic");
    expect(storedContentType("image/jpeg", "shot.jpg")).toBe("image/jpeg");
  });
});
