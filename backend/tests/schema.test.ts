import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { creerClient } from "../src/db.js";
import type { PrismaClient } from "../src/generated/prisma/client.js";

let prisma: PrismaClient;

beforeAll(() => {
  prisma = creerClient(process.env["TEST_DATABASE_URL"]!);
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Ordre imposé par les clés étrangères.
  await prisma.stockMovement.deleteMany();
  await prisma.promoRedemption.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.productImage.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.promoCode.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.user.deleteMany();
  await prisma.siteContent.deleteMany();
  await prisma.orderNumberCounter.deleteMany();
});

async function creerCategorie(nom = "Art de la table") {
  return prisma.category.create({
    data: { slug: nom.toLowerCase().replace(/\s+/g, "-"), name: nom, description: "" },
  });
}

async function creerProduit(categoryId: string, extra: Record<string, unknown> = {}) {
  return prisma.product.create({
    data: {
      slug: `produit-${Math.random().toString(36).slice(2, 9)}`,
      name: "Sous-assiette dorée",
      categoryId,
      price: 8500,
      stock: 10,
      description: "",
      ...extra,
    },
  });
}

async function creerCommande(extra: Record<string, unknown> = {}) {
  return prisma.order.create({
    data: {
      number: `DR-2608-${Math.floor(1000 + Math.random() * 9000)}`,
      customerName: "Awa Diop",
      customerPhone: "+221 77 123 45 67",
      regionName: "Dakar",
      areaName: "Almadies",
      address: "Villa 12",
      deliveryFee: 2500,
      subtotal: 8500,
      discount: 0,
      total: 11000,
      ...extra,
    },
  });
}

describe("unicité", () => {
  it("refuse deux produits avec le même slug", async () => {
    const c = await creerCategorie();
    await creerProduit(c.id, { slug: "doublon" });
    await expect(creerProduit(c.id, { slug: "doublon" })).rejects.toThrow();
  });

  it("refuse deux commandes avec le même numéro", async () => {
    await creerCommande({ number: "DR-2608-1042" });
    await expect(creerCommande({ number: "DR-2608-1042" })).rejects.toThrow();
  });

  it("refuse deux codes promo identiques", async () => {
    const promo = {
      code: "BIENVENUE10",
      type: "percent" as const,
      value: 10,
      minAmount: 20000,
      startsAt: new Date("2026-01-01"),
      endsAt: new Date("2026-12-31"),
      maxUses: 200,
    };
    await prisma.promoCode.create({ data: promo });
    await expect(prisma.promoCode.create({ data: promo })).rejects.toThrow();
  });
});

describe("montants et stock", () => {
  it("refuse un stock négatif", async () => {
    const c = await creerCategorie();
    const p = await creerProduit(c.id, { stock: 2 });
    // C'est le filet contre la survente : même une erreur de code ne peut pas
    // vendre un article qui n'existe plus.
    await expect(
      prisma.product.update({ where: { id: p.id }, data: { stock: { decrement: 5 } } }),
    ).rejects.toThrow(/products_stock_jamais_negatif/);
  });

  it("refuse un total incohérent", async () => {
    // 8500 - 0 + 2500 = 11000, et non 500.
    await expect(creerCommande({ total: 500 })).rejects.toThrow(/orders_total_coherent/);
  });

  it("refuse une remise supérieure au sous-total", async () => {
    await expect(
      creerCommande({ subtotal: 8500, discount: 10000, deliveryFee: 2500, total: 1000 }),
    ).rejects.toThrow(/orders_remise_plafonnee/);
  });

  it("accepte une commande dont le total est exact", async () => {
    const o = await creerCommande({
      subtotal: 20000,
      discount: 2000,
      deliveryFee: 2500,
      total: 20500,
    });
    expect(o.total).toBe(20500);
  });

  it("refuse un prix barré inférieur au prix courant", async () => {
    const c = await creerCategorie();
    await expect(creerProduit(c.id, { price: 10000, oldPrice: 8000 })).rejects.toThrow();
  });

  it("refuse une remise en pourcentage au-dessus de 100", async () => {
    await expect(
      prisma.promoCode.create({
        data: {
          code: "TROP",
          type: "percent",
          value: 150,
          minAmount: 0,
          startsAt: new Date("2026-01-01"),
          endsAt: new Date("2026-12-31"),
          maxUses: 10,
        },
      }),
    ).rejects.toThrow();
  });

  it("refuse une fenêtre de validité inversée", async () => {
    await expect(
      prisma.promoCode.create({
        data: {
          code: "INVERSE",
          type: "amount",
          value: 5000,
          minAmount: 0,
          startsAt: new Date("2026-12-31"),
          endsAt: new Date("2026-01-01"),
          maxUses: 10,
        },
      }),
    ).rejects.toThrow();
  });
});

describe("intégrité référentielle", () => {
  it("refuse de supprimer une catégorie qui contient des produits", async () => {
    const c = await creerCategorie();
    await creerProduit(c.id);
    await expect(prisma.category.delete({ where: { id: c.id } })).rejects.toThrow();
  });

  it("conserve une commande passée quand le produit est supprimé", async () => {
    const c = await creerCategorie();
    const p = await creerProduit(c.id);
    const o = await creerCommande();
    await prisma.orderItem.create({
      data: {
        orderId: o.id,
        productId: p.id,
        name: "Sous-assiette dorée",
        price: 8500,
        quantity: 1,
        image: "/media/x.jpg",
      },
    });

    await prisma.product.delete({ where: { id: p.id } });

    const ligne = await prisma.orderItem.findFirst({ where: { orderId: o.id } });
    // La ligne survit, avec son prix et son nom recopiés : c'est tout l'intérêt du
    // snapshot. Seul le lien vers le produit disparaît.
    expect(ligne).not.toBeNull();
    expect(ligne?.productId).toBeNull();
    expect(ligne?.name).toBe("Sous-assiette dorée");
    expect(ligne?.price).toBe(8500);
  });

  it("supprime les images avec leur produit", async () => {
    const c = await creerCategorie();
    const p = await creerProduit(c.id);
    await prisma.productImage.create({
      data: { productId: p.id, url: "/media/a.jpg", position: 0 },
    });

    await prisma.product.delete({ where: { id: p.id } });

    expect(await prisma.productImage.count()).toBe(0);
  });
});

describe("mouvements de stock", () => {
  it("accepte plusieurs mouvements de même motif pour une commande", async () => {
    const c = await creerCategorie();
    const p = await creerProduit(c.id);
    const o = await creerCommande();
    const mouvement = {
      productId: p.id,
      orderId: o.id,
      delta: 3,
      reason: "annulation" as const,
    };

    // Une commande peut être annulée, réactivée, puis annulée à nouveau : deux
    // mouvements d'annulation sont alors légitimes. La protection contre la double
    // restauration ne vient donc pas d'une contrainte d'unicité, qui interdirait ce
    // cycle, mais de la réconciliation calculée depuis la somme du journal — voir
    // src/stock.ts et les tests d'administration.
    await prisma.stockMovement.create({ data: mouvement });
    await expect(prisma.stockMovement.create({ data: mouvement })).resolves.toBeTruthy();

    const total = await prisma.stockMovement.aggregate({
      where: { orderId: o.id },
      _sum: { delta: true },
    });
    expect(total._sum.delta).toBe(6);
  });

  it("refuse un mouvement de stock nul", async () => {
    const c = await creerCategorie();
    const p = await creerProduit(c.id);
    await expect(
      prisma.stockMovement.create({ data: { productId: p.id, delta: 0, reason: "correction" } }),
    ).rejects.toThrow();
  });
});

describe("contenu du site", () => {
  const contenu = {
    bannerTitle: "L'art de recevoir",
    bannerSubtitle: "",
    bannerCta: "Découvrir",
    whatsapp: "221771234567",
    phone: "+221 77 123 45 67",
    email: "contact@decorek.sn",
    address: "Dakar",
    freeShippingFrom: 100000,
    pageContact: "",
    pageLivraison: "",
    pageApropos: "",
    pageCgv: "",
  };

  it("n'accepte qu'une seule ligne", async () => {
    await prisma.siteContent.create({ data: { id: 1, ...contenu } });
    await expect(prisma.siteContent.create({ data: { id: 2, ...contenu } })).rejects.toThrow();
  });
});

describe("numéros de commande", () => {
  it("incrémente le compteur d'une période de façon atomique", async () => {
    // Reproduit l'INSERT ... ON CONFLICT DO UPDATE utilisé à la création d'une commande.
    const increment = () =>
      prisma.$queryRaw<{ counter: number }[]>`
        INSERT INTO order_number_counters (period, counter) VALUES ('2608', 1)
        ON CONFLICT (period) DO UPDATE SET counter = order_number_counters.counter + 1
        RETURNING counter`;

    const resultats = await Promise.all(Array.from({ length: 20 }, increment));
    const valeurs = resultats.map((r) => Number(r[0]!.counter)).sort((a, b) => a - b);

    // Vingt incréments concurrents doivent produire vingt valeurs distinctes de 1 à 20,
    // sans doublon : c'est ce qui garantit l'absence de collision de numéros.
    expect(valeurs).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it("refuse une période mal formée", async () => {
    await expect(
      prisma.orderNumberCounter.create({ data: { period: "26-8", counter: 0 } }),
    ).rejects.toThrow();
  });
});
