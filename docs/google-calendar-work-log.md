# Google Calendar work log

A feature under test (`src/lib/test-users.ts` says for whom). The
company keeps one Google Calendar per member — "Jamie Northrup —
StuntListing Work Log" — shares it to the member by invitation, read
only, and mirrors every logged day onto it as an all-day event. The
member sees it beside their own calendars and can switch it on and off
without touching them. The Bookkeeper's `work_records` stay the source
of truth.

This is the "company owns the calendar" model, chosen over creating a
calendar inside each member's Google account: no OAuth consent from the
member, one invitation email from Google, and the member never grants
the app anything.

## How it works

- **The company's identity** is a Google service account. It owns the
  calendars, so nothing is concentrated under a person's Google
  account, and it signs in from the Worker with a JWT built from its
  private key (`src/lib/google-calendar.ts`, using jose) — no browser
  round trip.
- **Connect** (Preferences → Google Calendar work log, testers): the
  app creates the calendar (`calendars.insert`, New York time), shares
  it to the member's email as a reader (`acl.insert` with
  `sendNotifications=true`, which is the invitation), stores the
  calendar id on the user (migration 0029), and writes every day they
  have logged.
- **Each day** is an all-day event: "Show — Role (for Actor)", with the
  call, the wrap, the expected pay and a link to the day in the
  description, and the record id in the event's private extended
  properties (`stuntlisting_work_record_id`) so a resync can always find
  its way back. The event id rides `work_records.googleEventId`, so an
  edit patches the same event and a delete removes it.
- **When** — after the response, on `ctx.waitUntil`, from every place a
  day is created, changed or deleted: Log Work, the day's edit page,
  transcription saves, uploads (an untranscribed day is written as
  such and rewritten when transcribed), and deletes. A calendar hiccup
  never fails a save; it is logged.
- **Disconnect** removes the member's access and forgets the calendar
  id; the events stay with the company.

## Setup (James)

1. In Google Cloud, make a project (or use one), enable the **Google
   Calendar API**, and create a **service account** with a JSON key.
2. Put the key file's contents, as one JSON string, in
   `GOOGLE_SERVICE_ACCOUNT_JSON` — a Worker secret at
   https://dash.cloudflare.com/?to=/:account/workers/services/view/rate-calculator/production/settings
   or an `app_config` row of that name.
3. No Workspace domain-wide delegation is needed: the service account
   is the calendar owner. Quotas are far above a work log's traffic.

Until the key is set, Preferences says so and the Share button stays
off.

## Not decided

- Whether every member should get this, or testers only (today).
- Whether weekly contracts should also appear as one spanning event.
