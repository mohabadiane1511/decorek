import { expect, test } from "./fixtures.js";
import type { Page } from "@playwright/test";
import { confirmerAdresse } from "./mailpit.js";

/**
 * Recherche et pagination des écrans de gestion.
 *
 * Le back-office demandait toutes ses lignes d'un coup, dans la limite de ce que l'API
 * acceptait de servir. Au-delà, les articles suivants existaient en base et
 * s'affichaient en boutique, mais devenaient impossibles à retrouver — donc à
 * corriger — depuis l'administration.
 */
const marque = Date.now();

async function ouvrirBackOffice(page: Page, nom: string): Promise<void> {
  const adresse = `listes-${nom}-${marque}@decorek.sn`;

  await page.goto("/compte");
  await page.getByRole("button", { name: "Créer un compte" }).click();
  await page.getByLabel("Nom complet").fill("Responsable");
  await page.getByLabel("Email").fill(adresse);
  await page.getByLabel("Mot de passe", { exact: true }).fill("motdepasse123");
  await page.getByLabel("Confirmer le mot de passe").fill("motdepasse123");
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await confirmerAdresse(page, adresse);

  const { execFileSync } = await import("node:child_process");
  execFileSync("npm", ["run", "--prefix", "backend", "db:admin", "--", adresse], {
    cwd: new URL("..", import.meta.url).pathname,
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: process.env["TEST_DATABASE_URL"] ?? "" },
  });

  await page.goto("/admin");
  await expect(page.getByText("Back-office")).toBeVisible({ timeout: 15_000 });
}

test("Produits : la recherche retrouve un article, quelle que soit sa page", async ({ page }) => {
  const nom = `Photophore introuvable ${marque}`;
  await ouvrirBackOffice(page, "recherche");

  // Assez d'articles pour dépasser une page. Créés par l'API : les saisir un par un
  // à l'écran n'apprendrait rien de plus sur la pagination.
  const categories = await (await page.request.get("/api/categories")).json();
  const categoryId = categories.items[0].id;
  const crees: string[] = [];
  for (let i = 0; i < 15; i += 1) {
    const reponse = await page.request.post("/api/admin/produits", {
      data: {
        name: i === 0 ? nom : `Remplissage ${marque}-${i}`,
        categoryId,
        price: 5000,
        stock: 4,
        lowStockThreshold: 2,
        description: "",
        featured: false,
        images: [],
      },
    });
    expect(reponse.status()).toBe(201);
    crees.push((await reponse.json()).id);
  }

  await page.goto("/admin");
  await page.getByRole("button", { name: "Produits" }).click();

  // Plus d'une page : le total annoncé dépasse ce qu'affiche le tableau.
  await expect(page.getByRole("button", { name: "Suivant" })).toBeVisible({ timeout: 15_000 });

  // La recherche ramène l'article sans qu'on ait à parcourir les pages.
  await page.getByLabel("Rechercher").first().fill("Photophore introuvable");
  await expect(page.locator("tr", { hasText: nom })).toBeVisible({ timeout: 15_000 });

  // Une recherche sans résultat ne doit pas afficher le catalogue entier.
  await page.getByLabel("Rechercher").first().fill(`zzz-aucun-${marque}`);
  await expect(page.locator("tr", { hasText: nom })).toHaveCount(0, { timeout: 15_000 });

  for (const id of crees) await page.request.delete(`/api/admin/produits/${id}`);
});

test("Produits : la page suivante montre d'autres articles", async ({ page }) => {
  await ouvrirBackOffice(page, "pagination");

  const categories = await (await page.request.get("/api/categories")).json();
  const crees: string[] = [];
  for (let i = 0; i < 15; i += 1) {
    const reponse = await page.request.post("/api/admin/produits", {
      data: {
        name: `Page ${marque}-${i}`,
        categoryId: categories.items[0].id,
        price: 5000,
        stock: 4,
        lowStockThreshold: 2,
        description: "",
        featured: false,
        images: [],
      },
    });
    crees.push((await reponse.json()).id);
  }

  await page.goto("/admin");
  await page.getByRole("button", { name: "Produits" }).click();
  await expect(page.getByRole("button", { name: "Suivant" })).toBeVisible({ timeout: 15_000 });

  const premierArticle = async (): Promise<string> =>
    (await page.locator("tbody tr").first().innerText()).trim();
  const page1 = await premierArticle();

  await page.getByRole("button", { name: "Suivant" }).click();
  await expect.poll(premierArticle, { timeout: 15_000 }).not.toBe(page1);

  // « Précédent » ramène bien à la liste de départ.
  await page.getByRole("button", { name: "Précédent" }).click();
  await expect.poll(premierArticle, { timeout: 15_000 }).toBe(page1);

  for (const id of crees) await page.request.delete(`/api/admin/produits/${id}`);
});

test("Commandes : la recherche retrouve une commande par son numéro", async ({ page }) => {
  const cliente = `Cliente listes ${marque}`;

  await page.goto("/produit/sous-assiette-solaire-doree");
  await page.getByRole("button", { name: "Ajouter au panier" }).first().click();
  await expect(page.locator("[data-sonner-toast]")).toBeVisible({ timeout: 10_000 });
  await page.goto("/commande");
  await page.getByLabel("Nom complet *").fill(cliente);
  await page.getByLabel("Téléphone *").fill("+221 77 123 45 67");
  await page.getByLabel("Adresse précise *").fill("Almadies, villa 9");
  await page.getByRole("button", { name: /Valider ma commande/ }).click();
  await expect(page).toHaveURL(/\/confirmation\/DR-\d{4}-\d{4}/, { timeout: 20_000 });
  const numero = page.url().split("/confirmation/")[1]!;

  await ouvrirBackOffice(page, "commandes");
  await page.getByRole("button", { name: "Commandes" }).click();

  await page.getByLabel("Rechercher").first().fill(numero);
  await expect(page.locator("article", { hasText: numero })).toBeVisible({ timeout: 15_000 });

  // Le nom de la cliente ramène la même commande : au téléphone, on a rarement le
  // numéro sous les yeux.
  await page.getByLabel("Rechercher").first().fill(cliente);
  await expect(page.locator("article", { hasText: numero })).toBeVisible({ timeout: 15_000 });
});

test("Tableau de bord : les chiffres viennent du serveur", async ({ page }) => {
  await page.goto("/produit/chaise-royale-doree");
  await page.getByRole("button", { name: "Ajouter au panier" }).first().click();
  await expect(page.locator("[data-sonner-toast]")).toBeVisible({ timeout: 10_000 });
  await page.goto("/commande");
  await page.getByLabel("Nom complet *").fill(`Bord ${marque}`);
  await page.getByLabel("Téléphone *").fill("+221 77 123 45 67");
  await page.getByLabel("Adresse précise *").fill("Almadies, villa 3");
  await page.getByRole("button", { name: /Valider ma commande/ }).click();
  await expect(page).toHaveURL(/\/confirmation\//, { timeout: 20_000 });

  await ouvrirBackOffice(page, "bord");

  // Le chiffre d'affaires est calculé en base : il ne dépend plus de ce que le
  // navigateur a réussi à charger.
  const carte = page.locator("div", { hasText: /^Chiffre d'affaires/ }).last();
  await expect(carte).toContainText("FCFA", { timeout: 20_000 });
  await expect(page.getByText("Calcul en cours…")).toHaveCount(0);

  // Changer de période relance le calcul sans casser l'écran.
  await page.getByRole("button", { name: "7 j" }).click();
  await expect(carte).toContainText("FCFA", { timeout: 20_000 });
});
