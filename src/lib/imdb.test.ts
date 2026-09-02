import { describe, expect, it } from "vitest";
import {
  imdbAddStuntsUrl,
  imdbTitleSearchUrl,
  normalizeImdbId,
  showCredits,
} from "./imdb";

describe("IMDb ids and links", () => {
  it("finds the nm id in an id or a pasted profile URL", () => {
    expect(normalizeImdbId("nm1234567")).toBe("nm1234567");
    expect(normalizeImdbId("https://www.imdb.com/name/NM1234567/?ref_=x")).toBe("nm1234567");
    expect(normalizeImdbId("Jamie Northrup")).toBeNull();
  });

  it("opens the contribution form with as many slots as shows, capped at forty", () => {
    expect(imdbAddStuntsUrl("nm1234567", 3)).toBe(
      "https://contribute.imdb.com/updates?update=nm1234567:stunts.add.3"
    );
    expect(imdbAddStuntsUrl("nm1234567", 90)).toMatch(/stunts\.add\.40$/);
    expect(imdbAddStuntsUrl("nm1234567", 0)).toMatch(/stunts\.add\.1$/);
  });

  it("searches titles by the show's name", () => {
    expect(imdbTitleSearchUrl("Grown Ups 3")).toBe(
      "https://www.imdb.com/find/?q=Grown%20Ups%203&s=tt"
    );
  });
});

describe("a performer's shows as credits", () => {
  it("groups days into one credit per show with every character and actor doubled", () => {
    const credits = showCredits([
      { showName: "Grown Ups 3", workDate: "2026-08-10", characterName: "Stunt Double", actorDoubled: "Adam Sandler" },
      { showName: "grown ups 3", workDate: "2026-08-11", characterName: "Stunt Double", actorDoubled: "David Spade" },
      { showName: "The Equalizer", workDate: "2022-01-06", characterName: "Stunt Player" },
      { showName: "Untranscribed Exhibit G 3", workDate: "2026-09-01" },
      { showName: "Big Brand Spot", workDate: "2026-07-01", workType: "other" },
    ]);
    expect(credits.map((c) => c.showName)).toEqual(["Grown Ups 3", "The Equalizer"]);
    expect(credits[0]).toMatchObject({
      days: 2,
      firstDate: "2026-08-10",
      lastDate: "2026-08-11",
      actorsDoubled: ["Adam Sandler", "David Spade"],
      creditLine: "Stunt Double (for Adam Sandler, David Spade)",
    });
    expect(credits[1].creditLine).toBe("Stunt Player");
  });
});
