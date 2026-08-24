import { defineConfig, devices } from "@playwright/test";

// Front dédié aux tests, distinct de celui du développement : il pointe vers
// l'API de test, qui écrit dans « decorek_test ».
const PORT = 8090;
const PORT_API_E2E = process.env["API_E2E_PORT"] ?? "53001";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/setup-global.ts",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  reporter: process.env["CI"] ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    env: {
      // Le proxy du front renvoie /api vers l'API de test, jamais vers celle du
      // développement.
      API_PORT: PORT_API_E2E,
      PORT: String(PORT),
    },
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
  },
});
