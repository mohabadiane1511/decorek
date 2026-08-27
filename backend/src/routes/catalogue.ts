import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Category, Product } from "../../../src/data/types.js";
import type { Cache } from "../cache.js";
import { ErreurApi, corpsErreur } from "../erreurs.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { chargerContenu, chargerLivraison } from "./contenu.js";

// Produit tel qu'il sort de la base, images comprises.
type ProduitEnBase = {
  id: string;
  slug: string;
  sku: string | null;
  name: string;
  categoryId: string;
  price: number;
  oldPrice: number | null;
  stock: number;
  lowStockThreshold: number;
  description: string;
  featured: boolean;
  createdAt: Date;
  images: { url: string }[];
};

/**
 * Convertit la représentation en base vers le contrat exposé au front.
 *
 * Les images vivent dans leur propre table, ordonnées par position ; le front attend un
 * simple tableau d'URLs dont la première sert de couverture. C'est précisément le rôle
 * de cette couche : la structure de la base ne dicte pas l'interface.
 */
export function versProduit(p: ProduitEnBase): Product {
  return {
    id: p.id,
    slug: p.slug,
    sku: p.sku ?? undefined,
    name: p.name,
    categoryId: p.categoryId,
    price: p.price,
    oldPrice: p.oldPrice ?? undefined,
    stock: p.stock,
    lowStockThreshold: p.lowStockThreshold,
    description: p.description,
    images: p.images.map((i) => i.url),
    featured: p.featured,
    createdAt: p.createdAt.toISOString(),
  };
}

/**
 * Première page du catalogue, sans filtre.
 *
 * Reprend la clé de cache de la route publique : les deux chemins partagent donc la
 * même entrée, et une invalidation les périme ensemble.
 */
export async function chargerPageCatalogue(
  prisma: PrismaClient,
  cache: Cache,
  parPage: number,
): Promise<{ items: Product[]; total: number; page: number; pages: number }> {
  return cache.lireOuCharger(`produits:::recent:1:${parPage}`, TTL_CATALOGUE, async () => {
    const [total, produits] = await prisma.$transaction([
      prisma.product.count(),
      prisma.product.findMany({
        orderBy: { createdAt: "desc" },
        include: inclureImages,
        take: parPage,
      }),
    ]);
    return {
      items: produits.map(versProduit),
      total,
      page: 1,
      pages: Math.max(1, Math.ceil(total / parPage)),
    };
  });
}

/** Catégories du catalogue, partagées par leur route et par l'amorçage d'une page. */
export async function chargerCategories(prisma: PrismaClient, cache: Cache): Promise<Category[]> {
  return cache.lireOuCharger<Category[]>("categories", TTL_CATALOGUE, async () => {
    const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });
    return categories.map((cat) => ({
      id: cat.id,
      slug: cat.slug,
      name: cat.name,
      description: cat.description,
    }));
  });
}

const TRIS = ["recent", "prix-asc", "prix-desc"] as const;

// Les noms de paramètres reprennent ceux déjà présents dans les URLs de la boutique
// (?categorie=…&q=…) : les liens existants et les favoris continuent de fonctionner.
const schemaListe = z.object({
  categorie: z.string().trim().min(1).optional(),
  q: z.string().trim().min(1).optional(),
  prixMax: z.coerce.number().int().positive().optional(),
  tri: z.enum(TRIS).default("recent"),
  page: z.coerce.number().int().min(1).default(1),
  // Plafonné : sans limite, un client pourrait réclamer le catalogue entier en une fois.
  parPage: z.coerce.number().int().min(1).max(48).default(8),
});

const inclureImages = { images: { orderBy: { position: "asc" } } } as const;

// Le catalogue change rarement et l'invalidation est explicite : ce délai n'est qu'un
// filet, pour qu'un oubli d'invalidation se résorbe de lui-même.
const TTL_CATALOGUE = 300;

export function routesCatalogue(prisma: PrismaClient, cache: Cache): Hono {
  const routes = new Hono();

  routes.get(
    "/produits",
    zValidator("query", schemaListe, (resultat, c) => {
      if (!resultat.success) {
        return c.json(
          corpsErreur("VALIDATION", "Paramètres invalides.", resultat.error.issues),
          400,
        );
      }
      return undefined;
    }),
    async (c) => {
      const { categorie, q, prixMax, tri, page, parPage } = c.req.valid("query");

      const where = {
        ...(categorie ? { category: { slug: categorie } } : {}),
        ...(prixMax ? { price: { lte: prixMax } } : {}),
        // La recherche porte sur le nom, comme dans la maquette. « insensitive » évite
        // qu'une majuscule fasse disparaître un résultat.
        ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
      };

      const orderBy =
        tri === "prix-asc"
          ? ({ price: "asc" } as const)
          : tri === "prix-desc"
            ? ({ price: "desc" } as const)
            : ({ createdAt: "desc" } as const);

      const cle = `produits:${categorie ?? ""}:${q ?? ""}:${prixMax ?? ""}:${tri}:${page}:${parPage}`;
      const resultat = await cache.lireOuCharger(cle, TTL_CATALOGUE, async () => {
        // Compte et page dans la même transaction : deux appels séparés pourraient
        // renvoyer un total incohérent avec la page si le catalogue change entre les deux.
        const [total, produits] = await prisma.$transaction([
          prisma.product.count({ where }),
          prisma.product.findMany({
            where,
            orderBy,
            include: inclureImages,
            skip: (page - 1) * parPage,
            take: parPage,
          }),
        ]);

        return {
          items: produits.map(versProduit),
          total,
          page,
          pages: Math.max(1, Math.ceil(total / parPage)),
        };
      });

      return c.json(resultat);
    },
  );

  routes.get("/produits/:slug", async (c) => {
    const slug = c.req.param("slug");
    const produit = await cache.lireOuCharger(`produit:${slug}`, TTL_CATALOGUE, () =>
      prisma.product.findUnique({ where: { slug }, include: inclureImages }),
    );
    if (!produit) throw new ErreurApi("INTROUVABLE", "Produit introuvable.");
    // Le cache stocke du JSON : createdAt revient en chaîne après un aller-retour, d'où
    // la reconstruction de la date avant conversion.
    return c.json(versProduit({ ...produit, createdAt: new Date(produit.createdAt) }));
  });

  routes.get("/categories", async (c) => c.json({ items: await chargerCategories(prisma, cache) }));

  /**
   * Tout ce qu'il faut pour dessiner une page, en un seul appel.
   *
   * Le rendu serveur réclamait catalogue, catégories, contenu et zones de livraison
   * séparément : quatre allers-retours avant de pouvoir répondre, à chaque page. Ils
   * puisent aux mêmes caches que les routes individuelles, qui restent en place pour
   * qui n'a besoin que d'une partie.
   */
  routes.get("/amorce", async (c) => {
    const [catalogue, categories, contenu, regions] = await Promise.all([
      chargerPageCatalogue(prisma, cache, 48),
      chargerCategories(prisma, cache),
      chargerContenu(prisma, cache),
      chargerLivraison(prisma, cache),
    ]);
    return c.json({ products: catalogue.items, categories, content: contenu, regions });
  });

  return routes;
}
