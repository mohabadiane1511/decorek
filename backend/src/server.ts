import { serve } from "@hono/node-server";
import { config as loadEnv } from "dotenv";
import { Redis } from "ioredis";
import { creerApp } from "./app.js";
import { creerAuth } from "./auth.js";
import { creerCache } from "./cache.js";
import { creerCourrier } from "./mail.js";
import { lireConfig } from "./config.js";
import { creerClient } from "./db.js";

// Chargé avant toute lecture de configuration. En conteneur, les variables viennent de
// l'environnement et ce fichier n'existe pas : dotenv l'ignore alors sans bruit.
loadEnv({ path: new URL("../.env", import.meta.url).pathname, quiet: true });

const config = lireConfig();
const prisma = creerClient(config.DATABASE_URL);
const cache = creerCache(config.REDIS_URL);
const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
redis.on("error", () => {
  // Journalisé par le cache : inutile de doubler le bruit. Sans écouteur, ioredis
  // ferait tomber le processus sur une erreur de connexion.
});
const courrier = creerCourrier(config);
const auth = creerAuth(prisma, redis, config, courrier);
const app = creerApp({ config, prisma, cache, redis, auth });

const serveur = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(`API Deco'Rek à l'écoute sur le port ${info.port} (${config.NODE_ENV})`);
});

// Sans cela, un conteneur qui redémarre coupe les requêtes en cours et laisse des
// connexions Postgres ouvertes jusqu'à leur expiration.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    serveur.close(() => {
      void Promise.allSettled([prisma.$disconnect(), cache.fermer(), redis.quit()]).then(() =>
        process.exit(0),
      );
    });
  });
}
