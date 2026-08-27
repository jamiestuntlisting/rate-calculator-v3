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
  input. Given one, it replaces the schedule's daily rate and everything
  else is worked out from it unchanged; given nothing, the engine behaves
  exactly as before. This is what a negotiated flat deal needs, and it is
  three lines at the single point where the engine reads the rate table.

Rates are a flat set of current minimums, so a work day from an earlier
contract year is calculated at today's rates. Historical schedules keyed by
effective date are the natural follow-up.

The legacy import paths `@/lib/rate-engine`, `@/lib/rate-constants`, and
`@/lib/time-utils` re-export from here, so app code needs no changes when
this directory is synced.

Once the Claude GitHub app has access to the StuntListing org (or the
package is published to npm), this vendored copy can be replaced with a
proper dependency.
