import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Order } from "../../../src/data/types.js";
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
      if (!estLaSienne) {
        if (!telephone || !memeTelephone(telephone, commande.customerPhone)) throw refus();
      }

      const suivi: Order = {
        id: commande.id,
        number: commande.number,
        createdAt: commande.createdAt.toISOString(),
        customer: {
          name: commande.customerName,
          phone: commande.customerPhone,
          email: commande.customerEmail ?? undefined,
        },
        delivery: {
          regionId: commande.regionId ?? "",
          regionName: commande.regionName,
          areaName: commande.areaName,
          address: commande.address,
          fee: commande.deliveryFee,
          note: commande.note ?? undefined,
        },
        items: commande.items.map((l) => ({
          productId: l.productId ?? "",
          name: l.name,
          price: l.price,
          quantity: l.quantity,
          image: l.image,
        })),
        subtotal: commande.subtotal,
        discount: commande.discount,
        promoCode: commande.promoCode ?? undefined,
        total: commande.total,
        status: commande.status,
        paid: commande.paid,
        // internalNote reste côté équipe : c'est une note de gestion, pas une
        // information destinée au client.
      };

      // Jamais mis en cache : la réponse porte des données personnelles et doit
      // refléter le statut réel, y compris juste après une mise à jour par l'équipe.
      c.header("Cache-Control", "no-store");
      return c.json(suivi);
    },
  );

  return routes;
}
