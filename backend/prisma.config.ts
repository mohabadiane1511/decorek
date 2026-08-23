import { config as loadEnv } from "dotenv";
import { defineConfig, env } from "prisma/config";

// Le backend a son propre .env : celui de la racine décrit comment Docker Compose
// démarre les services, celui-ci comment le backend s'y connecte.
loadEnv({ path: new URL(".env", import.meta.url).pathname, quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
