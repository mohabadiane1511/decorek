import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Auth } from "../auth.js";
import { lireSession } from "../auth-middleware.js";
import type { Cache } from "../cache.js";
import { creerCommande, validerPromo } from "../commandes.js";
import { corpsErreur } from "../erreurs.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { Config } from "../config.js";
import type { Courrier } from "../mail.js";
import { envoyerAlerteAdministration, envoyerConfirmationClient } from "../mail-commande.js";

/**
 * Ce que le client a le droit d'envoyer : des identifiants et des quantités.
 *
 * Aucun montant n'y figure — ni prix, ni frais, ni total. Les accepter, même pour les
 * « vérifier », ouvrirait la porte à une commande au prix choisi par l'acheteur.
 */
const schemaCommande = z.object({
  customer: z.object({
    name: z.string().trim().min(2, "Nom trop court").max(120),
    phone: z.string().trim().min(6, "Téléphone invalide").max(30),
    email: z.string().trim().email("Adresse e-mail invalide").optional(),
  }),
  delivery: z.object({
    areaId: z.string().min(1, "Zone de livraison requise"),
    address: z.string().trim().min(5, "Adresse trop courte").max(300),
    note: z.string().trim().max(500).optional(),
  }),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        // Plafond par ligne : au-delà, c'est une commande professionnelle qui mérite
        // un échange de vive voix, pas un formulaire.
        quantity: z.coerce.number().int().min(1).max(99),
      }),
    )
    .min(1, "Votre panier est vide")
    .max(50),
  promoCode: z.string().trim().max(40).optional(),
});

const schemaVerificationPromo = z.object({
  code: z.string().trim().min(1).max(40),
  items: z
    .array(
      z.object({ productId: z.string().min(1), quantity: z.coerce.number().int().min(1).max(99) }),
    )
    .min(1)
    .max(50),
});

export function routesCommandes(
  prisma: PrismaClient,
  cache: Cache,
  auth: Auth,
  courrier: Courrier,
  config: Config,
): Hono {
  const routes = new Hono();

  // Prévisualise la remise pour l'afficher avant validation, sans consommer le code.
  // Le sous-total est recalculé ici aussi : afficher une remise assise sur un montant
  // fourni par le client donnerait un aperçu différent du prix réellement facturé.
  routes.post(
    "/promos/verifier",
    zValidator("json", schemaVerificationPromo, (resultat, c) => {
      if (!resultat.success) {
        return c.json(corpsErreur("VALIDATION", "Requête invalide.", resultat.error.issues), 400);
      }
      return undefined;
    }),
    async (c) => {
      const { code, items } = c.req.valid("json");
      const session = await lireSession(auth, prisma, c);

      const produits = await prisma.product.findMany({
        where: { id: { in: items.map((l) => l.productId) } },
        select: { id: true, price: true },
      });
      const sousTotal = items.reduce((somme, ligne) => {
        const produit = produits.find((p) => p.id === ligne.productId);
        return somme + (produit ? produit.price * ligne.quantity : 0);
      }, 0);

      const valide = await validerPromo(prisma, code, sousTotal, session?.userId ?? null);
      return c.json({ code: valide.code, discount: valide.discount, subtotal: sousTotal });
    },
  );

  routes.post(
    "/commandes",
    zValidator("json", schemaCommande, (resultat, c) => {
      if (!resultat.success) {
        return c.json(corpsErreur("VALIDATION", "Commande invalide.", resultat.error.issues), 400);
      }
      return undefined;
    }),
    async (c) => {
      const demande = c.req.valid("json");
      // La commande en invité reste possible : c'est le compte qui est facultatif,
      // pas la commande.
      const session = await lireSession(auth, prisma, c);

      const commande = await creerCommande(prisma, {
        customer: demande.customer,
        delivery: demande.delivery,
        items: demande.items,
        promoCode: demande.promoCode,
        userId: session?.userId ?? null,
      });

      // Les stocks affichés ont changé : le catalogue en cache est périmé.
      await cache.invaliderCatalogue();

      // Les e-mails partent après l'enregistrement, sans bloquer la réponse : une
      // messagerie lente ne doit pas faire patienter le client devant son écran, ni
      // faire échouer une commande déjà validée.
      const contenu = await prisma.siteContent.findUnique({ where: { id: 1 } });
      void Promise.all([
        envoyerConfirmationClient(courrier, config, commande),
        // L'adresse vient de la configuration du site, jamais de la requête : sinon
        // n'importe qui se ferait adresser les coordonnées d'un acheteur.
        contenu?.email
          ? envoyerAlerteAdministration(courrier, config, commande, contenu.email)
          : Promise.resolve(),
      ]).catch((erreur) => console.error("Envoi des e-mails de commande impossible", erreur));

      return c.json(commande, 201);
    },
  );

  return routes;
}
