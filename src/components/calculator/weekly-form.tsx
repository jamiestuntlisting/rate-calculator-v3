"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, ChevronRight, Info, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/time-utils";
import { shortDay } from "@/lib/format-date";
import { RATES, ratesForDate, type RateSchedule } from "@/lib/rate-constants";
import {
  AGREEMENTS,
  THREE_DAY_OPTIONS,
  threeDayContractRate,
  threeDayLabel,
  weekRate,
  weeklyAgreementLabel,
} from "@/lib/agreements";

/**
 * The picker's own short names — the full agreement names clip on a phone,
 * and inside this page's context "Theatrical/TV" says everything the long
 * form says. "Other" is a deal that is none of the schedules: it is the
 * one case where the weekly rate is typed rather than known.
 */
const SHORT_NAMES: Record<string, string> = {
  theatrical_basic: "Theatrical/TV",
  low_budget: "Low Budget",
  modified_low_budget: "Mod. Low Budget",
  ultra_low_budget: "Ultra Low Budget",
  stunt_coordinator: "Coordinator — flat",
  stunt_coordinator_daily: "Coordinator — daily",
};
import {
  calculateWeekly,
  type WeeklyBreakdown,
  type WeeklyExtra,
} from "@/lib/weekly/weekly-engine";
import { dayContribution, workRecordsToWeeklyInput } from "@/lib/weekly/from-work-records";
import { calculateThreeDay } from "@/lib/three-day";
import {
  DEFAULT_WEEK_STARTS_ON,
  WEEK_DAY_NAMES,
  groupIntoWeeks,
  isContinuationWeek,
  weekLabel,
  type WeekStartDay,
} from "@/lib/weekly/weeks";
import { turnaroundsFor } from "@/lib/weekly/turnaround";
import { WEEKLY_GUARANTEES, weekRules } from "@/lib/weekly/rules";
import type { WorkRecord } from "@/types";
import { CollapsibleSection } from "@/components/calculator/collapsible-section";
import { ShowCombobox } from "@/components/shared/show-combobox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ExhibitGViewer } from "@/components/shared/exhibit-g-viewer";
import { PayStubSection } from "@/components/shared/pay-stub-section";
import type { PayStubLine } from "@/lib/pay-stub";
import { useAuth } from "@/context/auth-context";

/**
 * Location allowance and holiday are properties of one week, not the deal,
 * so they stay per-week rather than moving up with the terms.
 */
interface WeekOverride {
  extra: WeeklyExtra;
}

const NO_OVERRIDE: WeekOverride = { extra: null };

const EXTRAS: Array<{ value: WeeklyExtra; label: string }> = [
  { value: null, label: "None" },
  { value: "loc_allowance", label: "Location allowance" },
  { value: "holiday", label: "Holiday" },
];

const shortDate = (workDate: string) => shortDay(workDate);

/** A placeholder name from a bulk upload, or no name at all. */
const isUnnamed = (record: WorkRecord, title: string) =>
  !record.showName?.trim() ||
  /^Untranscribed Exhibit G \d+$/.test(record.showName) ||
  (title.trim() !== "" && record.showName.startsWith(`${title} — Day `));

/** A day with no times on it cannot contribute hours to the week. */
const needsInfo = (record: WorkRecord) => !record.callTime;

/** The Exhibit G attached to a day, if one is. */
function gDocOf(record: WorkRecord) {
  return (record.documents ?? []).find(
    (doc) =>
      doc.documentType === "exhibit_g" &&
      /\.(jpe?g|png|gif|webp|pdf)$/i.test(doc.filename)
  );
}

export function WeeklyForm() {
  const { user } = useAuth();

  /**
   * The terms of the deal, asked as a questionnaire rather than a rate
   * sheet. Picking the contract seeds the weekly rate (still editable —
   * over-scale deals exist); the overnight-location question is what
   * actually decides the 44 vs 48 hour guarantee and the rest rule, so
   * it is asked in those words instead of asking which guarantee they
   * think they are on. Weekly overtime is not asked at all: hours past
   * the guarantee are derived from the days.
   */
  const [title, setTitle] = useState("");
  const [agreement, setAgreement] = useState<RateSchedule | "other">(
    "theatrical_basic"
  );
  const [weeklyRate, setWeeklyRate] = useState<number>(
    RATES.theatrical_basic.weekly
  );
  const [distantLocation, setDistantLocation] = useState(false);
  const [showLocationInfo, setShowLocationInfo] = useState(false);
  const [weekStartsOn, setWeekStartsOn] =
    useState<WeekStartDay>(DEFAULT_WEEK_STARTS_ON);

  /**
   * Which contract this page is building. A 3-day (TV) contract groups
   * days exactly like a weekly and is paid as one check the same way —
   * three days guaranteed, a fourth or fifth prorated on top.
   */
  const [mode, setMode] = useState<"weekly" | "three_day">("weekly");
  const [threeDayRate, setThreeDayRate] = useState(0);
  /** "ws|length" for a schedule figure, or "other" for a typed deal. */
  const [threeDaySel, setThreeDaySel] = useState("other");
  const [records, setRecords] = useState<WorkRecord[] | null>(null);
  /** The weeklies already saved — proof they persist, and a way back in. */
  const [weeklies, setWeeklies] = useState<
    Array<{
      _id: string;
      kind: string;
      title: string;
      weekStart: string;
      weekStartsOn: number;
      agreement: string;
      weeklyRate: number;
      distantLocation: number;
    }>
  >([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  /**
   * The offered-days list scrolls past ~288px, but a cut that lands
   * exactly between rows looks like the end of the list. The cap is
   * measured off the real rows so the cut always lands mid-row — half a
   * day showing is the signal that there is more to scroll — and is
   * dropped entirely when everything fits.
   */
  const dayListRef = useRef<HTMLDivElement | null>(null);
  const [dayListMaxH, setDayListMaxH] = useState<number | null>(288);
  const [overrides, setOverrides] = useState<Record<string, WeekOverride>>({});
  const [openWeek, setOpenWeek] = useState<string | null>(null);
  /**
   * The page saves as it goes — there is no Save button. Whenever the
   * picked days settle into weeks (or the 3-day group) under a titled
   * deal, each changed week is written out after a short debounce, the
   * same call the old button made, so days are stamped and grouped
   * identically. A per-week signature keeps identical saves from
   * repeating; a week whose days were all unpicked is saved once more
   * with no days, which detaches them.
   */
  const [weekSaveState, setWeekSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const lastSavedRef = useRef<Record<string, { sig: string; kind: string }>>({});
  /** The day whose Exhibit G is open in the popup viewer, if any. */
  const [viewing, setViewing] = useState<WorkRecord | null>(null);
  const load = useCallback(async () => {
    try {
      const res = await fetch(
        "/api/work-records?limit=200&sort=workDate&order=desc"
      );
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { records: WorkRecord[] };
      setRecords(data.records.filter((r) => r.workType !== "other"));
    } catch {
      setRecords([]);
    }
    try {
      const res = await fetch("/api/weeklies");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setWeeklies(data.weeklies ?? []);
    } catch {
      setWeeklies([]);
    }
  }, []);

  /**
   * The two facts a G photo usually gives away at a glance — the show and
   * the date — editable in the popup itself, so naming a day does not
   * mean leaving the week being built. Times still live on the record.
   */
  const [viewEdit, setViewEdit] = useState({ showName: "", workDate: "" });
  /**
   * The popup has no Save button: a show or date saves itself the moment
   * it is set. A short debounce keeps a name being typed to one write,
   * and only fields that are valid and actually different from the
   * record go in the body — so a half-scrolled date wheel or a cleared
   * name never overwrites anything.
   */
  const [viewSaveState, setViewSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const viewSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewPending = useRef<{
    id: string;
    body: Partial<{ showName: string; workDate: string }>;
  } | null>(null);
  const openViewer = (record: WorkRecord) => {
    setViewing(record);
    setViewSaveState("idle");
    setViewEdit({
      showName: record.showName?.trim() && !isUnnamed(record, "")
        ? record.showName
        : "",
      workDate: (record.workDate || "").slice(0, 10),
    });
  };
  const pushViewEdit = useCallback(
    async (id: string, body: Partial<{ showName: string; workDate: string }>) => {
      setViewSaveState("saving");
      try {
        const res = await fetch(`/api/work-records/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error();
        const updated = (await res.json()) as WorkRecord;
        setViewing((cur) => (cur && cur._id === id ? updated : cur));
        setViewSaveState("saved");
        load();
      } catch {
        setViewSaveState("error");
      }
    },
    [load]
  );
  useEffect(() => {
    if (!viewing) return;
    const body: Partial<{ showName: string; workDate: string }> = {};
    const name = viewEdit.showName.trim();
    if (name && name !== (viewing.showName || "").trim()) body.showName = name;
    if (
      /^\d{4}-\d{2}-\d{2}$/.test(viewEdit.workDate) &&
      viewEdit.workDate !== (viewing.workDate || "").slice(0, 10)
    ) {
      body.workDate = viewEdit.workDate;
    }
    if (!body.showName && !body.workDate) {
      viewPending.current = null;
      return;
    }
    viewPending.current = { id: viewing._id, body };
    const t = setTimeout(() => {
      viewPending.current = null;
      pushViewEdit(viewing._id, body);
    }, 800);
    viewSaveTimer.current = t;
    return () => clearTimeout(t);
  }, [viewEdit, viewing, pushViewEdit]);
  /** An edit still inside the debounce saves anyway when the popup goes. */
  const flushViewEdit = useCallback(() => {
    if (viewSaveTimer.current) {
      clearTimeout(viewSaveTimer.current);
      viewSaveTimer.current = null;
    }
    const pending = viewPending.current;
    if (pending) {
      viewPending.current = null;
      pushViewEdit(pending.id, pending.body);
    }
  }, [pushViewEdit]);
  useEffect(() => flushViewEdit, [flushViewEdit]);

  const guarantee = distantLocation ? ("distant" as const) : ("studio" as const);
  const guaranteeHours =
    WEEKLY_GUARANTEES.find((g) => g.id === guarantee)?.hours ?? 44;
  // 12 hours is the studio rest rule; 11 is the overnight-location figure.
  const turnaroundHours = distantLocation ? 11 : 12;

  /** Reopen a saved weekly: its deal in the questionnaire, its days picked. */
  const openWeekly = (w: (typeof weeklies)[number]) => {
    setMode(w.kind === "three_day" ? "three_day" : "weekly");
    if (w.kind === "three_day") {
      setThreeDayRate(w.weeklyRate || 0);
      setThreeDaySel("other");
    }
    setTitle(w.title);
    setWeekStartsOn(
      (Math.min(6, Math.max(0, w.weekStartsOn)) as WeekStartDay) ??
        DEFAULT_WEEK_STARTS_ON
    );
    if (w.agreement in RATES) {
      setAgreement(w.agreement as RateSchedule);
    } else {
      setAgreement("other");
      setWeeklyRate(w.weeklyRate || 0);
    }
    setDistantLocation(Boolean(w.distantLocation));
    const members = (records ?? [])
      .filter((r) => r.weeklyId === w._id)
      .map((r) => r._id);
    setPicked(new Set(members));
  };

  useEffect(() => {
    load();
  }, [load]);

  /**
   * The shows this member has logged, newest first — the show being worked
   * this week is almost always the one touched most recently, so it should
   * be the first thing the pulldown offers.
   */
  const knownShows = useMemo(() => {
    const latest = new Map<string, string>();
    for (const record of records ?? []) {
      const name = record.showName?.trim();
      if (!name || /^Untranscribed Exhibit G \d+$/.test(name) || / — Day \d+$/.test(name)) {
        continue;
      }
      const touched = record.updatedAt || record.workDate || "";
      if (touched > (latest.get(name) ?? "")) latest.set(name, touched);
    }
    return [...latest.entries()]
      .sort((a, b) => b[1].localeCompare(a[1]))
      .map(([name]) => name);
  }, [records]);

  /**
   * The days offered: the picked show's, plus every unnamed upload —
   * an untranscribed Exhibit G could be anyone's, so it stays pickable
   * whichever show is chosen.
   */
  const offered = useMemo(() => {
    // A day whose contract was deliberately set to something else was
    // already decided — offering it here just invites mixing contracts.
    // But most days never decided anything: a length that was never
    // stated (null) is a daily only by default, so the day is offered,
    // and picking it into a contract is what decides it. And a day
    // cannot belong to two weeklies: one already attached to a saved
    // contract is hidden — except while it is picked in THIS build,
    // since the autosave attaches picked days immediately and hiding
    // them would make a week vanish as it was being assembled. To move
    // a taken day, reopen its contract from Saved contracts (which
    // picks its days again) or set it back on its record page.
    const kindById = new Map(weeklies.map((w) => [w._id, w.kind]));
    const wanted = mode === "three_day" ? "three_day" : "weekly";
    const all = (records ?? []).filter((r) => {
      const takenElsewhere =
        r.weeklyId != null && kindById.has(r.weeklyId) && !picked.has(r._id);
      if (takenElsewhere) return false;
      return (
        isUnnamed(r, title) ||
        r.contractLength == null ||
        r.contractLength === wanted ||
        (r.weeklyId != null && kindById.get(r.weeklyId) === wanted)
      );
    });
    if (!title.trim()) return all;
    return all.filter(
      (r) => r.showName?.trim() === title.trim() || isUnnamed(r, title)
    );
  }, [records, title, mode, weeklies, picked]);

  useEffect(() => {
    const el = dayListRef.current;
    if (!el) return;
    const measure = () => {
      const NOMINAL = 288;
      if (el.scrollHeight <= NOMINAL + 8) {
        setDayListMaxH(null);
        return;
      }
      const listTop = el.getBoundingClientRect().top - el.scrollTop;
      for (const child of Array.from(el.children) as HTMLElement[]) {
        const rect = child.getBoundingClientRect();
        const top = rect.top - listTop;
        if (top + rect.height > NOMINAL) {
          setDayListMaxH(Math.round(top + rect.height * 0.55));
          return;
        }
      }
      setDayListMaxH(NOMINAL);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [offered]);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const weeks = useMemo(() => {
    if (mode !== "weekly") return [];
    const chosen = (records ?? []).filter((r) => picked.has(r._id));
    return groupIntoWeeks(chosen, weekStartsOn);
  }, [records, picked, weekStartsOn, mode]);

  const ready = mode === "three_day" ? threeDayRate > 0 : weeklyRate > 0;

  /**
   * The 3-day contract: one group of every picked day, whatever the
   * calendar says — a Thursday-to-Monday 3-day is still one contract.
   * The contract and the prorated extra days come from the rate; meal
   * penalties and stunt adjustments come off the days themselves; the
   * 3-day schedule's own overtime is counted but deliberately not
   * priced, because its rules are not in the app yet and a guessed
   * figure would state money nobody is owed.
   */
  const threeDay = useMemo(() => {
    if (mode !== "three_day") return null;
    const chosen = (records ?? [])
      .filter((r) => picked.has(r._id))
      .sort((a, b) => (a.workDate || "").localeCompare(b.workDate || ""));
    if (chosen.length === 0) return null;
    const { derivation } = workRecordsToWeeklyInput(chosen, {
      scaleWeeklyRate: threeDayRate,
      contractWeeklyRate: threeDayRate,
    });
    const breakdown = ready
      ? calculateThreeDay({
          contractRate: threeDayRate,
          dayCount: chosen.length,
          mealPenalties: derivation.mealPenalties,
          stuntAdjustments: derivation.adjustments,
          overtimeHours:
            derivation.dailyOvertimeHours + derivation.doubleTimeHours,
        })
      : null;
    const firstDay = (chosen[0].workDate ?? "").slice(0, 10);
    return {
      records: chosen,
      breakdown,
      firstDay,
      needsInfo: derivation.daysWithoutCalculation,
    };
  }, [mode, records, picked, threeDayRate, ready]);

  /** One calculation per week — a run across three weeks is three contracts. */
  const calculated = useMemo(
    () =>
      weeks.map((week) => {
        const override = overrides[week.start] ?? NO_OVERRIDE;
        // The scale in force when the week was worked — a 2025 week at the
        // 2025 weekly, whatever year it is entered. An "other" deal has no
        // published scale, so its own rate stands in and premiums follow
        // the deal rather than a schedule it is not on.
        const weekFirstDay = (week.records[0]?.workDate ?? week.start).slice(0, 10);
        const weekScale =
          agreement === "other"
            ? weeklyRate
            : ratesForDate(weekFirstDay)[agreement].weekly;
        const { input, derivation } = workRecordsToWeeklyInput(week.records, {
          scaleWeeklyRate: weekScale,
          contractWeeklyRate: agreement === "other" ? weeklyRate : weekScale,
        });
        // Weekly overtime is the hours the week ran past its guarantee,
        // read off the days rather than asked for.
        const weeklyOvertimeHours =
          Math.round(Math.max(0, derivation.workHours - guaranteeHours) * 10) /
          10;
        // A week the same engagement worked into from the week before
        // is a prorated weekly: its days are additional days on the
        // original week, a fifth of the weekly each, so the full-week
        // minimum belongs to the first week only.
        const continuation = isContinuationWeek(
          week.start,
          weeks.map((w) => w.start)
        );
        let breakdown: WeeklyBreakdown | null = null;
        if (ready) {
          try {
            breakdown = calculateWeekly({
              ...input,
              weeklyOvertimeHours,
              extra: override.extra,
              // A signed weekly pays at least the full week: fewer days
              // just means the guarantee line makes up the difference,
              // and a week that works out over it keeps the larger figure.
              // A continuation week deliberately has no floor.
              minimumWeekly: continuation
                ? undefined
                : input.contractWeeklyRate,
            });
          } catch {
            breakdown = null;
          }
        }
        const turnarounds = turnaroundsFor(week.records, turnaroundHours);
        const rules = weekRules({
          derivation,
          turnarounds,
          turnaroundHours,
          guarantee,
        });
        return { week, derivation, breakdown, override, turnarounds, rules, continuation };
      }),
    [
      weeks,
      overrides,
      agreement,
      weeklyRate,
      ready,
      guaranteeHours,
      turnaroundHours,
      guarantee,
    ]
  );

  const grandTotal = calculated.reduce(
    (sum, w) => sum + (w.breakdown?.grandTotal ?? 0),
    0
  );

  const setOverride = (start: string, patch: Partial<WeekOverride>) =>
    setOverrides((prev) => ({
      ...prev,
      [start]: { ...(prev[start] ?? NO_OVERRIDE), ...patch },
    }));

  /** What to call a day in a week: its show, or Day N until transcribed. */
  const dayLabel = (record: WorkRecord, index: number) =>
    isUnnamed(record, title) ? `Day ${index + 1}` : record.showName;

  const postWeek = useCallback(
    async (
      kind: string,
      start: string,
      expectedAmount: number,
      ids: string[]
    ): Promise<boolean> => {
      try {
        const res = await fetch("/api/weeklies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind,
            title: title.trim(),
            weekStart: start,
            weekStartsOn,
            agreement:
              kind === "three_day"
                ? threeDaySel === "other"
                  ? "three_day"
                  : threeDaySel.split("|")[0]
                : agreement,
            weeklyRate: kind === "three_day" ? threeDayRate : weeklyRate,
            distantLocation: kind === "weekly" && distantLocation,
            expectedAmount,
            recordIds: ids,
          }),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
    [
      title,
      weekStartsOn,
      agreement,
      threeDaySel,
      threeDayRate,
      weeklyRate,
      distantLocation,
    ]
  );

  useEffect(() => {
    if (!ready || records === null || !title.trim()) return;
    const terms = JSON.stringify([
      mode,
      title.trim(),
      agreement,
      threeDaySel,
      threeDayRate,
      weeklyRate,
      weekStartsOn,
      distantLocation,
    ]);
    const groups = new Map<
      string,
      { ids: string[]; expected: number; sig: string }
    >();
    if (mode === "three_day") {
      if (threeDay?.breakdown) {
        const ids = threeDay.records.map((r) => r._id);
        groups.set(threeDay.firstDay, {
          ids,
          expected: threeDay.breakdown.total,
          sig: JSON.stringify([ids, threeDay.breakdown.total, terms]),
        });
      }
    } else {
      for (const { week, breakdown } of calculated) {
        if (!breakdown) continue;
        const ids = week.records.map((r) => r._id);
        const firstDay = (week.records[0]?.workDate ?? week.start).slice(0, 10);
        groups.set(firstDay, {
          ids,
          expected: breakdown.grandTotal,
          sig: JSON.stringify([ids, breakdown.grandTotal, terms]),
        });
      }
    }
    const dirty = [...groups.entries()].filter(
      ([start, g]) => lastSavedRef.current[start]?.sig !== g.sig
    );
    // A start that was saved but no longer forms a group lost its days —
    // saving it empty detaches them. Its stored kind rides along so a
    // weekly bucket is never rewritten as a 3-day on a mode switch.
    const vanished = Object.keys(lastSavedRef.current).filter(
      (start) => !groups.has(start)
    );
    if (dirty.length === 0 && vanished.length === 0) return;
    const t = setTimeout(async () => {
      setWeekSaveState("saving");
      let allOk = true;
      for (const [start, g] of dirty) {
        if (await postWeek(mode, start, g.expected, g.ids)) {
          lastSavedRef.current[start] = { sig: g.sig, kind: mode };
        } else {
          allOk = false;
        }
      }
      for (const start of vanished) {
        if (await postWeek(lastSavedRef.current[start].kind, start, 0, [])) {
          delete lastSavedRef.current[start];
        } else {
          allOk = false;
        }
      }
      setWeekSaveState(allOk ? "saved" : "error");
      if (allOk) load();
    }, 1200);
    return () => clearTimeout(t);
  }, [
    calculated,
    threeDay,
    ready,
    records,
    title,
    mode,
    agreement,
    threeDaySel,
    threeDayRate,
    weeklyRate,
    weekStartsOn,
    distantLocation,
    postWeek,
    load,
  ]);

  /**
   * The questionnaire and the picked days survive leaving the page: a
   * per-account draft in this browser, restored on return. The money
   * itself is already in D1 by then — this is just the working state,
   * so coming back looks like never having left.
   */
  const draftKey = user?.email ? `weekly-draft:${user.email}` : null;
  const draftRestored = useRef(false);
  useEffect(() => {
    if (!draftKey || draftRestored.current) return;
    draftRestored.current = true;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const d = JSON.parse(raw) as Record<string, unknown>;
      if (typeof d.title === "string" && d.title) setTitle(d.title);
      if (d.mode === "weekly" || d.mode === "three_day") setMode(d.mode);
      if (
        typeof d.agreement === "string" &&
        (d.agreement === "other" || d.agreement in RATES)
      ) {
        setAgreement(d.agreement as RateSchedule | "other");
      }
      if (typeof d.weeklyRate === "number" && d.weeklyRate > 0) {
        setWeeklyRate(d.weeklyRate);
      }
      if (typeof d.threeDayRate === "number" && d.threeDayRate > 0) {
        setThreeDayRate(d.threeDayRate);
      }
      if (typeof d.threeDaySel === "string") setThreeDaySel(d.threeDaySel);
      if (typeof d.distantLocation === "boolean") {
        setDistantLocation(d.distantLocation);
      }
      if (
        typeof d.weekStartsOn === "number" &&
        d.weekStartsOn >= 0 &&
        d.weekStartsOn <= 6
      ) {
        setWeekStartsOn(d.weekStartsOn as WeekStartDay);
      }
      if (Array.isArray(d.picked)) {
        setPicked(
          new Set(d.picked.filter((x): x is string => typeof x === "string"))
        );
      }
    } catch {
      // A malformed draft is just a missing one.
    }
  }, [draftKey]);
  useEffect(() => {
    if (!draftKey || !draftRestored.current) return;
    try {
      localStorage.setItem(
        draftKey,
        JSON.stringify({
          title,
          mode,
          agreement,
          weeklyRate,
          threeDayRate,
          threeDaySel,
          distantLocation,
          weekStartsOn,
          picked: [...picked],
        })
      );
    } catch {
      // Storage full or blocked — the weeks themselves are still saved.
    }
  }, [
    draftKey,
    title,
    mode,
    agreement,
    weeklyRate,
    threeDayRate,
    threeDaySel,
    distantLocation,
    weekStartsOn,
    picked,
  ]);

  /** The one line that says where saving stands, shown on every card. */
  const weekSaveLine = !title.trim()
    ? "Needs the show title above to save"
    : weekSaveState === "saving"
      ? "Saving…"
      : weekSaveState === "error"
        ? "Couldn't save — check the connection; the next change retries"
        : weekSaveState === "saved"
          ? "Saved — grouped in your tracker"
          : "Saves as you go — grouped in your tracker";

  const viewingDoc = viewing ? gDocOf(viewing) : null;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {mode === "weekly" ? "Weekly" : "3 Day"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "weekly"
              ? "Pick the days a weekly covers. Each week is worked out on its own."
              : "Pick the days the contract covers — three or more. It is one contract however many days it ran."}
          </p>
        </div>
        <div className="flex shrink-0 rounded-lg border border-border p-0.5">
          {(["weekly", "three_day"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                mode === m
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m === "weekly" ? "Weekly" : "3 Day"}
            </button>
          ))}
        </div>
      </div>
      {/* The G, in place: look at the card without leaving the week
          being built. Filling the day in still means the record page —
          the link at the bottom goes there. */}
      <Dialog
        open={viewing !== null}
        onOpenChange={(open) => {
          if (!open) {
            flushViewEdit();
            setViewing(null);
          }
        }}
      >
        <DialogContent className="max-w-3xl w-[calc(100vw-2rem)] p-4">
          <DialogHeader>
            <DialogTitle className="text-base">
              {viewing ? `${shortDate(viewing.workDate)} · ${viewing.showName || "Untranscribed"}` : ""}
            </DialogTitle>
          </DialogHeader>
          {viewing && viewingDoc && (
            <>
              <ExhibitGViewer
                src={`/api/uploads/${viewingDoc.filename}`}
                alt={viewingDoc.originalName}
                isPdf={/\.pdf$/i.test(viewingDoc.filename)}
                height="45vh"
                initialRotation={viewingDoc.rotation ?? 0}
              />
              {/* Name the day right here — show and date are what the
                  photo gives away at a glance; times go on the record.
                  No Save button: each field saves as soon as it is set. */}
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-end">
                <div className="space-y-1 min-w-0">
                  <Label htmlFor="viewShow" className="text-xs text-muted-foreground">
                    Show
                  </Label>
                  <ShowCombobox
                    id="viewShow"
                    value={viewEdit.showName}
                    onChange={(v) =>
                      setViewEdit((prev) => ({ ...prev, showName: v }))
                    }
                    options={knownShows}
                    placeholder="Which show is this?"
                  />
                </div>
                <div className="space-y-1 min-w-0">
                  <Label htmlFor="viewDate" className="text-xs text-muted-foreground">
                    Date
                  </Label>
                  <Input
                    id="viewDate"
                    type="date"
                    value={viewEdit.workDate}
                    onChange={(e) =>
                      setViewEdit((prev) => ({ ...prev, workDate: e.target.value }))
                    }
                    className="w-full max-w-full"
                  />
                </div>
              </div>
              <p
                className="text-xs text-muted-foreground text-center"
                aria-live="polite"
              >
                {viewSaveState === "saving"
                  ? "Saving…"
                  : viewSaveState === "saved"
                    ? "Saved"
                    : viewSaveState === "error"
                      ? "Couldn't save — check the connection and set it again"
                      : "Saves as soon as you set it"}
              </p>
              <Link
                href={`/work/${viewing._id}`}
                className="text-sm underline underline-offset-4 text-center"
              >
                Open the full record to fill in the times
              </Link>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* What has already been saved. Every weekly persists the moment it
          is created — here, from a day form, or from the tracker — and
          this list is the proof. Tapping one reopens it: its deal fills
          the questionnaire and its days are picked below. */}
      {weeklies.length > 0 && (
        <CollapsibleSection
          title="Saved contracts"
          defaultOpen
          summary={`${weeklies.length} saved`}
        >
          <div className="space-y-1 p-1">
            {weeklies.map((w) => {
              const days = (records ?? []).filter(
                (r) => r.weeklyId === w._id
              ).length;
              return (
                <button
                  key={w._id}
                  type="button"
                  onClick={() => openWeekly(w)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2.5 text-left hover:bg-accent/40"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {w.title}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {w.kind === "three_day" ? "3-day · " : ""}
                      {weekLabel(w.weekStart)}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                    {days === 1 ? "1 day" : `${days} days`}
                    <ChevronRight className="h-4 w-4" />
                  </span>
                </button>
              );
            })}
          </div>
        </CollapsibleSection>
      )}

      <CollapsibleSection
        title="Job Details"
        defaultOpen
        summary={
          [
            title,
            mode === "three_day"
              ? `3-day contract · ${formatCurrency(threeDayRate)}`
              : agreement === "other"
                ? `Other · ${weekRate(weeklyRate)}`
                : weeklyAgreementLabel(agreement),
            mode === "weekly" && distantLocation ? "Overnight location" : null,
          ]
            .filter(Boolean)
            .join(" · ") || "Show, contract and rate"
        }
      >
        <div className="space-y-3 p-1">
          <div className="space-y-1">
            <Label htmlFor="weeklyTitle" className="text-base">
              Show Title
            </Label>
            <ShowCombobox
              id="weeklyTitle"
              value={title}
              onChange={setTitle}
              options={knownShows}
              placeholder="Pick a show or type a new one"
              className="text-lg h-12"
            />
            <p className="text-xs text-muted-foreground">
              Filters the days below to this show — plus any Exhibit Gs with
              no name yet, since those could be its days. A day that never
              chose a contract is offered too, and picking it here sets it.
              Only days deliberately set Daily on their record stay out.
            </p>
          </div>

          {mode === "three_day" && (
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="threeDaySel" className="text-base shrink-0">
                Contract
              </Label>
              <FieldSelect
                id="threeDaySel"
                value={threeDaySel}
                onChange={(v) => {
                  setThreeDaySel(v);
                  if (v !== "other") {
                    const [ws, len] = v.split("|");
                    setThreeDayRate(
                      threeDayContractRate(ws, len === "long" ? "long" : "short")
                    );
                  }
                }}
                options={[
                  ...THREE_DAY_OPTIONS.map((o) => ({
                    value: `${o.workStatus}|${o.length}`,
                    label: threeDayLabel(o),
                  })),
                  { value: "other", label: "Other · type the rate" },
                ]}
              />
            </div>
          )}
          {mode === "three_day" && threeDaySel === "other" && (
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="threeDayRate" className="text-base shrink-0">
                3-day contract rate
              </Label>
              <MoneyInput
                id="threeDayRate"
                value={threeDayRate}
                onChange={setThreeDayRate}
              />
            </div>
          )}
          {mode === "three_day" && (
            <p className="text-xs text-muted-foreground">
              The contract buys three days; days past three are prorated at
              a third each.
            </p>
          )}

          {mode === "weekly" && (<>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="weeklyAgreement" className="text-base shrink-0">
              Contract
            </Label>
            <FieldSelect
              id="weeklyAgreement"
              value={agreement}
              onChange={(v) => {
                if (v === "other") {
                  setAgreement("other");
                  return;
                }
                const next = v as RateSchedule;
                setAgreement(next);
                // The contract knows its rate; nothing to type.
                setWeeklyRate(RATES[next].weekly);
              }}
              options={[
                ...AGREEMENTS.map((a) => ({
                  value: a.id,
                  label: `${SHORT_NAMES[a.id] ?? a.name} · ${weekRate(
                    RATES[a.id as RateSchedule].weekly
                  )}`,
                })),
                { value: "other", label: "Other · type the rate" },
              ]}
            />
          </div>

          {agreement === "other" && (
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="weeklyRate" className="text-base shrink-0">
                Weekly rate
              </Label>
              <MoneyInput id="weeklyRate" value={weeklyRate} onChange={setWeeklyRate} />
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="distantLocation"
                checked={distantLocation}
                onCheckedChange={(v) => setDistantLocation(!!v)}
              />
              <Label htmlFor="distantLocation" className="text-base font-normal">
                Were you on an overnight location?
              </Label>
              <button
                type="button"
                aria-label="What counts as an overnight location?"
                aria-expanded={showLocationInfo}
                onClick={() => setShowLocationInfo((v) => !v)}
                className="rounded-full border border-border p-1 text-muted-foreground hover:text-foreground"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </div>
            {showLocationInfo && (
              <p className="text-xs text-muted-foreground rounded-md bg-muted/40 border border-border/60 p-3">
                An overnight (distant) location is one far enough from the
                production&rsquo;s base that you were put up rather than going home
                — hotel and per diem, not your own bed. It changes the deal:
                the weekly guarantee is 48 hours instead of 44 (the extra
                four paid as location allowance), and rest between days can
                drop to 11 hours on two non-consecutive days. If you drove
                home each night, answer no.
              </p>
            )}
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="weekStartsOn" className="text-base shrink-0">
              Week starts
            </Label>
            <FieldSelect
              id="weekStartsOn"
              value={String(weekStartsOn)}
              onChange={(v) => setWeekStartsOn(Number(v) as WeekStartDay)}
              options={WEEK_DAY_NAMES.map((name, index) => ({
                value: String(index),
                label: name,
              }))}
            />
          </div>
          </>)}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Which days did you work?"
        defaultOpen
        summary={
          picked.size > 0
            ? `${picked.size} day${picked.size === 1 ? "" : "s"} picked`
            : "Pick the days this weekly covers"
        }
      >
        <div className="p-1">
          {records === null ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading your days…
            </div>
          ) : offered.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {title.trim()
                ? `No days for “${title.trim()}” yet — and no unnamed Exhibit Gs to assign.`
                : "No work days yet."}{" "}
              <Link href="/" className="underline">
                Log one
              </Link>{" "}
              or{" "}
              <Link href="/get-started" className="underline">
                bulk-upload your Exhibit Gs
              </Link>
              .
            </p>
          ) : (
            <div
              ref={dayListRef}
              className="overflow-y-auto -mx-1 px-1 space-y-1"
              style={dayListMaxH != null ? { maxHeight: dayListMaxH } : undefined}
            >
              {offered.map((record) => (
                <div
                  key={record._id}
                  className="flex items-center gap-3 p-2 rounded hover:bg-accent/40"
                >
                  <Checkbox
                    checked={picked.has(record._id)}
                    onCheckedChange={() => toggle(record._id)}
                  />
                  {/* A day that needs info opens its Exhibit G on tap — the
                      row's job is to show you the card so the info can be
                      filled in. A complete day just toggles its checkbox. */}
                  {needsInfo(record) && gDocOf(record) ? (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={() => openViewer(record)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") openViewer(record);
                      }}
                      className="flex-1 min-w-0 cursor-pointer"
                    >
                      <span className="block text-sm">
                        {shortDate(record.workDate)}
                      </span>
                      <span className="block text-xs text-muted-foreground truncate">
                        {record.showName || "—"}
                      </span>
                    </span>
                  ) : needsInfo(record) ? (
                    <Link
                      href={`/work/${record._id}`}
                      className="flex-1 min-w-0 cursor-pointer"
                    >
                      <span className="block text-sm">
                        {shortDate(record.workDate)}
                      </span>
                      <span className="block text-xs text-muted-foreground truncate">
                        {record.showName || "—"}
                      </span>
                    </Link>
                  ) : (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={() => toggle(record._id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") toggle(record._id);
                      }}
                      className="flex-1 min-w-0 cursor-pointer"
                    >
                      <span className="block text-sm">
                        {shortDate(record.workDate)}
                      </span>
                      <span className="block text-xs text-muted-foreground truncate">
                        {record.showName || "—"}
                      </span>
                    </span>
                  )}
                  {needsInfo(record) && (
                    <Link
                      href={`/work/${record._id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide border border-amber-500/60 text-amber-400 hover:bg-amber-500/10"
                    >
                      Needs info
                    </Link>
                  )}
                  {record.weeklyContract && !needsInfo(record) && (
                    <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide border border-primary/40 text-primary">
                      Weekly
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </CollapsibleSection>

      {mode === "three_day" && threeDay && (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className="font-semibold">
                3-day contract from {shortDate(threeDay.firstDay)}
              </p>
              <p className="text-xs text-muted-foreground">
                {threeDay.records.length}{" "}
                {threeDay.records.length === 1 ? "day" : "days"} picked
              </p>
            </div>
            {threeDay.breakdown && (
              <span className="text-2xl font-bold tabular-nums">
                {formatCurrency(threeDay.breakdown.total)}
                {threeDay.breakdown.unpricedOvertimeHours > 0 && "*"}
              </span>
            )}
          </div>

          {!ready && (
            <p className="text-sm text-muted-foreground">
              Enter the 3-day contract rate above to work this out.
            </p>
          )}

          {threeDay.breakdown && (
            <div className="space-y-1.5 border-t border-border/60 pt-3">
              {threeDay.breakdown.lines.map((line) => (
                <div
                  key={line.label}
                  className="flex items-baseline justify-between gap-3 text-sm"
                >
                  <span>{line.label}</span>
                  <span className="tabular-nums">
                    {formatCurrency(line.amount)}
                  </span>
                </div>
              ))}
              {threeDay.breakdown.unpricedOvertimeHours > 0 && (
                <p className="text-xs text-amber-400 pt-1">
                  * {threeDay.breakdown.unpricedOvertimeHours}h of overtime on
                  these days is not priced — the 3-day schedule&rsquo;s overtime
                  rules aren&rsquo;t built yet, so the total is what the contract,
                  prorated days, adjustments and penalties come to.
                </p>
              )}
              {threeDay.needsInfo > 0 && (
                <p className="text-xs text-amber-400">
                  {threeDay.needsInfo}{" "}
                  {threeDay.needsInfo === 1 ? "day is" : "days are"} still
                  missing times, so their penalties aren&rsquo;t counted yet.
                </p>
              )}
            </div>
          )}

          {threeDay.breakdown && (
            <p className="text-xs text-muted-foreground pt-1" aria-live="polite">
              {weekSaveLine}
            </p>
          )}

          {threeDay.breakdown && (
            <div className="border-t border-border/60 pt-3">
              <PayStubSection
                scope="week"
                weekStart={threeDay.firstDay}
                showName={title.trim() || "this production"}
                owed={threeDay.breakdown.total}
                performerName="This performer"
                period={`the 3-day contract from ${shortDate(threeDay.firstDay)}`}
                owedLines={threeDay.breakdown.lines.map((line) => ({
                  label: line.label,
                  hours: null,
                  amount: line.amount,
                }))}
              />
            </div>
          )}
        </div>
      )}

      {calculated.map(({ week, breakdown, override, turnarounds, rules, continuation }) => {
        const open = openWeek === week.start;
        // The weekly is defined by the first day actually worked — the
        // calendar boundary only decides which days belong together.
        const firstDay = (week.records[0]?.workDate ?? week.start).slice(0, 10);
        return (
          <div key={week.start} className="rounded-lg border border-border">
            <button
              type="button"
              onClick={() => setOpenWeek(open ? null : week.start)}
              aria-expanded={open}
              className="w-full text-left p-4 flex items-center gap-3 hover:bg-accent/30 transition-colors"
            >
              {open ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span className="flex-1 min-w-0">
                <span className="block font-medium">
                  {weekLabel(firstDay)}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {week.records.length} day
                  {week.records.length === 1 ? "" : "s"}
                  {continuation ? " · prorated weekly" : ""}
                  {lastSavedRef.current[firstDay] ? " · saved" : ""}
                </span>
              </span>
              <span className="text-lg font-semibold tabular-nums shrink-0">
                {breakdown ? formatCurrency(breakdown.grandTotal) : "—"}
              </span>
            </button>

            {open && (
              <div className="border-t border-border p-4 space-y-4">
                {continuation && (
                  <p className="text-xs text-muted-foreground">
                    Prorated weekly — this engagement worked the week before,
                    so these days are additional days on that weekly, a fifth
                    of the weekly rate each, with no fresh full-week minimum.
                  </p>
                )}
                {/* The days inside this week, unnamed ones as Day N until
                    transcription gives them their real date and show. */}
                <div className="space-y-1">
                  {week.records.map((record, index) => {
                    const day = dayContribution(record);
                    return (
                      <div key={record._id} className="py-0.5">
                        <div className="flex items-center gap-3 text-sm">
                          <span className="flex-1 min-w-0 truncate">
                            <span className="text-muted-foreground">
                              {shortDate(record.workDate)} ·{" "}
                            </span>
                            {dayLabel(record, index)}
                          </span>
                          {needsInfo(record) ? (
                            <Link
                              href={`/work/${record._id}`}
                              className="shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide border border-amber-500/60 text-amber-400 hover:bg-amber-500/10"
                            >
                              Needs info
                            </Link>
                          ) : (
                            <Link
                              href={`/work/${record._id}`}
                              className="shrink-0 text-xs text-muted-foreground underline underline-offset-2"
                            >
                              Details
                            </Link>
                          )}
                        </div>
                        {/* The day's own numbers, read exactly as the week
                            reads them, so these lines sum to the week's. */}
                        {day && (
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {Number(day.hours.toFixed(1))}h worked
                            {day.ot15 > 0 &&
                              ` · ${Number(day.ot15.toFixed(1))}h at 1.5×`}
                            {day.ot2 > 0 &&
                              ` · ${Number(day.ot2.toFixed(1))}h at 2×`}
                            {day.adjustment > 0 &&
                              ` · ${formatCurrency(day.adjustment)} adjustment`}
                            {day.penalties > 0 &&
                              ` · ${formatCurrency(day.penalties)} penalties`}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {EXTRAS.map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() =>
                        setOverride(week.start, { extra: option.value })
                      }
                      aria-pressed={override.extra === option.value}
                      className={`text-xs rounded px-3 py-1.5 border transition-colors ${
                        override.extra === option.value
                          ? "border-foreground/40 text-foreground"
                          : "border-border/40 text-muted-foreground hover:bg-accent/50"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                {breakdown ? (
                  <div className="space-y-1">
                    {breakdown.lineItems.map((item, i) => (
                      <div
                        key={`${item.label}-${i}`}
                        className="flex justify-between gap-3 text-sm"
                      >
                        <span className="text-muted-foreground">
                          {item.label}
                          {item.units !== 1 && ` · ${item.units}`}
                          {item.multiplier !== 1 && ` · ×${item.multiplier}`}
                        </span>
                        <span className="tabular-nums shrink-0">
                          {formatCurrency(item.amount)}
                        </span>
                      </div>
                    ))}
                    {breakdown.postSubtotalAdjustments !== 0 && (
                      <div className="flex justify-between gap-3 text-sm">
                        <span className="text-muted-foreground">
                          Meal penalties
                        </span>
                        <span className="tabular-nums shrink-0">
                          {formatCurrency(breakdown.postSubtotalAdjustments)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between gap-3 font-medium pt-2 border-t border-border">
                      <span>Total</span>
                      <span className="tabular-nums shrink-0">
                        {formatCurrency(breakdown.grandTotal)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Pick a contract above to work this week out.
                  </p>
                )}

                <p className="text-xs text-muted-foreground" aria-live="polite">
                  {weekSaveLine} Unnamed Exhibit Gs take the show title,
                  labelled Day 1, Day 2… until they are transcribed.
                </p>

                {breakdown && (
                  <div className="pt-3 border-t border-border space-y-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Pay stub for this week
                    </p>
                    <PayStubSection
                      scope="week"
                      weekStart={firstDay}
                      showName={title.trim() || week.records[0]?.showName || "this production"}
                      owed={breakdown.grandTotal}
                      performerName={
                        user
                          ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() ||
                            user.email
                          : "This performer"
                      }
                      period={weekLabel(firstDay).toLowerCase()}
                      owedLines={breakdown.lineItems.map(
                        (item): PayStubLine => ({
                          label: item.label,
                          hours: item.multiplier !== 1 ? item.units : null,
                          amount: item.amount,
                        })
                      )}
                    />
                  </div>
                )}

                <div className="pt-3 border-t border-border space-y-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Why this number
                  </p>
                  {rules.map((rule) => (
                    <div key={rule.id} className="space-y-0.5">
                      <div className="flex items-baseline gap-2">
                        <span
                          aria-hidden
                          className={`text-xs shrink-0 ${
                            rule.status === "breached"
                              ? "text-amber-400"
                              : rule.status === "check"
                                ? "text-muted-foreground"
                                : "text-primary"
                          }`}
                        >
                          {rule.status === "breached"
                            ? "!"
                            : rule.status === "check"
                              ? "?"
                              : "✓"}
                        </span>
                        <p
                          className={`text-sm font-medium ${
                            rule.status === "breached" ? "text-amber-400" : ""
                          }`}
                        >
                          {rule.title}
                        </p>
                      </div>
                      {rule.evidence && (
                        <p className="text-xs pl-5 text-foreground/80">
                          {rule.evidence}
                        </p>
                      )}
                      <p className="text-xs pl-5 text-muted-foreground">
                        {rule.detail}
                      </p>
                    </div>
                  ))}
                  {turnarounds.length > 0 && (
                    <div className="space-y-1 pl-5">
                      {turnarounds.map((rest) => (
                        <div
                          key={`${rest.from._id}-${rest.to._id}`}
                          className="flex justify-between gap-3 text-xs"
                        >
                          <span className="text-muted-foreground">
                            {shortDate(rest.from.workDate)} →{" "}
                            {shortDate(rest.to.workDate)}
                          </span>
                          <span
                            className={`tabular-nums shrink-0 ${
                              rest.short
                                ? "text-amber-400"
                                : "text-muted-foreground"
                            }`}
                          >
                            {rest.hours}h{rest.short ? " · short" : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* The saving status lives where it is always on screen, not only
          inside an expanded week card. */}
      {(calculated.length > 0 || (mode === "three_day" && threeDay?.breakdown)) && (
        <p className="text-xs text-muted-foreground text-center" aria-live="polite">
          {weekSaveLine}
        </p>
      )}

      {calculated.length > 1 && (
        <div className="rounded-lg border-2 border-primary bg-primary/5 p-4 flex items-center justify-between gap-4">
          <span className="text-sm text-muted-foreground">
            {calculated.length} weeks
          </span>
          <span className="text-2xl font-bold tabular-nums">
            {formatCurrency(grandTotal)}
          </span>
        </div>
      )}
    </div>
  );
}

/** A plain select styled to sit beside the money and number fields. */
function FieldSelect({
  id,
  value,
  onChange,
  options,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border-input dark:bg-input/30 h-9 max-w-[16rem] min-w-0 flex-1 truncate rounded-md border bg-transparent py-1 pl-2 pr-7 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function MoneyInput({
  id,
  value,
  onChange,
}: {
  id: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="relative flex-1 min-w-0 max-w-[10rem]">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
        $
      </span>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min="0"
        step="1"
        value={value || ""}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="pl-7 w-full"
        placeholder="0"
      />
    </div>
  );
}
