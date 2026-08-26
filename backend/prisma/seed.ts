import { readFile } from "node:fs/promises";
import { config as loadEnv } from "dotenv";
import {
  seedCategories,
  seedContent,
  seedProducts,
  seedPromos,
  seedRegions,
} from "../../src/data/seed.js";
import { creerClient } from "../src/db.js";
import {
  creerClientStockage,
  deposerObjet,
  lireConfigStockage,
  objetExiste,
} from "../src/storage.js";

loadEnv({ path: new URL("../.env", import.meta.url).pathname, quiet: true });

const racineDepot = new URL("../../", import.meta.url).pathname;

/**
 * Envoie une image de public/images/ vers le stockage et renvoie le chemin à enregistrer.
 * Les objets déjà présents ne sont pas réexpédiés : le seed doit rester rejouable.
 */
async function televerserImage(
  client: ReturnType<typeof creerClientStockage>,
  config: ReturnType<typeof lireConfigStockage>,
  cheminLocal: string,
): Promise<string> {
  const cle = cheminLocal.replace(/^\/images\//, "");
  if (await objetExiste(client, config.bucket, cle)) {
    return `${config.prefix}/${cle}`;
  }
  const contenu = await readFile(`${racineDepot}public/images/${cle}`);
  return deposerObjet(client, config, cle, contenu);
}

export async function semer(databaseUrl: string): Promise<void> {
  const prisma = creerClient(databaseUrl);
  const config = lireConfigStockage();
  const stockage = creerClientStockage(config);

  try {
    // Catégories. Le slug fait office de clé naturelle : rejouer le seed met à jour
    // plutôt que de dupliquer.
    for (const c of seedCategories) {
      await prisma.category.upsert({
        where: { slug: c.slug },
        create: { slug: c.slug, name: c.name, description: c.description },
        update: { name: c.name, description: c.description },
      });
    }

    const categoriesParAncienId = new Map<string, string>();
    for (const c of seedCategories) {
      const enBase = await prisma.category.findUniqueOrThrow({ where: { slug: c.slug } });
      categoriesParAncienId.set(c.id, enBase.id);
    }

    // Références déjà attribuées : le jeu de données ne doit pas réclamer celles-là.
    // Rejouer l'amorçage sur une base déjà peuplée réattribuerait sinon un code porté
    // par un autre article, et la contrainte d'unicité ferait tout échouer.
    const prises = new Set(
      (await prisma.product.findMany({ select: { sku: true } }))
        .map((p) => p.sku)
        .filter((sku): sku is string => sku !== null),
    );
    let rang = 0;
    const referenceLibre = (): string => {
      let candidat: string;
      do {
        rang += 1;
        candidat = `DR-${String(rang).padStart(4, "0")}`;
      } while (prises.has(candidat));
      prises.add(candidat);
      return candidat;
    };

    for (const p of seedProducts) {
      const categoryId = categoriesParAncienId.get(p.categoryId);
      if (!categoryId) throw new Error(`Catégorie inconnue pour le produit ${p.slug}`);

      const donnees = {
        name: p.name,
        categoryId,
        price: p.price,
        oldPrice: p.oldPrice ?? null,
        stock: p.stock,
        lowStockThreshold: p.lowStockThreshold,
        description: p.description,
        featured: p.featured,
        createdAt: new Date(p.createdAt),
      };
      // La référence n'est posée qu'à la création : un article déjà en base garde la
      // sienne, qui a pu servir à étiqueter des cartons ou figurer sur un inventaire.
      const existant = await prisma.product.findUnique({
        where: { slug: p.slug },
        select: { id: true, sku: true },
      });
      const produit = await prisma.product.upsert({
        where: { slug: p.slug },
        create: { slug: p.slug, sku: existant?.sku ?? referenceLibre(), ...donnees },
        update: donnees,
      });

      // Les images sont réécrites en bloc : c'est aussi ainsi que le réordonnancement
      // fonctionnera dans l'administration, et cela garde les positions contiguës.
      const urls = await Promise.all(
        p.images.map((image) => televerserImage(stockage, config, image)),
      );
      await prisma.productImage.deleteMany({ where: { productId: produit.id } });
      await prisma.productImage.createMany({
        data: urls.map((url, position) => ({ productId: produit.id, url, position })),
      });
    }

    // Le compteur ne recule jamais : le ramener en arrière ferait réattribuer une
    // référence déjà servie au prochain article créé.
    const compteur = await prisma.skuCounter.findUnique({ where: { id: 1 } });
    const atteint = Math.max(rang, compteur?.counter ?? 0);
    await prisma.skuCounter.upsert({
      where: { id: 1 },
      create: { id: 1, counter: atteint },
      update: { counter: atteint },
    });

    for (const r of seedRegions) {
      const region = await prisma.deliveryRegion.upsert({
        where: { name: r.name },
        create: { name: r.name },
        update: {},
      });
      for (const a of r.areas) {
        await prisma.deliveryArea.upsert({
          where: { regionId_name: { regionId: region.id, name: a.name } },
          create: { regionId: region.id, name: a.name, fee: a.fee },
          update: { fee: a.fee },
        });
      }
    }

    for (const promo of seedPromos) {
      const donnees = {
        type: promo.type,
        value: promo.value,
        minAmount: promo.minAmount,
        startsAt: new Date(promo.startsAt),
        endsAt: new Date(promo.endsAt),
        maxUses: promo.maxUses,
        active: promo.active,
      };
      await prisma.promoCode.upsert({
        where: { code: promo.code },
        create: { code: promo.code, ...donnees },
        update: donnees,
      });
    }

    // Le compteur `uses` de la maquette n'est pas repris : il est désormais dérivé des
    // lignes de promo_redemptions, qui n'existent que pour de vraies commandes.

    const contenu = {
      bannerTitle: seedContent.bannerTitle,
      bannerSubtitle: seedContent.bannerSubtitle,
      bannerCta: seedContent.bannerCta,
      whatsapp: seedContent.whatsapp,
      facebook: seedContent.facebook,
      instagram: seedContent.instagram,
      tiktok: seedContent.tiktok,
      snapchat: seedContent.snapchat,
      phone: seedContent.phone,
      email: seedContent.email,
      address: seedContent.address,
      freeShippingFrom: seedContent.freeShippingFrom,
      pageContact: seedContent.pages.contact,
      pageLivraison: seedContent.pages.livraison,
      pageApropos: seedContent.pages.apropos,
      pageCgv: seedContent.pages.cgv,
    };
    await prisma.siteContent.upsert({
      where: { id: 1 },
      create: { id: 1, ...contenu },
      update: contenu,
    });

    // Les commandes de démonstration ne sont volontairement pas importées : elles
    // devraient s'accompagner de mouvements de stock cohérents, et une base de départ
    // sans fausses ventes est plus saine pour vérifier les calculs.
  } finally {
    await prisma.$disconnect();
  }
}

const executeDirectement = process.argv[1]?.includes("seed");
if (executeDirectement) {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL manquante — voir backend/.env.example");
  await semer(url);
  console.log("Données de démonstration en place.");
}
