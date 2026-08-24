import { Redis } from "ioredis";
import type { Hono } from "hono";
import { creerApp } from "../src/app.js";
import { creerAuth, type Auth } from "../src/auth.js";
import { creerCache, type Cache } from "../src/cache.js";
import { lireConfig } from "../src/config.js";
import { creerClient } from "../src/db.js";
import type { PrismaClient } from "../src/generated/prisma/client.js";

export type ContexteTest = {
  app: Hono;
  auth: Auth;
  prisma: PrismaClient;
  cache: Cache;
  redis: Redis;
  fermer: () => Promise<void>;
};

/**
 * Monte l'application avec ses dépendances réelles, sur la base et le cache de test.
 * On ne simule ni Postgres ni Redis : les comportements qui nous intéressent — une
 * contrainte violée, un cache invalidé — ne se reproduisent pas fidèlement en double.
 */
export function creerContexte(env: NodeJS.ProcessEnv = process.env): ContexteTest {
  const databaseUrl = env["TEST_DATABASE_URL"];
  const redisUrl = env["TEST_REDIS_URL"];
  if (!databaseUrl || !redisUrl) {
    throw new Error(
      "TEST_DATABASE_URL et TEST_REDIS_URL sont requises — voir backend/.env.example",
    );
  }

  const prisma = creerClient(databaseUrl);
  const cache = creerCache(redisUrl);
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
  redis.on("error", () => {
    /* silencieux : certains tests coupent volontairement le cache */
  });

  const config = lireConfig({
    ...env,
    NODE_ENV: "test",
    DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl,
  });

  const auth = creerAuth(prisma, redis, config);

  return {
    app: creerApp({ config, prisma, cache, redis, auth }),
    auth,
    prisma,
    cache,
    redis,
    fermer: async () => {
      await Promise.allSettled([prisma.$disconnect(), cache.fermer(), redis.quit()]);
    },
  };
}
