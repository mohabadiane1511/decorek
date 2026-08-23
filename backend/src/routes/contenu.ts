import { Hono } from "hono";
import type { DeliveryRegion, SiteContent } from "../../../src/data/types.js";
import { ErreurApi } from "../erreurs.js";
import type { PrismaClient } from "../generated/prisma/client.js";

type ContenuEnBase = {
  bannerTitle: string;
  bannerSubtitle: string;
  bannerCta: string;
  whatsapp: string;
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

export function routesContenu(prisma: PrismaClient): Hono {
  const routes = new Hono();

  routes.get("/contenu", async (c) => {
    const contenu = await prisma.siteContent.findUnique({ where: { id: 1 } });
    if (!contenu) {
      // Échouer bruyamment plutôt que servir des valeurs par défaut : sans ce contenu,
      // le site afficherait un numéro WhatsApp vide et une livraison offerte à partir
      // de 0 FCFA. Mieux vaut une erreur visible qu'une promesse commerciale fausse.
      throw new ErreurApi("ERREUR_INTERNE", "Contenu du site absent : exécuter `npm run db:seed`.");
    }
    return c.json(versContenu(contenu));
  });

  routes.get("/livraison", async (c) => {
    const regions = await prisma.deliveryRegion.findMany({
      orderBy: { name: "asc" },
      include: { areas: { orderBy: { name: "asc" } } },
    });

    const items: DeliveryRegion[] = regions.map((r) => ({
      id: r.id,
      name: r.name,
      areas: r.areas.map((a) => ({ id: a.id, name: a.name, fee: a.fee })),
    }));
    return c.json({ items });
  });

  return routes;
}
