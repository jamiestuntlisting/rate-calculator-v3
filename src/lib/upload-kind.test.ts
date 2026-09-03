import { describe, expect, it } from "vitest";
import { isUploadKind, kindForUpload, UPLOAD_KIND_LABELS } from "./upload-kind";

describe("what a file arrives as", () => {
  it("a PDF is the call sheet", () => {
    expect(kindForUpload("application/pdf", "day-10.pdf")).toBe("call_sheet");
    expect(kindForUpload("", "CALLSHEET.PDF")).toBe("call_sheet");
  });

  it("start paperwork is a kind of its own, never transcribed", () => {
    expect(isUploadKind("start_paperwork")).toBe(true);
    expect(UPLOAD_KIND_LABELS.start_paperwork).toBe("Start paperwork");
  });
  it("a photo is an Exhibit G", () => {
    expect(kindForUpload("image/jpeg", "IMG_3763.jpeg")).toBe("exhibit_g");
    expect(kindForUpload("image/heic", "IMG_1.heic")).toBe("exhibit_g");
  });
});
