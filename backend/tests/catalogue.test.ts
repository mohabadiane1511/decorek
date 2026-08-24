import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Hono } from "hono";
import type { Product } from "../../src/data/types.js";
import { creerContexte, type ContexteTest } from "./contexte.js";
import { semer } from "../prisma/seed.js";
import type { PrismaClient } from "../src/generated/prisma/client.js";

let contexte: ContexteTest;
let app: Hono;
let prisma: PrismaClient;
const url = process.env["TEST_DATABASE_URL"]!;

type Liste = { items: Product[]; total: number; page: number; pages: number };

async function lister(requete: string): Promise<Liste> {
  const reponse = await app.request(`/api/produits${requete}`);
  expect(reponse.status, requete).toBe(200);
  return (await reponse.json()) as Liste;
}

beforeAll(async () => {
  contexte = creerContexte();
  ({ app, prisma } = contexte);
  await prisma.productImage.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await semer(url);
}, 120_000);

afterAll(async () => {
  await contexte.fermer();
});

describe("liste des produits", () => {
  it("renvoie la première page et le décompte total", async () => {
    const liste = await lister("");
    expect(liste.total).toBe(8);
    expect(liste.items).toHaveLength(8);
    expect(liste.page).toBe(1);
    expect(liste.pages).toBe(1);
  });

  it("expose chaque produit au format attendu par le front", async () => {
    const { items } = await lister("?parPage=1");
    const produit = items[0]!;

    // Les images viennent d'une table séparée : le front doit recevoir un simple
    // tableau d'URLs, la première servant de couverture.
    expect(Array.isArray(produit.images)).toBe(true);
    expect(produit.images[0]).toMatch(/^\/media\//);
    // createdAt est une date en base, une chaîne ISO dans le contrat.
    expect(typeof produit.createdAt).toBe("string");
    expect(Number.isInteger(produit.price)).toBe(true);
  });
});

describe("filtres", () => {
  it("filtre par catégorie", async () => {
    const liste = await lister("?categorie=art-de-la-table");
    expect(liste.items.length).toBeGreaterThan(0);

    const categorie = await prisma.category.findUniqueOrThrow({
      where: { slug: "art-de-la-table" },
    });
    expect(liste.items.every((p) => p.categoryId === categorie.id)).toBe(true);
    expect(liste.total).toBe(liste.items.length);
  });

  it("renvoie une liste vide pour une catégorie inconnue, sans erreur", async () => {
    const liste = await lister("?categorie=nexiste-pas");
    expect(liste.items).toEqual([]);
    expect(liste.total).toBe(0);
    // Une page vide reste une page : le front ne doit pas afficher « page 1 sur 0 ».
    expect(liste.pages).toBe(1);
  });

  it("filtre par prix maximum", async () => {
    const liste = await lister("?prixMax=10000");
    expect(liste.items.length).toBeGreaterThan(0);
    expect(liste.items.every((p) => p.price <= 10000)).toBe(true);
  });

  it("recherche dans le nom sans tenir compte de la casse", async () => {
    const minuscules = await lister("?q=chaise");
    const majuscules = await lister("?q=CHAISE");
    expect(minuscules.total).toBeGreaterThan(0);
    expect(majuscules.total).toBe(minuscules.total);
  });

  it("combine les filtres", async () => {
    const liste = await lister("?categorie=art-de-la-table&prixMax=10000");
    expect(liste.items.every((p) => p.price <= 10000)).toBe(true);
  });
});

describe("tri", () => {
  it("trie par prix croissant", async () => {
    const { items } = await lister("?tri=prix-asc");
    const prix = items.map((p) => p.price);
    expect(prix).toEqual([...prix].sort((a, b) => a - b));
  });

  it("trie par prix décroissant", async () => {
    const { items } = await lister("?tri=prix-desc");
    const prix = items.map((p) => p.price);
    expect(prix).toEqual([...prix].sort((a, b) => b - a));
  });

  it("classe les nouveautés en premier par défaut", async () => {
    const { items } = await lister("");
    const dates = items.map((p) => p.createdAt);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it("refuse un tri inconnu", async () => {
    const reponse = await app.request("/api/produits?tri=nimporte-quoi");
    expect(reponse.status).toBe(400);
    const corps = (await reponse.json()) as { error: { code: string } };
    expect(corps.error.code).toBe("VALIDATION");
  });
});

describe("pagination", () => {
  it("découpe le catalogue en pages", async () => {
    const p1 = await lister("?parPage=3&page=1");
    const p2 = await lister("?parPage=3&page=2");

    expect(p1.items).toHaveLength(3);
    expect(p1.pages).toBe(3); // 8 produits, 3 par page
    expect(p1.total).toBe(8);

    // Aucun produit ne doit apparaître sur deux pages.
    const ids = new Set([...p1.items, ...p2.items].map((p) => p.id));
    expect(ids.size).toBe(p1.items.length + p2.items.length);
  });

  it("renvoie une page vide au-delà de la dernière", async () => {
    const liste = await lister("?parPage=3&page=99");
    expect(liste.items).toEqual([]);
    expect(liste.total).toBe(8);
  });

  it("plafonne la taille de page demandée", async () => {
    // Sans plafond, un client pourrait réclamer le catalogue entier en une requête.
    const reponse = await app.request("/api/produits?parPage=10000");
    expect(reponse.status).toBe(400);
  });

  it("refuse une page nulle ou négative", async () => {
    expect((await app.request("/api/produits?page=0")).status).toBe(400);
    expect((await app.request("/api/produits?page=-1")).status).toBe(400);
  });
});

describe("fiche produit", () => {
  it("renvoie un produit par son slug", async () => {
    const reponse = await app.request("/api/produits/sous-assiette-solaire-doree");
    expect(reponse.status).toBe(200);

    const produit = (await reponse.json()) as Product;
    expect(produit.slug).toBe("sous-assiette-solaire-doree");
    expect(produit.images.length).toBeGreaterThan(0);
  });

  it("renvoie 404 au format d'erreur habituel pour un slug inconnu", async () => {
    const reponse = await app.request("/api/produits/slug-inconnu");
    expect(reponse.status).toBe(404);
    const corps = (await reponse.json()) as { error: { code: string } };
    expect(corps.error.code).toBe("INTROUVABLE");
  });
});

describe("catégories", () => {
  it("renvoie les cinq catégories", async () => {
    const reponse = await app.request("/api/categories");
    expect(reponse.status).toBe(200);

    const { items } = (await reponse.json()) as { items: { slug: string; name: string }[] };
    expect(items).toHaveLength(5);
    expect(items.map((c) => c.slug)).toContain("art-de-la-table");
  });
});
