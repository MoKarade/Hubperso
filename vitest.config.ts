import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // vitest 5 (Vite 8) transforme avec oxc, qui RESPECTE `"jsx": "preserve"` du tsconfig (réglage
  // voulu par Next) : un .tsx garde son JSX brut et ne s'analyse plus — un test qui l'importe
  // plante, et la couverture l'ÉCARTE EN SILENCE (mesuré : 5 .tsx comptés sur 35 dans CarAI).
  // Pour les tests seulement, JSX compilé en runtime automatique (React 17+).
  oxc: { jsx: { runtime: "automatic" } },
  // Même alias `@/` que tsconfig.json : sans lui, un test ne peut pas importer un fichier
  // de `app/` (les routes utilisent `@/lib/…`), donc les routes ne seraient pas testables
  // — et une route non testée est exactement celle qui garde une porte.
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Couverture (porte qualité de l'Atelier, S6) : calculée seulement avec --coverage (npm run portes).
    coverage: {
      provider: "v8",
      include: ["app/**/*.{ts,tsx}", "lib/**/*.ts", "components/**/*.tsx"],
      exclude: ["**/*.d.ts"],
      reporter: ["text-summary", "json-summary"],
      reportsDirectory: "coverage",
    },
  },
});
