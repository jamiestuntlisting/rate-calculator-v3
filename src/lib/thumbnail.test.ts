import { describe, expect, it } from "vitest";
import { THUMBNAIL_EDGE, thumbnailSize } from "./thumbnail";

describe("thumbnail size", () => {
  it("a phone photo comes down to the long edge, either way up", () => {
    expect(thumbnailSize(4032, 3024)).toEqual({ w: 320, h: 240 });
    expect(thumbnailSize(3024, 4032)).toEqual({ w: 240, h: 320 });
  });
  it("a small image is never enlarged", () => {
    expect(thumbnailSize(200, 100)).toEqual({ w: 200, h: 100 });
    expect(thumbnailSize(THUMBNAIL_EDGE, 10)).toEqual({ w: THUMBNAIL_EDGE, h: 10 });
  });
  it("nothing at zero", () => {
    expect(thumbnailSize(0, 0)).toEqual({ w: 0, h: 0 });
  });
});
