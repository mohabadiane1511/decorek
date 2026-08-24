import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { magicLink } from "better-auth/plugins";
import type { Redis } from "ioredis";
import type { Config } from "./config.js";
import type { PrismaClient } from "./generated/prisma/client.js";
import { rendre, type Courrier } from "./mail.js";

/**
 * Authentification réelle, en remplacement du simulacre de la maquette où toute adresse
 * commençant par « admin » ouvrait le back-office.
 *
 * Les sessions vivent à la fois en base et dans Redis : Redis répond en mémoire à chaque
 * requête et applique l'expiration nativement, la base garde la trace et permet à une
 * session de survivre à un vidage du cache.
 */
export function creerAuth(prisma: PrismaClient, redis: Redis, config: Config, courrier: Courrier) {
  return betterAuth({
    secret: config.AUTH_SECRET,
    baseURL: config.AUTH_URL,
    basePath: "/api/auth",
    database: prismaAdapter(prisma, { provider: "postgresql" }),

    emailAndPassword: {
      enabled: true,
      // L'adresse doit être confirmée avant la première connexion. Deux raisons :
      // elle empêche d'ouvrir un compte au nom de quelqu'un d'autre, et elle garantit
      // que la confirmation de commande arrivera bien — ce qui compte d'autant plus
      // ici que le paiement se fait à la livraison, sur la foi de coordonnées saisies.
      // La commande en invité reste possible : personne n'est bloqué pour acheter.
      requireEmailVerification: true,
      minPasswordLength: 8,
      sendResetPassword: async ({ user, url }) => {
        const { texte, html } = rendre({
          surtitre: "Sécurité du compte",
          titre: "Réinitialisez votre mot de passe",
          intro:
            "Vous avez demandé à changer le mot de passe de votre compte Deco'Rek. Ce lien est valable une heure et ne fonctionne qu'une seule fois.",
          lien: { url, libelle: "Choisir un nouveau mot de passe" },
          conclusion:
            "Si vous n'avez rien demandé, votre mot de passe actuel reste valable : il n'y a rien à faire.",
        });
        await courrier.envoyer({
          a: user.email,
          sujet: "Réinitialiser votre mot de passe Deco'Rek",
          texte,
          html,
        });
      },
    },

    emailVerification: {
      // Le lien part dès l'inscription, sans que le client ait à le demander.
      sendOnSignUp: true,
      // Une fois l'adresse confirmée, la session s'ouvre : lui redemander son mot de
      // passe juste après avoir cliqué n'apporterait rien.
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60 * 24, // 24 heures
      sendVerificationEmail: async ({ user, url }) => {
        // Sans destination explicite, la confirmation renvoie sur l'accueil : le
        // client ne voit alors nulle part que son compte est actif.
        const lien = new URL(url);
        lien.searchParams.set("callbackURL", "/compte");

        const { texte, html } = rendre({
          surtitre: "Bienvenue",
          titre: "Confirmez votre adresse",
          intro: `Bonjour ${user.name}, il ne reste qu'une étape pour activer votre compte Deco'Rek. Ce lien est valable 24 heures.`,
          lien: { url: lien.toString(), libelle: "Confirmer mon adresse" },
          conclusion:
            "Si vous n'avez pas créé de compte chez nous, ignorez cet e-mail : rien ne sera activé sans ce clic.",
        });
        await courrier.envoyer({
          a: user.email,
          sujet: "Confirmez votre adresse Deco'Rek",
          texte,
          html,
        });
      },
    },

    plugins: [
      // Connexion sans mot de passe : utile pour une clientèle qui commande rarement et
      // oublie ses identifiants entre deux achats.
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          const { texte, html } = rendre({
            surtitre: "Connexion",
            titre: "Votre lien de connexion",
            intro:
              "Accédez à votre espace Deco'Rek sans mot de passe. Ce lien est valable quelques minutes et ne fonctionne qu'une seule fois.",
            lien: { url, libelle: "Me connecter" },
            conclusion:
              "Ne transmettez ce lien à personne : il ouvre votre compte sans autre vérification.",
          });
          await courrier.envoyer({
            a: email,
            sujet: "Votre lien de connexion Deco'Rek",
            texte,
            html,
          });
        },
      }),
    ],

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
