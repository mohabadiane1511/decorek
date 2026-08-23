import { serve } from "@hono/node-server";
import { config as loadEnv } from "dotenv";
import { creerApp } from "./app.js";
import { lireConfig } from "./config.js";
import { creerClient } from "./db.js";

// Chargé avant toute lecture de configuration. En conteneur, les variables viennent de
// l'environnement et ce fichier n'existe pas : dotenv l'ignore alors sans bruit.
loadEnv({ path: new URL("../.env", import.meta.url).pathname, quiet: true });

const config = lireConfig();
const prisma = creerClient(config.DATABASE_URL);
const app = creerApp({ config, prisma });

const serveur = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(`API Deco'Rek à l'écoute sur le port ${info.port} (${config.NODE_ENV})`);
});

// Sans cela, un conteneur qui redémarre coupe les requêtes en cours et laisse des
// connexions Postgres ouvertes jusqu'à leur expiration.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    serveur.close(() => {
      void prisma.$disconnect().then(() => process.exit(0));
    });
  });
}
