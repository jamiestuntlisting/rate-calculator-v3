/**
 * The Worker's entry: the OpenNext handler plus a daily cron.
 *
 * wrangler.jsonc points `main` here instead of at the generated
 * `.open-next/worker.js`, so the app is untouched and the Worker gains
 * a `scheduled` handler. The cron (see `triggers.crons`) calls the
 * app's own `/api/cron/bank-sync` route in-process — no network hop —
 * carrying a token this module minted when the isolate started, which
 * the route compares against the same global. Nothing outside the
 * Worker can present that token.
 *
 * Plain JavaScript, because `.open-next/worker.js` only exists after a
 * build and the app's typecheck must not depend on it.
 */
import handler from "./.open-next/worker.js";

export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";

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
