import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedCategories, seedProducts } from "../../src/data/seed.js";
import { creerClient } from "../src/db.js";
import { lireConfigStockage, urlPublique } from "../src/storage.js";
import { semer } from "../prisma/seed.js";
import type { PrismaClient } from "../src/generated/prisma/client.js";

let prisma: PrismaClient;
const url = process.env["TEST_DATABASE_URL"]!;

beforeAll(async () => {
  prisma = creerClient(url);
  // Table rase avant de semer : les autres fichiers de test laissent la base vide,
  // mais l'ordre d'exécution n'est pas garanti.
  await prisma.productImage.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.deliveryArea.deleteMany();
  await prisma.deliveryRegion.deleteMany();
  await prisma.promoCode.deleteMany();
  await prisma.siteContent.deleteMany();
  await semer(url);
}, 120_000);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("contenu semé", () => {
  it("importe le catalogue de démonstration au complet", async () => {
    expect(await prisma.category.count()).toBe(seedCategories.length);
    expect(await prisma.product.count()).toBe(seedProducts.length);
    expect(await prisma.deliveryRegion.count()).toBe(5);
    expect(await prisma.deliveryArea.count()).toBe(16);
    expect(await prisma.promoCode.count()).toBe(2);
    expect(await prisma.siteContent.count()).toBe(1);
  });

  it("conserve prix, stock et catégorie de chaque produit", async () => {
    for (const attendu of seedProducts) {
      const produit = await prisma.product.findUnique({
        where: { slug: attendu.slug },
        include: { category: true },
      });
      expect(produit, `produit ${attendu.slug} absent`).not.toBeNull();
      expect(produit!.price).toBe(attendu.price);
      expect(produit!.stock).toBe(attendu.stock);
      expect(produit!.featured).toBe(attendu.featured);
    }
  });

  it("donne à chaque produit au moins une image, numérotée à partir de zéro", async () => {
    const produits = await prisma.product.findMany({
      include: { images: { orderBy: { position: "asc" } } },
    });
    for (const p of produits) {
      expect(p.images.length, `aucune image pour ${p.slug}`).toBeGreaterThan(0);
      // Positions contiguës : c'est ce qui rend l'ordre d'affichage prévisible et le
      // réordonnancement fiable.
      expect(p.images.map((i) => i.position)).toEqual(p.images.map((_, i) => i));
      expect(p.images[0]!.url).toMatch(/^\/media\//);
    }
  });

  it("ne duplique rien lorsqu'on le rejoue", async () => {
    const avant = {
      categories: await prisma.category.count(),
      produits: await prisma.product.count(),
      images: await prisma.productImage.count(),
      zones: await prisma.deliveryArea.count(),
    };

    await semer(url);

    expect({
      categories: await prisma.category.count(),
      produits: await prisma.product.count(),
      images: await prisma.productImage.count(),
      zones: await prisma.deliveryArea.count(),
    }).toEqual(avant);
  }, 120_000);
});

describe("images téléversées", () => {
  it("rend chaque image réellement téléchargeable", async () => {
    const config = lireConfigStockage();
    const images = await prisma.productImage.findMany();
    expect(images.length).toBeGreaterThan(0);

    // Un chemin en base ne prouve rien : on vérifie que l'objet répond vraiment, avec
    // un type d'image, et non une page d'erreur XML de MinIO.
    for (const image of images) {
      const reponse = await fetch(urlPublique(config, image.url));
      expect(reponse.status, `${image.url} injoignable`).toBe(200);
      expect(reponse.headers.get("content-type")).toMatch(/^image\//);
    }
  }, 60_000);
});
