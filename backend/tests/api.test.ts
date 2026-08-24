import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Hono } from "hono";
import { creerApp } from "../src/app.js";
import { lireConfig } from "../src/config.js";
import { creerClient } from "../src/db.js";
import type { PrismaClient } from "../src/generated/prisma/client.js";
import { creerContexte, type ContexteTest } from "./contexte.js";

let contexte: ContexteTest;
let app: Hono;
let prisma: PrismaClient;

beforeAll(() => {
  contexte = creerContexte();
  ({ app, prisma } = contexte);
});

afterAll(async () => {
  await contexte.fermer();
});

describe("contrôle de santé", () => {
  it("répond 200 quand la base est joignable", async () => {
    const reponse = await app.request("/api/health");
    expect(reponse.status).toBe(200);
    expect(await reponse.json()).toEqual({ status: "ok", database: "ok" });
  });

  it("répond 503 quand la base est injoignable", async () => {
    // Un contrôle de santé qui ignore ses dépendances laisserait l'orchestrateur
    // envoyer du trafic à un service incapable de répondre.
    const prismaCasse = creerClient("postgresql://absent:absent@127.0.0.1:1/absente");
    const config = lireConfig({
      ...process.env,
      NODE_ENV: "test",
      REDIS_URL: process.env["TEST_REDIS_URL"]!,
    });
    const appCassee = creerApp({
      config,
      prisma: prismaCasse,
      cache: contexte.cache,
      redis: contexte.redis,
      auth: contexte.auth,
    });

    const reponse = await appCassee.request("/api/health");
    expect(reponse.status).toBe(503);
    expect(await reponse.json()).toEqual({ status: "degraded", database: "injoignable" });
    await prismaCasse.$disconnect().catch(() => undefined);
  });
});

describe("contrat d'erreur", () => {
  it("renvoie la forme attendue sur une entrée invalide", async () => {
    const reponse = await app.request("/api/_diag/echo?n=abc");
    expect(reponse.status).toBe(400);

    const corps = (await reponse.json()) as { error: { code: string; message: string } };
    expect(corps.error.code).toBe("VALIDATION");
    expect(corps.error.message).toBeTruthy();
  });

  it("accepte une entrée valide", async () => {
    const reponse = await app.request("/api/_diag/echo?n=42");
    expect(reponse.status).toBe(200);
    expect(await reponse.json()).toEqual({ n: 42 });
  });

  it("renvoie 404 au même format sur une route inconnue", async () => {
    const reponse = await app.request("/api/nexiste-pas");
    expect(reponse.status).toBe(404);
    const corps = (await reponse.json()) as { error: { code: string } };
    expect(corps.error.code).toBe("INTROUVABLE");
  });

  it("utilise le code porté par une erreur métier", async () => {
    const reponse = await app.request("/api/_diag/introuvable");
    expect(reponse.status).toBe(404);
    const corps = (await reponse.json()) as { error: { code: string; message: string } };
    expect(corps.error.code).toBe("INTROUVABLE");
    expect(corps.error.message).toBe("Produit introuvable.");
  });

  it("n'expose jamais le détail d'une erreur inattendue", async () => {
    const reponse = await app.request("/api/_diag/boom");
    expect(reponse.status).toBe(500);

    const brut = await reponse.text();
    // La trace peut contenir une requête SQL, un chemin de fichier ou une clé.
    expect(brut).not.toContain("sk_live_123");
    expect(brut).not.toContain("panne simulée");
    expect(JSON.parse(brut).error.code).toBe("ERREUR_INTERNE");
  });
});

describe("routes de diagnostic", () => {
  it("n'existent pas en production", async () => {
    const config = lireConfig({
      ...process.env,
      NODE_ENV: "production",
      DATABASE_URL: process.env["TEST_DATABASE_URL"]!,
      REDIS_URL: process.env["TEST_REDIS_URL"]!,
    });
    const appProd = creerApp({
      config,
      prisma,
      cache: contexte.cache,
      redis: contexte.redis,
      auth: contexte.auth,
    });

    for (const route of [
      "/api/_diag/echo?n=1",
      "/api/_diag/boom",
      "/api/_diag/introuvable",
      "/api/_diag/limite",
    ]) {
      expect((await appProd.request(route)).status, route).toBe(404);
    }
    // Le contrôle de santé, lui, reste indispensable en production.
    expect((await appProd.request("/api/health")).status).toBe(200);
  });
});

describe("configuration", () => {
  it("refuse de démarrer sans DATABASE_URL", () => {
    const env = { ...process.env };
    delete env["DATABASE_URL"];
    expect(() => lireConfig(env)).toThrow(/DATABASE_URL/);
  });

  it("signale une variable de stockage manquante", () => {
    const env = { ...process.env };
    delete env["S3_BUCKET"];
    expect(() => lireConfig(env)).toThrow(/S3_BUCKET/);
  });
});
