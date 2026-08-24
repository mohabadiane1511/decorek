import type { Context, MiddlewareHandler } from "hono";
import type { Auth } from "./auth.js";
import { ErreurApi } from "./erreurs.js";
import type { PrismaClient } from "./generated/prisma/client.js";

export type Session = {
  userId: string;
  email: string;
  name: string;
  estAdmin: boolean;
};

/**
 * Lit la session depuis le cookie et y ajoute les rôles.
 *
 * Le rôle est relu en base à chaque requête, jamais porté par le cookie : un cookie
 * transporte ce que le client veut bien renvoyer, et un rôle qu'on retire à quelqu'un
 * doit prendre effet immédiatement, sans attendre l'expiration de sa session.
 */
export async function lireSession(
  auth: Auth,
  prisma: PrismaClient,
  c: Context,
): Promise<Session | null> {
  const resultat = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!resultat?.user) return null;

  const roles = await prisma.userRole.findMany({
    where: { userId: resultat.user.id },
    select: { role: true },
  });

  return {
    userId: resultat.user.id,
    email: resultat.user.email,
    name: resultat.user.name,
    estAdmin: roles.some((r) => r.role === "admin"),
  };
}

/** Exige une session valide. */
export function exigerConnexion(auth: Auth, prisma: PrismaClient): MiddlewareHandler {
  return async (c, next) => {
    const session = await lireSession(auth, prisma, c);
    if (!session) throw new ErreurApi("NON_AUTHENTIFIE", "Connexion requise.");
    c.set("session", session);
    await next();
  };
}

/**
 * Exige le rôle administrateur, vérifié côté serveur.
 *
 * Remplace le contrôle de la maquette, qui accordait le back-office à toute adresse
 * commençant par « admin » et le faisait dans le navigateur — donc contournable en
 * modifiant simplement l'état local de la page.
 */
export function exigerAdmin(auth: Auth, prisma: PrismaClient): MiddlewareHandler {
  return async (c, next) => {
    const session = await lireSession(auth, prisma, c);
    if (!session) throw new ErreurApi("NON_AUTHENTIFIE", "Connexion requise.");
    if (!session.estAdmin) {
      throw new ErreurApi("INTERDIT", "Accès réservé à l'administration.");
    }
    c.set("session", session);
    await next();
  };
}
