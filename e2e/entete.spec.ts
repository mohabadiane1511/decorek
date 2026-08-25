import { expect, test } from "@playwright/test";

/**
 * L'en-tête, vu du téléphone autant que du bureau.
 *
 * Le menu tenait en 11 pixels gris : lisible sur un grand écran au calme, beaucoup
 * moins sur un téléphone en extérieur, qui est le cas d'usage courant ici.
 */
test("les liens du menu restent lisibles", async ({ page }) => {
  await page.goto("/");

  const lien = page.locator("nav a", { hasText: "Boutique" }).first();
  await expect(lien).toBeVisible();

  const style = await lien.evaluate((el) => {
    const calcule = getComputedStyle(el);
    return { taille: parseFloat(calcule.fontSize), graisse: Number(calcule.fontWeight) };
  });

  // Seuil délibérément bas : il n'impose pas un choix graphique, il empêche seulement
  // de retomber sous ce qui se lit mal.
  expect(style.taille).toBeGreaterThanOrEqual(12);
  expect(style.graisse).toBeGreaterThanOrEqual(500);
});
