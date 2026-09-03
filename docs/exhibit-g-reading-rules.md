# How Claude reads an Exhibit G

A feature under test (`src/lib/test-users.ts` says for whom). When a
tester's Exhibit G lands — by the Upload button, by text or by email —
Claude Fable 5.1 reads the performer's row off the card in the
background, and the transcription form opens pre-filled from it. The
performer checks every box and marks the G done; Done scores each field
Claude read against what was saved, and `/admin/readings` keeps the
batting average.

## The rule book

The prompt itself is `RULE_BOOK` in `src/lib/g-reader/prompt.ts`; this
page explains it. Its version (`PROMPT_VERSION`) is stamped on every
reading, so a change to the words starts a fresh line on the analytics
page instead of blending into the old one. **Bump the version whenever
the prompt changes.**

What the rule book tells the model:

- **The card's anatomy.** Header (production, title, prod #, date,
  location), then one row per performer: cast, character, work-status
  letters, and the time columns — make-up/hair/wardrobe report (the
  call), report on set, dismiss on set, dismiss make-up/hair/wardrobe
  (the wrap), N.D. breakfast out/in, 1st meal out/in, 2nd meal out/in,
  travel, stunt adjustment, mileage, MPV, signature. Column order varies
  by printing, so read the printed headings, never positions.
- **Meals: OUT is the start, IN is the end.** The card's 1st Meal OUT is
  when the performer went out to lunch — `firstMealStart` — and IN is
  when they came back — `firstMealFinish`. This is the mapping most
  likely to be swapped, so it is stated twice.
- **Find the row by name**, tolerating abbreviation and misspelling,
  preferring a row whose character is a stunt role. If the name is not
  on the card, say so and fill nothing.
- **Handwritten times.** `6¹²A` is 6:12 AM, `5³¹P` is 5:31 PM; raised
  digits are minutes; A/P is the meridiem. Without one, infer from the
  day's sequence (call early, meals and dismissals after, wrap last). A
  dash, slash, cross or empty cell is null — never invent a time.
- **Money.** Stunt adjustments are round dollar figures (100, 250, 500,
  1000, 5000…); a tally mark is not an amount.
- **Date and show.** A handwritten date correction beats the printed
  date; the title as printed, plus the episode when shown.
- **Confidence** per field, with a note under 0.8 saying what the hand
  actually wrote — a flagged hard read is worth more than a guess.

## The output

`src/lib/g-reader/schema.ts` — the same fields the transcription form
asks for, in the form's units (24-hour `HH:MM`, `YYYY-MM-DD`, dollars),
plus `workStatusMark`, `travel`, `otherNotes` and a `fieldConfidence`
list. Structured outputs guarantee the shape.

## Scoring

`src/lib/g-reader/score.ts`, one outcome per field:

| Outcome | Meaning |
| --- | --- |
| exact | the same value |
| small | a time within 15 minutes, money within $50, text differing only in case, spacing or a contained word, a date a day or two out |
| meridiem | a time exactly twelve hours out — AM read as PM or back |
| large | wrong by more than that |
| missed | Claude left it blank, the performer filled it |
| spurious | Claude filled it, the performer left it blank |
| blank | both blank; not counted |

The **batting average** is exact over counted; **close enough** adds the
small ones. Both are kept per field, per prompt version, over all cards
and rolling over the last 10 and 20, because a prompt change can move
one without the other. A card is scored when its performer marks it
done; reopening and finishing again replaces the scores.

## Plumbing

- `src/lib/g-reader/read.ts` — fetches the card from R2, calls the
  Messages API with the rule book as a cached system prompt and the
  card as an image (or PDF document), records the reading or the
  error in `g_readings` (migration 0025) with tokens and timing.
- `src/lib/g-ingest.ts` — schedules the read on `ctx.waitUntil` for a
  tester's uploads, so the upload never waits on the model.
- `POST /api/g-uploads/[id]/read` — read now; the transcription page
  calls it for a tester's G that has no reading yet, and its "Read
  again" button.
- `GET /api/g-uploads/[id]` returns `reading`; `PATCH … done: true`
  scores it.
- `GET /api/admin/readings` and `/admin/readings` — the analytics.

## Setup

The key lives where the session secret does: `ANTHROPIC_API_KEY` as a
Worker secret, or an `app_config` row of that name. Until it is set,
every reading records the error "ANTHROPIC_API_KEY is not configured"
and the form opens empty as before. A key created under a person's
identity rather than inside a workspace is refused with
"anthropic-workspace-id is required"; set `ANTHROPIC_WORKSPACE_ID` (the
workspace's id, from the Console's workspace settings) in the same
place and the reader sends it as the `anthropic-workspace-id` header.
A key created inside a workspace needs nothing more.
