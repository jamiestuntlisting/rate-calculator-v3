# StuntListing Bookkeeper (Rate Calculator)

SAG-AFTRA stunt rate calculator and payment tracker for StuntListing Plus
members. Next.js 16 app running on **Cloudflare Workers** with **Cloudflare
D1** (database) and **Cloudflare R2** (uploaded documents/photos), deployed via
[@opennextjs/cloudflare](https://opennext.js.org/cloudflare).

## Stack

- **Hosting**: Cloudflare Workers (OpenNext adapter) — worker name `rate-calculator`
- **Database**: Cloudflare D1 `rate-calculator-db` (SQLite) — schema in `migrations/`
- **File storage**: Cloudflare R2 bucket `rate-calculator-uploads`
- **Auth**: StuntListing GraphQL login + JWT session cookie (jose), enforced by
  edge middleware (`src/middleware.ts`)
- **Bindings**: declared in `wrangler.jsonc` (`DB`, `UPLOADS`), typed via
  `cloudflare-env.d.ts` / `worker-bindings.d.ts`, accessed through
  `src/lib/db.ts` + repositories in `src/lib/repos/`

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars                       # local secrets
npx wrangler d1 migrations apply rate-calculator-db --local   # create local DB schema
npm run dev                                          # Next dev server with D1/R2 bindings
```

`npm run dev` uses local simulated D1/R2 state under `.wrangler/state/` — no
Cloudflare account needed.

To run the production build on the actual Workers runtime locally:

```bash
npm run preview        # opennextjs-cloudflare build + wrangler dev
```

## Deploying to Cloudflare

Two options:

1. **Workers Builds (recommended — replaces Vercel's git integration).**
   The repo is connected to the Worker `rate-calculator`. Its build
   settings (Worker → *Settings → Build*) must be:
   - Build command: `npx opennextjs-cloudflare build`
   - Deploy command: `npx wrangler deploy`
   - Branch: whichever branch carries this migrated code (`main` once merged)

   Every push to that branch then builds and deploys automatically. Plain
   `npm run build` will NOT work as the build command — the OpenNext step is
   what produces `.open-next/worker.js` for deployment.

2. **From your machine:**
   ```bash
   npx wrangler login
   npm run deploy
   ```

One-time production setup (either path):

- **`SESSION_SECRET` (required)** — the app refuses logins in production
  without it. Set it in the dashboard (*Worker → Settings → Variables and
  Secrets → Add → type "Secret"*) with a long random value, or run
  `npx wrangler secret put SESSION_SECRET`. Generate a value with:
  `openssl rand -base64 32`
- D1 schema: `npm run db:migrate:remote` (already applied to `rate-calculator-db`)

## Migrating data from the old MongoDB deployment

The previous Vercel deployment stored data in MongoDB. To move it into D1/R2:

```bash
npm i --no-save mongodb
MONGODB_URI="mongodb+srv://..." node scripts/mongo-to-d1.mjs
npx wrangler d1 execute rate-calculator-db --remote --file=mongo-export/data.sql
bash mongo-export/upload-to-r2.sh
```

Document ids and user associations are preserved.

## Useful commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Next dev server (fast refresh) with local bindings |
| `npm run preview` | Production build on local Workers runtime |
| `npm run deploy` | Build + deploy to Cloudflare |
| `npm run db:migrate:local` | Apply D1 migrations locally |
| `npm run db:migrate:remote` | Apply D1 migrations to production |
| `npm run cf-typegen` | Regenerate `cloudflare-env.d.ts` after `wrangler.jsonc` changes |
| `npx wrangler tail rate-calculator` | Live production logs |
