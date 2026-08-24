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

  it("REFUSE le numéro seul, sans téléphone", async () => {
    // Les numéros se suivent : qui connaît le sien devine ceux des autres. Sans cette
    // seconde information, le suivi livrerait nom, téléphone et adresse de n'importe
    // quel client à qui saurait compter.
    const reponse = await suivre({ numero: commande.number });
    expect(reponse.status).toBe(404);
  });

  it("refuse un téléphone qui ne correspond pas", async () => {
    const reponse = await suivre({ numero: commande.number, telephone: "77 999 99 99" });
    expect(reponse.status).toBe(404);
  });

  it("répond la même chose pour un numéro inexistant et un téléphone erroné", async () => {
    // Distinguer les deux cas révélerait quels numéros de commande existent.
    const inexistant = await suivre({ numero: "DR-9999-9999", telephone: TELEPHONE });
    const mauvaisTel = await suivre({ numero: commande.number, telephone: "77 000 00 00" });

    expect(inexistant.status).toBe(mauvaisTel.status);
    expect(await inexistant.text()).toBe(await mauvaisTel.text());
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
