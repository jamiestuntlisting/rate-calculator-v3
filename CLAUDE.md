# StuntListing Bookkeeper — project notes for Claude

Next.js 16 on Cloudflare Workers (OpenNext adapter). Data in Cloudflare D1
(`rate-calculator-db`), uploaded files in R2 (`rate-calculator-uploads`).
See README.md for commands; schema in `migrations/`; data layer in
`src/lib/repos/`.

## Working preferences (James)

- Run commands in the Claude terminal session; don't hand James copy-paste
  blocks unless something genuinely must run on his machine or credentials
  are missing.
- **Always give direct deep links to dashboard pages, never menu
  navigation.** Cloudflare deep links use the `?to=/:account/...` pattern,
  which auto-resolves the account.

## Direct links

| What | Link |
| --- | --- |
| Worker overview | https://dash.cloudflare.com/?to=/:account/workers/services/view/rate-calculator-v3 |
| Worker settings (secrets/vars) | https://dash.cloudflare.com/?to=/:account/workers/services/view/rate-calculator-v3/production/settings |
| Builds & deployments | https://dash.cloudflare.com/?to=/:account/workers/services/view/rate-calculator-v3/production/deployments |
| D1 database | https://dash.cloudflare.com/?to=/:account/workers/d1/databases/b3a532d8-066a-496b-97a2-33f23c0d5978 |
| R2 bucket | https://dash.cloudflare.com/?to=/:account/r2/default/buckets/rate-calculator-uploads |
| Cloudflare API tokens | https://dash.cloudflare.com/profile/api-tokens |
| Old Vercel project (being retired) | https://vercel.com/james-northrups-projects/rate-calculator-v3 |
| Vercel env vars (MONGODB_URI lives here) | https://vercel.com/james-northrups-projects/rate-calculator-v3/settings/environment-variables |

## Environment notes

- The Claude cloud environment's network policy blocks api.cloudflare.com
  and MongoDB Atlas: `wrangler` commands needing the API and direct Mongo
  connections fail here. Use the Cloudflare MCP tools for D1 SQL and
  resource management; anything needing `wrangler` auth (secrets, r2 object
  put, deploys) runs via Workers Builds on push, or on James's machine.
- Production deploys happen automatically: push to `main` → Cloudflare
  Workers Builds runs `npm run build` + `npx wrangler deploy`.
