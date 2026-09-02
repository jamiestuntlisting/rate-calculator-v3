/**
 * The Worker's entry: the OpenNext handler plus a daily cron.
 *
 * scripts/add-cron.mjs installs this as `.open-next/worker.js` at the
 * end of `npm run build`, after renaming the generated OpenNext worker
 * to `.open-next/app-worker.js` — so whatever command deploys, and
 * whichever script path it names, the Worker carries the `scheduled`
 * handler. The cron (`triggers.crons` in wrangler.jsonc) calls the
 * app's own `/api/cron/bank-sync` route in-process — no network hop —
 * carrying a token this module minted when the isolate started, which
 * the route compares against the same global. Nothing outside the
 * Worker can present that token.
 */
import handler from "./app-worker.js";

export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./app-worker.js";

const CRON_TOKEN = crypto.randomUUID();
globalThis.__cronToken = CRON_TOKEN;

const CRON_ROUTES = ["/api/cron/bank-sync"];

export default {
  ...handler,
  async scheduled(event, env, ctx) {
    for (const path of CRON_ROUTES) {
      const request = new Request(`https://rate-calculator.jamie-181.workers.dev${path}`, {
        method: "POST",
        headers: { "x-cron-token": CRON_TOKEN, "user-agent": "rate-calculator-cron" },
      });
      ctx.waitUntil(
        handler.fetch(request, env, ctx).then(
          async (res) => console.log(`cron ${path} → ${res.status} ${(await res.text()).slice(0, 200)}`),
          (e) => console.error(`cron ${path} failed:`, e)
        )
      );
    }
  },
};
