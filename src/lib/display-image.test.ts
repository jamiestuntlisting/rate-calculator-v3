import { describe, expect, it } from "vitest";
import { DISPLAY_MAX_EDGE, fitWithin } from "./display-image";

describe("display copy of a big photo", () => {
  it("a phone photo under the edge is shown as it is", () => {
    expect(fitWithin(2016, 1512)).toEqual({ w: 2016, h: 1512, scaled: false });
    expect(fitWithin(DISPLAY_MAX_EDGE, 100)).toEqual({ w: DISPLAY_MAX_EDGE, h: 100, scaled: false });
  });

  it("a 48-megapixel photo comes down to the long edge, either way up", () => {
    expect(fitWithin(8064, 6048)).toEqual({ w: 3000, h: 2250, scaled: true });
    expect(fitWithin(6048, 8064)).toEqual({ w: 2250, h: 3000, scaled: true });
  });

  it("nothing is drawn at zero", () => {
    expect(fitWithin(0, 0)).toEqual({ w: 0, h: 0, scaled: false });
  });
});
