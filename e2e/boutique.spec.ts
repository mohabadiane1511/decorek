import { expect, test } from "./fixtures.js";
import type { Page } from "@playwright/test";

// Ces parcours passent par l'API réelle : ils vérifient le branchement de bout en bout,
// pas seulement le rendu de composants isolés.

// Le décompte n'est jamais comparé à un nombre gravé : d'autres tests créent des
// articles dans la même base, et une valeur fixe ferait échouer la boutique pour une
// raison qui ne la concerne pas. Les totaux exacts sont vérifiés côté API, sur une
// base remise à zéro entre chaque cas.
async function nombreDePieces(page: Page): Promise<number> {
  // Le décompte affiche « … » tant que la requête court : on interroge jusqu'à ce
  // qu'un nombre apparaisse plutôt que de lire une seule fois, trop tôt.
  let nombre = 0;
  await expect
    .poll(
      async () => {
        // textContent plutôt qu'innerText : le compteur vit dans un élément que le
        // navigateur ne considère pas comme rendu, et innerText l'omet.
        const texte = (await page.locator("body").textContent()) ?? "";
        // Les espaces insécables du formatage français doivent être admises.
        const trouve = texte.match(/(\d+)\s*pièces?/);
        nombre = trouve ? Number(trouve[1]) : 0;
        return nombre;
      },
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0);
  return nombre;
}

test("la boutique affiche le catalogue servi par l'API", async ({ page }) => {
  await page.goto("/boutique");

  await expect(page.getByRole("heading", { name: "La boutique" })).toBeVisible();
  await expect(page.locator("article, a[href^='/produit/']").first()).toBeVisible();
  expect(await nombreDePieces(page)).toBeGreaterThanOrEqual(8);
});

test("le filtre par catégorie interroge l'API et restreint la liste", async ({ page }) => {
  await page.goto("/boutique");
  await page.getByRole("main").getByRole("link", { name: "Art de la table" }).click();
  await expect(page).toHaveURL(/categorie=art-de-la-table/);
  await expect(page.getByRole("heading", { name: "Art de la table" })).toBeVisible();

  // Le contenu est vérifié plutôt qu'un décompte : d'autres tests créent des articles
  // dans la même base, et un nombre attendu échouerait pour une raison étrangère au
  // filtre. La chaise appartient au mobilier événementiel : elle doit rester absente.
  expect(await nombreDePieces(page)).toBeGreaterThan(0);
  await expect(page.getByText("Chaise royale dorée")).toHaveCount(0);
});

test("la recherche ne renvoyant rien affiche un message, pas une page vide", async ({ page }) => {
  await page.goto("/boutique?q=zzzzzzintrouvable");
  await expect(page.getByText(/Aucun article ne correspond/)).toBeVisible();
});

test("la fiche produit s'ouvre depuis le catalogue", async ({ page }) => {
  await page.goto("/produit/chaise-royale-doree");
  await expect(page.getByRole("heading", { name: /Chaise royale dorée/i })).toBeVisible();
  await expect(page.getByText(/45 000 FCFA/)).toBeVisible();
});

test("une API en panne affiche un message et un bouton, jamais une page blanche", async ({
  page,
}) => {
  // C'est le comportement qui compte pour un client à Dakar sur une connexion instable :
  // il doit comprendre ce qui se passe et pouvoir réessayer.
  await page.route("**/api/**", (route) => route.abort("failed"));
  await page.goto("/boutique");

  await expect(page.getByText(/Boutique indisponible/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Réessayer" })).toBeVisible();
  // L'en-tête et le pied de page restent en place : le site n'a pas disparu.
  await expect(page.locator("footer")).toBeVisible();
});

test("sur téléphone, les filtres tiennent sur une rangée qui défile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/boutique");
  await expect(page.getByRole("main").getByRole("link", { name: "Art de la table" })).toBeVisible({
    timeout: 20_000,
  });

  const rangee = page.getByRole("navigation", { name: "Catégories" });

  // Une seule rangée : empilées, les catégories formaient un pavé de plusieurs
  // centaines de pixels qui repoussait les articles hors de l'écran.
  const boite = await rangee.boundingBox();
  expect(boite!.height).toBeLessThan(80);

  // Et la page elle-même ne défile jamais horizontalement : c'est la rangée qui
  // défile, pas le document.
  const deborde = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(deborde, "la page ne doit pas déborder en largeur").toBe(false);
});
