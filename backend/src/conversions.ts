import type { PaymentMethod, Order, OrderStatus } from "../../src/data/types.js";

/**
 * Conversion des commandes vers le contrat exposé au front.
 *
 * La base range les champs à plat (customerName, deliveryFee) parce que c'est plus
 * simple à interroger et à indexer ; le front les attend groupés sous `customer` et
 * `delivery`. Sans cette traduction, l'interface lit `customer.name` sur un objet qui
 * n'a pas de `customer` et s'arrête net.
 *
 * Une seule implémentation partagée : elle existait en double dans le suivi et la
 * création de commande, et manquait dans l'administration — ce qui a suffi à rendre
 * l'onglet Commandes inutilisable dès qu'une commande existait.
 */
export type CommandeEnBase = {
  id: string;
  number: string;
  createdAt: Date;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  regionId: string | null;
  regionName: string;
  areaName: string;
  address: string;
  deliveryFee: number;
  note: string | null;
  subtotal: number;
  discount: number;
  promoCode: string | null;
  total: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paid: boolean;
  userId?: string | null;
  internalNote?: string | null;
  items: {
    productId: string | null;
    name: string;
    price: number;
    quantity: number;
    image: string;
  }[];
};

export function versCommande(
  c: CommandeEnBase,
  options: { avecNoteInterne?: boolean } = {},
): Order {
  return {
    id: c.id,
    number: c.number,
    createdAt: c.createdAt.toISOString(),
    customer: {
      name: c.customerName,
      phone: c.customerPhone,
      email: c.customerEmail ?? undefined,
    },
    delivery: {
      regionId: c.regionId ?? "",
      regionName: c.regionName,
      areaName: c.areaName,
      address: c.address,
      fee: c.deliveryFee,
      note: c.note ?? undefined,
    },
    items: c.items.map((l) => ({
      productId: l.productId ?? "",
      name: l.name,
      price: l.price,
      quantity: l.quantity,
      image: l.image,
    })),
    subtotal: c.subtotal,
    discount: c.discount,
    promoCode: c.promoCode ?? undefined,
    total: c.total,
    status: c.status,
    paymentMethod: c.paymentMethod,
    paid: c.paid,
    userEmail: c.customerEmail ?? undefined,
    // La note de gestion n'accompagne la commande que vers le back-office : c'est une
    // information d'équipe, jamais destinée au client.
    ...(options.avecNoteInterne && c.internalNote ? { internalNote: c.internalNote } : {}),
  };
}
