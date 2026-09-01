# Session handoff — 2026-09-01

Read `CLAUDE.md` first; it is the standing project brief and was kept
current all session. This file is the delta: what this session shipped,
what is waiting on whom, and the environment lessons that cost real time
to learn. Overwrite it at the next handoff.

## Where things stand

Everything below is merged to `main` and deployed (push = deploy, ~3 min).
Work branch: `claude/rate-calculator-cloudflare-migration-qdcjow`,
fast-forwarded into `main` per change. 260 vitest green; CI
(`.github/workflows/tests.yml`) runs tsc + the suite on every push and
every Monday.

### Money rules (all researched, sourced, and pinned by tests)
- **15-minute rule** (8d16c27, df138e3): overtime runs to final dismissal
  at full tiers — no drop to 1.5×; meal penalties/turnaround measure to
  the *set* dismissal. Live counter runs after Dismiss On Set until any
  Wrapped time exists (typed or offered); while counting, dismissal does
  not auto-offer the wrap.
- **Weekly floor** (3c12bde): a signed weekly pays at least the full week;
  "Weekly guarantee" top-up line; penalties land after; ShowBiz bench
  never floored (cards are facts).
- **Prorated weeklies** (869879f): a continuation week (same engagement,
  the calendar week immediately before was worked) skips the floor —
  days at weekly/5, labelled "prorated weekly" on /weekly and the tracker.
- **Late is an equation** (a7ed1dc): due by the Wednesday of the second
  week after the work week (`src/lib/payment-due.ts`); derived, never
  hand-marked; `paymentFlag` holds only the human `done`.
- **Commercial session fee** (a2c6477): own April-1 ladder — 783.10 →
  822.30 (04/01/25) → 855.20 (04/01/26), verified against union rate
  sheets; prefills the Commercial pick by date; on /admin/rates.
- **Contract length is three-way** (8480b89, migration 0019): NULL =
  never stated (offered to weeklies), 'daily' = deliberate exclusion.
- **Day-joins-weekly reprices itself** (3ebb672): every stamp path calls
  `recalculateDay`; week cards show per-day hours/OT lines.

### UX shipped
- Weekly page: autosaves as you go (7f347bf) + localStorage draft; days
  already in a weekly are hidden from the picker unless picked here
  (95b1fbf); day list cuts mid-row to show scrollability (2340006);
  popup Show/Date autosave (02f2ef8).
- Log Work: offers only fill EMPTY fields (`offerAfterIfEmpty` /
  `offerBeforeIfEmpty`); ND meal Out derived (always 15 min); join-this-
  weekly card; combobox autocomplete everywhere (iOS datalist was
  invisible); show suggestions = own last-60-days jobs; date-aware
  agreement labels; all selects h-12 (9c067dd).
- Resolve (/analytics): pipeline card (G only → Logged → Received →
  Correct → Done), no auto-"Unpaid", triangle rows open the paycheck
  breakdown with Done button, phone-readable two-line rows (1566de7,
  9a22f98); unlogged days link into edit mode via `?edit=1` (5b17136).
- Transcription (/upload-g/[id]): 50/50 split view — image left/top,
  fields right/bottom, fit-to-pane open, zoom buttons + pinch +
  ctrl-wheel, header height measured at runtime (0c2a034).
- HEIC→JPEG in-browser on all six upload paths; bulk uploads chunked
  (4 files / 24MB) and extension-fallback filtered (631eb7a, a0649ae).
- Membership: Max $100/mo ($999/yr — James confirmed 999), Bookkeeper
  Plus $40/mo with 10 credits then $2/G, monthly/yearly toggle. Stored
  plan ids unchanged.
- Sample export anonymized ("Real Life Example NN", 01c1fe0); old names
  remain in git history (public repo — James knows; offer a history
  rewrite if he asks). Dates display as "Thu 8/26" (`shortDay`).
- Benches: /admin/time-bench is titled **Daily tests** (14 live rule
  checks); Weekly bench has a **Contract rules** card (5 live checks) and
  the bundle has an end-to-end vitest (decode → parse → engine →
  132/133). The bench sample API is `no-store` (a cached truncated
  response once read "24 cards, 0 weekly" on a healthy deploy).

### Production data actions taken
- Migrations applied to prod AND recorded in `d1_migrations` through
  **0020** (paymentFlag). 0019 reset 26 default-'daily' rows to NULL.
- Aug 20 Grown Ups 3 day repriced to weekly scale ($2,330.46 incl. $560
  no-meal penalties — lunch missing; recalculates when James fills it).
  Aug 18's malformed dismissal "430p" normalized to 16:30.
- **INBOUND_EMAIL_SECRET was rotated** (James pasted the old one into
  chat). The current one is only in `app_config`; he reads it in the D1
  console. Never echo it.

## Waiting on James
1. **Commercial overtime decision**: the union cheat sheet says
   commercial days DO earn 1.5×/2× past 8h (and doubles on weekends) —
   the flat treatment understates long days. Switching commercial from
   flat to session+OT (via dayRateOverride) changes logged days; flagged
   twice, awaiting his go-ahead.
2. **Gmail Apps Script install** (email intake): he was mid-install with
   full instructions; check whether actorsbookkeeper@gmail.com now has
   the trigger and whether his test image imported.
3. Pre-2025 wage tables; Stripe key + price ids (note: new plan names
   need Stripe products eventually); StuntListing org GitHub app.
4. Floated, unaccepted: delete/swipe for saved weeklies (empty shells
   accumulate — no DELETE API exists for weeklies).

## Environment lessons (cost hours; read before debugging)
- **Zombie dev servers**: a stale `next dev` can squat on :3000 for the
  whole session — every later `npm run dev &` dies on EADDRINUSE while
  probes "pass" against stale code. Before trusting any UI verification:
  `pgrep -af "next dev"`, kill by PID (never `pkill -f` in a compound
  command — it kills its own shell, exit 144). HMR also silently misses
  edits: if a change doesn't show, restart dev (and `rm -rf .next`).
- **`wrangler d1 execute --local` writes a DIFFERENT sqlite state than
  the dev server's D1** — cleanup via wrangler does not touch what the
  app sees. Local test debris (shows/weeklies named "ZZ …") may linger.
- **Python-written `\uXXXX` inside JSX text renders literally.** Use
  real characters (— – ’ ←) in generated TSX; escapes are only valid in
  JS string literals.
- Egress: api.cloudflare.com + workers.dev blocked (use Cloudflare MCP
  for D1/worker inspection — `workers_get_worker_code` can pull deployed
  code); WebSearch works; npm/pip work.
- Verification harness: jose at `node_modules/jose/dist/webapi/index.js`,
  JWT HS256 secret `stuntlisting-bookkeeper-dev-secret-change-in-production`,
  cookie `stl_session`, payload {userId:"nav-check", email, tier:"plus",
  role}; admin = email in `src/lib/admin-emails.ts` (use
  jamie@stuntlisting.com locally). Local R2 GET 404s — route-fulfill
  images in Playwright. Playwright at
  `/opt/node22/lib/node_modules/playwright/index.mjs`; chromium at
  `/opt/pw-browsers/chromium`. `waitForFunction(fn, null, {timeout})` —
  options are the THIRD argument.
- The app header is one sticky `<header>` whose height changes when the
  auth-dependent second nav bar mounts; measure with a ResizeObserver
  (upload-g/[id] does this).

## House norms (unchanged, restated)
Never guess money — research, cross-check arithmetic (3% ladders,
ratio checks, real contracts), pin with tests, and say when something
can't be verified. Every UI change verified in the browser at 390px
before shipping. One commit per change with a narrative message; push
branch → ff-only merge main → push. Check the Active deployment when a
deploy matters.
