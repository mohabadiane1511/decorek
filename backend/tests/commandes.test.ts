import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Order } from "../../src/data/types.js";
import { calculerLivraison, calculerRemise } from "../src/commandes.js";
import { semer } from "../prisma/seed.js";
import { creerContexte, type ContexteTest } from "./contexte.js";

let contexte: ContexteTest;
const urlBase = process.env["TEST_DATABASE_URL"]!;

const CLIENT = { email: "acheteuse@test.sn", password: "motdepasse123", name: "Awa Diop" };

type Corps = Record<string, unknown>;

async function commander(corps: Corps, cookie?: string): Promise<Response> {
  const entetes: Record<string, string> = { "Content-Type": "application/json" };
  if (cookie) entetes["Cookie"] = cookie;
  return contexte.app.request("/api/commandes", {
    method: "POST",
    headers: entetes,
    body: JSON.stringify(corps),
  });
}

async function connecter(): Promise<string> {
  await contexte.app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(CLIENT),
  });
  // La connexion exige une adresse confirmée : on la valide directement, le parcours
  // de confirmation étant couvert par les tests d'authentification.
  await contexte.prisma.user.update({
    where: { email: CLIENT.email },
    data: { emailVerified: true },
  });
  const reponse = await contexte.app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: CLIENT.email, password: CLIENT.password }),
  });
  return reponse.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

/** Panier minimal valide, complété par le test. */
async function demande(surcharges: Corps = {}): Promise<Corps> {
  const produit = await contexte.prisma.product.findFirstOrThrow({
    where: { slug: "sous-assiette-solaire-doree" },
  });
  const zone = await contexte.prisma.deliveryArea.findFirstOrThrow({ where: { name: "Almadies" } });
  return {
    customer: { name: "Awa Diop", phone: "+221 77 123 45 67" },
    delivery: { areaId: zone.id, address: "Route des Almadies, villa 12" },
    items: [{ productId: produit.id, quantity: 2 }],
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
  await contexte.prisma.stockMovement.deleteMany();
  await contexte.prisma.promoRedemption.deleteMany();
  await contexte.prisma.orderItem.deleteMany();
  await contexte.prisma.order.deleteMany();
  await contexte.prisma.orderNumberCounter.deleteMany();
  await contexte.prisma.session.deleteMany();
  await contexte.prisma.account.deleteMany();
  await contexte.prisma.userRole.deleteMany();
  await contexte.prisma.user.deleteMany();
  await contexte.prisma.productImage.deleteMany();
  await contexte.prisma.product.deleteMany();
  await contexte.prisma.category.deleteMany();
  await contexte.prisma.promoCode.deleteMany();
  await contexte.prisma.deliveryArea.deleteMany();
  await contexte.prisma.deliveryRegion.deleteMany();
  await contexte.prisma.siteContent.deleteMany();
  await semer(urlBase);
  await contexte.redis.flushdb();
}, 120_000);

describe("calculs monétaires", () => {
  it("arrondit une remise en pourcentage à l'unité", () => {
    // 10 % de 8 505 vaut 850,5 : le franc CFA n'ayant pas de sous-unité, il faut un entier.
    expect(calculerRemise("percent", 10, 8505)).toBe(851);
    expect(calculerRemise("percent", 10, 20000)).toBe(2000);
  });

  it("ne laisse jamais une remise dépasser le sous-total", () => {
    // Sinon le total deviendrait négatif et la contrainte en base rejetterait tout.
    expect(calculerRemise("amount", 5000, 3000)).toBe(3000);
  });

  it("offre la livraison à partir du seuil, la facture juste en dessous", () => {
    expect(calculerLivraison(2500, 100000, 100000)).toBe(0);
    expect(calculerLivraison(2500, 99999, 100000)).toBe(2500);
  });
});

describe("création d'une commande", () => {
  it("recalcule les montants et décrémente le stock", async () => {
    const produitAvant = await contexte.prisma.product.findFirstOrThrow({
      where: { slug: "sous-assiette-solaire-doree" },
    });

    const reponse = await commander(await demande());
    expect(reponse.status).toBe(201);

    const commande = (await reponse.json()) as Order;
    expect(commande.subtotal).toBe(produitAvant.price * 2);
    expect(commande.total).toBe(commande.subtotal - commande.discount + commande.delivery.fee);
    expect(commande.number).toMatch(/^DR-\d{4}-\d{4}$/);
    expect(commande.status).toBe("en_attente");
    expect(commande.paid).toBe(false);

    const produitApres = await contexte.prisma.product.findUniqueOrThrow({
      where: { id: produitAvant.id },
    });
    expect(produitApres.stock).toBe(produitAvant.stock - 2);

    // Le journal doit porter la trace du mouvement, pas seulement le compteur.
    const mouvements = await contexte.prisma.stockMovement.findMany();
    expect(mouvements).toHaveLength(1);
    expect(mouvements[0]!.delta).toBe(-2);
    expect(mouvements[0]!.reason).toBe("commande");
  });

  it("IGNORE les montants envoyés par le client", async () => {
    const produit = await contexte.prisma.product.findFirstOrThrow({
      where: { slug: "sous-assiette-solaire-doree" },
    });

    // Un acheteur malveillant annonce un total dérisoire.
    const reponse = await commander({
      ...(await demande()),
      subtotal: 1,
      total: 1,
      discount: 99999,
      items: [{ productId: produit.id, quantity: 2, price: 1 }],
    });

    expect(reponse.status).toBe(201);
    const commande = (await reponse.json()) as Order;
    // Les prix viennent de la base, jamais du corps de la requête.
    expect(commande.subtotal).toBe(produit.price * 2);
    expect(commande.items[0]!.price).toBe(produit.price);
    expect(commande.total).toBeGreaterThan(1);
  });

  it("recopie nom, prix et image dans la ligne de commande", async () => {
    const reponse = await commander(await demande());
    const commande = (await reponse.json()) as Order;
    expect(commande.items[0]!.name).toBeTruthy();
    expect(commande.items[0]!.image).toMatch(/^\/media\//);
  });

  it("attribue des numéros distincts et croissants", async () => {
    const a = (await (await commander(await demande())).json()) as Order;
    const b = (await (await commander(await demande())).json()) as Order;
    expect(a.number).not.toBe(b.number);
    expect(b.number > a.number).toBe(true);
  });

  it("offre la livraison au-delà du seuil", async () => {
    const cher = await contexte.prisma.product.findFirstOrThrow({
      where: { slug: "chaise-royale-doree" },
    });
    const zone = await contexte.prisma.deliveryArea.findFirstOrThrow({
      where: { name: "Almadies" },
    });

    // 45 000 × 3 = 135 000, au-dessus du seuil de 100 000.
    const reponse = await commander({
      customer: { name: "Awa Diop", phone: "+221 77 123 45 67" },
      delivery: { areaId: zone.id, address: "Route des Almadies, villa 12" },
      items: [{ productId: cher.id, quantity: 3 }],
    });

    const commande = (await reponse.json()) as Order;
    expect(commande.subtotal).toBeGreaterThanOrEqual(100000);
    expect(commande.delivery.fee).toBe(0);
  });
});

describe("stock insuffisant", () => {
  it("refuse une commande dépassant le stock, sans rien écrire", async () => {
    const produit = await contexte.prisma.product.findFirstOrThrow({
      where: { slug: "guirlande-lumineuse-lanternes" },
    });
    const zone = await contexte.prisma.deliveryArea.findFirstOrThrow({
      where: { name: "Almadies" },
    });

    const reponse = await commander({
      customer: { name: "Awa Diop", phone: "+221 77 123 45 67" },
      delivery: { areaId: zone.id, address: "Villa 12" },
      items: [{ productId: produit.id, quantity: produit.stock + 5 }],
    });

    expect(reponse.status).toBe(409);
    const corps = (await reponse.json()) as { error: { message: string } };
    expect(corps.error.message).toMatch(/reste|épuisé/i);

    // Aucune écriture partielle : ni commande, ni mouvement, ni stock entamé.
    expect(await contexte.prisma.order.count()).toBe(0);
    expect(await contexte.prisma.stockMovement.count()).toBe(0);
    const apres = await contexte.prisma.product.findUniqueOrThrow({ where: { id: produit.id } });
    expect(apres.stock).toBe(produit.stock);
  });

  it("ne laisse passer qu'une commande sur le dernier article", async () => {
    const produit = await contexte.prisma.product.findFirstOrThrow({
      where: { slug: "guirlande-lumineuse-lanternes" },
    });
    await contexte.prisma.product.update({ where: { id: produit.id }, data: { stock: 1 } });
    const zone = await contexte.prisma.deliveryArea.findFirstOrThrow({
      where: { name: "Almadies" },
    });

    const corps = {
      customer: { name: "Awa Diop", phone: "+221 77 123 45 67" },
      delivery: { areaId: zone.id, address: "Villa 12" },
      items: [{ productId: produit.id, quantity: 1 }],
    };

    // Deux acheteurs au même instant : sans verrou sur la ligne produit, tous deux
    // liraient « 1 en stock » et la boutique vendrait un article qu'elle n'a pas.
    const [a, b] = await Promise.all([commander(corps), commander(corps)]);
    const statuts = [a.status, b.status].sort();

    expect(statuts).toEqual([201, 409]);
    expect(await contexte.prisma.order.count()).toBe(1);
    const apres = await contexte.prisma.product.findUniqueOrThrow({ where: { id: produit.id } });
    expect(apres.stock).toBe(0);
  });
});

describe("codes promotionnels", () => {
  it("refuse un code à un client non connecté", async () => {
    const reponse = await commander(await demande({ promoCode: "BIENVENUE10" }));
    expect(reponse.status).toBe(403);
  });

  it("applique la remise pour un client connecté et trace l'utilisation", async () => {
    const cookie = await connecter();
    const cher = await contexte.prisma.product.findFirstOrThrow({
      where: { slug: "chaise-royale-doree" },
    });
    const zone = await contexte.prisma.deliveryArea.findFirstOrThrow({
      where: { name: "Almadies" },
    });

    const reponse = await commander(
      {
        customer: { name: "Awa Diop", phone: "+221 77 123 45 67" },
        delivery: { areaId: zone.id, address: "Villa 12" },
        items: [{ productId: cher.id, quantity: 1 }],
        promoCode: "bienvenue10",
      },
      cookie,
    );

    expect(reponse.status).toBe(201);
    const commande = (await reponse.json()) as Order;
    expect(commande.discount).toBe(Math.round(commande.subtotal * 0.1));
    expect(commande.total).toBe(commande.subtotal - commande.discount + commande.delivery.fee);

    // L'usage est une ligne, pas un compteur : on sait qui a utilisé le code.
    const usages = await contexte.prisma.promoRedemption.findMany();
    expect(usages).toHaveLength(1);
    expect(usages[0]!.userId).toBeTruthy();
  });

  it("refuse un code au-delà de sa limite d'utilisation", async () => {
    const cookie = await connecter();
    const promo = await contexte.prisma.promoCode.findFirstOrThrow({
      where: { code: "BIENVENUE10" },
    });
    await contexte.prisma.promoCode.update({ where: { id: promo.id }, data: { maxUses: 1 } });

    const cher = await contexte.prisma.product.findFirstOrThrow({
      where: { slug: "chaise-royale-doree" },
    });
    const zone = await contexte.prisma.deliveryArea.findFirstOrThrow({
      where: { name: "Almadies" },
    });
    const corps = {
      customer: { name: "Awa Diop", phone: "+221 77 123 45 67" },
      delivery: { areaId: zone.id, address: "Villa 12" },
      items: [{ productId: cher.id, quantity: 1 }],
      promoCode: "BIENVENUE10",
    };

    expect((await commander(corps, cookie)).status).toBe(201);
    // Le plafond se compte sur les utilisations réelles, pas sur un compteur qu'on
    // pourrait oublier d'incrémenter.
    const seconde = await commander(corps, cookie);
    expect(seconde.status).toBe(400);
  });

  it("refuse un code sous le montant minimum", async () => {
    const cookie = await connecter();
    // BIENVENUE10 exige 20 000 FCFA ; le panier par défaut vaut 17 000.
    const reponse = await commander(await demande({ promoCode: "BIENVENUE10" }), cookie);
    expect(reponse.status).toBe(400);
    const corps = (await reponse.json()) as { error: { message: string } };
    expect(corps.error.message).toMatch(/à partir de/i);
  });

  it("refuse un code inexistant", async () => {
    const cookie = await connecter();
    const reponse = await commander(await demande({ promoCode: "NEXISTEPAS" }), cookie);
    expect(reponse.status).toBe(400);
  });
});

describe("validation de la demande", () => {
  it("refuse un panier vide", async () => {
    const reponse = await commander(await demande({ items: [] }));
    expect(reponse.status).toBe(400);
  });

  it("refuse une quantité nulle ou négative", async () => {
    const produit = await contexte.prisma.product.findFirstOrThrow({
      where: { slug: "sous-assiette-solaire-doree" },
    });
    const reponse = await commander(
      await demande({ items: [{ productId: produit.id, quantity: 0 }] }),
    );
    expect(reponse.status).toBe(400);
  });

  it("refuse une zone de livraison inconnue", async () => {
    const reponse = await commander(
      await demande({ delivery: { areaId: "zone-inventee", address: "Quelque part" } }),
    );
    expect(reponse.status).toBe(400);
  });

  it("refuse un téléphone manquant", async () => {
    const reponse = await commander(await demande({ customer: { name: "Awa Diop", phone: "" } }));
    expect(reponse.status).toBe(400);
  });
});

describe("historique de la cliente", () => {
  async function mesCommandes(cookie?: string): Promise<Response> {
    const entetes: Record<string, string> = {};
    if (cookie) entetes["Cookie"] = cookie;
    return contexte.app.request("/api/mes-commandes", { headers: entetes });
  }

  it("rend les commandes passées en étant connectée", async () => {
    const cookie = await connecter();
    const passee = (await (await commander(await demande(), cookie)).json()) as Order;

    const reponse = await mesCommandes(cookie);
    expect(reponse.status).toBe(200);
    const { items } = (await reponse.json()) as { items: Order[] };
    expect(items.map((o) => o.number)).toContain(passee.number);
  });

  it("rattache aussi celles passées en invitée avec la même adresse", async () => {
    // Le cas courant : on commande d'abord, on crée son compte ensuite.
    const avant = (await (
      await commander(
        await demande({
          customer: { name: "Awa Diop", phone: "+221 77 123 45 67", email: CLIENT.email },
        }),
      )
    ).json()) as Order;

    const cookie = await connecter();
    const { items } = (await (await mesCommandes(cookie)).json()) as { items: Order[] };
    expect(items.map((o) => o.number)).toContain(avant.number);
  });

  it("ne montre jamais la commande d'une autre personne", async () => {
    const autre = (await (
      await commander(
        await demande({
          customer: { name: "Fatou Sow", phone: "+221 78 000 00 00", email: "fatou@test.sn" },
        }),
      )
    ).json()) as Order;

    const cookie = await connecter();
    const { items } = (await (await mesCommandes(cookie)).json()) as { items: Order[] };
    expect(items.map((o) => o.number)).not.toContain(autre.number);
  });

  it("n'expose pas la note interne de l'équipe", async () => {
    const cookie = await connecter();
    const commande = (await (await commander(await demande(), cookie)).json()) as Order;
    await contexte.prisma.order.update({
      where: { id: commande.id },
      data: { internalNote: "Cliente difficile, exiger un acompte" },
    });

    const brut = await (await mesCommandes(cookie)).text();
    expect(brut).not.toContain("acompte");
    expect(brut).not.toContain("internalNote");
  });

  it("refuse l'accès à qui n'est pas connecté", async () => {
    expect((await mesCommandes()).status).toBe(401);
  });

  it("interdit la mise en cache de la réponse", async () => {
    // Un état gardé en cache annoncerait « en préparation » à une cliente dont le
    // colis est déjà parti.
    const cookie = await connecter();
    expect((await mesCommandes(cookie)).headers.get("cache-control")).toContain("no-store");
  });

  it("rend les commandes de la plus récente à la plus ancienne", async () => {
    const cookie = await connecter();
    await commander(await demande(), cookie);
    await commander(await demande(), cookie);

    const { items } = (await (await mesCommandes(cookie)).json()) as { items: Order[] };
    const dates = items.map((o) => new Date(o.createdAt).getTime());
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
  });
});
