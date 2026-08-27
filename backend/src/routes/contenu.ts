import { Hono } from "hono";
import type { DeliveryRegion, SiteContent } from "../../../src/data/types.js";
import type { Cache } from "../cache.js";
import { ErreurApi } from "../erreurs.js";
import type { PrismaClient } from "../generated/prisma/client.js";

// Contenu et zones changent encore moins souvent que le catalogue, et l'administration
// les invalide explicitement.
const TTL_CONTENU = 600;

type ContenuEnBase = {
  bannerTitle: string;
  bannerSubtitle: string;
  bannerCta: string;
  whatsapp: string;
  facebook: string;
  instagram: string;
  tiktok: string;
  snapchat: string;
  phone: string;
  email: string;
  address: string;
  freeShippingFrom: number;
  pageContact: string;
  pageLivraison: string;
  pageApropos: string;
  pageCgv: string;
};

/**
 * La base range les textes de pages à plat (pageContact, pageCgv…) parce que c'est plus
 * simple à éditer et à migrer ; le front les attend regroupés sous `pages`.
 */
export function versContenu(c: ContenuEnBase): SiteContent {
  return {
    bannerTitle: c.bannerTitle,
    bannerSubtitle: c.bannerSubtitle,
    bannerCta: c.bannerCta,
    whatsapp: c.whatsapp,
    facebook: c.facebook,
    instagram: c.instagram,
    tiktok: c.tiktok,
    snapchat: c.snapchat,
    phone: c.phone,
    email: c.email,
    address: c.address,
    freeShippingFrom: c.freeShippingFrom,
    pages: {
      contact: c.pageContact,
      livraison: c.pageLivraison,
      apropos: c.pageApropos,
      cgv: c.pageCgv,
    },
  };
}

/**
 * Contenu éditorial du site.
 *
 * Extrait de sa route pour que l'amorçage d'une page puisse le réclamer sans passer
 * par un second appel HTTP — le rendu serveur en avait besoin quatre.
 */
export async function chargerContenu(prisma: PrismaClient, cache: Cache): Promise<SiteContent> {
  const contenu = await cache.lireOuCharger("contenu", TTL_CONTENU, () =>
    prisma.siteContent.findUnique({ where: { id: 1 } }),
  );
  if (!contenu) {
    // Échouer bruyamment plutôt que servir des valeurs par défaut : sans ce contenu,
    // le site afficherait un numéro WhatsApp vide et une livraison offerte à partir
    // de 0 FCFA. Mieux vaut une erreur visible qu'une promesse commerciale fausse.
    throw new ErreurApi("ERREUR_INTERNE", "Contenu du site absent : exécuter `npm run db:seed`.");
  }
  return versContenu(contenu);
}

/** Zones de livraison et leurs frais. */
export async function chargerLivraison(
  prisma: PrismaClient,
  cache: Cache,
): Promise<DeliveryRegion[]> {
  return cache.lireOuCharger<DeliveryRegion[]>("livraison", TTL_CONTENU, async () => {
    const regions = await prisma.deliveryRegion.findMany({
      orderBy: { name: "asc" },
      include: { areas: { orderBy: { name: "asc" } } },
    });
    return regions.map((r) => ({
      id: r.id,
      name: r.name,
      areas: r.areas.map((a) => ({ id: a.id, name: a.name, fee: a.fee })),
    }));
  });
}

export function routesContenu(prisma: PrismaClient, cache: Cache): Hono {
  const routes = new Hono();

  routes.get("/contenu", async (c) => c.json(await chargerContenu(prisma, cache)));

  routes.get("/livraison", async (c) => c.json({ items: await chargerLivraison(prisma, cache) }));

  return routes;
}
