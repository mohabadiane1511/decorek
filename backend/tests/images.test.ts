import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  configStockageDepuis,
  preparerTeleversement,
  TAILLE_IMAGE_MAX,
  TYPES_IMAGE_AUTORISES,
} from "../src/storage.js";
import { lireConfig } from "../src/config.js";
import { creerContexte, type ContexteTest } from "./contexte.js";

let contexte: ContexteTest;
let cookieAdmin: string;
let cookieClient: string;

async function compte(email: string, admin: boolean): Promise<string> {
  await contexte.app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "motdepasse123", name: "Compte" }),
  });
  const utilisateur = await contexte.prisma.user.update({
    where: { email },
    data: { emailVerified: true },
  });
  if (admin) {
    await contexte.prisma.userRole.create({ data: { userId: utilisateur.id, role: "admin" } });
  }
  const reponse = await contexte.app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "motdepasse123" }),
  });
  return reponse.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

async function demander(corps: unknown, cookie?: string): Promise<Response> {
  const entetes: Record<string, string> = { "Content-Type": "application/json" };
  if (cookie) entetes["Cookie"] = cookie;
  return contexte.app.request("/api/admin/images/televersement", {
    method: "POST",
    headers: entetes,
    body: JSON.stringify(corps),
  });
}

beforeAll(async () => {
  contexte = creerContexte();
}, 60_000);

afterAll(async () => {
  await contexte.fermer();
});

beforeEach(async () => {
  await contexte.prisma.session.deleteMany();
  await contexte.prisma.account.deleteMany();
  await contexte.prisma.userRole.deleteMany();
  await contexte.prisma.user.deleteMany();
  await contexte.redis.flushdb();
  cookieAdmin = await compte("equipe@decorek.sn", true);
  cookieClient = await compte("cliente@test.sn", false);
}, 60_000);

describe("autorisation de téléversement", () => {
  it("refuse un visiteur non connecté", async () => {
    const reponse = await demander({ contentType: "image/jpeg", taille: 1000 });
    expect(reponse.status).toBe(401);
  });

  it("refuse un client sans rôle", async () => {
    const reponse = await demander({ contentType: "image/jpeg", taille: 1000 }, cookieClient);
    expect(reponse.status).toBe(403);
  });

  it("délivre une URL signée à un administrateur", async () => {
    const reponse = await demander({ contentType: "image/jpeg", taille: 500_000 }, cookieAdmin);
    expect(reponse.status).toBe(200);

    const { url, chemin } = (await reponse.json()) as { url: string; chemin: string };
    expect(url).toContain("X-Amz-Signature");
    // Le chemin enregistré en base reste relatif, comme pour les images du seed.
    expect(chemin).toMatch(/^\/media\/produits\/[0-9a-f-]+\.jpg$/);
  });
});

describe("contrôles avant signature", () => {
  it("refuse un format non image", async () => {
    // Une fois l'URL signée remise, le serveur n'a plus la main : le contrôle doit
    // avoir lieu avant.
    for (const type of ["application/pdf", "text/html", "application/x-httpd-php"]) {
      const reponse = await demander({ contentType: type, taille: 1000 }, cookieAdmin);
      expect(reponse.status, type).toBe(400);
    }
  });

  it("refuse une image trop lourde", async () => {
    const reponse = await demander(
      { contentType: "image/jpeg", taille: TAILLE_IMAGE_MAX + 1 },
      cookieAdmin,
    );
    expect(reponse.status).toBe(400);
    const corps = (await reponse.json()) as { error: { message: string } };
    expect(corps.error.message).toMatch(/trop lourde/i);
  });

  it("accepte les formats web courants", async () => {
    for (const type of TYPES_IMAGE_AUTORISES) {
      const reponse = await demander({ contentType: type, taille: 1000 }, cookieAdmin);
      expect(reponse.status, type).toBe(200);
    }
  });
});

describe("nommage des objets", () => {
  const config = configStockageDepuis(
    lireConfig({ ...process.env, DATABASE_URL: process.env["TEST_DATABASE_URL"]! }),
  );

  it("engendre un nom différent à chaque appel", async () => {
    const a = await preparerTeleversement(config, "image/png");
    const b = await preparerTeleversement(config, "image/png");
    // Reprendre le nom fourni par le client permettrait d'écraser une image existante.
    expect(a.cle).not.toBe(b.cle);
  });

  it("range les envois sous un préfixe dédié", async () => {
    const { cle } = await preparerTeleversement(config, "image/webp");
    expect(cle.startsWith("produits/")).toBe(true);
    // Aucun élément du nom ne vient de l'extérieur : rien ne peut viser un autre
    // emplacement du bucket.
    expect(cle).not.toContain("..");
  });

  it("choisit l'extension d'après le type déclaré", async () => {
    expect((await preparerTeleversement(config, "image/png")).cle).toMatch(/\.png$/);
    expect((await preparerTeleversement(config, "image/webp")).cle).toMatch(/\.webp$/);
  });

  it("refuse de signer un type non autorisé", async () => {
    await expect(preparerTeleversement(config, "application/zip")).rejects.toThrow();
  });
});
