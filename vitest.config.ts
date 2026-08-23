import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Config autonome : ne pas réutiliser vite.config.ts, dont les plugins (tanstackStart,
// nitro) démarrent un serveur SSR inutile et coûteux pour des tests unitaires.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    restoreMocks: true,
  },
});
