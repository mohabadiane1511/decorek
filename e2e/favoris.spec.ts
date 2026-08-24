import { expect, test } from "@playwright/test";

test("un article mis en favori se retrouve sur la page dédiée", async ({ page }) => {
  await page.goto("/boutique");

  const premiere = page.locator("article").first();
  const nom = await premiere.locator("a[href^='/produit/']").first().getAttribute("aria-label");
  await premiere.getByRole("button", { name: /Ajouter .* aux favoris/ }).click();
  await expect(page.locator("[data-sonner-toast]")).toBeVisible({ timeout: 10_000 });

  // Le compteur de l'en-tête suit.
  await expect(page.getByRole("link", { name: /Favoris \(1\)/ })).toBeVisible();

  await page.goto("/favoris");
  await expect(page.getByText(nom!).first()).toBeVisible({ timeout: 15_000 });
});

test("les favoris survivent au rechargement", async ({ page }) => {
  await page.goto("/boutique");
  await page
    .locator("article")
    .first()
    .getByRole("button", { name: /aux favoris/ })
    .click();
  await expect(page.getByRole("link", { name: /Favoris \(1\)/ })).toBeVisible({
    timeout: 20_000,
  });

  // Conservés dans le navigateur, comme le panier : fermer l'onglet ne les perd pas.
  await page.reload();
  await expect(page.getByRole("link", { name: /Favoris \(1\)/ })).toBeVisible({ timeout: 15_000 });
});

test("un second clic retire l'article des favoris", async ({ page }) => {
  await page.goto("/boutique");
  const bouton = page
    .locator("article")
    .first()
    .getByRole("button", { name: /favoris/ });

  await bouton.click();
  await expect(page.getByRole("link", { name: /Favoris \(1\)/ })).toBeVisible({
    timeout: 20_000,
  });

  await bouton.click();
  // Plus de compteur : le lien reprend son libellé neutre.
  await expect(page.getByRole("link", { name: "Favoris", exact: true })).toBeVisible();
});

test("la page favoris vide invite à parcourir la boutique", async ({ page }) => {
  await page.goto("/favoris");

  // Délai large : la page attend le chargement du catalogue, et la silhouette reste
  // affichée plus longtemps quand plusieurs tests sollicitent l'API en même temps.
  await expect(page.getByRole("heading", { name: /Aucun favori/i })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole("link", { name: "Parcourir la boutique" })).toBeVisible();
  // La limite est annoncée franchement plutôt que découverte en changeant de téléphone.
  await expect(page.getByText(/reste sur cet appareil/i)).toBeVisible();
});
