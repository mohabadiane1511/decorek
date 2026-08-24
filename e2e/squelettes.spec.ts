import { expect, test } from "@playwright/test";

/**
 * Les silhouettes de chargement doivent apparaître pendant l'attente, puis céder la
 * place au contenu. Les réponses de l'API sont volontairement retardées : sans cela,
 * elles arrivent trop vite en local pour qu'on puisse observer quoi que ce soit.
 */
test("la boutique affiche des silhouettes puis les articles", async ({ page }) => {
  await page.route("**/api/produits*", async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });

  await page.goto("/boutique");

  const silhouettes = page.getByRole("status", { name: /Chargement des articles/i });
  await expect(silhouettes).toBeVisible();

  // Puis le contenu réel prend la place.
  await expect(page.getByText(/pièces/).first()).toBeVisible({ timeout: 20_000 });
  await expect(silhouettes).toHaveCount(0);
});

test("la fiche produit affiche une silhouette pendant le chargement", async ({ page }) => {
  await page.route("**/api/produits/*", async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });

  await page.goto("/produit/chaise-royale-doree");
  await expect(page.getByRole("status", { name: /Chargement de l'article/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Chaise royale dorée/i })).toBeVisible({
    timeout: 20_000,
  });
});

test("les silhouettes ne perturbent pas la lecture d'écran", async ({ page }) => {
  await page.route("**/api/produits*", async (route) => {
    await new Promise((r) => setTimeout(r, 1200));
    await route.continue();
  });
  await page.goto("/boutique");

  // Les cartes factices sont masquées aux technologies d'assistance : seul le
  // conteneur annonce qu'un chargement est en cours, plutôt que huit articles vides.
  const cartesFactices = page.locator("article[aria-hidden='true']");
  await expect(cartesFactices.first()).toBeAttached();
  await expect(page.getByRole("status", { name: /Chargement des articles/i })).toBeVisible();
});
