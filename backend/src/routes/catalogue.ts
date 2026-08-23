import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Category, Product } from "../../../src/data/types.js";
import { ErreurApi, corpsErreur } from "../erreurs.js";
import type { PrismaClient } from "../generated/prisma/client.js";

// Produit tel qu'il sort de la base, images comprises.
type ProduitEnBase = {
  id: string;
  slug: string;
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

export function routesCatalogue(prisma: PrismaClient): Hono {
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

      // Compte et page dans la même requête : deux appels séparés pourraient renvoyer un
      // total incohérent avec la page si le catalogue change entre les deux.
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

      return c.json({
        items: produits.map(versProduit),
        total,
        page,
        pages: Math.max(1, Math.ceil(total / parPage)),
      });
    },
  );

  routes.get("/produits/:slug", async (c) => {
    const produit = await prisma.product.findUnique({
      where: { slug: c.req.param("slug") },
      include: inclureImages,
    });
    if (!produit) throw new ErreurApi("INTROUVABLE", "Produit introuvable.");
    return c.json(versProduit(produit));
  });

  routes.get("/categories", async (c) => {
    const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });
    const items: Category[] = categories.map((cat) => ({
      id: cat.id,
      slug: cat.slug,
      name: cat.name,
      description: cat.description,
    }));
    return c.json({ items });
  });

  return routes;
}
