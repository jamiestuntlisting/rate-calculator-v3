import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { isWeeklyCard, parseShowbizCsv } from "./showbiz";
import { checkWeeklyCards } from "./weekly/from-showbiz";

/**
 * The bundled reference export, decoded and run exactly the way the
 * bench runs it — the real base64, the real gunzip, the real parser,
 * the real engine. This is the test that fails loudly if a rebuild of
 * the bundle ever mangles the CSV again: it once shipped reading 24
 * cards and 0 weeklies while every narrower test stayed green.
 */
function decodeBundle(): string {
  const src = readFileSync(
    new URL("./showbiz-sample.ts", import.meta.url),
    "utf-8"
  );
  const start = src.indexOf("const GZIP_BASE64 =");
  const end = src.indexOf(";", start);
  const base64 = Array.from(src.slice(start, end).matchAll(/"([^"]*)"/g))
    .map((m) => m[1])
    .join("");
  let text = gunzipSync(Buffer.from(base64, "base64")).toString("utf-8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text;
}

describe("the bundled ShowBiz export, end to end", () => {
  const cards = parseShowbizCsv(decodeBundle());

  it("parses every card: 414 in the file, 133 of them weekly", () => {
    expect(cards.length).toBe(414);
    const weekly = cards.filter((c) =>
      c.employmentType.toLowerCase().includes("weekly")
    );
    expect(weekly.length).toBe(133);
  });

  it("matches payroll on 132 of 133, the known miss being S1234", () => {
    const result = checkWeeklyCards(cards.filter(isWeeklyCard));
    const misses = result.checks.filter((c) => !c.matches);
    expect(result.checks.length).toBe(133);
    expect(misses.map((m) => m.card.cardId)).toEqual(["S1234"]);
  });
});
