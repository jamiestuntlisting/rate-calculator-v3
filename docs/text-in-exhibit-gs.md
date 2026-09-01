# Text in an Exhibit G

A performer texts a photo of their Exhibit G to the intake number and it
lands in their tracker — same dedupe, same numbered rows, same
transcription queue as the Upload button, the bulk page and the email
intake (all four share `src/lib/g-ingest.ts`). The reply says so:
"Got it. Adding this to your Bookkeeping tracker."

## How a sender is matched

By mobile number, against `users.phone` (bare digits; the last ten are
compared, so `+1 929…` and `929…` agree). The number gets there two
ways:

1. **Preferences** — the member types it under "Text in your Exhibit
   Gs" on `/preferences`. Deterministic, and doubles as consent.
2. **Login probe** — best-effort: after a successful login the app asks
   the StuntListing profile for a mobile number, trying the candidate
   field names `phone`, `phone_number`, `mobile` one at a time in their
   own queries (a miss can never break the login). It only fills an
   EMPTY stored phone — a number typed into Preferences always stands.
   The production log line `stored mobile from StuntListing field "…"`
   says which name the schema actually has; once known, the candidate
   list can be trimmed to just it.

An unknown or ambiguous number is never guessed at — the reply tells
the sender to add their number under Preferences. Ambiguous means two
accounts share the last ten digits; nobody's paperwork should land in a
stranger's tracker.

## Setting it up (James)

1. **Pick the number** in the Twilio console (any SMS/MMS-capable
   number on the existing account works).
2. **Point its Messaging webhook** ("A message comes in") at
   `https://rate-calculator.jamie-181.workers.dev/api/inbound-sms`,
   method **HTTP POST**.
3. **Drop the credentials into `app_config`** (D1 console → the
   database → Console):

   ```sql
   INSERT OR REPLACE INTO app_config (key, value) VALUES
     ('TWILIO_AUTH_TOKEN',  '<the account auth token>'),
     ('TWILIO_ACCOUNT_SID', '<ACxxxxxxxx>'),
     ('SMS_INTAKE_NUMBER',  '+1 (xxx) xxx-xxxx');
   ```

   - `TWILIO_AUTH_TOKEN` verifies each request really came from Twilio
     (the `X-Twilio-Signature` HMAC) and authenticates media downloads.
     A Worker env var of the same name wins over the table, same as
     `INBOUND_EMAIL_SECRET`.
   - `TWILIO_ACCOUNT_SID` is used for fetching the pictures (HTTP basic
     auth works whether or not the account enforces auth on media
     URLs).
   - `SMS_INTAKE_NUMBER` is display only: it is what Preferences shows
     members to text. Format it however it should read.
4. **Test**: add your own mobile under Preferences, text the number a
   photo, expect "Got it. Adding this to your Bookkeeping tracker." and
   a new row on /upload-g and the Tracker.

If the worker ever runs behind a different public URL than the one
Twilio calls (a proxy, a custom domain), set `TWILIO_WEBHOOK_URL` in
`app_config` to the exact URL configured in Twilio — the signature is
computed over that string.

## Replies the sender can get

- "Got it. Adding this to your Bookkeeping tracker." — one picture, one
  new tracker row (multiple pictures say how many; each is its own
  work day, like every other upload path).
- "Got it — you'd already sent this one, so it's not added twice." —
  the bytes matched an earlier upload (the same dedupe as everywhere).
- "This number isn't linked…" — no matching member; add the number
  under Preferences.
- "Text a photo of your Exhibit G…" — a text with no picture.
- "Couldn't read that attachment…" — media that isn't a photo or PDF.

## Notes

- The route is `POST /api/inbound-sms`, exempt from the session
  middleware; it authenticates every request by signature and answers
  everything with TwiML at status 200 (Twilio re-delivers on errors,
  and a re-delivered "unknown sender" helps nobody). A missing
  `TWILIO_AUTH_TOKEN` answers 503 — unconfigured, not open.
- Signature scheme and phone normalization are pinned by tests
  (`src/lib/twilio.test.ts`) against node's own HMAC.
- Up to 10 pictures per message are taken (Twilio's own MMS cap).
