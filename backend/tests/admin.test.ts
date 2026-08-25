import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Order } from "../../src/data/types.js";
import { slugifier } from "../src/routes/admin.js";
import { retientLeStock } from "../src/stock.js";
import { semer } from "../prisma/seed.js";
import { creerContexte, type ContexteTest } from "./contexte.js";

let contexte: ContexteTest;
let cookieAdmin: string;
let cookieClient: string;
const urlBase = process.env["TEST_DATABASE_URL"]!;

async function creerCompte(email: string, admin: boolean): Promise<string> {
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

async function appeler(
  methode: string,
  chemin: string,
  cookie?: string,
  corps?: unknown,
): Promise<Response> {
  const entetes: Record<string, string> = { "Content-Type": "application/json" };
  if (cookie) entetes["Cookie"] = cookie;
  // GET et DELETE n'acceptent pas de corps : l'envoyer quand même ferait échouer la
  // requête avant même d'atteindre le contrôle d'accès qu'on veut éprouver.
  const avecCorps = corps !== undefined && methode !== "GET" && methode !== "DELETE";
  return contexte.app.request(chemin, {
    method: methode,
    headers: entetes,
    ...(avecCorps ? { body: JSON.stringify(corps) } : {}),
  });
}

/** Passe une commande en invité et renvoie la commande créée. */
async function commander(quantite = 2): Promise<Order> {
  const produit = await contexte.prisma.product.findFirstOrThrow({
    where: { slug: "sous-assiette-solaire-doree" },
  });
  const zone = await contexte.prisma.deliveryArea.findFirstOrThrow({ where: { name: "Almadies" } });
  const reponse = await appeler("POST", "/api/commandes", undefined, {
    customer: { name: "Awa Diop", phone: "+221 77 123 45 67" },
    delivery: { areaId: zone.id, address: "Villa 12" },
    items: [{ productId: produit.id, quantity: quantite }],
  });
  return (await reponse.json()) as Order;
}

async function stockDe(slug: string): Promise<number> {
  const p = await contexte.prisma.product.findFirstOrThrow({ where: { slug } });
  return p.stock;
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

  cookieAdmin = await creerCompte("equipe@decorek.sn", true);
  cookieClient = await creerCompte("cliente@test.sn", false);
}, 120_000);

describe("contrôle d'accès", () => {
  const routes: [string, string][] = [
    ["GET", "/api/admin/commandes"],
    ["GET", "/api/admin/promos"],
    ["POST", "/api/admin/produits"],
    ["POST", "/api/admin/categories"],
    ["PUT", "/api/admin/contenu"],
    ["PUT", "/api/admin/livraison"],
  ];

  it("refuse un visiteur non connecté sur toutes les routes", async () => {
    for (const [methode, chemin] of routes) {
      const reponse = await appeler(methode, chemin, undefined, {});
      expect(reponse.status, `${methode} ${chemin}`).toBe(401);
    }
  });

  it("refuse un client connecté sans rôle sur toutes les routes", async () => {
    for (const [methode, chemin] of routes) {
      const reponse = await appeler(methode, chemin, cookieClient, {});
      expect(reponse.status, `${methode} ${chemin}`).toBe(403);
    }
  });
});

describe("cycle de vie du stock", () => {
  it("rend le stock à l'annulation", async () => {
    const avant = await stockDe("sous-assiette-solaire-doree");
    const commande = await commander(2);
    expect(await stockDe("sous-assiette-solaire-doree")).toBe(avant - 2);

    await appeler("PATCH", `/api/admin/commandes/${commande.id}`, cookieAdmin, {
      status: "annulee",
    });
    expect(await stockDe("sous-assiette-solaire-doree")).toBe(avant);
  });

  it("REPREND le stock si une commande annulée repart", async () => {
    // Le trou de la maquette : elle rendait les articles à l'annulation mais ne les
    // reprenait jamais si la commande redevenait active. Le stock gonflait à chaque
    // aller-retour.
    const avant = await stockDe("sous-assiette-solaire-doree");
    const commande = await commander(2);

    await appeler("PATCH", `/api/admin/commandes/${commande.id}`, cookieAdmin, {
      status: "annulee",
    });
    expect(await stockDe("sous-assiette-solaire-doree")).toBe(avant);

    await appeler("PATCH", `/api/admin/commandes/${commande.id}`, cookieAdmin, {
      status: "confirmee",
    });
    expect(await stockDe("sous-assiette-solaire-doree")).toBe(avant - 2);
  });

  it("ne crédite pas deux fois une annulation répétée", async () => {
    const avant = await stockDe("sous-assiette-solaire-doree");
    const commande = await commander(2);

    await appeler("PATCH", `/api/admin/commandes/${commande.id}`, cookieAdmin, {
      status: "annulee",
    });
    // Deuxième passage au même statut : l'écart à combler est nul, rien ne bouge.
    await appeler("PATCH", `/api/admin/commandes/${commande.id}`, cookieAdmin, {
      status: "annulee",
    });
    await appeler("PATCH", `/api/admin/commandes/${commande.id}`, cookieAdmin, {
      status: "non_honoree",
    });

    expect(await stockDe("sous-assiette-solaire-doree")).toBe(avant);
  });

  it("reste cohérent après plusieurs allers-retours", async () => {
    const avant = await stockDe("sous-assiette-solaire-doree");
    const commande = await commander(3);

    for (const statut of ["annulee", "confirmee", "non_honoree", "en_livraison", "annulee"]) {
      await appeler("PATCH", `/api/admin/commandes/${commande.id}`, cookieAdmin, {
        status: statut,
      });
    }
    expect(await stockDe("sous-assiette-solaire-doree")).toBe(avant);

    await appeler("PATCH", `/api/admin/commandes/${commande.id}`, cookieAdmin, {
      status: "livree",
    });
    expect(await stockDe("sous-assiette-solaire-doree")).toBe(avant - 3);
  });

  it("laisse une trace de chaque mouvement", async () => {
    const commande = await commander(2);
    await appeler("PATCH", `/api/admin/commandes/${commande.id}`, cookieAdmin, {
      status: "annulee",
    });

    const mouvements = await contexte.prisma.stockMovement.findMany({
      where: { orderId: commande.id },
      orderBy: { createdAt: "asc" },
    });
    expect(mouvements).toHaveLength(2);
    expect(mouvements[0]!.delta).toBe(-2);
    expect(mouvements[1]!.delta).toBe(2);
    // La somme revient à zéro : les articles sont bien revenus en rayon.
    expect(mouvements.reduce((s, m) => s + m.delta, 0)).toBe(0);
  });

  it("sait quels statuts retiennent du stock", () => {
    expect(retientLeStock("en_attente")).toBe(true);
    expect(retientLeStock("livree")).toBe(true);
    expect(retientLeStock("annulee")).toBe(false);
    expect(retientLeStock("non_honoree")).toBe(false);
  });
});

describe("commandes", () => {
  it("enregistre l'encaissement et la note interne", async () => {
    const commande = await commander();
    const reponse = await appeler("PATCH", `/api/admin/commandes/${commande.id}`, cookieAdmin, {
      paid: true,
      internalNote: "Rappeler avant 18h",
    });
    expect(reponse.status).toBe(200);

    const enBase = await contexte.prisma.order.findUniqueOrThrow({ where: { id: commande.id } });
    expect(enBase.paid).toBe(true);
    expect(enBase.internalNote).toBe("Rappeler avant 18h");
  });

  it("renvoie les commandes au format attendu par l'interface", async () => {
    await commander(2);

    const reponse = await appeler("GET", "/api/admin/commandes", cookieAdmin);
    const { items } = (await reponse.json()) as { items: Order[] };
    const commande = items[0]!;

    // La base range ces champs à plat (customerName, deliveryFee) ; l'interface les
    // lit groupés. Renvoyer la forme brute faisait planter l'onglet Commandes dès
    // qu'une commande existait — un statut 200 ne suffit donc pas à valider la route.
    expect(commande.customer.name).toBe("Awa Diop");
    expect(commande.customer.phone).toBeTruthy();
    expect(commande.delivery.address).toBeTruthy();
    expect(commande.delivery.areaName).toBe("Almadies");
    expect(typeof commande.delivery.fee).toBe("number");
    expect(commande.items[0]!.name).toBeTruthy();
    expect(typeof commande.createdAt).toBe("string");
  });

  it("expose la note interne au back-office, jamais au suivi client", async () => {
    const commande = await commander(1);
    await appeler("PATCH", `/api/admin/commandes/${commande.id}`, cookieAdmin, {
      internalNote: "Rappeler avant 18h",
    });

    const admin = await appeler("GET", "/api/admin/commandes", cookieAdmin);
    const { items } = (await admin.json()) as { items: Order[] };
    expect(items[0]!.internalNote).toBe("Rappeler avant 18h");

    const suivi = await appeler("POST", "/api/commandes/suivi", undefined, {
      numero: commande.number,
      telephone: "+221 77 123 45 67",
    });
    expect(await suivi.text()).not.toContain("Rappeler avant 18h");
  });

  it("filtre par statut", async () => {
    const a = await commander(1);
    await commander(1);
    await appeler("PATCH", `/api/admin/commandes/${a.id}`, cookieAdmin, { status: "livree" });

    const reponse = await appeler("GET", "/api/admin/commandes?statut=livree", cookieAdmin);
    const { items } = (await reponse.json()) as { items: { id: string }[] };
    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe(a.id);
  });
});

describe("produits", () => {
  it("génère un identifiant d'URL à partir du nom", () => {
    expect(slugifier("Sous-assiette solaire dorée")).toBe("sous-assiette-solaire-doree");
    expect(slugifier("Chaise  royale — DORÉE !")).toBe("chaise-royale-doree");
  });

  it("crée un produit et le rend visible au catalogue public", async () => {
    const categorie = await contexte.prisma.category.findFirstOrThrow();
    const reponse = await appeler("POST", "/api/admin/produits", cookieAdmin, {
      name: "Théière ciselée",
      categoryId: categorie.id,
      price: 15000,
      stock: 7,
      lowStockThreshold: 2,
      description: "Théière en métal ciselé.",
      featured: false,
      images: ["/media/sousassiettes.jpg"],
    });
    expect(reponse.status).toBe(201);

    // Le cache public doit refléter la création sans attendre l'expiration.
    const publique = await contexte.app.request("/api/produits/theiere-ciselee");
    expect(publique.status).toBe(200);
  });

  it("évite les doublons d'adresse", async () => {
    const categorie = await contexte.prisma.category.findFirstOrThrow();
    const donnees = {
      name: "Sous-assiette solaire dorée",
      categoryId: categorie.id,
      price: 9000,
      stock: 1,
      lowStockThreshold: 1,
      description: "",
      featured: false,
      images: [],
    };
    const reponse = await appeler("POST", "/api/admin/produits", cookieAdmin, donnees);
    expect(reponse.status).toBe(201);

    const cree = (await reponse.json()) as { slug: string };
    // Le slug du seed est déjà pris : un suffixe est ajouté plutôt que d'échouer.
    expect(cree.slug).toBe("sous-assiette-solaire-doree-1");
  });

  it("trace une correction manuelle de stock", async () => {
    const produit = await contexte.prisma.product.findFirstOrThrow({
      where: { slug: "sous-assiette-solaire-doree" },
    });
    await appeler("PUT", `/api/admin/produits/${produit.id}`, cookieAdmin, {
      name: produit.name,
      categoryId: produit.categoryId,
      price: produit.price,
      stock: produit.stock + 10,
      lowStockThreshold: produit.lowStockThreshold,
      description: produit.description,
      featured: produit.featured,
      images: ["/media/sousassiettes.jpg"],
    });

    const correction = await contexte.prisma.stockMovement.findFirst({
      where: { productId: produit.id, reason: "correction" },
    });
    expect(correction?.delta).toBe(10);
  });

  it("refuse de supprimer un produit déjà commandé", async () => {
    const commande = await commander(1);
    const productId = commande.items[0]!.productId;

    const reponse = await appeler("DELETE", `/api/admin/produits/${productId}`, cookieAdmin);
    // Supprimer romprait le lien depuis l'historique des ventes.
    expect(reponse.status).toBe(409);
  });

  it("répercute une modification de prix sur le catalogue public", async () => {
    const produit = await contexte.prisma.product.findFirstOrThrow({
      where: { slug: "chaise-royale-doree" },
    });
    // On remplit le cache avant de modifier.
    await contexte.app.request("/api/produits/chaise-royale-doree");

    await appeler("PUT", `/api/admin/produits/${produit.id}`, cookieAdmin, {
      name: produit.name,
      categoryId: produit.categoryId,
      price: 99000,
      stock: produit.stock,
      lowStockThreshold: produit.lowStockThreshold,
      description: produit.description,
      featured: produit.featured,
      images: ["/media/chaiseroyale.png"],
    });

    const publique = await contexte.app.request("/api/produits/chaise-royale-doree");
    expect(((await publique.json()) as { price: number }).price).toBe(99000);
  });
});

describe("catégories", () => {
  it("refuse de supprimer une catégorie qui contient des articles", async () => {
    const categorie = await contexte.prisma.category.findFirstOrThrow({
      where: { slug: "art-de-la-table" },
    });
    const reponse = await appeler("DELETE", `/api/admin/categories/${categorie.id}`, cookieAdmin);
    expect(reponse.status).toBe(409);
  });

  it("supprime une catégorie vide", async () => {
    const creation = await appeler("POST", "/api/admin/categories", cookieAdmin, {
      name: "Éphémère",
      description: "",
    });
    const { id } = (await creation.json()) as { id: string };
    expect((await appeler("DELETE", `/api/admin/categories/${id}`, cookieAdmin)).status).toBe(200);
  });
});

describe("promotions", () => {
  it("compte les utilisations réelles plutôt qu'un compteur", async () => {
    const reponse = await appeler("GET", "/api/admin/promos", cookieAdmin);
    const { items } = (await reponse.json()) as { items: { code: string; uses: number }[] };
    const bienvenue = items.find((p) => p.code === "BIENVENUE10");
    // Le seed ne crée aucune utilisation : le compteur doit donc être à zéro, là où
    // la maquette affichait 34 sans qu'aucune commande n'existe.
    expect(bienvenue?.uses).toBe(0);
  });

  it("enregistre un code en majuscules", async () => {
    const reponse = await appeler("POST", "/api/admin/promos", cookieAdmin, {
      code: "rentree20",
      type: "percent",
      value: 20,
      minAmount: 10000,
      startsAt: "2026-01-01",
      endsAt: "2026-12-31",
      maxUses: 50,
      active: true,
    });
    expect(reponse.status).toBe(201);
    expect(((await reponse.json()) as { code: string }).code).toBe("RENTREE20");
  });
});

describe("contenu et livraison", () => {
  it("met à jour le contenu et le répercute publiquement", async () => {
    await contexte.app.request("/api/contenu");

    const reponse = await appeler("PUT", "/api/admin/contenu", cookieAdmin, {
      bannerTitle: "Nouvelle bannière",
      bannerSubtitle: "Sous-titre",
      bannerCta: "Découvrir",
      whatsapp: "221770000000",
      phone: "+221 77 000 00 00",
      email: "equipe@decorek.sn",
      address: "Dakar",
      freeShippingFrom: 75000,
      pages: { contact: "c", livraison: "l", apropos: "a", cgv: "g" },
    });
    expect(reponse.status).toBe(200);

    const publique = await contexte.app.request("/api/contenu");
    const contenu = (await publique.json()) as { bannerTitle: string; freeShippingFrom: number };
    expect(contenu.bannerTitle).toBe("Nouvelle bannière");
    expect(contenu.freeShippingFrom).toBe(75000);
  });

  it("enregistre les réseaux sociaux et tolère leur absence", async () => {
    const base = {
      bannerTitle: "Titre",
      bannerSubtitle: "",
      bannerCta: "Voir",
      whatsapp: "221770000000",
      phone: "+221 77 000 00 00",
      email: "equipe@decorek.sn",
      address: "Dakar",
      freeShippingFrom: 100000,
      pages: { contact: "", livraison: "", apropos: "", cgv: "" },
    };

    // Sans les champs : accepté, les réseaux restent vides. Les exiger ferait échouer
    // une requête émise par une version antérieure du front.
    expect((await appeler("PUT", "/api/admin/contenu", cookieAdmin, base)).status).toBe(200);

    const avec = await appeler("PUT", "/api/admin/contenu", cookieAdmin, {
      ...base,
      facebook: "https://facebook.com/decorek",
      instagram: "https://instagram.com/decorek",
    });
    expect(avec.status).toBe(200);

    const publique = await contexte.app.request("/api/contenu");
    const contenu = (await publique.json()) as { facebook: string; tiktok: string };
    expect(contenu.facebook).toBe("https://facebook.com/decorek");
    expect(contenu.tiktok).toBe("");
  });

  it("ajoute une zone dont l'identifiant vient du navigateur", async () => {
    // Le formulaire attribue un identifiant local aux nouvelles zones avant de les
    // envoyer. Cet identifiant n'existe pas en base : le traiter comme une mise à
    // jour fait échouer toute la transaction, et l'ajout est perdu sans que rien ne
    // le signale.
    const avant = await contexte.prisma.deliveryRegion.findFirstOrThrow({
      where: { name: "Dakar" },
      include: { areas: true },
    });

    const reponse = await appeler("PUT", "/api/admin/livraison", cookieAdmin, {
      regions: [
        {
          id: avant.id,
          name: avant.name,
          areas: [
            ...avant.areas.map((a) => ({ id: a.id, name: a.name, fee: a.fee })),
            { id: "zoneabc123", name: "Sacré-Cœur", fee: 2000 },
          ],
        },
      ],
    });

    expect(reponse.status).toBe(200);

    const apres = await contexte.prisma.deliveryArea.findFirst({
      where: { name: "Sacré-Cœur" },
    });
    expect(apres, "la zone doit être créée malgré son identifiant inconnu").not.toBeNull();
    expect(apres?.fee).toBe(2000);
  });

  it("remplace les zones de livraison", async () => {
    const reponse = await appeler("PUT", "/api/admin/livraison", cookieAdmin, {
      regions: [{ name: "Dakar", areas: [{ name: "Plateau", fee: 1500 }] }],
    });
    expect(reponse.status).toBe(200);

    const publique = await contexte.app.request("/api/livraison");
    const { items } = (await publique.json()) as {
      items: { name: string; areas: { name: string; fee: number }[] }[];
    };
    expect(items).toHaveLength(1);
    expect(items[0]!.areas[0]!.fee).toBe(1500);
  });
});
