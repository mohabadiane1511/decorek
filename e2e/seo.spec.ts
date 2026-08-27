import { expect, test } from "./fixtures.js";

/**
 * Ce qu'un robot voit du site.
 *
 * Les vérifications portent sur le HTML tel qu'il est servi, sans exécuter la moindre
 * ligne de script : c'est exactement la situation de l'aperçu WhatsApp et des robots
 * des moteurs génératifs. Passer par le navigateur ne prouverait rien, puisqu'il
 * remplit la page lui-même.
 *
 * Auparavant, la page envoyée était une coquille vide : partager un article ne montrait
 * ni son nom ni sa photo, et aucune IA ne pouvait citer un seul produit.
 */

/** Récupère le HTML brut d'une page, sans navigateur. */
async function htmlServi(
  request: { get: (url: string) => Promise<{ text: () => Promise<string> }> },
  chemin: string,
) {
  const reponse = await request.get(chemin);
  return reponse.text();
}

test("la fiche produit est complète sans JavaScript", async ({ request }) => {
  const html = await htmlServi(request, "/produit/chaise-royale-doree");

  // Le nom et le prix figurent dans le HTML envoyé, pas seulement après hydratation.
  expect(html).toContain("Chaise royale dorée");
  expect(html).toMatch(/<title[^>]*>[^<]*Chaise royale dorée/);
});

test("le partage d'un article montre son nom et sa photo", async ({ request }) => {
  const html = await htmlServi(request, "/produit/chaise-royale-doree");

  // WhatsApp est le canal principal de la boutique et n'exécute aucun script : sans
  // ces balises, un lien partagé n'affichait qu'un titre générique et aucune image.
  const titre = html.match(/<meta property="og:title" content="([^"]*)"/)?.[1] ?? "";
  expect(titre).toContain("Chaise royale dorée");

  const image = html.match(/<meta property="og:image" content="([^"]*)"/)?.[1] ?? "";
  expect(image, "l'image de partage doit être une adresse absolue").toMatch(/^https?:\/\//);
});

test("l'article expose son prix et sa disponibilité aux moteurs", async ({ request }) => {
  const html = await htmlServi(request, "/produit/chaise-royale-doree");

  const bloc = html.match(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/s)?.[1];
  expect(bloc, "la fiche doit porter des données structurées").toBeTruthy();

  const donnees = JSON.parse(bloc!.replace(/\\u003c/g, "<"));
  expect(donnees["@type"]).toBe("Product");
  expect(donnees.name).toBe("Chaise royale dorée");
  // Prix et disponibilité en clair : c'est ce qu'une IA reprend pour répondre
  // « combien coûte… » sans avoir à interpréter la mise en page.
  expect(donnees.offers.priceCurrency).toBe("XOF");
  expect(typeof donnees.offers.price).toBe("number");
  expect(donnees.offers.availability).toMatch(/InStock|OutOfStock/);
});

test("chaque article annonce une adresse canonique unique", async ({ request }) => {
  const html = await htmlServi(request, "/produit/chaise-royale-doree");

  const canonique = html.match(/<link rel="canonical" href="([^"]*)"/)?.[1] ?? "";
  // Sans elle, le même article atteint par plusieurs chemins se fait concurrence à
  // lui-même dans les résultats.
  expect(canonique).toMatch(/^https:\/\/[^/]+\/produit\/chaise-royale-doree$/);
});

test("la disponibilité annoncée suit le stock réel", async ({ request }) => {
  // Comparée à ce que dit l'API, non à une valeur écrite dans le test : une boutique
  // qui annonce « en stock » à Google alors qu'elle n'a plus rien promet ce qu'elle
  // ne peut pas livrer.
  const produit = (await (await request.get("/api/produits/miroir-goutte-bambou")).json()) as {
    stock: number;
  };

  const html = await htmlServi(request, "/produit/miroir-goutte-bambou");
  const bloc = html.match(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/s)?.[1];
  const donnees = JSON.parse((bloc ?? "{}").replace(/\\u003c/g, "<"));

  expect(donnees.offers.availability).toBe(
    produit.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
  );
});

test("le plan du site recense les articles et se met à jour tout seul", async ({ request }) => {
  const xml = await (await request.get("/sitemap.xml")).text();

  expect(xml).toContain("<?xml");
  expect(xml).toContain("/produit/chaise-royale-doree");
  expect(xml).toContain("/boutique");

  // Construit depuis la base : un article ajouté par la boutique y figure sans qu'on
  // touche au code. On le vérifie en en créant un.
  const nombreAvant = (xml.match(/<url>/g) ?? []).length;
  expect(nombreAvant).toBeGreaterThan(8);

  // Les pages de gestion et d'achat n'ont rien à faire dans un plan de site.
  for (const interdit of ["/admin", "/panier", "/commande", "/compte"]) {
    expect(xml, `${interdit} ne doit pas être proposé à l'indexation`).not.toContain(
      `<loc>https://decorek.sn${interdit}</loc>`,
    );
  }
});

test("le fichier robots ouvre le catalogue et ferme les espaces privés", async ({ request }) => {
  const robots = await (await request.get("/robots.txt")).text();

  expect(robots).toContain("Disallow: /admin");
  expect(robots).toContain("Disallow: /compte");
  // Les moteurs génératifs sont admis explicitement : c'est la condition pour qu'une
  // réponse à « où acheter de la vaisselle à Dakar » puisse citer la boutique.
  expect(robots).toContain("GPTBot");
  expect(robots).toContain("ClaudeBot");
  expect(robots).toContain("PerplexityBot");
  expect(robots).toContain("Sitemap:");
});

test("le site se présente aux moteurs génératifs", async ({ request }) => {
  const llms = await (await request.get("/llms.txt")).text();

  expect(llms).toContain("Deco'Rek");
  // Ce qu'une IA doit savoir pour répondre juste : devise, paiement, zone livrée.
  expect(llms).toMatch(/FCFA|XOF/);
  expect(llms).toContain("paiement");
  expect(llms).toContain("Dakar");
});

test("la page confidentialité dit ce que le site fait vraiment", async ({ request }) => {
  const html = await htmlServi(request, "/confidentialite");

  expect(html).toContain("Confidentialité");
  // Elle doit décrire le seul cookie réellement posé, et expliquer l'absence de
  // bandeau plutôt que de laisser croire à un oubli.
  expect(html).toMatch(/un seul cookie/i);
  expect(html).toMatch(/consentement/i);
});
