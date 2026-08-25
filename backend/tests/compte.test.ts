import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Address, SessionUser } from "../../src/data/types.js";
import { semer } from "../prisma/seed.js";
import { creerContexte, type ContexteTest } from "./contexte.js";

let contexte: ContexteTest;
const urlBase = process.env["TEST_DATABASE_URL"]!;

let cookieAwa: string;
let cookieFatou: string;
let zoneId: string;

async function connecter(email: string): Promise<string> {
  await contexte.app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "motdepasse123", name: "Cliente" }),
  });
  await contexte.prisma.user.update({ where: { email }, data: { emailVerified: true } });
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

async function appeler(
  methode: string,
  chemin: string,
  cookie?: string,
  corps?: unknown,
): Promise<Response> {
  const entetes: Record<string, string> = { "Content-Type": "application/json" };
  if (cookie) entetes["Cookie"] = cookie;
  const avecCorps = corps !== undefined && methode !== "GET" && methode !== "DELETE";
  return contexte.app.request(chemin, {
    method: methode,
    headers: entetes,
    ...(avecCorps ? { body: JSON.stringify(corps) } : {}),
  });
}

/** Adresse valide, complétée par le test. */
function adresse(surcharges: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    label: "Maison",
    fullName: "Awa Diop",
    phone: "+221 77 123 45 67",
    areaId: zoneId,
    address: "Route des Almadies, villa 12",
    ...surcharges,
  };
}

beforeAll(async () => {
  contexte = creerContexte();
}, 60_000);

afterAll(async () => {
  await contexte.fermer();
});

beforeEach(async () => {
  await contexte.prisma.address.deleteMany();
  await contexte.prisma.deliveryArea.deleteMany();
  await contexte.prisma.deliveryRegion.deleteMany();
  await contexte.prisma.session.deleteMany();
  await contexte.prisma.account.deleteMany();
  await contexte.prisma.userRole.deleteMany();
  await contexte.prisma.user.deleteMany();
  await semer(urlBase);
  await contexte.redis.flushdb();

  const zone = await contexte.prisma.deliveryArea.findFirstOrThrow({ where: { name: "Almadies" } });
  zoneId = zone.id;
  cookieAwa = await connecter("awa@test.sn");
  cookieFatou = await connecter("fatou@test.sn");
}, 120_000);

describe("informations personnelles", () => {
  it("enregistre le nom et le téléphone", async () => {
    // Le nom de départ est « Cliente » : le changer prouve que la relecture suit.
    const reponse = await appeler("PATCH", "/api/compte/profil", cookieAwa, {
      name: "Awa Diop",
      phone: "+221 77 555 44 33",
    });
    expect(reponse.status).toBe(200);

    const profil = (await reponse.json()) as SessionUser;
    expect(profil.name).toBe("Awa Diop");
    expect(profil.phone).toBe("+221 77 555 44 33");

    // La session relue porte la modification : les écrans qui pré-remplissent un
    // formulaire doivent voir la nouvelle valeur sans qu'on se reconnecte. Les sessions
    // sont mises en cache hors de la base : écrire le nom directement en table
    // laisserait servir l'ancien jusqu'à expiration, ce que cette relecture attrape.
    const moi = await appeler("GET", "/api/moi", cookieAwa);
    const { utilisateur } = (await moi.json()) as { utilisateur: SessionUser };
    expect(utilisateur.name).toBe("Awa Diop");
    expect(utilisateur.phone).toBe("+221 77 555 44 33");
  });

  it("efface le téléphone quand le champ est vidé", async () => {
    await appeler("PATCH", "/api/compte/profil", cookieAwa, { name: "Awa", phone: "77 111 11 11" });
    const reponse = await appeler("PATCH", "/api/compte/profil", cookieAwa, {
      name: "Awa",
      phone: "",
    });
    expect(((await reponse.json()) as SessionUser).phone).toBeUndefined();
  });

  it("ne laisse pas changer l'adresse e-mail par ce chemin", async () => {
    // Elle identifie le compte et rattache les commandes passées en invitée : une
    // faute de frappe fermerait l'accès.
    await appeler("PATCH", "/api/compte/profil", cookieAwa, {
      name: "Awa",
      email: "autre@test.sn",
    });
    const utilisateur = await contexte.prisma.user.findUniqueOrThrow({
      where: { email: "awa@test.sn" },
    });
    expect(utilisateur.email).toBe("awa@test.sn");
  });

  it("refuse un nom trop court", async () => {
    const reponse = await appeler("PATCH", "/api/compte/profil", cookieAwa, { name: "A" });
    expect(reponse.status).toBe(400);
  });

  it("refuse un visiteur non connecté", async () => {
    expect((await appeler("PATCH", "/api/compte/profil", undefined, { name: "Awa" })).status).toBe(
      401,
    );
  });
});

describe("carnet d'adresses", () => {
  it("enregistre une adresse et la rend avec sa zone", async () => {
    const reponse = await appeler("POST", "/api/compte/adresses", cookieAwa, adresse());
    expect(reponse.status).toBe(201);

    const enregistree = (await reponse.json()) as Address;
    expect(enregistree.label).toBe("Maison");
    expect(enregistree.areaName).toBe("Almadies");
    // Les frais viennent de la zone vivante : c'est ce qui sera facturé.
    expect(enregistree.fee).toBeGreaterThan(0);
    // La première adresse est proposée d'office, sans qu'on ait à la désigner.
    expect(enregistree.isDefault).toBe(true);
  });

  it("ne garde qu'une seule adresse proposée d'office", async () => {
    await appeler("POST", "/api/compte/adresses", cookieAwa, adresse({ label: "Maison" }));
    await appeler(
      "POST",
      "/api/compte/adresses",
      cookieAwa,
      adresse({ label: "Bureau", isDefault: true }),
    );

    const { items } = (await (await appeler("GET", "/api/compte/adresses", cookieAwa)).json()) as {
      items: Address[];
    };
    expect(items.filter((a) => a.isDefault)).toHaveLength(1);
    expect(items.find((a) => a.isDefault)?.label).toBe("Bureau");
    // Celle proposée d'office arrive en tête de liste.
    expect(items[0]!.label).toBe("Bureau");
  });

  it("désigne une autre adresse quand celle par défaut est supprimée", async () => {
    const premiere = (await (
      await appeler("POST", "/api/compte/adresses", cookieAwa, adresse({ label: "Maison" }))
    ).json()) as Address;
    await appeler("POST", "/api/compte/adresses", cookieAwa, adresse({ label: "Bureau" }));

    await appeler("DELETE", `/api/compte/adresses/${premiere.id}`, cookieAwa);

    // Sans reprise, la commande repartirait d'un formulaire vide alors qu'une adresse
    // reste au carnet.
    const { items } = (await (await appeler("GET", "/api/compte/adresses", cookieAwa)).json()) as {
      items: Address[];
    };
    expect(items).toHaveLength(1);
    expect(items[0]!.isDefault).toBe(true);
  });

  it("modifie une adresse existante", async () => {
    const creee = (await (
      await appeler("POST", "/api/compte/adresses", cookieAwa, adresse())
    ).json()) as Address;

    const reponse = await appeler(
      "PUT",
      `/api/compte/adresses/${creee.id}`,
      cookieAwa,
      adresse({ label: "Maison familiale", address: "Sacré-Cœur 3, villa 44" }),
    );
    const modifiee = (await reponse.json()) as Address;
    expect(modifiee.label).toBe("Maison familiale");
    expect(modifiee.address).toBe("Sacré-Cœur 3, villa 44");
  });

  it("NE laisse jamais lire ni toucher le carnet d'une autre cliente", async () => {
    const sienne = (await (
      await appeler("POST", "/api/compte/adresses", cookieAwa, adresse())
    ).json()) as Address;

    // L'identifiant vient de l'URL : s'en remettre à lui seul ouvrirait le carnet de
    // n'importe qui en changeant un caractère.
    const lecture = await appeler("GET", "/api/compte/adresses", cookieFatou);
    expect(((await lecture.json()) as { items: Address[] }).items).toHaveLength(0);

    const modification = await appeler(
      "PUT",
      `/api/compte/adresses/${sienne.id}`,
      cookieFatou,
      adresse({ label: "Détournée" }),
    );
    expect(modification.status).toBe(404);

    const suppression = await appeler("DELETE", `/api/compte/adresses/${sienne.id}`, cookieFatou);
    expect(suppression.status).toBe(404);

    // L'adresse est intacte.
    const apres = await contexte.prisma.address.findUniqueOrThrow({ where: { id: sienne.id } });
    expect(apres.label).toBe("Maison");
  });

  it("répond la même chose pour une adresse inexistante et celle d'une autre", async () => {
    const sienne = (await (
      await appeler("POST", "/api/compte/adresses", cookieAwa, adresse())
    ).json()) as Address;

    const inexistante = await appeler("DELETE", "/api/compte/adresses/inexistante", cookieFatou);
    const autrui = await appeler("DELETE", `/api/compte/adresses/${sienne.id}`, cookieFatou);

    // Distinguer les deux dirait quels identifiants existent.
    expect(inexistante.status).toBe(autrui.status);
    expect(await inexistante.text()).toBe(await autrui.text());
  });

  it("refuse une zone de livraison qui n'existe pas", async () => {
    const reponse = await appeler(
      "POST",
      "/api/compte/adresses",
      cookieAwa,
      adresse({ areaId: "zone-inventee" }),
    );
    expect(reponse.status).toBe(400);
  });

  it("garde l'adresse lisible quand sa zone disparaît du catalogue", async () => {
    const creee = (await (
      await appeler("POST", "/api/compte/adresses", cookieAwa, adresse())
    ).json()) as Address;

    await contexte.prisma.deliveryArea.delete({ where: { id: zoneId } });

    const { items } = (await (await appeler("GET", "/api/compte/adresses", cookieAwa)).json()) as {
      items: Address[];
    };
    const apres = items.find((a) => a.id === creee.id)!;

    // L'adresse survit, mais sans zone ni tarif : elle demande à être revue plutôt
    // que d'annoncer des frais qui n'existent plus.
    expect(apres.address).toBe("Route des Almadies, villa 12");
    expect(apres.areaId).toBeUndefined();
    expect(apres.fee).toBeUndefined();
  });

  it("interdit la mise en cache du carnet", async () => {
    const reponse = await appeler("GET", "/api/compte/adresses", cookieAwa);
    expect(reponse.headers.get("cache-control")).toContain("no-store");
  });

  it("ferme tout le carnet à un visiteur non connecté", async () => {
    expect((await appeler("GET", "/api/compte/adresses")).status).toBe(401);
    expect((await appeler("POST", "/api/compte/adresses", undefined, adresse())).status).toBe(401);
    expect((await appeler("DELETE", "/api/compte/adresses/x")).status).toBe(401);
  });
});
