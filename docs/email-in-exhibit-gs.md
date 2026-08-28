# Email in an Exhibit G

Members mail a photo (or several) to the intake address and it lands in
their uploads — matched by their **from** address against the email they
sign in with, then run through exactly the same pipeline as a tap on
Upload: duplicate detection, a numbered tracker row per image, the
transcription queue.

## The moving parts

- **`POST /api/inbound-email`** on the Worker. Auth is the
  `X-Inbound-Secret` header; the secret lives in `app_config` under
  `INBOUND_EMAIL_SECRET` (a Worker env var of the same name would win).
  Rotate it with one SQL UPDATE. Unknown senders are refused by name, so
  mail never lands in the wrong account.
- **A Google Apps Script inside the Gmail account** (below). It checks the
  inbox every few minutes, POSTs each new message's attachments to the
  endpoint, then labels the thread `processed` / `unmatched` / `failed`
  so the mailbox itself is the log.

## One-time setup (James, ~5 minutes)

1. Create / sign in to the intake Gmail account
   (**actorsbookkeeper@gmail.com**).
2. Open <https://script.google.com> **while signed in as that account** →
   New project.
3. Paste `docs/inbound-email.gs`, replacing SECRET_HERE with the value in
   app_config (ask Claude, or:
   `SELECT value FROM app_config WHERE key='INBOUND_EMAIL_SECRET'`).
4. Run `processInbox` once from the editor — Google asks to authorize
   Gmail + external requests; approve.
5. Triggers (clock icon) → Add trigger → `processInbox`, time-driven,
   every 5 minutes.

That's the whole install. To stop it, delete the trigger; to rotate the
secret, update app_config and the script constant.

## Notes

- Senders must mail **from the address they log in with**. The unmatched
  label catches everyone else.
- Attachments accepted: photos and PDFs (same rule as the app; videos are
  skipped and named in the response).
- The service worker never reads the mailbox — Google pushes to us, so no
  Gmail credentials live anywhere near the app.
