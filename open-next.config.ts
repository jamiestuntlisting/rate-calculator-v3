import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default {
  ...defineCloudflareConfig(),
  // `npm run build` is wired to `opennextjs-cloudflare build` so Cloudflare
  // Workers Builds' default commands work unchanged. This is the inner
  // Next.js build step it runs (must NOT be `npm run build` — recursion).
  buildCommand: "npx next build",
};
