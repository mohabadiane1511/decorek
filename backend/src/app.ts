import { Hono } from "hono";
import { logger } from "hono/logger";
import { requestId } from "hono/request-id";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { Config } from "./config.js";
import { ErreurApi, corpsErreur, gererErreur } from "./erreurs.js";
import type { PrismaClient } from "./generated/prisma/client.js";

export type Dependances = {
  config: Config;
  prisma: PrismaClient;
};

export function creerApp({ config, prisma }: Dependances): Hono {
  const app = new Hono();

  app.use("*", requestId());
  if (config.NODE_ENV !== "test") {
    app.use("*", logger());
  }

  app.onError(gererErreur);
  app.notFound((c) => c.json(corpsErreur("INTROUVABLE", "Ressource introuvable."), 404));

  // Vérifie la dépendance, pas seulement que le processus répond : un service qui
  // renvoie « je vais bien » sans savoir joindre sa base ne sert à rien à un
  // orchestrateur, qui continuerait à lui envoyer du trafic.
  app.get("/api/health", async (c) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (erreur) {
      console.error("Contrôle de santé : base injoignable", erreur);
      return c.json({ status: "degraded" as const, database: "injoignable" as const }, 503);
    }
    return c.json({ status: "ok" as const, database: "ok" as const });
  });

  // Routes de diagnostic : jamais montées en production. Elles servent aux tests du
  // contrat d'erreur, mais /api/boom offrirait sinon un moyen commode de polluer les
  // journaux, et rien de ce qu'elles font n'a d'utilité pour un client réel.
  if (config.NODE_ENV !== "production") {
    app.get(
      "/api/_diag/echo",
      zValidator(
        "query",
        z.object({ n: z.coerce.number().int().min(1).max(100) }),
        (resultat, c) => {
          if (!resultat.success) {
            return c.json(
              corpsErreur("VALIDATION", "Paramètres invalides.", resultat.error.issues),
              400,
            );
          }
          return undefined;
        },
      ),
      (c) => c.json({ n: c.req.valid("query").n }),
    );

    app.get("/api/_diag/boom", () => {
      throw new Error("panne simulée contenant un secret : sk_live_123");
    });

    app.get("/api/_diag/introuvable", () => {
      throw new ErreurApi("INTROUVABLE", "Produit introuvable.");
    });
  }

  return app;
}
