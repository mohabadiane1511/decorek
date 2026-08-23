import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Hono } from "hono";
import type { DeliveryRegion, SiteContent } from "../../src/data/types.js";
import { seedContent, seedRegions } from "../../src/data/seed.js";
import { creerApp } from "../src/app.js";
import { lireConfig } from "../src/config.js";
import { creerClient } from "../src/db.js";
import { semer } from "../prisma/seed.js";
import type { PrismaClient } from "../src/generated/prisma/client.js";

let app: Hono;
let prisma: PrismaClient;
const url = process.env["TEST_DATABASE_URL"]!;

beforeAll(async () => {
  prisma = creerClient(url);
  await prisma.deliveryArea.deleteMany();
  await prisma.deliveryRegion.deleteMany();
  await prisma.siteContent.deleteMany();
  await semer(url);

  const config = lireConfig({ ...process.env, NODE_ENV: "test", DATABASE_URL: url });
  app = creerApp({ config, prisma });
}, 120_000);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("contenu du site", () => {
  it("renvoie le contenu au format attendu par le front", async () => {
    const reponse = await app.request("/api/contenu");
    expect(reponse.status).toBe(200);

    const contenu = (await reponse.json()) as SiteContent;
    expect(contenu.bannerTitle).toBe(seedContent.bannerTitle);
    expect(contenu.whatsapp).toBe(seedContent.whatsapp);
    expect(contenu.freeShippingFrom).toBe(seedContent.freeShippingFrom);

    // La base range les textes à plat, le front les attend regroupés.
    expect(contenu.pages.cgv).toBe(seedContent.pages.cgv);
    expect(contenu.pages.livraison).toBe(seedContent.pages.livraison);
  });

  it("signale explicitement un contenu manquant au lieu de servir du vide", async () => {
    await prisma.siteContent.deleteMany();
    try {
      const reponse = await app.request("/api/contenu");
      // Sans contenu, le site annoncerait une livraison offerte dès 0 FCFA et un
      // numéro WhatsApp vide : une erreur visible vaut mieux qu'une promesse fausse.
      expect(reponse.status).toBe(500);
      const corps = (await reponse.json()) as { error: { message: string } };
      expect(corps.error.message).toMatch(/db:seed/);
    } finally {
      await semer(url);
    }
  }, 120_000);
});

describe("zones de livraison", () => {
  it("renvoie chaque région avec ses zones et leurs frais", async () => {
    const reponse = await app.request("/api/livraison");
    expect(reponse.status).toBe(200);

    const { items } = (await reponse.json()) as { items: DeliveryRegion[] };
    expect(items).toHaveLength(seedRegions.length);

    const total = items.reduce((n, r) => n + r.areas.length, 0);
    expect(total).toBe(16);

    const dakar = items.find((r) => r.name === "Dakar");
    expect(dakar, "région Dakar absente").toBeDefined();
    const almadies = dakar!.areas.find((a) => a.name === "Almadies");
    expect(almadies?.fee).toBe(2500);
  });

  it("donne des frais entiers et positifs pour chaque zone", async () => {
    const reponse = await app.request("/api/livraison");
    const { items } = (await reponse.json()) as { items: DeliveryRegion[] };
    for (const region of items) {
      expect(region.areas.length, `${region.name} sans zone`).toBeGreaterThan(0);
      for (const zone of region.areas) {
        expect(Number.isInteger(zone.fee), `${zone.name}`).toBe(true);
        expect(zone.fee).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
