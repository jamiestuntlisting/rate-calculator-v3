import { describe, expect, it } from "vitest";
import { imdbSuggestionUrl, normalizeImdbTitleId, parseImdbSuggestions } from "./imdb";

describe("IMDb lookups", () => {
  it("a title id comes out of an id or a pasted URL", () => {
    expect(normalizeImdbTitleId("tt0364845")).toBe("tt0364845");
    expect(normalizeImdbTitleId("https://www.imdb.com/title/tt0364845/?ref_=x")).toBe("tt0364845");
    expect(normalizeImdbTitleId("nm1956087")).toBeNull();
  });

  it("the suggestion URL is IMDb's search-box endpoint, by type", () => {
    expect(imdbSuggestionUrl("title", "NCIS: New Orleans")).toBe(
      "https://v3.sg.media-imdb.com/suggestion/titles/n/ncis%3A_new_orleans.json"
    );
    expect(imdbSuggestionUrl("name", "Jamie Northrup")).toBe(
      "https://v3.sg.media-imdb.com/suggestion/names/j/jamie_northrup.json"
    );
    expect(imdbSuggestionUrl("title", "9-1-1")).toMatch(/\/titles\/x\//);
  });

  it("the payload reduces to id, label, detail and a page URL; junk is dropped", () => {
    const titles = parseImdbSuggestions(
      { d: [{ id: "tt0364845", l: "NCIS", q: "TV series", yr: "2003-", i: { imageUrl: "x.jpg" } }, { id: "nm1", l: "not a title" }, { l: "no id" }] },
      "title"
    );
    expect(titles).toEqual([
      { id: "tt0364845", label: "NCIS", detail: "TV series · 2003-", imageUrl: "x.jpg", url: "https://www.imdb.com/title/tt0364845/" },
    ]);
    const names = parseImdbSuggestions({ d: [{ id: "nm1956087", l: "Jamie Northrup", s: "Stunts, The Equalizer (2021)" }] }, "name");
    expect(names[0]).toMatchObject({ id: "nm1956087", detail: "Stunts, The Equalizer (2021)", url: "https://www.imdb.com/name/nm1956087/" });
    expect(parseImdbSuggestions(null, "title")).toEqual([]);
  });
});
