import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Order } from "../../src/data/types.js";
import { memeTelephone } from "../src/routes/suivi.js";
import { semer } from "../prisma/seed.js";
import { creerContexte, type ContexteTest } from "./contexte.js";

let contexte: ContexteTest;
const urlBase = process.env["TEST_DATABASE_URL"]!;
const TELEPHONE = "+221 77 123 45 67";

let commande: Order;

async function suivre(corps: Record<string, unknown>, cookie?: string): Promise<Response> {
  const entetes: Record<string, string> = { "Content-Type": "application/json" };
  if (cookie) entetes["Cookie"] = cookie;
  return contexte.app.request("/api/commandes/suivi", {
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
  await contexte.prisma.stockMovement.deleteMany();
  await contexte.prisma.promoRedemption.deleteMany();
  await contexte.prisma.orderItem.deleteMany();
  await contexte.prisma.order.deleteMany();
  await contexte.prisma.orderNumberCounter.deleteMany();
  await contexte.prisma.productImage.deleteMany();
  await contexte.prisma.product.deleteMany();
  await contexte.prisma.category.deleteMany();
  await contexte.prisma.deliveryArea.deleteMany();
  await contexte.prisma.deliveryRegion.deleteMany();
  await contexte.prisma.promoCode.deleteMany();
  await contexte.prisma.siteContent.deleteMany();
  await semer(urlBase);
  await contexte.redis.flushdb();

  const produit = await contexte.prisma.product.findFirstOrThrow({
    where: { slug: "sous-assiette-solaire-doree" },
  });
  const zone = await contexte.prisma.deliveryArea.findFirstOrThrow({ where: { name: "Almadies" } });
  const reponse = await contexte.app.request("/api/commandes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      paymentMethod: "wave",
      customer: { name: "Awa Diop", phone: TELEPHONE },
      delivery: { areaId: zone.id, address: "Route des Almadies, villa 12" },
      items: [{ productId: produit.id, quantity: 1 }],
    }),
  });
  commande = (await reponse.json()) as Order;
}, 120_000);

describe("comparaison des téléphones", () => {
  it("ignore la mise en forme", () => {
    expect(memeTelephone("+221 77 123 45 67", "771234567")).toBe(true);
    expect(memeTelephone("77-123-45-67", "+221 77 123 45 67")).toBe(true);
    expect(memeTelephone("00221771234567", "771234567")).toBe(false); // préfixe international différent
  });

  it("refuse deux numéros distincts", () => {
    expect(memeTelephone("771234567", "779999999")).toBe(false);
  });

  it("refuse une saisie trop courte", () => {
    // Sans longueur minimale, « 67 » correspondrait à quantité de commandes.
    expect(memeTelephone("67", "771234567")).toBe(false);
  });
});

describe("accès au suivi", () => {
  it("renvoie la commande avec le bon numéro et le bon téléphone", async () => {
    const reponse = await suivre({ numero: commande.number, telephone: TELEPHONE });
    expect(reponse.status).toBe(200);

    const suivi = (await reponse.json()) as Order;
    expect(suivi.number).toBe(commande.number);
    expect(suivi.status).toBe("en_attente");
    expect(suivi.items.length).toBeGreaterThan(0);
  });

  it("accepte le numéro écrit en minuscules", async () => {
    const reponse = await suivre({
      numero: commande.number.toLowerCase(),
      telephone: TELEPHONE,
    });
    expect(reponse.status).toBe(200);
  });

  it("donne l'état au numéro seul, mais rien de personnel", async () => {
    // Le numéro seul suffit à savoir où en est la commande : c'est ce qu'on vient
    // chercher. Il ne doit rien livrer d'autre — les numéros se suivent, et nom,
    // téléphone, adresse et achats iraient à qui sait compter.
    const reponse = await suivre({ numero: commande.number });
    expect(reponse.status).toBe(200);

    const brut = await reponse.text();
    const partiel = JSON.parse(brut) as Record<string, unknown>;
    expect(partiel["status"]).toBe("en_attente");
    expect(partiel["number"]).toBe(commande.number);

    for (const secret of ["Awa Diop", TELEPHONE, "Almadies", "customer", "items", "total"]) {
      expect(brut, `« ${secret} » ne doit pas sortir sans preuve`).not.toContain(secret);
    }
  });

  it("ne livre pas le détail à un téléphone qui ne correspond pas", async () => {
    const reponse = await suivre({ numero: commande.number, telephone: "77 999 99 99" });
    const brut = await reponse.text();
    expect(brut).not.toContain("Awa Diop");
    expect(brut).not.toContain("Almadies");
  });

  it("ne dit rien d'une commande qui n'existe pas", async () => {
    const inexistant = await suivre({ numero: "DR-9999-9999" });
    expect(inexistant.status).toBe(404);
  });

  it("n'expose jamais la note interne de l'équipe", async () => {
    await contexte.prisma.order.update({
      where: { number: commande.number },
      data: { internalNote: "Cliente difficile, exiger un acompte" },
    });

    const reponse = await suivre({ numero: commande.number, telephone: TELEPHONE });
    const brut = await reponse.text();
    expect(brut).not.toContain("acompte");
    expect(brut).not.toContain("internalNote");
  });

  it("reflète immédiatement un changement de statut", async () => {
    await contexte.prisma.order.update({
      where: { number: commande.number },
      data: { status: "en_livraison" },
    });

    // Cette réponse n'est jamais mise en cache : un client qui suit son colis doit
    // voir l'état réel, pas celui d'il y a cinq minutes.
    const reponse = await suivre({ numero: commande.number, telephone: TELEPHONE });
    expect(((await reponse.json()) as Order).status).toBe("en_livraison");
  });

  it("interdit la mise en cache de la réponse", async () => {
    const reponse = await suivre({ numero: commande.number, telephone: TELEPHONE });
    expect(reponse.headers.get("cache-control")).toContain("no-store");
  });
});

describe("protection contre l'énumération", () => {
  it("finit par répondre 429", async () => {
    const statuts: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      const reponse = await suivre({ numero: `DR-2608-${String(i).padStart(4, "0")}` });
      statuts.push(reponse.status);
    }
    expect(statuts.filter((s) => s === 429).length).toBeGreaterThan(0);
  }, 60_000);
});
