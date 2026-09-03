// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

/**
 * The Log Work test bench: the form itself, rendered, with times put
 * into one field and the rules checked in the others — the way a
 * person meets them. The pure rule functions have their own tests; this
 * file is about the wiring, which is where a rule can silently stop
 * being applied while its function still passes.
 *
 * The form is rendered whole. What it reaches for on mount is stubbed
 * (the router, the weeklies fetch, image conversion), nothing in the
 * times section is.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/heic-to-jpeg", () => ({
  toUploadableImage: async (f: File) => f,
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { ExhibitGForm } from "./exhibit-g-form";

const field = (id: string) => document.getElementById(id) as HTMLInputElement;
const set = (id: string, value: string) => {
  const input = field(id);
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value } });
};
const tick = (id: string) => fireEvent.click(document.getElementById(id)!);

/** Local calendar date, the way the form and TimeSelect compute it. */
const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ weeklies: [] }) }))
  );
  if (!("ResizeObserver" in globalThis)) {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
  }
  window.HTMLElement.prototype.scrollIntoView = () => {};
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Log Work — meals follow the call", () => {
  it("setting call offers lunch six hours on and its Out half an hour after", () => {
    render(<ExhibitGForm />);
    set("callTime", "08:00");
    expect(field("firstMealStart").value).toBe("14:00");
    expect(field("firstMealFinish").value).toBe("14:30");
  });

  it("the offer keeps tracking call until a hand sets lunch, then stays", () => {
    render(<ExhibitGForm />);
    set("callTime", "08:00");
    set("callTime", "09:00");
    expect(field("firstMealStart").value).toBe("15:00");
    set("firstMealStart", "13:00");
    set("callTime", "07:00");
    expect(field("firstMealStart").value).toBe("13:00");
  });

  it("an ND meal re-anchors lunch to its own end, and its Out is derived", () => {
    render(<ExhibitGForm />);
    set("callTime", "08:00");
    tick("showNdMeal");
    set("ndMealIn", "09:00");
    expect(screen.getByText("9:15 AM")).toBeTruthy();
    expect(field("firstMealStart").value).toBe("15:15");
    expect(field("firstMealFinish").value).toBe("15:45");
  });
});

describe("Log Work — a meal's In drags its Out", () => {
  it("James's rule: lunch In at 1:00 PM sets the Out to 1:30 PM at once", () => {
    render(<ExhibitGForm />);
    set("firstMealStart", "13:00");
    expect(field("firstMealFinish").value).toBe("13:30");
  });

  it("an Out already later than In + 30 is left where it was put", () => {
    render(<ExhibitGForm />);
    set("firstMealStart", "12:00");
    set("firstMealFinish", "12:45");
    set("firstMealStart", "12:10");
    expect(field("firstMealFinish").value).toBe("12:45");
  });

  it("an In moved to within half an hour of the Out drags the Out along", () => {
    render(<ExhibitGForm />);
    set("firstMealStart", "12:00");
    set("firstMealFinish", "12:45");
    set("firstMealStart", "12:40");
    expect(field("firstMealFinish").value).toBe("13:10");
  });

  it("an Out typed too close snaps to In + 30; one too far snaps to In + 60", () => {
    render(<ExhibitGForm />);
    set("firstMealStart", "12:00");
    set("firstMealFinish", "12:10");
    expect(field("firstMealFinish").value).toBe("12:30");
    set("firstMealFinish", "13:30");
    expect(field("firstMealFinish").value).toBe("13:00");
  });

  it("the 2nd meal is offered six hours after lunch ends, and follows lunch until hand-set", () => {
    render(<ExhibitGForm />);
    set("firstMealStart", "12:00");
    tick("showSecondMeal");
    expect(field("secondMealStart").value).toBe("18:30");
    expect(field("secondMealFinish").value).toBe("19:00");
    set("firstMealStart", "13:00");
    expect(field("secondMealStart").value).toBe("19:30");
    set("secondMealStart", "20:00");
    set("firstMealStart", "12:00");
    expect(field("secondMealStart").value).toBe("20:00");
    expect(field("secondMealFinish").value).toBe("20:30");
  });
});

describe("Log Work — the end of the day", () => {
  it("dismissal offers the wrap a quarter hour on, only while Wrapped is empty", () => {
    render(<ExhibitGForm />);
    set("dismissOnSet", "23:00");
    expect(field("dismissMakeupWardrobe").value).toBe("23:15");
    set("dismissOnSet", "23:45");
    expect(field("dismissMakeupWardrobe").value).toBe("23:15");
  });

  it("wrap set first offers the dismissal a quarter hour before, only while it is empty", () => {
    render(<ExhibitGForm />);
    set("dismissMakeupWardrobe", "22:00");
    expect(field("dismissOnSet").value).toBe("21:45");
    set("dismissMakeupWardrobe", "22:30");
    expect(field("dismissOnSet").value).toBe("21:45");
  });

  it("a wrap before the dismissal argues; one equal to it does not", () => {
    render(<ExhibitGForm />);
    set("dismissOnSet", "22:00");
    set("dismissMakeupWardrobe", "21:00");
    expect(screen.getByText(/Wrapped lands before the on-set dismissal/)).toBeTruthy();
    set("dismissMakeupWardrobe", "22:00");
    expect(screen.queryByText(/Wrapped lands before the on-set dismissal/)).toBeNull();
  });
});

describe("Log Work — a meal outside the day argues", () => {
  it("names the wrong-meridiem lunch and offers the flip", () => {
    render(<ExhibitGForm />);
    set("callTime", "19:24");
    set("dismissOnSet", "08:00");
    set("dismissMakeupWardrobe", "08:00");
    set("firstMealStart", "13:39");
    // The In warns, and so does the Out it dragged along.
    const warnings = screen.getAllByText(/isn't between your 7:24 PM call/);
    expect(warnings[0].textContent).toContain("The 1st Meal In at 1:39 PM");
    expect(warnings[0].textContent).toContain("Did you mean 1:39 AM?");
  });

  it("an ND meal outside the two hours after call is refused in words", () => {
    render(<ExhibitGForm />);
    set("callTime", "08:00");
    tick("showNdMeal");
    set("ndMealIn", "10:30");
    expect(screen.getByText(/An ND meal has to fall inside the 2 hours after your 8:00 AM call/)).toBeTruthy();
  });
});

describe("Log Work — a stunt double names the actor", () => {
  const openJobDetails = () => fireEvent.click(screen.getByText("Job Details"));

  it("the field appears only once the character reads as a stunt double", () => {
    render(<ExhibitGForm />);
    openJobDetails();
    expect(document.getElementById("actorDoubled")).toBeNull();
    fireEvent.change(field("characterName"), { target: { value: "Stunt Double" } });
    expect(screen.getByLabelText("Name of Actor Doubled")).toBeTruthy();
    fireEvent.change(field("actorDoubled"), { target: { value: "Adam Sandler" } });
    expect(field("actorDoubled").value).toBe("Adam Sandler");
    // Another role puts the question away again.
    fireEvent.change(field("characterName"), { target: { value: "Stunt Performer" } });
    expect(document.getElementById("actorDoubled")).toBeNull();
  });

  it("a card's abbreviation counts", () => {
    render(<ExhibitGForm />);
    openJobDetails();
    fireEvent.change(field("characterName"), { target: { value: "#X4 Marcus Stunt Dbl" } });
    expect(document.getElementById("actorDoubled")).not.toBeNull();
  });
});

describe("Log Work — the platform's clock stamp", () => {
  it("on another day's form, the current minute arriving on focus is refused", () => {
    render(<ExhibitGForm />);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    // Job Details is folded by default; the date lives inside it.
    fireEvent.click(screen.getByText("Job Details"));
    fireEvent.change(field("workDate"), { target: { value: localDate(yesterday) } });
    const now = new Date();
    const stamp = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    set("callTime", stamp);
    expect(field("callTime").value).toBe("");
    // A different minute is a person's pick and lands.
    const picked = now.getHours() === 6 && now.getMinutes() === 0 ? "07:00" : "06:00";
    set("callTime", picked);
    expect(field("callTime").value).toBe(picked);
  });

  it("on today's form the current minute is live logging and stays", () => {
    render(<ExhibitGForm />);
    const now = new Date();
    const stamp = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    set("callTime", stamp);
    expect(field("callTime").value).toBe(stamp);
  });
});

describe("Log Work — contract length", () => {
  it("starts blank: nothing has been picked, so the day may still join a weekly", () => {
    render(<ExhibitGForm />);
    fireEvent.click(screen.getByText("Job Details"));
    // The trigger shows the placeholder, not "Daily" — an unpicked day
    // is not a decision. There is no second control for it.
    expect(screen.getByText("Not set — a daily")).toBeTruthy();
    expect(screen.queryByText("Keep this day out of weeklies")).toBeNull();
  });
});
