import type { OrderStatus } from "../../src/data/types.js";
import type { PrismaClient } from "./generated/prisma/client.js";

type Transaction = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/**
 * Une commande dans l'un de ces états ne retient plus de stock : les articles
 * retournent en rayon.
 */
const STATUTS_SANS_RETENUE: OrderStatus[] = ["annulee", "non_honoree"];

export function retientLeStock(statut: OrderStatus): boolean {
  return !STATUTS_SANS_RETENUE.includes(statut);
}

/**
 * Aligne le stock sur l'état visé par une commande.
 *
 * Plutôt que d'appliquer « annuler = rendre le stock », on calcule ce que le journal
 * devrait totaliser pour cette commande, on le compare à ce qu'il totalise réellement,
 * et on n'écrit que l'écart.
 *
 * Cette façon de faire règle d'un coup trois cas que la maquette traitait mal ou pas :
 * - annuler deux fois de suite ne crédite le stock qu'une fois, puisque le second
 *   passage ne trouve aucun écart à combler ;
 * - réactiver une commande annulée redécrémente bien le stock, ce que la maquette
 *   oubliait — elle rendait les articles sans jamais les reprendre ;
 * - alterner annulation et réactivation autant de fois qu'on veut reste cohérent.
 */
export async function reconcilierStock(
  tx: Transaction,
  orderId: string,
  nouveauStatut: OrderStatus,
): Promise<void> {
  const lignes = await tx.orderItem.findMany({
    where: { orderId, productId: { not: null } },
    select: { productId: true, quantity: true },
  });
  if (lignes.length === 0) return;

  const mouvements = await tx.stockMovement.groupBy({
    by: ["productId"],
    where: { orderId },
    _sum: { delta: true },
  });

  const doitRetenir = retientLeStock(nouveauStatut);

  for (const ligne of lignes) {
    const productId = ligne.productId!;
    // Ce que le journal devrait totaliser : la quantité retenue en négatif si la
    // commande est active, zéro si les articles sont rendus.
    const cible = doitRetenir ? -ligne.quantity : 0;
    const actuel = mouvements.find((m) => m.productId === productId)?._sum.delta ?? 0;
    const ecart = cible - actuel;

    if (ecart === 0) continue;

    await tx.product.update({
      where: { id: productId },
      data: { stock: { increment: ecart } },
    });
    await tx.stockMovement.create({
      data: {
        productId,
        orderId,
        delta: ecart,
        reason: ecart > 0 ? "annulation" : "commande",
      },
    });
  }
}
