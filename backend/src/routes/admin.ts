import { Hono } from "hono";
import type { OrderStatus } from "../../../src/data/types.js";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Auth } from "../auth.js";
import { exigerAdmin } from "../auth-middleware.js";
import type { Cache } from "../cache.js";
import { ErreurApi, corpsErreur } from "../erreurs.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { reconcilierStock } from "../stock.js";
import { versCommande } from "../conversions.js";
import type { Config } from "../config.js";
import {
  configStockageDepuis,
  preparerTeleversement,
  TAILLE_IMAGE_MAX,
  TYPES_IMAGE_AUTORISES,
} from "../storage.js";
import { versContenu } from "./contenu.js";
import { versProduit } from "./catalogue.js";
import { construireClasseur, nomFichier } from "../export.js";

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

/**
 * Lit les paramètres de pagination et de recherche communs aux écrans du back-office.
 *
 * Le plafond par page protège la base : sans lui, l'équipe — ou un onglet resté
 * ouvert — pourrait réclamer des milliers de lignes d'un coup. Une saisie aberrante
 * (page zéro, texte à la place d'un nombre) retombe sur la valeur par défaut plutôt
 * que de faire échouer la requête, car il n'y a rien à corriger côté utilisateur.
 */
export function lirePagination(query: Record<string, string | undefined>): {
  q: string | undefined;
  page: number;
  parPage: number;
} {
  const nombre = (valeur: string | undefined, defaut: number, max: number): number => {
    const lu = Number(valeur);
    if (!Number.isInteger(lu) || lu < 1) return defaut;
    return Math.min(lu, max);
  };
  const recherche = (query["q"] ?? "").trim();
  return {
    q: recherche.length > 0 ? recherche : undefined,
    page: nombre(query["page"], 1, 10_000),
    parPage: nombre(query["parPage"], 20, 100),
  };
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
  // Laissée vide, la référence est attribuée par le serveur. Le format est libre :
  // la cliente peut vouloir reprendre celui de son fournisseur.
  sku: z.string().trim().max(40).optional(),
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
  // Adresse complète attendue, ou chaîne vide : un identifiant seul (« @decorek »)
  // ne permet pas de construire un lien fiable, chaque réseau ayant sa propre forme.
  //
  // Facultatifs à dessein : exiger ces champs ferait échouer toute requête émise par
  // une version antérieure du front — pendant un déploiement, par exemple. L'absence
  // vaut « pas de réseau », ce que l'interface traduit par une icône en moins.
  facebook: z.string().trim().max(300).default(""),
  instagram: z.string().trim().max(300).default(""),
  tiktok: z.string().trim().max(300).default(""),
  snapchat: z.string().trim().max(300).default(""),
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

  // ------------------------------------------------------------------ Export

  routes.get("/admin/export", async (c) => {
    const lu = Number(c.req.query("jours"));
    // Sans période, tout l'historique : c'est ce qu'on attend d'un inventaire annuel.
    const depuis =
      Number.isInteger(lu) && lu >= 1
        ? new Date(Date.now() - Math.min(lu, 3650) * 86_400_000)
        : undefined;

    const classeur = await construireClasseur(prisma, { depuis });

    // `new Response` plutôt que l'aide de Hono : celle-ci type son corps de façon
    // trop stricte pour un tableau d'octets.
    return new Response(classeur, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nomFichier()}"`,
        // Un inventaire daté ne doit pas être resservi depuis un cache intermédiaire.
        "Cache-Control": "no-store",
      },
    });
  });

  // ----------------------------------------------------------- Tableau de bord

  routes.get("/admin/statistiques", async (c) => {
    // Bornes larges : « 0 jour » n'a pas de sens et dix ans suffisent à tout historique.
    const lu = Number(c.req.query("jours"));
    const jours = Number.isInteger(lu) && lu >= 1 ? Math.min(lu, 3650) : 30;
    const depuis = new Date(Date.now() - jours * 86_400_000);

    const periode = { createdAt: { gte: depuis } };
    // Une commande annulée ou non honorée n'a rien rapporté : elle compte dans le
    // nombre de commandes, jamais dans le chiffre d'affaires.
    const valides = { ...periode, status: { notIn: ["annulee", "non_honoree"] as OrderStatus[] } };

    const [chiffre, encaisse, commandes, nombreValides, meilleurs] = await Promise.all([
      prisma.order.aggregate({ where: valides, _sum: { total: true } }),
      prisma.order.aggregate({ where: { ...periode, paid: true }, _sum: { total: true } }),
      prisma.order.count({ where: periode }),
      prisma.order.count({ where: valides }),
      prisma.orderItem.groupBy({
        by: ["productId", "name"],
        where: { order: valides },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: 5,
      }),
    ]);

    // Le chiffre d'affaires par article ne peut pas être agrégé en une passe : il vaut
    // prix × quantité, un produit de deux colonnes que le groupBy ne calcule pas.
    const recettes = await prisma.$queryRaw<{ name: string; total: bigint }[]>`
      SELECT i.name, SUM(i.price * i.quantity)::bigint AS total
        FROM order_items i
        JOIN orders o ON o.id = i.order_id
       WHERE o.created_at >= ${depuis}
         AND o.status NOT IN ('annulee', 'non_honoree')
       GROUP BY i.name`;
    const recetteParNom = new Map(recettes.map((l) => [l.name, Number(l.total)]));

    // Deux colonnes comparées entre elles : Prisma ne l'exprime pas, d'où le SQL.
    // La liste est bornée — l'écran n'en montre qu'un aperçu, l'onglet Stocks sert au
    // détail — mais le compte, lui, porte sur tout le catalogue.
    const [{ bas }] = await prisma.$queryRaw<[{ bas: bigint }]>`
      SELECT COUNT(*)::bigint AS bas FROM products WHERE stock <= low_stock_threshold`;
    const alertes = await prisma.$queryRaw<{ id: string; name: string; stock: number }[]>`
      SELECT id, name, stock FROM products
       WHERE stock <= low_stock_threshold
       ORDER BY stock ASC
       LIMIT 20`;

    // Le regroupement par jour se fait en base : ramener chaque commande pour les
    // compter ici reviendrait à charger tout l'historique dans le navigateur.
    const serie = await prisma.$queryRaw<{ jour: Date; total: bigint }[]>`
      SELECT date_trunc('day', created_at) AS jour, SUM(total)::bigint AS total
        FROM orders
       WHERE created_at >= ${depuis}
         AND status NOT IN ('annulee', 'non_honoree')
       GROUP BY jour
       ORDER BY jour`;

    return c.json({
      jours,
      chiffreAffaires: chiffre._sum?.total ?? 0,
      encaisse: encaisse._sum?.total ?? 0,
      commandes,
      valides: nombreValides,
      stockBas: Number(bas),
      meilleurs: meilleurs.map((l) => ({
        productId: l.productId,
        name: l.name,
        quantite: l._sum?.quantity ?? 0,
        total: recetteParNom.get(l.name) ?? 0,
      })),
      alertes,
      serie: serie.map((l) => ({
        jour: l.jour.toISOString().slice(0, 10),
        total: Number(l.total),
      })),
    });
  });

  // ---------------------------------------------------------------- Produits

  routes.get("/admin/produits", async (c) => {
    const { q, page, parPage } = lirePagination(c.req.query());

    // Jamais mis en cache, contrairement au catalogue public : l'équipe doit voir
    // l'effet de sa modification immédiatement, pas au bout de cinq minutes.
    // Nom ou référence : au téléphone comme devant un carton, on a l'un ou l'autre.
    const where = q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { sku: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {};

    // L'écran des stocks met les articles à réassortir en tête. Le tri doit se faire
    // en base : trier les vingt lignes de la page en cours ne remonterait que le plus
    // bas de cette page, pas celui du catalogue.
    const orderBy =
      c.req.query("tri") === "stock"
        ? ({ stock: "asc" } as const)
        : ({ createdAt: "desc" } as const);

    const [total, produits] = await prisma.$transaction([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        orderBy,
        include: { images: { orderBy: { position: "asc" } } },
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
  });

  routes.post("/admin/produits", validation(schemaProduit), async (c) => {
    const donnees = c.req.valid("json");
    const produit = await prisma.$transaction(async (tx) => {
      const cree = await tx.product.create({
        data: {
          slug: await slugUnique(tx, slugifier(donnees.name)),
          sku: donnees.sku && donnees.sku.length > 0 ? donnees.sku : await prochaineReference(tx),
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
          // Une référence effacée dans le formulaire n'est pas supprimée : elle a pu
          // servir à étiqueter des cartons. On en attribue une si l'article n'en
          // avait pas encore.
          sku:
            donnees.sku && donnees.sku.length > 0
              ? donnees.sku
              : (existant.sku ?? (await prochaineReference(tx))),
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
    const { q, page, parPage } = lirePagination(c.req.query());

    const where = {
      ...(statut && STATUTS.includes(statut as (typeof STATUTS)[number])
        ? { status: statut as (typeof STATUTS)[number] }
        : {}),
      // Trois façons de retrouver une commande, selon ce que la cliente a sous la main
      // au téléphone : son numéro, son nom, ou le numéro qu'elle appelle.
      ...(q
        ? {
            OR: [
              { number: { contains: q, mode: "insensitive" as const } },
              { customerName: { contains: q, mode: "insensitive" as const } },
              { customerPhone: { contains: q } },
            ],
          }
        : {}),
    };

    const [total, commandes] = await prisma.$transaction([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: { items: true },
        skip: (page - 1) * parPage,
        take: parPage,
      }),
    ]);

    // Le back-office voit la note interne, contrairement au suivi client.
    return c.json({
      items: commandes.map((o) => versCommande(o, { avecNoteInterne: true })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / parPage)),
    });
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
    return c.json(versCommande(commande, { avecNoteInterne: true }));
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
      // Un identifiant venu du navigateur peut ne correspondre à rien : le formulaire
      // en attribue un provisoire aux éléments qu'on vient d'ajouter. Le traiter comme
      // une mise à jour faisait échouer toute la transaction, et l'ajout était perdu
      // sans que rien ne le signale. On vérifie donc ce qui existe réellement.
      const regionsConnues = new Set(
        (await tx.deliveryRegion.findMany({ select: { id: true } })).map((r) => r.id),
      );
      const zonesConnues = new Set(
        (await tx.deliveryArea.findMany({ select: { id: true } })).map((a) => a.id),
      );

      const conservees = regions
        .map((r) => r.id)
        .filter((id): id is string => id !== undefined && regionsConnues.has(id));
      await tx.deliveryRegion.deleteMany({
        where: conservees.length > 0 ? { id: { notIn: conservees } } : {},
      });

      for (const region of regions) {
        // Identifiant retenu seulement s'il désigne une région existante ; sinon on
        // crée, ce qui couvre aussi bien un ajout qu'un identifiant provisoire.
        const idExistant =
          region.id !== undefined && regionsConnues.has(region.id) ? region.id : undefined;
        const enregistree = idExistant
          ? await tx.deliveryRegion.update({
              where: { id: idExistant },
              data: { name: region.name },
            })
          : await tx.deliveryRegion.create({ data: { name: region.name } });

        const zonesGardees = region.areas
          .map((a) => a.id)
          .filter((id): id is string => id !== undefined && zonesConnues.has(id));
        await tx.deliveryArea.deleteMany({
          where: {
            regionId: enregistree.id,
            ...(zonesGardees.length > 0 ? { id: { notIn: zonesGardees } } : {}),
          },
        });

        for (const zone of region.areas) {
          const idZone = zone.id !== undefined && zonesConnues.has(zone.id) ? zone.id : undefined;
          if (idZone) {
            await tx.deliveryArea.update({
              where: { id: idZone },
              // La région peut changer si la zone a été déplacée.
              data: { name: zone.name, fee: zone.fee, regionId: enregistree.id },
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
        facebook: d.facebook,
        instagram: d.instagram,
        tiktok: d.tiktok,
        snapchat: d.snapchat,
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

/**
 * Attribue la prochaine référence d'article.
 *
 * Le compteur est incrémenté en base plutôt que déduit du nombre de produits : après
 * une suppression, compter les lignes redonnerait une référence déjà attribuée, que
 * la contrainte d'unicité refuserait — ou pire, qui désignerait deux articles
 * différents dans deux exports successifs.
 */
async function prochaineReference(
  tx: PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
): Promise<string> {
  const compteur = await tx.skuCounter.upsert({
    where: { id: 1 },
    create: { id: 1, counter: 1 },
    update: { counter: { increment: 1 } },
    select: { counter: true },
  });
  return `DR-${String(compteur.counter).padStart(4, "0")}`;
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
