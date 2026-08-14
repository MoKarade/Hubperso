import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Même alias `@/` que tsconfig.json : sans lui, un test ne peut pas importer un fichier
  // de `app/` (les routes utilisent `@/lib/…`), donc les routes ne seraient pas testables
  // — et une route non testée est exactement celle qui garde une porte.
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
