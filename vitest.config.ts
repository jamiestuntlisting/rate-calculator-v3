import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // Component tests (*.test.tsx) render React through jsdom; each such
  // file opts in with `// @vitest-environment jsdom` at its top so the
  // pure-logic suite keeps running in node.
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
