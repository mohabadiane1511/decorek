import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import type { Redis } from "ioredis";
import type { Config } from "./config.js";
import type { PrismaClient } from "./generated/prisma/client.js";

/**
 * Authentification réelle, en remplacement du simulacre de la maquette où toute adresse
 * commençant par « admin » ouvrait le back-office.
 *
 * Les sessions vivent à la fois en base et dans Redis : Redis répond en mémoire à chaque
 * requête et applique l'expiration nativement, la base garde la trace et permet à une
 * session de survivre à un vidage du cache.
 */
export function creerAuth(prisma: PrismaClient, redis: Redis, config: Config) {
  return betterAuth({
    secret: config.AUTH_SECRET,
    baseURL: config.AUTH_URL,
    basePath: "/api/auth",
    database: prismaAdapter(prisma, { provider: "postgresql" }),

    emailAndPassword: {
      enabled: true,
      // Laisser entrer sans vérification d'adresse : la boutique accepte déjà les
      // commandes en invité, et exiger un e-mail validé ferait fuir des clients sans
      // rien protéger de sensible. À revoir si le compte donne un jour accès à autre
      // chose que son propre historique.
      requireEmailVerification: false,
      minPasswordLength: 8,
    },

    secondaryStorage: {
      get: async (cle) => redis.get(cle),
      set: async (cle, valeur, ttl) => {
        if (ttl) await redis.set(cle, valeur, "EX", ttl);
        else await redis.set(cle, valeur);
      },
      delete: async (cle) => {
        await redis.del(cle);
      },
      // Lecture et suppression en une seule commande : un jeton à usage unique ne doit
      // pas pouvoir être consommé deux fois par deux requêtes simultanées.
      getAndDelete: async (cle) => redis.getdel(cle),
      increment: async (cle) => redis.incr(cle),
    },

    // Better Auth embarque sa propre limitation de débit, en mémoire du processus et
    // avec des messages en anglais. On lui préfère celle du lot 8 : partagée via Redis,
    // donc valable même à plusieurs instances, en fenêtre glissante, et déjà éprouvée.
    // Deux limiteurs superposés rendraient surtout le diagnostic illisible.
    rateLimit: { enabled: false },

    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 jours
      updateAge: 60 * 60 * 24, // prolongée au plus une fois par jour
      storeSessionInDatabase: true,
    },

    advanced: {
      // Un seul domaine grâce au proxy : le cookie peut donc rester strict, ce qui
      // ferme la porte aux requêtes intersites.
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "strict",
        secure: config.NODE_ENV === "production",
      },
    },
  });
}

export type Auth = ReturnType<typeof creerAuth>;
