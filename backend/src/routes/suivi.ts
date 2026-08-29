import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { versCommande } from "../conversions.js";
import type { Auth } from "../auth.js";
import { lireSession } from "../auth-middleware.js";
import { ErreurApi, corpsErreur } from "../erreurs.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { limiter } from "../limite.js";
import type { Redis } from "ioredis";

/**
 * Suivi d'une commande.
 *
 * Les numéros sont séquentiels — c'est ce qui garantit leur unicité — donc devinables :
 * qui connaît DR-2608-0007 devine DR-2608-0008. Or cette réponse contient le nom, le
 * téléphone et l'adresse du client. Le numéro seul ne peut donc pas suffire.
 *
 * Deux façons d'y accéder :
 * - en invité, il faut le numéro **et** le téléphone de la commande, que seul son
 *   auteur connaît ;
 * - connecté, ses propres commandes s'ouvrent sans autre vérification.
 *
 * La limitation de débit s'ajoute à cela, mais elle ne ferait que ralentir quelqu'un de
 * patient : c'est la seconde information qui ferme réellement l'énumération.
 */

/** Compare deux numéros de téléphone sans s'arrêter à leur mise en forme. */
export function memeTelephone(saisi: string, enregistre: string): boolean {
  const normaliser = (valeur: string) => valeur.replace(/\D/g, "").replace(/^221/, "");
  const a = normaliser(saisi);
  const b = normaliser(enregistre);
  // Un numéro trop court comparé sur ses derniers chiffres laisserait passer trop de
  // faux positifs : on exige une correspondance complète du numéro national.
  return a.length >= 6 && a === b;
}

const schemaSuivi = z.object({
  numero: z.string().trim().min(4).max(30),
  telephone: z.string().trim().max(30).optional(),
});

export function routesSuivi(prisma: PrismaClient, auth: Auth, redis: Redis): Hono {
  const routes = new Hono();

  routes.post(
    "/commandes/suivi",
    limiter(redis, "suivi", { max: 15, fenetreSecondes: 60 }),
    zValidator("json", schemaSuivi, (resultat, c) => {
      if (!resultat.success) {
        return c.json(corpsErreur("VALIDATION", "Requête invalide.", resultat.error.issues), 400);
      }
      return undefined;
    }),
    async (c) => {
      const { numero, telephone } = c.req.valid("json");
      const session = await lireSession(auth, prisma, c);

      const commande = await prisma.order.findUnique({
        where: { number: numero.trim().toUpperCase() },
        include: { items: true },
      });

      // Message identique qu'elle n'existe pas ou que le téléphone ne corresponde pas :
      // distinguer les deux cas dirait quels numéros de commande existent.
      const refus = () =>
        new ErreurApi(
          "INTROUVABLE",
          "Aucune commande ne correspond à ces informations. Vérifiez le numéro et le téléphone utilisés lors de l'achat.",
        );

      if (!commande) throw refus();

      const estLaSienne = session !== null && commande.userId === session.userId;
      const identifiee =
        estLaSienne ||
        (telephone !== undefined && memeTelephone(telephone, commande.customerPhone));

      // Le numéro seul suffit à savoir où en est la commande : c'est ce qu'on vient
      // chercher, et l'exiger avec le téléphone décourageait des clientes pressées.
      //
      // Il ne donne en revanche rien de personnel. Les numéros se suivent : qui connaît
      // le sien devine ceux des autres, et livrer nom, téléphone, adresse et achats à
      // qui sait compter reviendrait à publier le fichier clients. Ce détail n'apparaît
      // qu'en prouvant que la commande est la sienne — par le téléphone ou la session.
      const suivi = identifiee
        ? versCommande(commande)
        : {
            number: commande.number,
            createdAt: commande.createdAt.toISOString(),
            status: commande.status,
          };

      // Jamais mis en cache : la réponse porte des données personnelles et doit
      // refléter le statut réel, y compris juste après une mise à jour par l'équipe.
      c.header("Cache-Control", "no-store");
      return c.json(suivi);
    },
  );

  /**
   * La cliente déclare avoir réglé sa commande.
   *
   * Protégé comme le suivi : le numéro de commande seul ne suffit pas, ils se
   * devinent. Rien n'est marqué payé ici — seul le statut change, pour signaler à
   * l'équipe qu'il y a une preuve à contrôler dans Wave ou Orange Money. Une capture
   * d'écran se falsifie ; la vérification reste humaine.
   */
  routes.post(
    "/commandes/paiement-annonce",
    limiter(redis, "suivi", { max: 15, fenetreSecondes: 60 }),
    zValidator("json", schemaSuivi, (resultat, c) => {
      if (!resultat.success) {
        return c.json(corpsErreur("VALIDATION", "Numéro de commande manquant."), 400);
      }
      return undefined;
    }),
    async (c) => {
      const { numero, telephone } = c.req.valid("json");
      const session = await lireSession(auth, prisma, c);

      const commande = await prisma.order.findUnique({
        where: { number: numero.trim().toUpperCase() },
      });
      const refus = () =>
        new ErreurApi("INTROUVABLE", "Aucune commande ne correspond à ces informations.");
      if (!commande) throw refus();

      const estLaSienne = session !== null && commande.userId === session.userId;
      if (!estLaSienne) {
        if (!telephone || !memeTelephone(telephone, commande.customerPhone)) throw refus();
      }

      // Seule une commande encore en attente bascule : annoncer un paiement ne doit pas
      // faire reculer une commande déjà confirmée, préparée ou livrée par l'équipe.
      if (commande.status === "en_attente") {
        await prisma.order.update({
          where: { id: commande.id },
          data: { status: "paiement_annonce" },
        });
      }

      c.header("Cache-Control", "no-store");
      return c.json({ annonce: true });
    },
  );

  return routes;
}
