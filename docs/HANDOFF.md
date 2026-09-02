# Session handoff — 2026-09-02

Read `CLAUDE.md` first; it is the standing project brief and was kept
current all session. This file is the delta: what this session shipped,
what is waiting on whom, and the environment lessons that cost real time
to learn. Overwrite it at the next handoff.

## Where things stand

Everything below is merged to `main` and deployed (push = deploy, ~3–4
min via Workers Builds). Work branch:
`claude/exhibit-g-layout-date-picker-mnc3dj`, fast-forwarded into `main`
per change (`git push origin HEAD:main` after the branch push). 294
vitest green across 29 files — the count is a tripwire, see the Write
hazard below. Deploys verified by fetching the worker bundle with the
Cloudflare MCP `workers_get_worker_code` tool and grepping for a
commit-unique string: the SSR chunks keep exported identifiers and
string literals (`WorkDateContext`, `localISODate`, UI copy), while
function bodies and module-private names minify away, so pick markers
accordingly. The result is ~9.4 MB and lands in a file — grep it, then
delete it.

## Shipped this session

- **A2P compliance pages** — `/privacy` and `/terms`, written to the
  carrier checklist (program name, frequency, "message and data rates
  may apply", bold HELP/STOP, the no-marketing-sharing clause), linked
  from the footer. Public needs BOTH the middleware `PUBLIC_PATHS` and
  the client `SIGNED_OUT_PATHS` in `auth-context.tsx` — the client
  guard alone bounced logged-out reviewers to the sign-in page.
- **Times toggle** (`transcribeTimeOrder`): the transcription page runs
  its time fields in day order or the G's column order (call, both
  dismissals, then meals). Small segmented control on the times box.
- **One-at-a-time rail** (`transcribeMode`): Typeform-style guided mode
  beside the form — 14 steps, same state, flipping loses nothing, the
  card never moves. Steps advance ONLY on human acts: picker dismissal
  (blur with a value), Enter, or the arrows. Never on a timer — two
  real-world bugs came from timers racing open pickers (below).
- **User preferences plumbing** — `users.prefs` JSON column (migration
  0023, applied to prod and recorded, id 23), `/api/me/prefs` GET/PUT
  (deliberately the signed-in user, never the viewed-as member),
  localStorage mirrors `stl_transcribe_order` / `stl_transcribe_mode`
  for first paint, rows on the Preferences page. Add future prefs here.
- **Transcribe page counter** — a to-do badge on the title; transcribed
  cards don't count, zero shows nothing.
- **Done gate** — marking a G transcribed requires call time + wrap
  (the day's brackets): standing hint, arguing toast, and a server-side
  400 in the g-uploads PATCH judged on the request's transcription (or
  stored, for a bare `done` flag). Save still keeps any fragment.
- **Field-truth rules, all shared and pinned by tests:**
  - Wrap may equal the on-set dismissal (the card writes a dash);
    only strictly-before warns. `calculateDuration` reads an equal
    pair as 24 hours — never compare through it for order.
  - `isClockStamp` (time-select) + `WorkDateContext`: iOS stamps the
    current clock into an EMPTY time field on tap; refused when the
    form's day isn't today. All four times forms provide the context.
  - `isTodayStamp` (date-field): iOS stamps today into an empty DATE
    field on focus — even programmatic focus. Refused when no pointer
    was involved; a tapped-open picker is the person's own act.
  - `starts_before_call` (nd-meal): an ND In before call used to read
    forward as tomorrow and warn "ends before it starts".
  - `mealBoundsWarning` (work-times-fields): a meal sits between call
    and wrap, inclusive. With an end the check is exact and quotes
    both ends; without one, only the back half of the clock argues, so
    night shoots stop warning once the wrap lands. Offers the meridiem
    flip when the flipped time would fit — the wheel on the wrong half
    is almost always the real story.
  - Meal In drags a too-close Out to In + 30
    (`clampMealFinish(v, followedTime(v, out, MEAL_MINUTES))`) — now on
    ALL meal entries; the transcription form and rail were the last on
    the offer-only path.
- **Rail-specific mechanics worth knowing before touching it:** each
  step's input carries `key={currentStep.key}` so React mounts a fresh
  DOM node — without it the open iOS wheel from the previous step kept
  writing into the next field. Nav arrows act on pointerdown (before
  the blur they cause) and stamp `navTapped`; the blur handler honours
  it, or Next would double-advance. TimeSelect's clear ✕ clears on
  pointerdown for the same reason.
- **ND Out renders on one line** (`whitespace-nowrap`, note wraps below).

## Waiting on James / external

1. **A2P 10DLC campaign approval** — submitted 2026-09-02 (evening).
   Twilio's own review runs ~10–15 days right now; carriers add more.
   Inbound texting works throughout; only the outbound "Got it" reply is
   blocked (error 30034). **After approval:** add (484) 978-8687 to the
   campaign's Messaging Service AND set the service's inbound to "Defer
   to sender's webhook" (or the same POST URL) — otherwise the service
   swallows inbound and the working intake breaks. Consent/copy answers
   used on the form are in the session transcript; the policy URLs are
   the live `/privacy` and `/terms`.
2. The standing CLAUDE.md list is unchanged: Stripe key, pre-2025 wage
   tables, StuntListing org GitHub app, the commercial-overtime
   decision.

## Environment lessons (cost real time)

- **Playwright auth recipe** (scratchpad dies with the container — this
  is the whole trick, keep it): global playwright at
  `/opt/node22/lib/node_modules/playwright/index.mjs`, jose from the
  repo's node_modules. Sign a dev JWT and set the cookie:
  `new SignJWT({userId:"nav-check",email:"jamie@stuntlisting.com",firstName:"Jamie",lastName:"Northrup",tier:"plus",role:"admin"}).setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("2h").sign(new TextEncoder().encode("stuntlisting-bookkeeper-dev-secret-change-in-production"))`
  → cookie `stl_session` on `localhost`. Route `**/api/uploads/**` to a
  stub JPEG so image fetches don't hang. Field ids: `#row-*` on the
  transcription form, `#guided-*` on the rail, `#g-work-date`,
  `#g-show-nd-meal`. The dev D1 carries junk from smoke runs (the first
  upload has test times saved on it) — clear fields in-test, don't
  assume a clean fixture.
- **Dev server**: often already running on 3000 from a keeper script
  ("Another next dev server is already running" — use it); warm a cold
  page with `curl --retry 40 --retry-all-errors --retry-delay 3`; the
  transcription page can take >30 s to compile cold.
- **Hooks trap**: `upload-g/[id]/page.tsx` has early returns (~line
  530); any new hook must live ABOVE them or React throws "more hooks
  than during the previous render".
- **Write-tool hazard**: writing a "new" test file overwrote
  `time-select.test.ts` and silently dropped 18 tests — the suite count
  catching it is why the count is stated above. Check for an existing
  file before Write; recover with `git show HEAD:<path>`.
- **`npm run build` must run from the repo root** — a `cd` left over
  from a smoke run makes it enoent.
- Deploy waits are background `sleep ~260` then verify; a doc-only push
  restarts the build clock too.
- **A missing marker is not a missing build.** `clampMealFinish` greps
  to ZERO in the bundle even for code deployed weeks ago — imported lib
  identifiers minify at call sites; only some exported names and string
  literals survive. This briefly read as "the meal-drag build never
  deployed" when it had. The reliable check when a change carries no
  greppable literal: the bundle's byte size, which moves with every
  real code change (it went 9,462,357 → 9,485,913 for that build) and
  stays identical across doc-only rebuilds. Establish the size of a
  known build before declaring a later one missing.

## Live-state notes

- James's texted-in G (`text-2026-09-01-1.jpg`) is a real tracker row —
  the text-in pipeline is proven end to end inbound.
- Prod `d1_migrations` is current through id 23. Migrations still do
  not run in CI; apply by hand via MCP and record the row.
