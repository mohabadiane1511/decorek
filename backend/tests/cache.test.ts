import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Redis } from "ioredis";
import { creerCache } from "../src/cache.js";
import { verifierLimite } from "../src/limite.js";
import { semer } from "../prisma/seed.js";
import { creerContexte, type ContexteTest } from "./contexte.js";

let contexte: ContexteTest;
const urlBase = process.env["TEST_DATABASE_URL"]!;
const urlCache = process.env["TEST_REDIS_URL"]!;

beforeAll(async () => {
  contexte = creerContexte();
  await contexte.prisma.productImage.deleteMany();
  await contexte.prisma.product.deleteMany();
  await contexte.prisma.category.deleteMany();
  await semer(urlBase);
}, 120_000);

afterAll(async () => {
  await contexte.fermer();
});

beforeEach(async () => {
  await contexte.redis.flushdb();
});

describe("cache de lecture", () => {
  it("ne recharge pas une donnée déjà en cache", async () => {
    let appels = 0;
    const charger = async () => {
      appels += 1;
      return { valeur: "x" };
    };

    const a = await contexte.cache.lireOuCharger("essai", 60, charger);
    const b = await contexte.cache.lireOuCharger("essai", 60, charger);

    expect(a).toEqual(b);
    expect(appels, "la source a été sollicitée deux fois").toBe(1);
  });

  it("recharge après expiration du délai", async () => {
    let appels = 0;
    const charger = async () => ({ n: ++appels });

    await contexte.cache.lireOuCharger("court", 1, charger);
    await new Promise((r) => setTimeout(r, 1_300));
    await contexte.cache.lireOuCharger("court", 1, charger);

    // Le TTL est le filet de sécurité : même sans invalidation explicite, l'écart
    // finit par se résorber seul.
    expect(appels).toBe(2);
  });

  it("périme toutes les entrées d'un coup quand la version change", async () => {
    let appels = 0;
    const charger = async () => ({ n: ++appels });

    await contexte.cache.lireOuCharger("a", 300, charger);
    await contexte.cache.lireOuCharger("b", 300, charger);
    expect(appels).toBe(2);

    await contexte.cache.invaliderCatalogue();

    // Une seule opération suffit à invalider toutes les clés dérivées : c'est l'intérêt
    // du compteur de version face à une suppression clé par clé, qui en oublie toujours.
    await contexte.cache.lireOuCharger("a", 300, charger);
    await contexte.cache.lireOuCharger("b", 300, charger);
    expect(appels).toBe(4);
  });

  it("incrémente la version à chaque invalidation", async () => {
    const avant = await contexte.cache.versionCatalogue();
    await contexte.cache.invaliderCatalogue();
    expect(await contexte.cache.versionCatalogue()).toBe(avant + 1);
  });
});

describe("panne du cache", () => {
  it("sert quand même la donnée quand Redis est injoignable", async () => {
    // Règle non négociable : le cache est facultatif. Un cache en panne dégrade les
    // performances, il ne doit jamais interrompre le service.
    const cacheMort = creerCache("redis://127.0.0.1:1");
    try {
      const valeur = await cacheMort.lireOuCharger("peu-importe", 60, async () => ({ ok: true }));
      expect(valeur).toEqual({ ok: true });
    } finally {
      await cacheMort.fermer();
    }
  });

  it("laisse l'API répondre sans cache", async () => {
    const cacheMort = creerCache("redis://127.0.0.1:1");
    const redisMort = new Redis("redis://127.0.0.1:1", {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
    redisMort.on("error", () => {});

    const { creerApp } = await import("../src/app.js");
    const { lireConfig } = await import("../src/config.js");
    const config = lireConfig({
      ...process.env,
      NODE_ENV: "test",
      DATABASE_URL: urlBase,
      REDIS_URL: urlCache,
    });
    const app = creerApp({
      config,
      prisma: contexte.prisma,
      cache: cacheMort,
      redis: redisMort,
      auth: contexte.auth,
      courrier: contexte.courrier,
    });

    try {
      const reponse = await app.request("/api/produits");
      expect(reponse.status, "l'API doit répondre malgré un cache éteint").toBe(200);
      const corps = (await reponse.json()) as { total: number };
      expect(corps.total).toBe(8);
    } finally {
      await cacheMort.fermer();
      redisMort.disconnect();
    }
  });
});

describe("limitation de débit", () => {
  it("autorise jusqu'au seuil puis refuse", async () => {
    const verdicts = [];
    for (let i = 0; i < 5; i += 1) {
      verdicts.push(await verifierLimite(contexte.redis, "essai", 3, 60));
    }

    expect(verdicts.slice(0, 3).every((v) => v.autorise)).toBe(true);
    expect(verdicts.slice(3).every((v) => v.autorise)).toBe(false);
  });

  it("compte séparément deux appelants", async () => {
    for (let i = 0; i < 4; i += 1) await verifierLimite(contexte.redis, "client-a", 3, 60);
    const autre = await verifierLimite(contexte.redis, "client-b", 3, 60);
    expect(autre.autorise, "un client ne doit pas bloquer les autres").toBe(true);
  });

  it("laisse repasser une fois la fenêtre écoulée", async () => {
    const maintenant = Date.now();
    for (let i = 0; i < 3; i += 1) {
      await verifierLimite(contexte.redis, "fenetre", 2, 1, maintenant);
    }
    expect((await verifierLimite(contexte.redis, "fenetre", 2, 1, maintenant)).autorise).toBe(
      false,
    );

    // Deux secondes plus tard, les tentatives sont sorties de la fenêtre glissante.
    const plusTard = maintenant + 2_000;
    expect((await verifierLimite(contexte.redis, "fenetre", 2, 1, plusTard)).autorise).toBe(true);
  });

  it("laisse passer si Redis est injoignable", async () => {
    const redisMort = new Redis("redis://127.0.0.1:1", {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
    redisMort.on("error", () => {});
    try {
      // Bloquer tout le trafic parce que le cache est tombé transformerait une panne
      // mineure en interruption de service.
      const verdict = await verifierLimite(redisMort, "peu-importe", 1, 60);
      expect(verdict.autorise).toBe(true);
    } finally {
      redisMort.disconnect();
    }
  });

  it("renvoie 429 sur la route protégée une fois le seuil dépassé", async () => {
    const appels = [];
    for (let i = 0; i < 5; i += 1) {
      appels.push(await contexte.app.request("/api/_diag/limite"));
    }

    expect(appels.slice(0, 3).map((r) => r.status)).toEqual([200, 200, 200]);
    expect(appels[4]!.status).toBe(429);

    const corps = (await appels[4]!.json()) as { error: { code: string } };
    expect(corps.error.code).toBe("TROP_DE_REQUETES");
  });
});

describe("invalidation vue depuis l'API", () => {
  it("sert la nouvelle valeur dès l'invalidation, sans attendre le TTL", async () => {
    const lirePrix = async (): Promise<number> => {
      const reponse = await contexte.app.request("/api/produits/sous-assiette-solaire-doree");
      const produit = (await reponse.json()) as { price: number };
      return produit.price;
    };

    const initial = await lirePrix();
    await contexte.prisma.product.update({
      where: { slug: "sous-assiette-solaire-doree" },
      data: { price: initial + 1000 },
    });

    // Sans invalidation, le cache continue de servir l'ancien prix.
    expect(await lirePrix()).toBe(initial);

    await contexte.cache.invaliderCatalogue();
    expect(await lirePrix()).toBe(initial + 1000);

    await contexte.prisma.product.update({
      where: { slug: "sous-assiette-solaire-doree" },
      data: { price: initial },
    });
    await contexte.cache.invaliderCatalogue();
  });
});
