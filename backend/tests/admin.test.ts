import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import type { Order } from "../../src/data/types.js";
import { lirePagination, slugifier } from "../src/routes/admin.js";
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

describe("pagination et recherche du back-office", () => {
  it("lit des paramètres aberrants sans échouer", () => {
    // Un « page=0 » ou « parPage=abc » n'a rien à faire corriger par l'équipe : on
    // retombe sur les valeurs par défaut plutôt que de renvoyer une erreur.
    expect(lirePagination({ page: "0", parPage: "abc" })).toEqual({
      q: undefined,
      page: 1,
      parPage: 20,
    });
    // Le plafond protège la base d'une demande démesurée.
    expect(lirePagination({ parPage: "5000" }).parPage).toBe(100);
    // Une recherche vide ne doit pas devenir un filtre sur la chaîne vide.
    expect(lirePagination({ q: "   " }).q).toBeUndefined();
    expect(lirePagination({ q: "  vase " }).q).toBe("vase");
  });

  it("découpe le catalogue en pages et annonce le total", async () => {
    const premiere = await appeler("GET", "/api/admin/produits?parPage=3", cookieAdmin);
    expect(premiere.status).toBe(200);
    const page1 = (await premiere.json()) as { items: unknown[]; total: number; pages: number };
    expect(page1.items).toHaveLength(3);
    expect(page1.total).toBe(8);
    expect(page1.pages).toBe(3);

    const troisieme = await appeler("GET", "/api/admin/produits?parPage=3&page=3", cookieAdmin);
    const page3 = (await troisieme.json()) as { items: { id: string }[] };
    expect(page3.items).toHaveLength(2);

    // Aucun article ne doit apparaître sur deux pages, ni manquer à l'appel.
    const deuxieme = await appeler("GET", "/api/admin/produits?parPage=3&page=2", cookieAdmin);
    const page2 = (await deuxieme.json()) as { items: { id: string }[] };
    const ids = [...(page1.items as { id: string }[]), ...page2.items, ...page3.items].map(
      (p) => p.id,
    );
    expect(new Set(ids).size).toBe(8);
  });

  it("montre les articles au-delà du 48e, que l'ancien écran perdait", async () => {
    // Le back-office demandait 48 articles et l'API n'en servait pas davantage : au
    // 49e produit, des articles existants devenaient impossibles à modifier.
    const categorie = await contexte.prisma.category.findFirstOrThrow();
    for (let i = 0; i < 45; i += 1) {
      await contexte.prisma.product.create({
        data: {
          slug: `article-${i}`,
          name: `Article ${i}`,
          categoryId: categorie.id,
          price: 1000,
          stock: 1,
          lowStockThreshold: 1,
          description: "",
        },
      });
    }

    const reponse = await appeler("GET", "/api/admin/produits?parPage=100", cookieAdmin);
    const { total, items } = (await reponse.json()) as { total: number; items: unknown[] };
    expect(total).toBe(53);
    expect(items).toHaveLength(53);
  });

  it("retrouve un article par son nom, sans souci de casse", async () => {
    const reponse = await appeler("GET", "/api/admin/produits?q=CHAISE", cookieAdmin);
    const { items } = (await reponse.json()) as { items: { name: string }[] };
    expect(items).toHaveLength(1);
    expect(items[0]!.name).toContain("Chaise");
  });

  it("refuse la liste des produits à qui n'est pas administrateur", async () => {
    expect((await appeler("GET", "/api/admin/produits")).status).toBe(401);
    expect((await appeler("GET", "/api/admin/produits", cookieClient)).status).toBe(403);
  });

  it("retrouve une commande par numéro, par nom et par téléphone", async () => {
    const commande = await commander();

    for (const terme of [commande.number, "Awa", "77 123"]) {
      const reponse = await appeler(
        "GET",
        `/api/admin/commandes?q=${encodeURIComponent(terme)}`,
        cookieAdmin,
      );
      const { items } = (await reponse.json()) as { items: { number: string }[] };
      expect(
        items.map((o) => o.number),
        `recherche « ${terme} »`,
      ).toContain(commande.number);
    }
  });

  it("combine le filtre par statut et la recherche", async () => {
    const commande = await commander();
    await contexte.prisma.order.update({
      where: { id: commande.id },
      data: { status: "livree" },
    });

    const correspond = await appeler(
      "GET",
      `/api/admin/commandes?statut=livree&q=${encodeURIComponent(commande.number)}`,
      cookieAdmin,
    );
    expect(((await correspond.json()) as { total: number }).total).toBe(1);

    // Le même numéro, mais dans un autre statut : la commande ne doit pas ressortir.
    const exclut = await appeler(
      "GET",
      `/api/admin/commandes?statut=annulee&q=${encodeURIComponent(commande.number)}`,
      cookieAdmin,
    );
    expect(((await exclut.json()) as { total: number }).total).toBe(0);
  });
});

describe("statistiques du tableau de bord", () => {
  it("calcule sur toute la base, pas sur les commandes affichées", async () => {
    // Le tableau de bord additionnait les commandes chargées par le navigateur, au
    // plus 200 : au-delà, le chiffre d'affaires était silencieusement tronqué.
    const commandes = [];
    for (let i = 0; i < 5; i += 1) commandes.push(await commander(1));

    const reponse = await appeler("GET", "/api/admin/statistiques", cookieAdmin);
    expect(reponse.status).toBe(200);
    const stats = (await reponse.json()) as {
      chiffreAffaires: number;
      encaisse: number;
      commandes: number;
      valides: number;
      stockBas: number;
      meilleurs: { name: string; quantite: number }[];
      serie: { jour: string; total: number }[];
    };

    const attendu = commandes.reduce((s, o) => s + o.total, 0);
    expect(stats.chiffreAffaires).toBe(attendu);
    expect(stats.commandes).toBe(5);
    expect(stats.valides).toBe(5);
    // Rien n'est encaissé tant que la livraison n'a pas eu lieu.
    expect(stats.encaisse).toBe(0);
    expect(stats.serie.reduce((s, j) => s + j.total, 0)).toBe(attendu);
    expect(stats.meilleurs[0]?.quantite).toBe(5);
  });

  it("exclut du chiffre d'affaires ce qui n'a rien rapporté", async () => {
    const gardee = await commander(1);
    const annulee = await commander(1);
    await contexte.prisma.order.update({
      where: { id: annulee.id },
      data: { status: "annulee" },
    });

    const stats = (await (await appeler("GET", "/api/admin/statistiques", cookieAdmin)).json()) as {
      chiffreAffaires: number;
      commandes: number;
      valides: number;
    };

    // La commande annulée reste comptée comme commande, jamais comme recette.
    expect(stats.chiffreAffaires).toBe(gardee.total);
    expect(stats.commandes).toBe(2);
    expect(stats.valides).toBe(1);
  });

  it("compte le stock bas sur tout le catalogue", async () => {
    const categorie = await contexte.prisma.category.findFirstOrThrow();
    await contexte.prisma.product.create({
      data: {
        slug: "article-a-reassortir",
        name: "Article à réassortir",
        categoryId: categorie.id,
        price: 1000,
        stock: 1,
        lowStockThreshold: 5,
        description: "",
      },
    });

    const stats = (await (await appeler("GET", "/api/admin/statistiques", cookieAdmin)).json()) as {
      stockBas: number;
    };
    expect(stats.stockBas).toBeGreaterThanOrEqual(1);
  });

  it("ne retient que la période demandée", async () => {
    const ancienne = await commander(1);
    // Reculée de 60 jours : hors de la fenêtre de 30 jours par défaut.
    await contexte.prisma.order.update({
      where: { id: ancienne.id },
      data: { createdAt: new Date(Date.now() - 60 * 86_400_000) },
    });

    const surTrenteJours = (await (
      await appeler("GET", "/api/admin/statistiques?jours=30", cookieAdmin)
    ).json()) as { commandes: number };
    expect(surTrenteJours.commandes).toBe(0);

    const surUnAn = (await (
      await appeler("GET", "/api/admin/statistiques?jours=365", cookieAdmin)
    ).json()) as { commandes: number };
    expect(surUnAn.commandes).toBe(1);
  });

  it("refuse les statistiques à qui n'est pas administrateur", async () => {
    expect((await appeler("GET", "/api/admin/statistiques")).status).toBe(401);
    expect((await appeler("GET", "/api/admin/statistiques", cookieClient)).status).toBe(403);
  });
});

describe("références d'articles", () => {
  it("attribue une référence à un article qui n'en propose pas", async () => {
    const categorie = await contexte.prisma.category.findFirstOrThrow();
    const reponse = await appeler("POST", "/api/admin/produits", cookieAdmin, {
      name: "Photophore ambré",
      categoryId: categorie.id,
      price: 12000,
      stock: 3,
      lowStockThreshold: 1,
      description: "",
      featured: false,
      images: [],
    });
    expect(reponse.status).toBe(201);
    const { sku } = (await reponse.json()) as { sku: string };
    expect(sku).toMatch(/^DR-\d{4}$/);
  });

  it("ne réattribue jamais une référence libérée par une suppression", async () => {
    // Déduire la référence du nombre d'articles redonnerait celle d'un produit
    // supprimé : deux exports successifs désigneraient alors des articles différents
    // sous le même code.
    const categorie = await contexte.prisma.category.findFirstOrThrow();
    const creer = (nom: string) =>
      appeler("POST", "/api/admin/produits", cookieAdmin, {
        name: nom,
        categoryId: categorie.id,
        price: 1000,
        stock: 1,
        lowStockThreshold: 1,
        description: "",
        featured: false,
        images: [],
      });

    const premier = (await (await creer("Premier")).json()) as { id: string; sku: string };
    await appeler("DELETE", `/api/admin/produits/${premier.id}`, cookieAdmin);
    const second = (await (await creer("Second")).json()) as { sku: string };

    expect(second.sku).not.toBe(premier.sku);
  });

  it("accepte une référence choisie par l'équipe", async () => {
    const categorie = await contexte.prisma.category.findFirstOrThrow();
    const reponse = await appeler("POST", "/api/admin/produits", cookieAdmin, {
      name: "Article fournisseur",
      sku: "FOURN-77",
      categoryId: categorie.id,
      price: 1000,
      stock: 1,
      lowStockThreshold: 1,
      description: "",
      featured: false,
      images: [],
    });
    expect(((await reponse.json()) as { sku: string }).sku).toBe("FOURN-77");
  });

  it("explique le refus d'une référence déjà prise", async () => {
    const categorie = await contexte.prisma.category.findFirstOrThrow();
    const existant = await contexte.prisma.product.findFirstOrThrow({ where: { sku: "DR-0001" } });

    const reponse = await appeler("POST", "/api/admin/produits", cookieAdmin, {
      name: "Doublon",
      sku: existant.sku!,
      categoryId: categorie.id,
      price: 1000,
      stock: 1,
      lowStockThreshold: 1,
      description: "",
      featured: false,
      images: [],
    });

    // Sans message dédié, la cliente lirait « une erreur interne est survenue » et ne
    // saurait pas que la correction lui appartient.
    expect(reponse.status).toBe(409);
    const corps = (await reponse.json()) as { error: { message: string } };
    expect(corps.error.message).toMatch(/référence est déjà utilisée/i);
  });

  it("conserve la référence quand le formulaire la renvoie vide", async () => {
    const produit = await contexte.prisma.product.findFirstOrThrow({ where: { sku: "DR-0002" } });
    const reponse = await appeler("PUT", `/api/admin/produits/${produit.id}`, cookieAdmin, {
      name: produit.name,
      sku: "",
      categoryId: produit.categoryId,
      price: produit.price,
      stock: produit.stock,
      lowStockThreshold: produit.lowStockThreshold,
      description: produit.description,
      featured: produit.featured,
      images: [],
    });
    // La référence a pu servir à étiqueter des cartons : l'effacer par mégarde dans le
    // formulaire ne doit pas la détruire.
    expect(((await reponse.json()) as { sku: string }).sku).toBe("DR-0002");
  });

  it("retrouve un article par sa référence", async () => {
    const reponse = await appeler("GET", "/api/admin/produits?q=DR-0003", cookieAdmin);
    const { items } = (await reponse.json()) as { items: { sku: string }[] };
    expect(items).toHaveLength(1);
    expect(items[0]!.sku).toBe("DR-0003");
  });
});

describe("export du classeur", () => {
  async function relire(reponse: Response): Promise<ExcelJS.Workbook> {
    const octets = await reponse.arrayBuffer();
    const classeur = new ExcelJS.Workbook();
    await classeur.xlsx.load(octets);
    return classeur;
  }

  it("sert un classeur lisible, avec ses deux feuilles", async () => {
    await commander();
    const reponse = await appeler("GET", "/api/admin/export", cookieAdmin);

    expect(reponse.status).toBe(200);
    expect(reponse.headers.get("content-type")).toContain("spreadsheetml");
    expect(reponse.headers.get("content-disposition")).toMatch(/\.xlsx"$/);

    // Le fichier est vraiment relu : un octet mal formé rendrait l'export inutilisable
    // sans qu'un contrôle d'en-tête s'en aperçoive.
    const classeur = await relire(reponse);
    expect(classeur.worksheets.map((f) => f.name)).toEqual(["Inventaire", "Ventes"]);
  });

  it("écrit les montants en nombres, pas en texte", async () => {
    const reponse = await appeler("GET", "/api/admin/export", cookieAdmin);
    const inventaire = (await relire(reponse)).getWorksheet("Inventaire")!;

    // « 12 000 FCFA » écrit en toutes lettres empêcherait la moindre somme : c'est
    // précisément ce qu'on attend d'un inventaire.
    const prix = inventaire.getRow(2).getCell("D").value;
    expect(typeof prix).toBe("number");
    const valeur = inventaire.getRow(2).getCell("I").value;
    expect(typeof valeur).toBe("number");
  });

  it("reprend chaque article du catalogue", async () => {
    const reponse = await appeler("GET", "/api/admin/export", cookieAdmin);
    const inventaire = (await relire(reponse)).getWorksheet("Inventaire")!;
    const attendus = await contexte.prisma.product.count();

    // rowCount inclut la ligne d'en-têtes.
    expect(inventaire.rowCount - 1).toBe(attendus);
  });

  it("n'expose jamais la note interne de l'équipe", async () => {
    const commande = await commander();
    await contexte.prisma.order.update({
      where: { id: commande.id },
      data: { internalNote: "Cliente difficile, exiger un acompte" },
    });

    const reponse = await appeler("GET", "/api/admin/export", cookieAdmin);
    const ventes = (await relire(reponse)).getWorksheet("Ventes")!;

    // Le fichier peut être transmis à un comptable ou à un tiers : ce qui sert à
    // l'équipe n'a pas à voyager avec lui.
    let trouve = false;
    ventes.eachRow((ligne) => {
      if (JSON.stringify(ligne.values).includes("acompte")) trouve = true;
    });
    expect(trouve).toBe(false);
  });

  it("neutralise un nom d'article qu'un tableur prendrait pour une formule", async () => {
    const categorie = await contexte.prisma.category.findFirstOrThrow();
    await contexte.prisma.product.create({
      data: {
        slug: "article-formule",
        sku: "DR-9001",
        name: "=1+1",
        categoryId: categorie.id,
        price: 1000,
        stock: 1,
        lowStockThreshold: 1,
        description: "",
      },
    });

    const reponse = await appeler("GET", "/api/admin/export", cookieAdmin);
    const inventaire = (await relire(reponse)).getWorksheet("Inventaire")!;

    let cellule: unknown = null;
    inventaire.eachRow((ligne) => {
      const valeur = ligne.getCell("B").value;
      if (typeof valeur === "string" && valeur.includes("1+1")) cellule = valeur;
    });
    // Réenregistré en CSV — ce que fait volontiers un comptable — « =1+1 » deviendrait
    // une formule exécutée à l'ouverture.
    expect(cellule).toBe("'=1+1");
  });

  it("limite l'export à la période demandée", async () => {
    const ancienne = await commander();
    await contexte.prisma.order.update({
      where: { id: ancienne.id },
      data: { createdAt: new Date(Date.now() - 60 * 86_400_000) },
    });

    const surTrenteJours = await appeler("GET", "/api/admin/export?jours=30", cookieAdmin);
    const ventes = (await relire(surTrenteJours)).getWorksheet("Ventes")!;
    expect(ventes.rowCount - 1).toBe(0);
  });

  it("refuse l'export à qui n'est pas administrateur", async () => {
    // Le classeur contient nom, téléphone et adresse de chaque cliente.
    expect((await appeler("GET", "/api/admin/export")).status).toBe(401);
    expect((await appeler("GET", "/api/admin/export", cookieClient)).status).toBe(403);
  });
});
