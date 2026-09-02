import { describe, expect, it } from "vitest";
import { originNote } from "./g-ingest";
import { formatPhone } from "./phone";

describe("where a G came from", () => {
  it("a texted G says the number and the moment, in Eastern time", () => {
    // 01:20 UTC on Sep 3 is 9:20 PM on Sep 2 in New Jersey.
    const note = originNote(
      "text",
      formatPhone("+14849788687"),
      new Date("2026-09-03T01:20:00Z")
    );
    expect(note).toBe(
      "Received by text from (484) 978-8687 on Sep 2, 2026 at 9:20 PM."
    );
  });

  it("an emailed G says the address", () => {
    const note = originNote(
      "email",
      "jamie@stuntlisting.com",
      new Date("2026-09-02T14:05:00Z")
    );
    expect(note).toBe(
      "Received by email from jamie@stuntlisting.com on Sep 2, 2026 at 10:05 AM."
    );
  });

  it("formats a ten-digit number, and leaves anything else alone", () => {
    expect(formatPhone("4849788687")).toBe("(484) 978-8687");
    expect(formatPhone("1 (484) 978-8687")).toBe("(484) 978-8687");
    expect(formatPhone("+44 20 7946 0958")).toBe("+44 20 7946 0958");
  });
});
