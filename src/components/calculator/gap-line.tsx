import { calculateDuration } from "@/lib/time-utils";

/**
 * The stretch between two moments of the day, shown where it happens.
 *
 * The gaps are what the rules care about — a first meal is owed within six
 * hours of call, a second within six of the first — so the number belongs
 * between the fields, not in anyone's head. Gaps inside a meal (start to
 * finish) are deliberately not shown; the length of a lunch is not a rule.
 */
export function GapLine({
  from,
  to,
  label,
  warnAfterHours,
}: {
  from: string | null | undefined;
  to: string | null | undefined;
  label: string;
  /** Past this many hours the gap is the thing that costs money. */
  warnAfterHours?: number;
}) {
  const ok = (v: string | null | undefined): v is string =>
    typeof v === "string" && /^\d{1,2}:\d{2}$/.test(v);
  if (!ok(from) || !ok(to)) return null;
  const hours = Math.round((calculateDuration(from, to) / 60) * 10) / 10;
  const over = warnAfterHours !== undefined && hours > warnAfterHours;
  return (
    <p
      className={`text-xs pl-2 ${
        over ? "text-amber-400" : "text-muted-foreground"
      }`}
    >
      ↕ {hours}h {label}
      {over ? ` — past ${warnAfterHours}h` : ""}
    </p>
  );
}
