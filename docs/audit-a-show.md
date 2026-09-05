# Audit a show — the outline

**Status (09/2026):** built as a stepped flow at `/admin/audits` with real
details, uploads and transcription, and placeholders for pricing,
matching and the package (a sample PDF). See CLAUDE.md for the pieces.

An uncommon service, for when a production has not paid correctly: take
every Exhibit G from a run, transcribe every performer's row, price what
each of them should have been paid, and set that against what they were
paid. This is the broad shape, agreed before anything is built. A
placeholder page states it at `/admin/audits`.

## What makes it different from the pile

The app's Exhibit G flow is one member, one card, one row — their own
day. An audit is a show: many cards, every row, many people, most of
whom are not members and never log in. So an audit is **its own world**:

- **An audit is a record** (`audits`): show, production company, the
  agreement(s) in force, who asked for it, status (open, transcribing,
  priced, matched, delivered). Everything below hangs off its id.
- **Its people are audit performers** (`audit_performers`), not users:
  a name, the characters they played, a contact if one is known, and
  the union status the card shows. A performer can later be linked to a
  member account, but nothing requires it.
- **Its cards are audit uploads**: the same ingest as the pile — dedupe
  by bytes, R2, numbered placeholders — tagged to the audit rather than
  to a member, and never shown on anyone's tracker or pile.
- **Its days are audit days** (`audit_days`): one per row per card, the
  same fields the transcription form asks — call, ND meal, meals,
  dismissal, wrap, adjustment, work status, character, notes — keyed to
  a performer and a card. Privacy is by construction: an audit's rows
  live in audit tables, and only admins on the audit see them.

## The work, in order

1. **Open** — name the show, the company, the agreement; note who
   asked and why.
2. **Upload** every card. The bulk page's ingest with an audit tag.
3. **Transcribe whole cards.** The transcription page's fields pane,
   but for every row on the card, not one: a row picker on the card
   (the highlighter and row lock already exist for exactly this), and
   Claude's reading of the whole card pre-filling every row for the
   transcriber to check (`src/lib/g-reader` reads one row today; the
   rule book extends to "every row" without changing shape).
4. **Price every day** with the engine, by date and agreement — daily,
   weekly (splitting on week boundaries as `/weekly` does), 3-day,
   flat — so each performer has what they were owed day by day and
   for the run. Recalculation on edit, as the tracker does.
5. **Match the paychecks.** Per performer, the stubs or check totals
   they supply go in beside the working (the per-day pay-stub
   transcription and the expected-pay PDF already exist). The
   shortfall points at a line. The reverse calculator says how a wrong
   figure was probably arrived at.
6. **Package.** One report per performer and one for the show: days,
   times, owed, paid, the gap. The per-day expected-pay PDF stacks
   into it; the note to payroll already drafts from the two workings.

## What is reused, and what is new

Reused as-is: `ingestGUploads` (with a tag), the transcription form's
fields pane and its rules, the rate engine and the weekly engine,
`recalculateDay`, the pay-stub transcription, the expected-pay PDF,
the reverse calculator, the Claude reader.

New: the `audits`, `audit_performers`, `audit_days` tables and their
repos; an audit-aware ingest tag; a whole-card transcription mode (row
picker + per-row Claude reading); the per-performer and per-show
reports; the admin pages to walk it.

## Open questions for James

- Whether audit performers ever get a login to see their own report,
  or the package is delivered by the auditor.
- Which agreements an audit needs beyond the ones the app prices
  (a show-specific deal memo is likely).
- How paychecks arrive — stubs to transcribe, a payroll export to
  import, or totals typed in.
