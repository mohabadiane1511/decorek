import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { creerContexte, type ContexteTest } from "./contexte.js";

let contexte: ContexteTest;

const CLIENT = { email: "client@test.sn", password: "motdepasse123", name: "Awa Diop" };
const ADMIN = { email: "admin@decorek.sn", password: "motdepasse123", name: "Administration" };
// L'adresse qui ouvrait le back-office dans la maquette : elle commence par « admin »
// mais n'a aucun rôle en base.
const IMPOSTEUR = { email: "adminfake@test.sn", password: "motdepasse123", name: "Imposteur" };

async function inscrire(compte: typeof CLIENT): Promise<Response> {
  return contexte.app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(compte),
  });
}

/**
 * Marque l'adresse comme confirmée, sans passer par le lien reçu par e-mail.
 * La connexion l'exige désormais ; suivre le lien dans chaque test n'apporterait rien
 * de plus que ce que vérifie le test dédié.
 */
async function confirmerAdresse(email: string): Promise<void> {
  await contexte.prisma.user.update({ where: { email }, data: { emailVerified: true } });
}

async function connecter(compte: { email: string; password: string }): Promise<Response> {
  return contexte.app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: compte.email, password: compte.password }),
  });
}

function cookies(reponse: Response): string {
  return reponse.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
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
});

describe("inscription et connexion", () => {
  it("crée un compte puis ouvre une session", async () => {
    expect((await inscrire(CLIENT)).status).toBe(200);
    await confirmerAdresse(CLIENT.email);

    const reponse = await connecter(CLIENT);
    expect(reponse.status).toBe(200);
    expect(cookies(reponse)).toMatch(/session/i);
  });

  it("ne stocke jamais le mot de passe en clair", async () => {
    await inscrire(CLIENT);
    const compte = await contexte.prisma.account.findFirst();
    expect(compte?.password).toBeTruthy();
    expect(compte?.password).not.toContain(CLIENT.password);
  });

  it("refuse la connexion tant que l'adresse n'est pas confirmée", async () => {
    expect((await inscrire(CLIENT)).status).toBe(200);

    // Sans cette exigence, n'importe qui ouvrirait un compte au nom d'un tiers, et
    // rien ne garantirait que la confirmation de commande arrive à destination.
    const reponse = await connecter(CLIENT);
    expect(reponse.status).toBeGreaterThanOrEqual(400);

    await confirmerAdresse(CLIENT.email);
    expect((await connecter(CLIENT)).status).toBe(200);
  });

  it("refuse un mauvais mot de passe", async () => {
    await inscrire(CLIENT);
    const reponse = await connecter({ email: CLIENT.email, password: "mauvais-mot-de-passe" });
    expect(reponse.status).toBeGreaterThanOrEqual(400);
  });

  it("refuse un mot de passe trop court", async () => {
    const reponse = await inscrire({ ...CLIENT, password: "court" });
    expect(reponse.status).toBeGreaterThanOrEqual(400);
  });

  it("ne crée jamais deux comptes pour la même adresse", async () => {
    expect((await inscrire(CLIENT)).status).toBe(200);
    await inscrire(CLIENT);

    // La seconde tentative peut répondre 200 sans rien créer : c'est délibéré côté
    // Better Auth, et c'est souhaitable. Répondre « cette adresse existe déjà »
    // permettrait à un inconnu de savoir qui est client de la boutique. Ce qui compte
    // est donc l'état de la base, pas le code renvoyé.
    expect(await contexte.prisma.user.count({ where: { email: CLIENT.email } })).toBe(1);
  });
});

describe("session", () => {
  it("expose l'utilisateur connecté", async () => {
    await inscrire(CLIENT);
    await confirmerAdresse(CLIENT.email);
    const session = cookies(await connecter(CLIENT));

    const reponse = await contexte.app.request("/api/moi", { headers: { Cookie: session } });
    const corps = (await reponse.json()) as {
      utilisateur: { email: string; isAdmin: boolean } | null;
    };
    expect(corps.utilisateur?.email).toBe(CLIENT.email);
    expect(corps.utilisateur?.isAdmin).toBe(false);
  });

  it("ne renvoie personne sans cookie", async () => {
    const reponse = await contexte.app.request("/api/moi");
    expect((await reponse.json()) as unknown).toEqual({ utilisateur: null });
  });

  it("invalide le cookie après déconnexion", async () => {
    await inscrire(CLIENT);
    await confirmerAdresse(CLIENT.email);
    const session = cookies(await connecter(CLIENT));

    await contexte.app.request("/api/auth/sign-out", {
      method: "POST",
      headers: { Cookie: session, "Content-Type": "application/json" },
    });

    // La session vit dans Redis : la révocation doit prendre effet tout de suite,
    // sans attendre l'expiration.
    const reponse = await contexte.app.request("/api/moi", { headers: { Cookie: session } });
    const corps = (await reponse.json()) as { utilisateur: unknown };
    expect(corps.utilisateur).toBeNull();
  });

  it("rejette un cookie forgé", async () => {
    const reponse = await contexte.app.request("/api/moi", {
      headers: { Cookie: "better-auth.session_token=jeton-inventé-de-toutes-pièces" },
    });
    const corps = (await reponse.json()) as { utilisateur: unknown };
    expect(corps.utilisateur).toBeNull();
  });
});

describe("contrôle d'accès à l'administration", () => {
  it("refuse un visiteur non connecté", async () => {
    const reponse = await contexte.app.request("/api/admin/verification");
    expect(reponse.status).toBe(401);
    const corps = (await reponse.json()) as { error: { code: string } };
    expect(corps.error.code).toBe("NON_AUTHENTIFIE");
  });

  it("refuse un client connecté sans rôle", async () => {
    await inscrire(CLIENT);
    await confirmerAdresse(CLIENT.email);
    const session = cookies(await connecter(CLIENT));

    const reponse = await contexte.app.request("/api/admin/verification", {
      headers: { Cookie: session },
    });
    expect(reponse.status).toBe(403);
    const corps = (await reponse.json()) as { error: { code: string } };
    expect(corps.error.code).toBe("INTERDIT");
  });

  it("REFUSE une adresse commençant par « admin » mais sans rôle", async () => {
    // La faille de la maquette : toute adresse commençant par « admin » ouvrait le
    // back-office. Ce test existe pour qu'elle ne puisse pas revenir.
    await inscrire(IMPOSTEUR);
    await confirmerAdresse(IMPOSTEUR.email);
    const session = cookies(await connecter(IMPOSTEUR));

    const reponse = await contexte.app.request("/api/admin/verification", {
      headers: { Cookie: session },
    });
    expect(reponse.status, "une adresse ne doit jamais valoir un rôle").toBe(403);
  });

  it("accepte un compte porteur du rôle admin", async () => {
    await inscrire(ADMIN);
    const utilisateur = await contexte.prisma.user.findUniqueOrThrow({
      where: { email: ADMIN.email },
    });
    await contexte.prisma.userRole.create({ data: { userId: utilisateur.id, role: "admin" } });

    await confirmerAdresse(ADMIN.email);
    const session = cookies(await connecter(ADMIN));
    const reponse = await contexte.app.request("/api/admin/verification", {
      headers: { Cookie: session },
    });
    expect(reponse.status).toBe(200);
  });

  it("applique le retrait d'un rôle sans attendre la fin de la session", async () => {
    await inscrire(ADMIN);
    const utilisateur = await contexte.prisma.user.findUniqueOrThrow({
      where: { email: ADMIN.email },
    });
    const role = await contexte.prisma.userRole.create({
      data: { userId: utilisateur.id, role: "admin" },
    });
    await confirmerAdresse(ADMIN.email);
    const session = cookies(await connecter(ADMIN));
    expect(
      (await contexte.app.request("/api/admin/verification", { headers: { Cookie: session } }))
        .status,
    ).toBe(200);

    await contexte.prisma.userRole.delete({ where: { id: role.id } });

    // Le rôle est relu en base à chaque requête, jamais porté par le cookie : révoquer
    // un accès doit être immédiat.
    expect(
      (await contexte.app.request("/api/admin/verification", { headers: { Cookie: session } }))
        .status,
    ).toBe(403);
  });
});

describe("protection contre le bourrinage", () => {
  it("finit par répondre 429 sur les tentatives de connexion", async () => {
    await inscrire(CLIENT);

    // Au-delà du plafond de connexion (20 par minute et par adresse).
    const statuts: number[] = [];
    for (let i = 0; i < 26; i += 1) {
      const reponse = await connecter({ email: CLIENT.email, password: "mauvais" });
      statuts.push(reponse.status);
    }

    // Sans plafond, essayer des mots de passe en masse ne coûterait rien à l'attaquant.
    expect(statuts.filter((s) => s === 429).length).toBeGreaterThan(0);
  }, 60_000);
});
