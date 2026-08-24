import type { Order, OrderItem } from "../../src/data/types.js";
import { ErreurApi } from "./erreurs.js";
import type { PrismaClient } from "./generated/prisma/client.js";

export type LigneDemandee = { productId: string; quantity: number };

export type DemandeCommande = {
  customer: { name: string; phone: string; email?: string | undefined };
  delivery: { areaId: string; address: string; note?: string | undefined };
  items: LigneDemandee[];
  promoCode?: string | undefined;
  /** Identifiant de l'utilisateur connecté, `null` pour une commande en invité. */
  userId: string | null;
};

/**
 * Calcule la remise d'un code promotionnel.
 *
 * Extrait à part pour être vérifiable sans base de données : ce sont les arrondis sur
 * l'argent, et il vaut mieux les éprouver directement.
 */
export function calculerRemise(
  type: "percent" | "amount",
  valeur: number,
  sousTotal: number,
): number {
  // Le franc CFA n'a pas de sous-unité : un pourcentage doit produire un entier, et on
  // arrondit à l'unité comme le faisait déjà la maquette.
  const brute = type === "percent" ? Math.round((sousTotal * valeur) / 100) : valeur;
  // Une remise ne peut jamais dépasser ce qui est dû, sinon le total deviendrait négatif.
  return Math.min(brute, sousTotal);
}

/** Frais de livraison, une fois la franchise appliquée. */
export function calculerLivraison(fraisZone: number, sousTotal: number, franchise: number): number {
  return sousTotal >= franchise ? 0 : fraisZone;
}

function numeroDepuisCompteur(compteur: number, date = new Date()): string {
  const annee = String(date.getFullYear()).slice(2);
  const mois = String(date.getMonth() + 1).padStart(2, "0");
  return `DR-${annee}${mois}-${String(compteur).padStart(4, "0")}`;
}

export function periodeCourante(date = new Date()): string {
  return `${String(date.getFullYear()).slice(2)}${String(date.getMonth() + 1).padStart(2, "0")}`;
}

type ClientPrisma = PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/**
 * Vérifie un code promotionnel et calcule sa remise, sans le consommer.
 *
 * Partagé entre la prévisualisation (le client saisit son code et voit le montant) et
 * la création de commande. Une seule implémentation : deux copies finiraient par
 * diverger, et l'écart se verrait sur un total affiché différent du total facturé.
 */
export async function validerPromo(
  tx: ClientPrisma,
  code: string,
  sousTotal: number,
  userId: string | null,
): Promise<{ code: string; promoId: string; discount: number }> {
  if (!userId) {
    throw new ErreurApi("INTERDIT", "Les codes promo sont réservés aux clients connectés.");
  }

  const promo = await tx.promoCode.findUnique({
    where: { code: code.trim().toUpperCase() },
    include: { _count: { select: { redemptions: true } } },
  });
  const maintenant = new Date();

  if (!promo) throw new ErreurApi("VALIDATION", "Ce code promo n'existe pas.");
  if (!promo.active) throw new ErreurApi("VALIDATION", "Ce code promo n'est plus actif.");
  if (maintenant < promo.startsAt) {
    throw new ErreurApi("VALIDATION", "Ce code n'est pas encore valable.");
  }
  if (maintenant > promo.endsAt) throw new ErreurApi("VALIDATION", "Ce code a expiré.");
  if (promo._count.redemptions >= promo.maxUses) {
    throw new ErreurApi("VALIDATION", "Ce code a atteint sa limite d'utilisation.");
  }
  if (sousTotal < promo.minAmount) {
    throw new ErreurApi(
      "VALIDATION",
      `Ce code s'applique à partir de ${promo.minAmount.toLocaleString("fr-FR")} FCFA d'achat.`,
    );
  }

  return {
    code: promo.code,
    promoId: promo.id,
    discount: calculerRemise(promo.type, promo.value, sousTotal),
  };
}

/**
 * Crée une commande.
 *
 * Tout se joue dans une seule transaction : sans cela, un échec en cours de route
 * laisserait par exemple le stock décrémenté sans commande en face.
 *
 * Aucun montant n'est accepté du client. Il envoie des identifiants et des quantités ;
 * les prix, les frais et le total sont relus et recalculés ici. C'est la règle qui
 * empêche de commander au prix qu'on choisit soi-même.
 */
export async function creerCommande(
  prisma: PrismaClient,
  demande: DemandeCommande,
): Promise<Order> {
  if (demande.items.length === 0) {
    throw new ErreurApi("VALIDATION", "Votre panier est vide.");
  }

  return prisma.$transaction(async (tx) => {
    const contenu = await tx.siteContent.findUnique({ where: { id: 1 } });
    if (!contenu) {
      throw new ErreurApi("ERREUR_INTERNE", "Contenu du site absent : exécuter `npm run db:seed`.");
    }

    const zone = await tx.deliveryArea.findUnique({
      where: { id: demande.delivery.areaId },
      include: { region: true },
    });
    if (!zone) throw new ErreurApi("VALIDATION", "Zone de livraison inconnue.");

    // Verrouillage des lignes produit avant toute lecture de stock. Sans ce verrou,
    // deux commandes simultanées sur le dernier article liraient toutes deux « 1 en
    // stock » et passeraient toutes les deux.
    const ids = demande.items.map((l) => l.productId);
    await tx.$queryRaw`SELECT id FROM products WHERE id = ANY(${ids}::text[]) FOR UPDATE`;

    const produits = await tx.product.findMany({
      where: { id: { in: ids } },
      include: { images: { orderBy: { position: "asc" }, take: 1 } },
    });

    const lignes: OrderItem[] = [];
    for (const demandee of demande.items) {
      if (demandee.quantity <= 0) {
        throw new ErreurApi("VALIDATION", "Quantité invalide.");
      }
      const produit = produits.find((p) => p.id === demandee.productId);
      if (!produit) throw new ErreurApi("VALIDATION", "Un article de votre panier n'existe plus.");
      if (produit.stock < demandee.quantity) {
        throw new ErreurApi(
          "CONFLIT",
          produit.stock === 0
            ? `« ${produit.name} » est épuisé.`
            : `Il ne reste que ${produit.stock} « ${produit.name} » en stock.`,
        );
      }
      // Nom, prix et image sont recopiés : la commande doit rester lisible même si le
      // produit change de prix ou disparaît ensuite.
      lignes.push({
        productId: produit.id,
        name: produit.name,
        price: produit.price,
        quantity: demandee.quantity,
        image: produit.images[0]?.url ?? "",
      });
    }

    const subtotal = lignes.reduce((somme, l) => somme + l.price * l.quantity, 0);

    let discount = 0;
    let codePromo: string | undefined;
    let promoId: string | undefined;
    if (demande.promoCode) {
      const valide = await validerPromo(tx, demande.promoCode, subtotal, demande.userId);
      discount = valide.discount;
      codePromo = valide.code;
      promoId = valide.promoId;
    }

    const deliveryFee = calculerLivraison(zone.fee, subtotal, contenu.freeShippingFrom);
    const total = subtotal - discount + deliveryFee;

    // Compteur mensuel incrémenté dans la transaction : deux commandes simultanées
    // obtiennent deux numéros différents.
    const periode = periodeCourante();
    const compteurs = await tx.$queryRaw<{ counter: number }[]>`
      INSERT INTO order_number_counters (period, counter) VALUES (${periode}, 1)
      ON CONFLICT (period) DO UPDATE SET counter = order_number_counters.counter + 1
      RETURNING counter`;
    const counter = compteurs[0]?.counter;
    if (counter === undefined) {
      throw new ErreurApi("ERREUR_INTERNE", "Impossible d'attribuer un numéro de commande.");
    }

    const commande = await tx.order.create({
      data: {
        number: numeroDepuisCompteur(Number(counter)),
        customerName: demande.customer.name,
        customerPhone: demande.customer.phone,
        customerEmail: demande.customer.email ?? null,
        regionId: zone.regionId,
        regionName: zone.region.name,
        areaName: zone.name,
        address: demande.delivery.address,
        deliveryFee,
        note: demande.delivery.note ?? null,
        subtotal,
        discount,
        promoCode: codePromo ?? null,
        total,
        status: "en_attente",
        paid: false,
        userId: demande.userId,
        items: { create: lignes },
      },
      include: { items: true },
    });

    // Stock : une écriture par article, doublée d'un mouvement dans le journal. La
    // contrainte `stock >= 0` en base sert de dernier filet si un verrou était oublié.
    for (const ligne of lignes) {
      await tx.product.update({
        where: { id: ligne.productId! },
        data: { stock: { decrement: ligne.quantity } },
      });
      await tx.stockMovement.create({
        data: {
          productId: ligne.productId!,
          orderId: commande.id,
          delta: -ligne.quantity,
          reason: "commande",
        },
      });
    }

    if (promoId) {
      await tx.promoRedemption.create({
        data: { promoCodeId: promoId, orderId: commande.id, userId: demande.userId },
      });
    }

    return {
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
      items: lignes,
      subtotal: commande.subtotal,
      discount: commande.discount,
      promoCode: commande.promoCode ?? undefined,
      total: commande.total,
      status: commande.status,
      paid: commande.paid,
      userEmail: demande.customer.email ?? undefined,
    } satisfies Order;
  });
}
