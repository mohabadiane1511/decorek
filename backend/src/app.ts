import { Hono } from "hono";
import { logger } from "hono/logger";
import { requestId } from "hono/request-id";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { Redis } from "ioredis";
import type { Auth } from "./auth.js";
import { exigerAdmin, lireSession } from "./auth-middleware.js";
import type { Cache } from "./cache.js";
import type { Courrier } from "./mail.js";
import type { Config } from "./config.js";
import { limiter } from "./limite.js";
import { ErreurApi, corpsErreur, gererErreur } from "./erreurs.js";
import type { PrismaClient } from "./generated/prisma/client.js";
import { routesCatalogue } from "./routes/catalogue.js";
import { routesCommandes } from "./routes/commandes.js";
import { routesContenu } from "./routes/contenu.js";

export type Dependances = {
  config: Config;
  prisma: PrismaClient;
  cache: Cache;
  redis: Redis;
  auth: Auth;
  courrier: Courrier;
};

export function creerApp({ config, prisma, cache, redis, auth, courrier }: Dependances): Hono {
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

  // Connexion et création de compte sont limitées en débit : sans cela, essayer des
  // mots de passe en masse ne coûte rien à l'attaquant.
  //
  // Le seuil laisse de la marge parce que la clé est l'adresse IP : au Sénégal, un
  // cybercafé ou un partage de connexion met plusieurs clients légitimes derrière la
  // même adresse. Vingt essais par minute les gênent peu et n'aident en rien quelqu'un
  // qui doit en tenter des milliers.
  app.on(
    ["POST"],
    [
      "/api/auth/sign-in/*",
      "/api/auth/sign-up/*",
      // Ces deux-là déclenchent un envoi d'e-mail : sans plafond, on pourrait s'en
      // servir pour inonder la boîte de quelqu'un depuis le site.
      "/api/auth/request-password-reset",
      "/api/auth/magic-link/*",
    ],
    limiter(redis, "auth", { max: 20, fenetreSecondes: 60 }),
  );
  app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

  // Session courante, telle que le front doit la voir : identité et rôle, rien de plus.
  app.get("/api/moi", async (c) => {
    const session = await lireSession(auth, prisma, c);
    if (!session) return c.json({ utilisateur: null });
    return c.json({
      utilisateur: {
        name: session.name,
        email: session.email,
        isAdmin: session.estAdmin,
      },
    });
  });

  // Sonde du contrôle d'accès, utilisée par les tests et par check-infra.
  app.get("/api/admin/verification", exigerAdmin(auth, prisma), (c) => c.json({ ok: true }));

  app.route("/api", routesCatalogue(prisma, cache));
  app.route("/api", routesContenu(prisma, cache));
  app.route("/api", routesCommandes(prisma, cache, auth, courrier, config));

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

    // Permet d'éprouver la limitation de débit en conditions réelles avant qu'elle ne
    // protège la connexion (lot 10) et le suivi de commande (lot 14).
    app.get("/api/_diag/limite", limiter(redis, "diag", { max: 3, fenetreSecondes: 10 }), (c) =>
      c.json({ ok: true }),
    );
  }

  return app;
}
