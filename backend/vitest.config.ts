import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["./tests/setup-global.ts"],
    // Les tests partagent une base : les faire tourner en parallèle produirait des
    // interférences difficiles à diagnostiquer pour un gain nul à cette échelle.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
