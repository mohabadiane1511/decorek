import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Auth } from "../auth.js";
import { exigerAdmin } from "../auth-middleware.js";
import type { Cache } from "../cache.js";
import { ErreurApi, corpsErreur } from "../erreurs.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { reconcilierStock } from "../stock.js";
import type { Config } from "../config.js";
import {
  configStockageDepuis,
  preparerTeleversement,
  TAILLE_IMAGE_MAX,
  TYPES_IMAGE_AUTORISES,
} from "../storage.js";
import { versContenu } from "./contenu.js";
import { versProduit } from "./catalogue.js";

/** Transforme un nom en identifiant d'URL : minuscules, sans accents, tirets. */
export function slugifier(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const STATUTS = [
  "en_attente",
  "confirmee",
  "preparation",
  "en_livraison",
  "livree",
  "non_honoree",
  "annulee",
] as const;

const schemaProduit = z.object({
  name: z.string().trim().min(2).max(160),
  categoryId: z.string().min(1),
  price: z.coerce.number().int().min(0),
  oldPrice: z.coerce.number().int().min(0).nullable().optional(),
  stock: z.coerce.number().int().min(0),
  lowStockThreshold: z.coerce.number().int().min(0),
  description: z.string().trim().max(4000),
  featured: z.boolean(),
  images: z.array(z.string().min(1)).max(12),
});

const schemaCategorie = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000),
});

const schemaPromo = z.object({
  code: z.string().trim().min(3).max(40),
  type: z.enum(["percent", "amount"]),
  value: z.coerce.number().int().positive(),
  minAmount: z.coerce.number().int().min(0),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  maxUses: z.coerce.number().int().positive(),
  active: z.boolean(),
});

const schemaCommande = z.object({
  status: z.enum(STATUTS).optional(),
  paid: z.boolean().optional(),
  internalNote: z.string().trim().max(2000).nullable().optional(),
});

const schemaRegions = z.object({
  regions: z.array(
    z.object({
      id: z.string().optional(),
      name: z.string().trim().min(2).max(120),
      areas: z.array(
        z.object({
          id: z.string().optional(),
          name: z.string().trim().min(2).max(120),
          fee: z.coerce.number().int().min(0),
        }),
      ),
    }),
  ),
});

const schemaContenu = z.object({
  bannerTitle: z.string().trim().max(200),
  bannerSubtitle: z.string().trim().max(500),
  bannerCta: z.string().trim().max(80),
  whatsapp: z.string().trim().max(30),
  phone: z.string().trim().max(30),
  email: z.string().trim().email(),
  address: z.string().trim().max(300),
  freeShippingFrom: z.coerce.number().int().min(0),
  pages: z.object({
    contact: z.string().max(8000),
    livraison: z.string().max(8000),
    apropos: z.string().max(8000),
    cgv: z.string().max(8000),
  }),
});

// Générique : sans cela, le type des données validées se perd et chaque handler
// reçoit du `unknown`.
function validation<T extends z.ZodTypeAny>(schema: T) {
  return zValidator("json", schema, (resultat, c) => {
    if (!resultat.success) {
      return c.json(corpsErreur("VALIDATION", "Données invalides.", resultat.error.issues), 400);
    }
    return undefined;
  });
}

const schemaTeleversement = z.object({
  contentType: z.string().min(1).max(80),
  taille: z.coerce.number().int().positive(),
});

export function routesAdmin(prisma: PrismaClient, cache: Cache, auth: Auth, config: Config): Hono {
  const routes = new Hono();

  // Une seule garde pour tout le préfixe : ajouter un endpoint ici ne peut pas
  // accidentellement laisser une porte ouverte.
  routes.use("/admin/*", exigerAdmin(auth, prisma));

  /** Toute écriture périme le catalogue public. */
  const invalider = () => cache.invaliderCatalogue();

  // ---------------------------------------------------------------- Images

  routes.post("/admin/images/televersement", validation(schemaTeleversement), async (c) => {
    const { contentType, taille } = c.req.valid("json");

    // Type et poids vérifiés avant d'émettre l'autorisation : une fois l'URL signée
    // remise, le serveur n'a plus la main sur ce qui est envoyé.
    if (!TYPES_IMAGE_AUTORISES.includes(contentType)) {
      throw new ErreurApi(
        "VALIDATION",
        "Format non accepté. Utilisez une image JPEG, PNG, WebP ou AVIF.",
      );
    }
    if (taille > TAILLE_IMAGE_MAX) {
      throw new ErreurApi(
        "VALIDATION",
        `Image trop lourde (${Math.round(taille / 1024 / 1024)} Mo). Maximum ${TAILLE_IMAGE_MAX / 1024 / 1024} Mo.`,
      );
    }

    const prepare = await preparerTeleversement(configStockageDepuis(config), contentType);
    return c.json(prepare);
  });

  // ---------------------------------------------------------------- Produits

  routes.post("/admin/produits", validation(schemaProduit), async (c) => {
    const donnees = c.req.valid("json");
    const produit = await prisma.$transaction(async (tx) => {
      const cree = await tx.product.create({
        data: {
          slug: await slugUnique(tx, slugifier(donnees.name)),
          name: donnees.name,
          categoryId: donnees.categoryId,
          price: donnees.price,
          oldPrice: donnees.oldPrice ?? null,
          stock: donnees.stock,
          lowStockThreshold: donnees.lowStockThreshold,
          description: donnees.description,
          featured: donnees.featured,
          images: {
            create: donnees.images.map((url, position) => ({ url, position })),
          },
        },
        include: { images: { orderBy: { position: "asc" } } },
      });
      if (donnees.stock > 0) {
        await tx.stockMovement.create({
          data: { productId: cree.id, delta: donnees.stock, reason: "reapprovisionnement" },
        });
      }
      return cree;
    });

    await invalider();
    return c.json(versProduit(produit), 201);
  });

  routes.put("/admin/produits/:id", validation(schemaProduit), async (c) => {
    const id = c.req.param("id");
    const donnees = c.req.valid("json");

    const produit = await prisma.$transaction(async (tx) => {
      const existant = await tx.product.findUnique({ where: { id } });
      if (!existant) throw new ErreurApi("INTROUVABLE", "Produit introuvable.");

      // Le stock corrigé à la main laisse une trace : sans elle, le journal ne
      // suffirait plus à expliquer l'état des rayons.
      const ecart = donnees.stock - existant.stock;
      if (ecart !== 0) {
        await tx.stockMovement.create({
          data: { productId: id, delta: ecart, reason: "correction" },
        });
      }

      // Les images sont réécrites en bloc : c'est ce qui rend le réordonnancement
      // fiable et garde les positions contiguës.
      await tx.productImage.deleteMany({ where: { productId: id } });

      return tx.product.update({
        where: { id },
        data: {
          name: donnees.name,
          categoryId: donnees.categoryId,
          price: donnees.price,
          oldPrice: donnees.oldPrice ?? null,
          stock: donnees.stock,
          lowStockThreshold: donnees.lowStockThreshold,
          description: donnees.description,
          featured: donnees.featured,
          images: { create: donnees.images.map((url, position) => ({ url, position })) },
        },
        include: { images: { orderBy: { position: "asc" } } },
      });
    });

    await invalider();
    return c.json(versProduit(produit));
  });

  routes.delete("/admin/produits/:id", async (c) => {
    const id = c.req.param("id");
    const vendu = await prisma.orderItem.count({ where: { productId: id } });
    if (vendu > 0) {
      // Supprimer viderait le lien depuis les commandes passées. Elles resteraient
      // lisibles grâce aux valeurs recopiées, mais l'historique perdrait le fil.
      throw new ErreurApi(
        "CONFLIT",
        "Ce produit figure dans des commandes. Retirez-le de la vitrine plutôt que de le supprimer.",
      );
    }
    await prisma.product.delete({ where: { id } });
    await invalider();
    return c.json({ supprime: true });
  });

  // ---------------------------------------------------------------- Catégories

  routes.post("/admin/categories", validation(schemaCategorie), async (c) => {
    const donnees = c.req.valid("json");
    const categorie = await prisma.category.create({
      data: {
        slug: await slugUnique(prisma, slugifier(donnees.name)),
        name: donnees.name,
        description: donnees.description,
      },
    });
    await invalider();
    return c.json(categorie, 201);
  });

  routes.put("/admin/categories/:id", validation(schemaCategorie), async (c) => {
    const donnees = c.req.valid("json");
    const categorie = await prisma.category.update({
      where: { id: c.req.param("id") },
      // Le slug ne change pas : il vit dans les URL et les liens déjà partagés.
      data: { name: donnees.name, description: donnees.description },
    });
    await invalider();
    return c.json(categorie);
  });

  routes.delete("/admin/categories/:id", async (c) => {
    const id = c.req.param("id");
    const produits = await prisma.product.count({ where: { categoryId: id } });
    if (produits > 0) {
      throw new ErreurApi(
        "CONFLIT",
        `Cette catégorie contient ${produits} article${produits > 1 ? "s" : ""}. Déplacez-les d'abord.`,
      );
    }
    await prisma.category.delete({ where: { id } });
    await invalider();
    return c.json({ supprime: true });
  });

  // ---------------------------------------------------------------- Commandes

  routes.get("/admin/commandes", async (c) => {
    const statut = c.req.query("statut");
    const commandes = await prisma.order.findMany({
      where:
        statut && STATUTS.includes(statut as (typeof STATUTS)[number])
          ? { status: statut as (typeof STATUTS)[number] }
          : {},
      orderBy: { createdAt: "desc" },
      include: { items: true },
      take: 200,
    });
    return c.json({ items: commandes });
  });

  routes.patch("/admin/commandes/:id", validation(schemaCommande), async (c) => {
    const id = c.req.param("id");
    const { status, paid, internalNote } = c.req.valid("json");

    const commande = await prisma.$transaction(async (tx) => {
      const existante = await tx.order.findUnique({ where: { id } });
      if (!existante) throw new ErreurApi("INTROUVABLE", "Commande introuvable.");

      if (status && status !== existante.status) {
        // Le stock suit le statut dans les deux sens : rendu à l'annulation, repris
        // si la commande repart. C'est ce second sens qui manquait à la maquette.
        await reconcilierStock(tx, id, status);
      }

      return tx.order.update({
        where: { id },
        data: {
          ...(status ? { status } : {}),
          ...(paid !== undefined ? { paid } : {}),
          ...(internalNote !== undefined ? { internalNote } : {}),
        },
        include: { items: true },
      });
    });

    await invalider();
    return c.json(commande);
  });

  // ---------------------------------------------------------------- Promotions

  routes.get("/admin/promos", async (c) => {
    const promos = await prisma.promoCode.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { redemptions: true } } },
    });
    // Le nombre d'utilisations est dérivé des lignes, jamais d'un compteur qu'on
    // pourrait oublier d'incrémenter.
    return c.json({
      items: promos.map(({ _count, ...p }) => ({ ...p, uses: _count.redemptions })),
    });
  });

  routes.post("/admin/promos", validation(schemaPromo), async (c) => {
    const d = c.req.valid("json");
    const promo = await prisma.promoCode.create({
      data: {
        ...d,
        code: d.code.toUpperCase(),
        startsAt: new Date(d.startsAt),
        endsAt: new Date(d.endsAt),
      },
    });
    return c.json(promo, 201);
  });

  routes.put("/admin/promos/:id", validation(schemaPromo), async (c) => {
    const d = c.req.valid("json");
    const promo = await prisma.promoCode.update({
      where: { id: c.req.param("id") },
      data: {
        ...d,
        code: d.code.toUpperCase(),
        startsAt: new Date(d.startsAt),
        endsAt: new Date(d.endsAt),
      },
    });
    return c.json(promo);
  });

  routes.delete("/admin/promos/:id", async (c) => {
    await prisma.promoCode.delete({ where: { id: c.req.param("id") } });
    return c.json({ supprime: true });
  });

  // ---------------------------------------------------------------- Livraison

  routes.put("/admin/livraison", validation(schemaRegions), async (c) => {
    const { regions } = c.req.valid("json");

    await prisma.$transaction(async (tx) => {
      const conservees = regions.map((r) => r.id).filter((id): id is string => Boolean(id));
      await tx.deliveryRegion.deleteMany({
        where: conservees.length > 0 ? { id: { notIn: conservees } } : {},
      });

      for (const region of regions) {
        const enregistree = region.id
          ? await tx.deliveryRegion.update({
              where: { id: region.id },
              data: { name: region.name },
            })
          : await tx.deliveryRegion.create({ data: { name: region.name } });

        const zonesGardees = region.areas
          .map((a) => a.id)
          .filter((id): id is string => Boolean(id));
        await tx.deliveryArea.deleteMany({
          where: {
            regionId: enregistree.id,
            ...(zonesGardees.length > 0 ? { id: { notIn: zonesGardees } } : {}),
          },
        });

        for (const zone of region.areas) {
          if (zone.id) {
            await tx.deliveryArea.update({
              where: { id: zone.id },
              data: { name: zone.name, fee: zone.fee },
            });
          } else {
            await tx.deliveryArea.create({
              data: { regionId: enregistree.id, name: zone.name, fee: zone.fee },
            });
          }
        }
      }
    });

    await invalider();
    const apres = await prisma.deliveryRegion.findMany({
      orderBy: { name: "asc" },
      include: { areas: { orderBy: { name: "asc" } } },
    });
    return c.json({ items: apres });
  });

  // ---------------------------------------------------------------- Contenu

  routes.put("/admin/contenu", validation(schemaContenu), async (c) => {
    const d = c.req.valid("json");
    const contenu = await prisma.siteContent.update({
      where: { id: 1 },
      data: {
        bannerTitle: d.bannerTitle,
        bannerSubtitle: d.bannerSubtitle,
        bannerCta: d.bannerCta,
        whatsapp: d.whatsapp,
        phone: d.phone,
        email: d.email,
        address: d.address,
        freeShippingFrom: d.freeShippingFrom,
        pageContact: d.pages.contact,
        pageLivraison: d.pages.livraison,
        pageApropos: d.pages.apropos,
        pageCgv: d.pages.cgv,
      },
    });
    await invalider();
    return c.json(versContenu(contenu));
  });

  return routes;
}

/** Ajoute un suffixe numérique tant que le slug est déjà pris. */
async function slugUnique(
  tx: PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
  base: string,
): Promise<string> {
  const racine = base || "article";
  for (let suffixe = 0; suffixe < 100; suffixe += 1) {
    const candidat = suffixe === 0 ? racine : `${racine}-${suffixe}`;
    const [produit, categorie] = await Promise.all([
      tx.product.findUnique({ where: { slug: candidat }, select: { id: true } }),
      tx.category.findUnique({ where: { slug: candidat }, select: { id: true } }),
    ]);
    if (!produit && !categorie) return candidat;
  }
  throw new ErreurApi("CONFLIT", "Impossible de générer une adresse unique pour ce nom.");
}
