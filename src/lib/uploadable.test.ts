import { describe, it, expect } from "vitest";
import { isUploadable } from "./uploadable";

describe("isUploadable — type first, extension second", () => {
  it("accepts JPEG, PNG and HEIC even with a blank type", () => {
    expect(isUploadable("", "IMG_1.jpg")).toBe(true);
    expect(isUploadable("", "IMG_2.JPEG")).toBe(true);
    expect(isUploadable("", "shot.png")).toBe(true);
    expect(isUploadable("", "IMG_3.HEIC")).toBe(true);
    expect(isUploadable("", "IMG_4.heif")).toBe(true);
  });
  it("accepts the declared type whatever the name says", () => {
    expect(isUploadable("image/jpeg", "weird.bin")).toBe(true);
    expect(isUploadable("application/pdf", "card")).toBe(true);
  });
  it("refuses video, renamed or not", () => {
    expect(isUploadable("video/mp4", "gag.mp4")).toBe(false);
    expect(isUploadable("video/quicktime", "gag.jpg")).toBe(false);
  });
});
