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
is a deploy; it lands in ~3 minutes. **Check the deploy actually landed**
when it matters: builds on the work branch only upload *versions*; the
`main` build is the one that deploys, and the dashboard's Active deployment
says which version serves traffic. `npm run build` deletes
`.next/cache/turbopack` first, on purpose: Workers Builds restores the
previous build's `.next` cache, a build canceled mid-write once left that
cache truncated, and Turbopack 16 hard-crashes on an inconsistent cache
instead of cold-building — which silently pinned production to a stale
version for most of a day while branch builds stayed green. The cold
compile costs ~30s and cannot be poisoned. Work happens on
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
  Its README lists the deliberate divergences: date-keyed rate schedules
  (`RATE_SCHEDULES`/`ratesForDate` — a work day is priced by the schedule
  in force on its date; verified tables from 07/01/2025 through the
  2026-30 agreement's scheduled raises, and **derived** columns back to
  07/01/2014, walked back from the verified 2025 table through each
  agreement's general wage increase with dollar rounding at every step
  — 3%/3% under 2014, 2.5% a year to minimums under 2017 and 2020, then
  7% on 11/09/2023, 4% on 07/01/2024, 3.5% on 07/01/2025. The day
  performer column reproduces every published minimum from $880 to
  $1,204, which is the check on the method; other rows can sit $1 off a
  published cell on a half-dollar landing, and `/admin/rates` badges
  them "derived" so James can confirm them against the tables.
  `rate-schedules.test.ts` pins the ladder. Before 07/01/2014 the
  earliest column applies), the three low budget agreements, `flatDayRate`,
  `dayRateOverride`, and workStatus accepting the app's flat
  pseudo-agreements — none of which the source repo has got. `@/lib/rate-engine`, `rate-constants`, `time-utils` are
  one-line re-export shims onto it.
- **Agreements** — `src/lib/agreements.ts` is the only place the list of
  offered agreements is written down; the picker, the work page and
  `/api/contracts` all read it. Theatrical and Television pay the same, so
  they are one entry — `television` stays in `RATES` only so records saved
  under it still calculate. The three low budget tiers are derived rather
  than typed, because that is how the agreements are written: 65% / 35% /
  20% of "the applicable rate from the Basic Agreement current at the time
  of performance", so they follow the basic rate whenever it moves. Stunt
  coordinators are never reduced — Schedule K applies whatever the
  production's budget, so a coordinator on a low budget show is still
  `stunt_coordinator`. That one is the **flat deal** coordinator
  (K-III: $1,696/day, $6,752/week on 07/01/26, no times and no
  overtime); `stunt_coordinator_daily` is a coordinator employed at less
  than flat deal, who earns overtime like anyone else — the distinction
  is why both rates exist. The flat pair was verified against the
  2026-30 wage-table ladders in 08/2026 (replacing a wrong
  $1,996/$7,439). The daily coordinator's DAY rate is the day performer
  minimum ($1,283 on 07/01/26): the Theatrical Wage Table lists "Stunt
  Coordinator (employed at less than 'flat deal' minimum)" on the
  Performer row, corrected 09/2026 after a wrong $1,329 ladder. Its
  WEEKLY ($4,955) is still the earlier figure — confirm it against the
  Weekly Performers section of the same table.
  A deal that is none of the schedules is picked as **Commercial** or
  **Flat deal** in the same pulldown (`FLAT_AGREEMENTS`) — the performer
  types the contract's number, `flatDayRate` rides the record, and the
  old separate flat-rate checkbox is gone. Commercial opens prefilled at
  the Commercials Contract session fee for the day's date
  (`COMMERCIAL_SCHEDULES`/`commercialSessionFee` — April-1 calendar:
  783.10 → 822.30 on 04/01/25 → 855.20 on 04/01/26, union rate sheets),
  shown on `/admin/rates`; note the union's cheat sheet says commercial
  days DO earn 1.5×/2× overtime past 8 hours, so the flat treatment
  understates long days — flagged to James, not yet changed.
  **A flat deal earns no overtime**: the number buys the day, so the engine
  returns it as one segment however long the day ran, and a sixteen-hour
  day pays what an eight-hour day pays. Meal penalties are not wages and
  still land on top, as does a stunt adjustment the performer entered.
  Penalties are statutory dollars and do not move with the rate; there is a
  test pinning that, and another pinning that scale and a flat rate of the
  same size agree at eight hours and diverge the moment overtime starts.
- **Weekly engine** — `src/lib/weekly/` (app-level, not vendored).
  Reverse-engineered from 133 real ShowBiz cards; `docs/weekly-rules.md` is
  the derivation and `docs/showbiz-csv-format.md` the file format. Tests run
  the whole sample: 132/133 match payroll to the cent. The one miss, S1234,
  is asserted by name — it is a malformed card, not a missing rule.
  Two files map onto the engine and are the only places those mappings are
  written down: `from-showbiz.ts` for a parsed payroll card, and
  `from-work-records.ts` for the performer's own logged days. `/weekly` is
  driven by picking days off the Tracker: `weeks.ts` splits them on week
  boundaries and each week is a separate contract and a separate
  calculation, so a run across three weeks is three of them, never one long
  one. The week starts Monday (`DEFAULT_WEEK_STARTS_ON`) and the page lets
  it be moved to any day, because productions differ; every group is
  labelled with the date it runs from so a wrong split shows rather than
  hides. `work_records.contractLength` is three-way on purpose: NULL means
  never stated (the day calculates as a daily but the weekly picker still
  offers it, and picking it into a contract is what sets it), while an
  explicit `'daily'` — the "Keep this day out of weeklies" checkbox
  under a Daily pulldown on Log Work and the day's edit page; it was a
  second "Daily" entry in the pulldown once and James read it as a bug —
  is a decision that keeps the day out. Do not "normalize" the NULLs;
  migration 0019 exists to create them. `/admin/weekly-bench` runs an export through it card by
  card; it opens on a bundled reference export (`src/lib/showbiz-sample.ts`,
  gzipped and base64'd — regenerate with `scripts/build-showbiz-sample.py`),
  which should always read 132 of 133, the one miss being S1234. An admin can
  override it from the bench ("Make this the default"), which stores the
  replacement across `showbiz_sample_*` rows in `app_config` and takes
  precedence over the bundle. This repository is public, so only bundle an
  export that is safe to publish.
  `rules.ts` states the contract rules behind a week next to its number —
  the guarantee that applied, the rest between days, what triggered daily
  overtime — with three states, because "the days show this happened",
  "this turns on a term of the deal" and "the production went under an
  entitlement" are different things. The guarantee is 44 hours studio and
  48 overnight location, which all 133 sample cards confirm exactly
  (112 studio at 44, 21 distant at 48, no exceptions). Rest between days is
  **12** hours, not 11: 11 is an overnight-location exception good for two
  non-consecutive days a week, and 10 needs exterior photography on a
  distant location. Using 11 as the default called a studio forced call
  compliant. The 2×10 + 3×8 straight-time week is **not** implemented —
  see docs/weekly-rules.md §6c for why the sample argues against it.
  Weekly overtime is **not** derivable from the hours worked — 32 cards were
  paid exactly 6.00 hours of it on weeks totalling 35 to 56 hours, and one
  103-hour week got none. It is a term of the deal, asked for once with the
  rates; see docs/weekly-rules.md §4b before trying to compute it. Rest
  between days *is* derivable, and `turnaround.ts` does it.
  Deriving a day's overtime tier from `segment.multiplier` is wrong:
  on a 6th or 7th day the daily engine raises every segment to the day
  multiplier, so straight hours read 1.5 — go by the segment label. Watch the two
  adjustment columns: 202 is per-day stunt adjustments and feeds the overtime
  rate, 190 is allowances and meal penalties landing after the subtotal, and
  swapping them still yields a plausible gross.
- **Transcription row lock** — the `/upload-g/[id]` card pane draws a
  translucent highlighter band (50px, rgba(255,230,0) at .32, .5 once
  locked) at mid-height on a phone and 40% down on a desktop
  (`useHighlightLine`, the `lg` breakpoint); a lock button in the
  pane's bottom-right corner holds the row under the band so the
  performer transcribes without the card drifting. Sideways still pans.
  **Locked, the row's vertical position is a transform, not a scroll**:
  the page wraps the card in a clip exactly the pane's height, so the
  pane has nothing to scroll vertically and no touch can move it —
  iOS pans a horizontally scrollable pane vertically even with
  overflow-y hidden, and correcting scrollTop afterwards (on scroll
  events, or on touchend) read as the card jumping back. `useFocalZoom`
  owns it: `lockLine` grabs the line under the band (against its
  `lineFraction` option), `applyAnchor` places the card and re-runs on
  pane resize, `releaseLine` hands the position back to the pane's
  scroll on unlock so nothing moves, and zooms — buttons, pinch,
  ⌘+wheel — anchor on the line. Fit and Rotate hide while locked; the
  lock rides the saved view (`view.lockedY`). `use-focal-zoom.test.ts`
  pins the arithmetic.
- **No page zoom on the transcription screen** — the root layout's
  `viewport` sets `minimumScale: 1`, and `usePreventPageZoom` (mounted
  by `/upload-g/[id]`) swallows two-finger touchmoves and Safari's
  `gesturestart`/`gesturechange` document-wide, so a pinch beside the
  card zooms the card or nothing, never the page. Only pages with a
  zoom of their own should mount it; page zoom is accessibility
  elsewhere.
- **The pile's Transcribed section is a table** — finished Gs on
  `/upload-g` render tracker-style (`Table`, a 40px thumbnail, the show
  with the character under it, the work date from the transcription's
  details, the transcribed-on date at md+, delete), a row tap opening
  the G. The to-do pile above keeps its cards.
- **What a file is** — `g_uploads.kind` (migration 0026;
  `src/lib/upload-kind.ts`: exhibit_g | call_sheet | contract | paystub
  | wardrobe_photo | photo | conversation | other — `DocumentType` has
  the same names plus the older timecard). A PDF arrives as the call
  sheet, a photo as an Exhibit G (`kindForUpload`); both start a work
  day, whose document carries the same type. Only an Exhibit G is
  transcribed: every other kind sits in the "Other files" table on
  `/upload-g`, counts in no to-do, is not read by Claude, and is left
  out of transcription requests and the admin queue. Reclassify with
  the pulldown on the pile's cards and tables (`PATCH /api/g-uploads/
  [id]` with `kind`, which retypes the day's document) or on the day's
  Photos & Documents (`PUT /api/work-records/[id]` with `documents`,
  which retypes the upload) — never inside the transcription view.
- **Where a G came from** — text and email intake pass an
  `originNote` into `ingestGUploads`, written into the new day's
  `notes` ("Received by text from (484) 978-8687 on Sep 2, 2026 at
  9:20 PM."). The upload GET returns `workRecordNotes` and the
  transcription form opens its Notes box on it, so a save keeps it
  (the PATCH copies row notes onto the record). It is deliberately not
  seeded into `g_uploads.transcription`: a non-null transcription
  reads as "in progress" on the pile and drops the G from the
  transcription-request count.
- **Done gate** — marking a G transcribed needs the show, the work
  date, the call time, the wrap, and an answer to "Did you get lunch?"
  — Yes needs the 1st Meal In and Out, No does not (a no-lunch day
  prices with its meal penalties, which is why it is asked outright).
  `src/lib/transcription-done.ts` is the one statement of the rule; the
  form's hint, its toast, and the g-uploads PATCH (400) all read it.
  The answer lives on the transcription row (`lunch`: yes/no/""); a
  row saved before the question existed counts lunch times as yes and
  none as unanswered, never as no. Save is never gated.
- **Transcription shares Log Work's views** — the `/upload-g/[id]`
  fields pane renders the same vertical rows as Log Work through
  `src/components/calculator/work-times-fields.tsx` (TimeRow,
  MealSection, the derived ND Out). ND breakfast and 2nd meal are off
  until the card shows one; Cast is the signed-in (or viewed) member's
  registered name, shown not asked. Saving a transcription calls
  `recalculateDay` like the weekly stamp paths, so a transcribed G
  prices its tracker row; days missing an agreement stay unpriced and
  surface as to-dos on Resolve. `DateField`
  (`src/components/ui/date-field.tsx`) is the app's date input — it
  summons the platform picker on pointerdown; use it, not a bare
  `<Input type="date">`.
- **Resolve groups weeklies** — days with a `weeklyId` fold into one
  row per contract on /analytics: Calculated is the saved weekly's
  `expectedAmount` (else the day sum, asterisked), and the one Paid box
  spreads the check across the days oldest-first as bookkeeping. The
  pipeline card is five blocks with arrows; each expanded row carries a
  "Check & pay stub" fold (photo + lines, image beside the working) and
  an expected-pay PDF link.
- **Expected-pay PDF** — `/api/work-records/[id]/expected-pay` renders
  the statement (times, breakdown, total, the G's JPEG on page 2) via
  `src/lib/pdf.ts`, a dependency-free writer with uncompressed streams
  so tests read the document's own text. Do not add a PDF library; the
  Worker bundle is the reason it exists.
- **Reverse calculator** — `/admin/reverse` works a check total
  backwards through `src/lib/reverse-daily.ts`, pricing normal day
  shapes with the real engine (adjustments feed the OT rate, so no
  shortcut math — pinned by test). No date is asked: the search runs
  every rate schedule in force in the last two years (`searchedRates`)
  and each match names its rate, so a check paid at last year's figure
  is found on last year's column. The shapes are the finite set of
  normal payments — 6:00 AM call, lunch on time or late by each half
  hour up to two (each a distinct penalty), 8–16 hour days in 6-minute
  steps, adjustments to $1,000 in $50s, with and without a second meal
  (~50k engine runs, ~0.3 s). Near misses are always reported, closest
  first, however far; `commonPayments` is the whole-hours grid the page
  shows under the results with the check's nearest cell marked.
- **Non-SAG work** — commercials, music videos, low budget and anything
  else go through `/other-work`, and carry the same times as a SAG day:
  call, both meals, dismissal and wrap. They are deliberately **not** run
  through the rate engine — a commercial is not on the Basic Agreement and
  calculating one at scale would state a figure nobody is owed. What they
  get instead is `src/lib/work-hours.ts`, which is agreement-free: hours on
  the clock, meal time out, hours worked, and the fee the performer entered
  divided by those hours. That last number is the whole point — non-union
  work is quoted as a day rate, and a day rate means nothing until you know
  whether the day ran eight hours or sixteen. The columns already existed
  on `work_records`, so this needed no migration.
- **Editable pages** — `/how-it-works` and `/membership` render through
  `EditablePage`/`Editable` (`src/components/shared/editable-page.tsx`).
  An admin gets an "Edit page" button; edits save as JSON overrides in
  `app_config` (`page_content:<page>`) via `/api/page-content/[page]` and
  go live for everyone. The defaults stay written in the code, so an empty
  override store is exactly the page as committed. Reading is public,
  writing is admin-only. Admin → Pages links to them.
- **Text intake** — text a photo of a G to the Twilio number and it lands
  in the sender's account: Twilio POSTs to `/api/inbound-sms` (exempt
  from session middleware; authenticated by `X-Twilio-Signature` against
  `TWILIO_AUTH_TOKEN` in `app_config`). Senders match on `users.phone`
  (last ten digits; set under Preferences, or best-effort probed from
  the StuntListing profile at login — probe never breaks login and never
  overwrites a typed number). Replies are TwiML at 200 always. Setup —
  the number, webhook and config rows — is docs/text-in-exhibit-gs.md;
  James still has to pick the number and set the three config values.
- **Email intake** — mail an Exhibit G to the intake Gmail and it lands in
  the sender's account: a Google Apps Script inside the mailbox POSTs each
  message to `/api/inbound-email` (secret in `app_config` under
  `INBOUND_EMAIL_SECRET`; the route is exempt from the session middleware
  and authenticates the header itself). Senders match on their login
  email; unknown senders are refused and the script labels the thread
  `unmatched`. Setup and the script live in docs/email-in-exhibit-gs.md —
  James still has to install it in the Gmail account. All upload paths
  share `src/lib/g-ingest.ts`, so email, the Upload button and the bulk
  page behave identically (dedupe, numbered rows, the queue).
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
- **Actor doubled** — when the character reads as a stunt double
  (`isStuntDouble`: "Stunt Double", "Stunt Dbl", with or without a
  prefix or suffix), Log Work and both transcription modes open a
  "Name of Actor Doubled" box under Character; it stores in
  `work_records.actorDoubled` (migration 0024, NULL on every other
  day) and the tracker shows "doubling X" under the character. It is
  for the résumé and the StuntListing profile — a card never carries
  it, so it is asked, not transcribed. The day's edit page (`/work/
  [id]`) has its own copy of Job Details and asks it there too, and
  has a Notes box at the end of its edit form like Log Work.
- **Names** — show titles and character names autocomplete from
  `name_suggestions`. Saving a record records the name and resolves blocked
  spellings to their replacement, so admins can stop a production being
  spelled three ways (Admin → Names). Each name also carries a review
  status — pending / approved / ignored — with per-kind tabs for
  monitoring. Autocomplete differs by kind on purpose: shows offer
  everything not blocked or ignored (approval is monitoring, not a gate),
  while characters offer only the approved set, seeded with the standard
  stunt roles (Stunt Performer/Double/Coordinator/Rigger/Driver, Utility
  Stunts, ND Stunt) — one-off character names get Ignored, not corrected.

## Gotchas worth knowing

- Times are the platform's own `<input type="time">`, wrapped as
  `TimeSelect` — on a phone that is the OS wheel, with its own AM/PM column.
  It was a free-text field with a suggestion list for a while, so that
  6-minute increments could be offered; James asked for the system picker
  back and accepted whole minutes on iOS as the price. `step` is still set
  to 360, which desktop browsers honour and iOS ignores. Nothing is typed,
  so no time can be read as the wrong half of the day and there is no
  meridiem-guessing left to get wrong; what remains is `toFieldValue`,
  which zero-pads an hour ("9:30") because a native field shows a bare one
  as empty and silently loses the time. Setting a meal's start still offers
  a finish half an hour on and never overwrites one already entered.
  iOS also stamps the current clock into an empty time field the moment
  it is tapped; `TimeSelect` refuses that stamp when the form's day (via
  `WorkDateContext`, provided by all four times forms) isn't today — the
  test is value ≈ current minute arriving within moments of focus, in
  local time because UTC calls a New York evening tomorrow. Today's
  forms still take "now"; that is live logging. A wrap equal to the
  dismissal is legal (the card writes a dash) — only strictly-before
  warns, and never through `calculateDuration`, which reads an equal
  pair as 24 hours. The field's ✕ clear button is `tabIndex={-1}`: Tab
  past AM/PM goes to the next row's hour, not to the ✕.
- Serve R2 objects with `object.writeHttpMetadata()`; setting
  `Content-Length` by hand truncates images.
- Read `e.currentTarget` synchronously in event handlers — React clears it
  before a `setState` updater runs.
- A pay stub is transcribed the way stubs are laid out — what the payment
  was for, the hours, the money — so a shortfall points at a line rather
  than at a total (`src/lib/pay-stub.ts`, `pay_stubs` table). It hangs off a
  work day, or off a week's start date when the contract is weekly, because
  a week is not a stored record. The note to payroll is drafted from the two
  sets of working; **sending it from the app needs a mail provider, which is
  not configured** — today it opens in the performer's own mail app.
- Two Exhibit Gs on one day usually means two contracts. The engine works
  out one; each contract past the first adds a day rate minimum on top
  (`src/lib/multi-contract.ts`), except on a multiple-episode weekly where
  the episodes are already inside the guarantee. Anything that recalculates
  a record has to add them back or it silently drops a day's pay per
  contract.
- An ND meal has to fall in the two hours after call — at or after the call
  itself, finished by the end of that window. The vendored engine only
  refuses one that *ends* late, and throws rather than explaining, so
  `src/lib/nd-meal.ts` carries the whole rule and the form shows it. The
  start check belongs upstream.
- A SAG check is due by the **Wednesday of the second week after the work
  week** (`src/lib/payment-due.ts`) — a Friday is paid on the second
  Wednesday after it, the Monday of that same week on its third, one due
  date per work week. "Late" on /analytics derives from this and is never
  hand-marked; `paymentFlag` holds only the human 'done' mark (the 'late'
  value is legacy, unused by the UI).
- Sum money at full precision and round once. Rounding per line is a cent
  out on roughly one weekly card in twenty.
- Vitest needs `vitest.config.ts` for the `@/` alias and `jsx:
  "automatic"` for the component tests. `npm test` runs 351 tests across
  38 files; keep them green, and treat the count as a tripwire (a Write
  once silently overwrote a test file — the count caught it).
- **Log Work front-end bench** — `exhibit-g-form.test.tsx` renders the
  real form in jsdom (Testing Library; `// @vitest-environment jsdom`
  at the top of the file) and puts times into one field to check the
  rules in the others: call offering lunch, an In dragging its Out to
  +30, the Out clamps, the 2nd meal following the 1st until hand-set,
  the wrap offers both ways, the order and bounds warnings, the ND
  window, and the iOS clock-stamp refusal on another day's form. The
  router, the weeklies fetch and image conversion are stubbed; nothing
  in the times section is. `/admin/time-bench` states the same rules
  against the pure functions for reading on a phone.

## Open work

The live list is the `tasks` table in D1, shown at **Admin → Tasks**
(`/admin/tasks`). Query it rather than trusting this section, which is a
snapshot. `owner` separates work a session can finish from work that needs
something only James can supply.

Done since this file was last written: the ShowBiz CSV import and weekly
test bench (`/admin/weekly-bench`), and the weekly calculator UI
(`/weekly`).

Still waiting on James:

0. **A2P 10DLC campaign approval** for the text-in number — submitted
   2026-09-02, likely weeks. Inbound works now; only the outbound reply
   is blocked. After approval: add the number to the campaign's
   Messaging Service and set its inbound to "Defer to sender's webhook".

1. **Stripe billing** — plans are defined and tier resolution already
   prefers Stripe; needs a restricted `STRIPE_SECRET_KEY` (read on
   customers, subscriptions, products) and the price ids for Plus and the
   transcription add-on. The $15 per-Exhibit-G price is a placeholder James
   has not confirmed.
2. **Historical rate schedules** — derived columns back to 07/01/2014
   are loaded (see the rate engine note above); the 11/9/2023 mid-year
   bump is in. What is left for James is confirming the derived
   non-day-performer rows against the real wage tables when he has
   them — any cell a dollar off is a one-number edit.
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

## Features under test (test users)

`src/lib/test-users.ts` names the test accounts (today
`jamesdunnauthor@gmail.com`); they are performers whose own days
exercise a feature before it launches, distinct from admins. The
session's `/api/auth/me` carries `tester: true` for them.

- **Claude reads the G** — a tester's Exhibit G is read by Claude Fable
  5.1 as it lands (`src/lib/g-reader`, scheduled on `ctx.waitUntil`
  from `ingestGUploads`; `POST /api/g-uploads/[id]/read` reads on
  demand), the transcription form opens pre-filled from the reading
  (empty boxes only), and Done scores each field against what was
  saved (`score.ts`: exact / small / meridiem / large / missed /
  spurious). `g_readings` and `g_reading_scores` (migration 0025);
  `/admin/readings` is the batting average per field and per
  rule-book version. The rule book is `prompt.ts` (`RULE_BOOK`,
  `PROMPT_VERSION` — bump it whenever the words change) and is
  explained in docs/exhibit-g-reading-rules.md. Needs
  `ANTHROPIC_API_KEY` as a Worker secret or `app_config` row; until
  then every reading records that error and the form opens empty.
- **IMDb credits** (`/admin/imdb`, admin, not tester-gated) — IMDb has
  no API for writing credits; it documents a contribution URL that
  opens a person's form with N stunt-credit slots
  (`contribute.imdb.com/updates?update=<nm>:stunts.add.N`). The page
  takes a member, their `prefs.imdbId` (set there, pasted id or URL,
  `PATCH /api/admin/users/[userId]/imdb`), and lists their SAG shows
  as credits (`src/lib/imdb.ts` `showCredits`: one per show, every
  character and actor doubled) beside that link and an IMDb title
  search per show. Matching shows to tt ids is a separate feature.
- **Members** (`/admin/members`) — who uses the service and how much,
  with the switch that makes a member a test user (`users.tester`,
  migration 0027; the seed list in `test-users.ts` stays on and shows
  as "seeded"). `/admin` has a layout with a grouped sidebar on a
  desktop, chips on a phone, and an Admin › tool breadcrumb.
- **Google Calendar work log** (Preferences, testers) — the company's
  service account owns one calendar per member, shares it to them by
  invitation (read only), and mirrors every logged day as an all-day
  event from every create/update/delete path on `ctx.waitUntil`
  (`src/lib/google-calendar.ts`; `users.calendarId`,
  `work_records.googleEventId`, migration 0029). Needs
  `GOOGLE_SERVICE_ACCOUNT_JSON`; docs/google-calendar-work-log.md.
- **Audit a show** — an outline only: docs/audit-a-show.md and the
  placeholder at `/admin/audits`. Nothing built.
- **Bank deposits via Plaid** (`/bank`, testers) — connect a bank
  account view-only, pull deposits (`bank_connections`,
  `bank_deposits`, migration 0028), and match each to the pay the
  calculator expected on timing first (within ten days of the SAG due
  date) and money second (between half the gross and the gross, since
  deposits are net). Unmatched payroll-house deposits are residuals.
  `src/lib/bank-match.ts` is the rule, tested; `src/lib/plaid.ts` is
  the client (plain fetch); `src/lib/bank-sync.ts` pulls and matches
  one member or all of them. The page is just Connect; the floor is a
  preference (`prefs.depositFloor`, default $500); and **a daily cron
  does the looking**: `npm run build` ends with `scripts/add-cron.mjs`,
  which renames OpenNext's output to `app-worker.js` and installs
  `scripts/cron-worker.js` as the Worker entry — a `scheduled` handler
  (`triggers.crons`, 11:00 UTC) calling `POST /api/cron/bank-sync`
  in-process with a token minted on first use. **Never mint that token
  at module load**: a top-level `crypto.randomUUID()` is a Workers
  validation error (10021, "disallowed operation in global scope") and
  it silently failed every deploy for an afternoon until the build log
  was read. Check a wrapper change with `npx wrangler dev --local
  --test-scheduled` before pushing. Needs
  `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`; docs/bank-deposits.md
  has the setup and the two open decisions (auto-write residuals?
  auto-mark paid?).
