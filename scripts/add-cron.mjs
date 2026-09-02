#!/usr/bin/env node
/**
 * Wrap the generated OpenNext worker with the cron entry. Runs at the
 * end of `npm run build`: `.open-next/worker.js` (OpenNext's output)
 * becomes `.open-next/app-worker.js`, and scripts/cron-worker.js takes
 * its place as `.open-next/worker.js`. Idempotent: a second run finds
 * the wrapper already in place and leaves it.
 */
import { readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";

const OUT = ".open-next/worker.js";
const APP = ".open-next/app-worker.js";
const WRAPPER = "scripts/cron-worker.js";

// Never fail the build: the app deploying without its cron beats the
// app not deploying at all. A problem here is logged and the OpenNext
// worker ships as it is.
try {
  if (!existsSync(OUT)) {
    console.error("add-cron: no .open-next/worker.js — skipping (the cron will not be installed)");
  } else {
    const current = readFileSync(OUT, "utf8");
    if (current.includes("__cronToken")) {
      console.log("add-cron: wrapper already in place");
    } else {
      renameSync(OUT, APP);
      writeFileSync(OUT, readFileSync(WRAPPER, "utf8"));
      console.log("add-cron: .open-next/worker.js now wraps app-worker.js with the scheduled handler");
    }
  }
} catch (e) {
  console.error("add-cron: skipped —", e instanceof Error ? e.message : e);
}
process.exit(0);
