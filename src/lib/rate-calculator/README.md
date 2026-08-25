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

Rates are a flat set of current minimums, so a work day from an earlier
contract year is calculated at today's rates. Historical schedules keyed by
effective date are the natural follow-up.

The legacy import paths `@/lib/rate-engine`, `@/lib/rate-constants`, and
`@/lib/time-utils` re-export from here, so app code needs no changes when
this directory is synced.

Once the Claude GitHub app has access to the StuntListing org (or the
package is published to npm), this vendored copy can be replaced with a
proper dependency.
