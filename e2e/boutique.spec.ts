import { expect, test } from "@playwright/test";

// Ces parcours passent par l'API réelle : ils vérifient le branchement de bout en bout,
// pas seulement le rendu de composants isolés.

test("la boutique affiche le catalogue servi par l'API", async ({ page }) => {
  await page.goto("/boutique");

  await expect(page.getByRole("heading", { name: "La boutique" })).toBeVisible();
  // 8 produits en base, 8 par page.
  await expect(page.locator("article, a[href^='/produit/']").first()).toBeVisible();
  await expect(page.getByText(/8 pièces/)).toBeVisible();
});

test("le filtre par catégorie interroge l'API et restreint la liste", async ({ page }) => {
  await page.goto("/boutique");
  await page.getByRole("button", { name: "Art de la table" }).click();

  await expect(page).toHaveURL(/categorie=art-de-la-table/);
  await expect(page.getByRole("heading", { name: "Art de la table" })).toBeVisible();
  // Trois produits dans cette catégorie : le décompte doit suivre.
  await expect(page.getByText(/3 pièces/)).toBeVisible();
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
