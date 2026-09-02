# Bank deposits via Plaid

A feature under test (`src/lib/test-users.ts` says for whom). A tester
connects a bank account through Plaid — view only — and the app pulls
their deposits and lines each one up against the pay the calculator
expected.

## What it does

- **Connect** — `/bank` opens Plaid Link with a token from
  `POST /api/bank/link-token`; Link hands back a public token that
  `POST /api/bank/exchange` swaps for an access token, stored in
  `bank_connections` (migration 0028). One connection per member; a new
  one replaces the old. Transactions only, read only: Plaid cannot move
  money with this token.
- **Pull** — `src/lib/bank-sync.ts` walks `transactions/sync` from the
  stored cursor, keeps the credits (Plaid signs money in as negative),
  and stores them in `bank_deposits`. `POST /api/bank/sync` runs it for
  the signed-in member; **once a day** the Worker's cron (`worker.js`,
  `triggers.crons` in wrangler.jsonc, 11:00 UTC) calls
  `POST /api/cron/bank-sync`, which runs it for every connected member.
  The cron request is made in-process with a token the Worker minted at
  startup, so nothing outside can trigger it; an admin can run it by
  hand from a signed-in session.
- **Match** — `src/lib/bank-match.ts`, pure and tested. A deposit is
  net of withholding while the app's figure is gross, so they never
  agree to the cent; timing is what they agree on. A SAG check is due
  by the Wednesday of the second week after the work week
  (`payment-due.ts`), so a deposit matches an expected payment when it
  falls within ten days of that due date and its amount sits between
  half the gross and the gross. Nearest by date wins, biggest deposits
  claim first, each expected payment takes one deposit. Days and
  weeklies are both candidates. A deposit above the floor that matches
  nothing but comes from a payroll house (`PAYROLL_NAMES`) is a
  **residual**; anything else stays unmatched. The floor defaults to
  $500 and is a preference (`prefs.depositFloor`, set under
  Preferences → Bank deposits), not a control on the page.
- **Show** — `/bank` lists deposits above the floor with what each lines
  up with (a link to the day or the weekly), the expected gross and the
  deposit as a percentage of it, and how many days from the due date it
  landed. `DELETE /api/bank/connection` disconnects and forgets the
  deposits.

## Setup (James)

Plaid keys on the Worker or in `app_config`: `PLAID_CLIENT_ID`,
`PLAID_SECRET`, and `PLAID_ENV` — `sandbox` to try it with Plaid's test
bank (any sandbox institution, user `user_good`, password `pass_good`),
`production` when real. Until they are set the page says so and the
Connect button stays off. Plaid's production access for transactions
needs their approval of the app, which is a form on the Plaid
dashboard.

## What is not decided

- Whether a residual deposit should be written to the residuals ledger
  automatically, or only suggested.
- Whether a matched deposit should mark the day paid (`paidAmount`)
  automatically. Today it only records the match; marking paid stays a
  human act on Resolve.
