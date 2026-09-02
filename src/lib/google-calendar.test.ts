import { describe, expect, it } from "vitest";
import { addCalendarLink, workDayEvent } from "./google-calendar";

describe("a work day as a calendar event", () => {
  it("is an all-day event named for the show and the role, carrying the record id", () => {
    const e = workDayEvent(
      {
        _id: "rec-1",
        showName: "The Equalizer",
        workDate: "2026-09-03T00:00:00.000Z",
        characterName: "Stunt Double",
        actorDoubled: "Queen Latifah",
        callTime: "06:12",
        dismissMakeupWardrobe: "18:00",
        expectedAmount: 2405.63,
        workType: "sag_aftra",
        recordStatus: "complete",
      },
      "https://example.test"
    );
    expect(e.summary).toBe("The Equalizer — Stunt Double (for Queen Latifah)");
    expect(e.start).toEqual({ date: "2026-09-03" });
    expect(e.end).toEqual({ date: "2026-09-04" });
    expect(e.description).toContain("Call 06:12");
    expect(e.description).toContain("Expected pay $2,405.63");
    expect(e.description).toContain("https://example.test/work/rec-1");
    expect(e.extendedProperties.private.stuntlisting_work_record_id).toBe("rec-1");
  });

  it("an untranscribed day says so and needs no role", () => {
    const e = workDayEvent(
      {
        _id: "r",
        showName: "Untranscribed Exhibit G 2",
        workDate: "2026-09-01",
        characterName: "",
        actorDoubled: null,
        callTime: null,
        dismissMakeupWardrobe: null,
        expectedAmount: 0,
        workType: "sag_aftra",
        recordStatus: "attachment_only",
      },
      "https://example.test"
    );
    expect(e.summary).toBe("Untranscribed Exhibit G 2");
    expect(e.description).toContain("Not transcribed yet");
  });

  it("builds the add-to-calendar link Google expects", () => {
    expect(addCalendarLink("abc123@group.calendar.google.com")).toMatch(
      /^https:\/\/calendar\.google\.com\/calendar\/u\/0\/r\?cid=[A-Za-z0-9_-]+$/
    );
  });
});
