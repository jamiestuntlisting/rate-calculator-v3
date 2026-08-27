# StuntListing Bookkeeper — project notes for Claude

Live app: https://rate-calculator.jamie-181.workers.dev (Worker name:
`rate-calculator`; the worker `rate-calculator-v3` is an orphaned first
deploy attempt, safe to delete).

Next.js 16 on Cloudflare Workers (OpenNext adapter). Data in Cloudflare D1
(`rate-calculator-db`, id `f1a039c5-d470-4464-acd8-be5343d99470`), uploaded
files in R2 (`rate-calculator-uploads`). Schema in `migrations/`; data layer
in `src/lib/repos/`. See README.md for commands.

## Working preferences (James)

- Run commands in the Claude terminal session; don't hand James copy-paste
  blocks unless something genuinely must run on his machine or credentials
  are missing.
- **Always give direct deep links to dashboard pages, never menu
  navigation.** Cloudflare deep links use the `?to=/:account/...` pattern,
  which auto-resolves the account.
- He works on his phone a lot. Check mobile at 390px before calling UI done.

## Deploying

`git push` to `main` → Cloudflare Workers Builds runs `npm run build`
(wired to `opennextjs-cloudflare build`) then `npx wrangler deploy`. A push
is a deploy; it lands in ~3 minutes. Work happens on
`claude/rate-calculator-cloudflare-migration-43cdc3` and is fast-forwarded
into `main`.

**Migrations do not run in CI.** Apply schema changes to production
yourself with the Cloudflare MCP `d1_database_query` tool, and insert the
filename into `d1_migrations` so the local `wrangler d1 migrations apply`
state stays in step.

## How the pieces fit

- **Rate engine** — `src/lib/rate-calculator/` is a *vendored verbatim copy*
  of the shared `StuntListing/rate-calculator` package (day rates, Exhibit G
  math). Do not edit it to fix app-level things; fix upstream and re-copy.
  Its README lists the one deliberate divergence: rates were updated to the
  07/01/2026 schedule here (day performer $1,283) and the source repo has
  not been. `@/lib/rate-engine`, `rate-constants`, `time-utils` are
  one-line re-export shims onto it.
- **Weekly engine** — `src/lib/weekly/` (app-level, not vendored).
  Reverse-engineered from 133 real ShowBiz cards; `docs/weekly-rules.md` is
  the derivation and `docs/showbiz-csv-format.md` the file format. Tests run
  the whole sample: 132/133 match payroll to the cent. The one miss, S1234,
  is asserted by name — it is a malformed card, not a missing rule.
  Two files map onto the engine and are the only places those mappings are
  written down: `from-showbiz.ts` for a parsed payroll card, and
  `from-work-records.ts` for the performer's own logged days — five or more
  on one show is what makes a weekly contract, and `/weekly` offers those
  runs at the top. `/admin/weekly-bench` runs an export through it card by
  card; it opens on a bundled reference export (`src/lib/showbiz-sample.ts`,
  gzipped and base64'd — regenerate with `scripts/build-showbiz-sample.py`),
  which should always read 132 of 133, the one miss being S1234. An admin can
  override it from the bench ("Make this the default"), which stores the
  replacement across `showbiz_sample_*` rows in `app_config` and takes
  precedence over the bundle. This repository is public, so only bundle an
  export that is safe to publish.
  Deriving a day's overtime tier from `segment.multiplier` is wrong:
  on a 6th or 7th day the daily engine raises every segment to the day
  multiplier, so straight hours read 1.5 — go by the segment label. Watch the two
  adjustment columns: 202 is per-day stunt adjustments and feeds the overtime
  rate, 190 is allowances and meal penalties landing after the subtotal, and
  swapping them still yields a plausible gross.
- **Auth** — StuntListing GraphQL login → JWT session cookie. The signing
  key comes from `SESSION_SECRET` on the Worker if set, else from the
  `app_config` table in D1 (`src/lib/session-secret.ts`). The D1 fallback is
  what is actually in use; do not "clean it up" or logins break.
- **Membership** — `src/lib/membership-plans.ts` holds prices and features.
  Tier resolution order: `users.tierOverride` (hand-set, no billing yet) →
  Stripe by email (`src/lib/stripe.ts`, needs `STRIPE_SECRET_KEY`, not yet
  configured) → StuntListing profile fields.
- **Exhibit G** — an upload is one work day. Uploading creates a linked
  `work_records` row (`g_uploads.workRecordId`) so it appears in the
  Tracker; transcribing updates that row with whatever has been filled in.
  Partial saves are expected and supported.
- **Names** — show titles and character names autocomplete from
  `name_suggestions`. Saving a record records the name and resolves blocked
  spellings to their replacement, so admins can stop a production being
  spelled three ways (Admin → Names).

## Gotchas worth knowing

- `<input type="time">` ignores `step` on iOS, which is why times use the
  custom `TimeSelect` (type freely or pick from 6-minute increments plus
  :15/:45). A bare hour of 1–12 resolves against the time it
  follows — the call, or whatever precedes it in the day — so 3 after an
  11am call is 3pm, not 3am sixteen hours later. An am/pm someone typed is
  never second-guessed, nor is an hour of 13–23, and with nothing to follow
  a bare time is still read on a 24-hour clock. Setting a meal's start
  offers a finish half an hour on and never overwrites one already entered.
  Everything here is one wrong meridiem away from misstating pay, so the
  rules live in `parseTime` with the cases pinned by test.
- Serve R2 objects with `object.writeHttpMetadata()`; setting
  `Content-Length` by hand truncates images.
- Read `e.currentTarget` synchronously in event handlers — React clears it
  before a `setState` updater runs.
- An ND meal has to fall in the two hours after call — at or after the call
  itself, finished by the end of that window. The vendored engine only
  refuses one that *ends* late, and throws rather than explaining, so
  `src/lib/nd-meal.ts` carries the whole rule and the form shows it. The
  start check belongs upstream.
- Sum money at full precision and round once. Rounding per line is a cent
  out on roughly one weekly card in twenty.
- Vitest needs `vitest.config.ts` for the `@/` alias. `npm test` runs 59
  tests; keep them green.

## Open work

The live list is the `tasks` table in D1, shown at **Admin → Tasks**
(`/admin/tasks`). Query it rather than trusting this section, which is a
snapshot. `owner` separates work a session can finish from work that needs
something only James can supply.

Done since this file was last written: the ShowBiz CSV import and weekly
test bench (`/admin/weekly-bench`), and the weekly calculator UI
(`/weekly`).

Still waiting on James:

1. **Stripe billing** — plans are defined and tier resolution already
   prefers Stripe; needs a restricted `STRIPE_SECRET_KEY` (read on
   customers, subscriptions, products) and the price ids for Plus and the
   transcription add-on. The $15 per-Exhibit-G price is a placeholder James
   has not confirmed.
2. **Historical rate schedules** — rates are a single current set, so a 2021
   work day is calculated at 2026 rates. Blocked twice over: the fix belongs
   in the vendored engine and so must go upstream (item 4), and it needs the
   real historical schedules as data. Guessing rates would silently misstate
   pay.
3. **Weekly overtime absorption threshold** — bounded, not pinned; see
   `OVERTIME_ABSORPTION_NOTE`. If James learns the real rule it is one
   constant.
4. **StuntListing org GitHub access** — the shared rate-calculator repo is
   under the `StuntListing` org, which the Claude GitHub app is not
   installed on, so it can only be reached by uploading a zip. An org owner
   installing the app fixes it permanently, and unblocks re-syncing the
   07/01/2026 rates upstream before they are silently reverted.

## Direct links

| What | Link |
| --- | --- |
| Worker overview | https://dash.cloudflare.com/?to=/:account/workers/services/view/rate-calculator |
| Worker settings (secrets/vars) | https://dash.cloudflare.com/?to=/:account/workers/services/view/rate-calculator/production/settings |
| Builds & deployments | https://dash.cloudflare.com/?to=/:account/workers/services/view/rate-calculator/production/deployments |
| D1 database | https://dash.cloudflare.com/?to=/:account/workers/d1/databases/f1a039c5-d470-4464-acd8-be5343d99470 |
| R2 bucket | https://dash.cloudflare.com/?to=/:account/r2/default/buckets/rate-calculator-uploads |
| Cloudflare API tokens | https://dash.cloudflare.com/profile/api-tokens |
| Old Vercel project (retired) | https://vercel.com/james-northrups-projects/rate-calculator-v3 |

## Environment notes

- The Claude cloud environment's network policy blocks api.cloudflare.com,
  workers.dev and MongoDB Atlas: `wrangler` commands needing the API, and
  fetching the live app, fail here. Use the Cloudflare MCP tools for D1 SQL
  and resource listing; anything needing `wrangler` auth runs via Workers
  Builds on push, or on James's machine.
- MongoDB is fully retired — all data was migrated to D1 and verified
  (15,197 residual checks, totals matched to the cent). `scripts/mongo-to-d1.mjs`
  is kept only as a record of how it was done.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
