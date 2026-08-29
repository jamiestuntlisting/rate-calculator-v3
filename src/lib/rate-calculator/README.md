# Vendored: @stuntlisting/rate-calculator

Verbatim copy of the `src/` of
[StuntListing/rate-calculator](https://github.com/StuntListing/rate-calculator)
(the shared SAG-AFTRA math engine, also used by the StuntListing Plus app).

**Do not edit these files here.** Fix the math in the source repo, then
re-copy `src/*.ts` over this directory. The only file that differs from the
source repo is `rate-engine.test.ts` (its import paths are adjusted; it
comes from the repo's `test/` directory). Run `npm test` after syncing.

### Local divergence to carry upstream

`rate-constants.ts` has been updated here to the **07/01/2026** SAG-AFTRA
schedule (day performer $1,246 → $1,283, other minimums +3%). The source
repo still carries the 2025-2026 rates, so apply the same change there
before the next sync or this will be silently reverted.

Two further changes are local and also need carrying upstream:

- `rate-constants.ts` adds the three low budget agreements — `low_budget`,
  `modified_low_budget`, `ultra_low_budget` — derived as 65% / 35% / 20% of
  the basic day and weekly rates, which is how the agreements themselves are
  written ("the applicable rate from the Basic Agreement current at the time
  of performance"). Stunt coordinators are deliberately not reduced: their
  rates track Schedule K whatever the production's budget.
- `types.ts` and `rate-engine.ts` accept an optional `flatDayRate` on the
  input — a negotiated flat deal. Given one, it replaces the schedule's
  daily rate **and the day earns no overtime**: `buildFlatSegment` returns
  the day as a single segment however long it ran, because nobody reaches a
  tier on a flat deal. Meal penalties are not wages and still land on top.
  Given nothing, the engine behaves exactly as before.
- `types.ts` and `rate-engine.ts` also accept an optional `dayRateOverride`
  — a rate that replaces the schedule's daily while staying a scale day:
  overtime tiers, the stunt adjustment and penalties all work off it as
  normal, unlike `flatDayRate`. The app uses it to approximate a day inside
  a weekly contract at the weekly scale over five days. A flat deal wins if
  both are set; given neither, the engine behaves exactly as before.
- `rate-engine.ts` puts the eight-hour daily minimum into the segment
  lines (Step 8b): the straight-time segment never pays fewer than eight
  hours, and is created outright on a zero-hour day. The grand total
  already honored the guarantee via the Step 11 `max()`; before this the
  difference sat in no line and a short day's breakdown did not sum to
  its total. Flat deals keep their single segment.
- `rate-constants.ts` splits the stunt coordinator in two.
  `stunt_coordinator` is the flat-deal figure it always was ($1,996); the
  new `stunt_coordinator_daily` is a coordinator employed at *less than*
  flat deal, which tracks the day performer minimum and works overtime like
  anyone else. That distinction is the reason both rates exist in Schedule K.

Rates are a flat set of current minimums, so a work day from an earlier
contract year is calculated at today's rates. Historical schedules keyed by
effective date are the natural follow-up.

The legacy import paths `@/lib/rate-engine`, `@/lib/rate-constants`, and
`@/lib/time-utils` re-export from here, so app code needs no changes when
this directory is synced.

Once the Claude GitHub app has access to the StuntListing org (or the
package is published to npm), this vendored copy can be replaced with a
proper dependency.
