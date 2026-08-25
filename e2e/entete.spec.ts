import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * L'en-tête, vu du téléphone autant que du bureau.
 *
 * Le menu tenait en 11 pixels gris : lisible sur un grand écran au calme, beaucoup
 * moins sur un téléphone en extérieur, qui est le cas d'usage courant ici.
 */
/**
 * Ouvre le panneau de recherche.
 *
 * Le clic est rejoué jusqu'à ce que le champ paraisse : en développement, l'en-tête
 * n'est interactif qu'une fois le JavaScript arrivé, et un clic émis avant se perd
 * sans erreur. Le produit n'est pas en cause — le même écran répond immédiatement une
 * fois la page prête.
 */
async function ouvrirRecherche(page: Page): Promise<Locator> {
  const champ = page.getByLabel("Rechercher un article");
  await expect
    .poll(
      async () => {
        if ((await champ.count()) === 0) {
          await page.getByRole("button", { name: "Ouvrir la recherche" }).click();
        }
        return champ.count();
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);
  return champ;
}

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

test("la loupe de l'en-tête mène à la boutique avec le terme cherché", async ({ page }) => {
  await page.goto("/contact");

  // Depuis n'importe quelle page : c'est tout l'intérêt d'avoir la recherche dans
  // l'en-tête plutôt que sur la seule page d'accueil.
  const champ = await ouvrirRecherche(page);
  await champ.fill("chaise");
  await page.getByRole("button", { name: "Rechercher", exact: true }).click();

  await expect(page).toHaveURL(/\/boutique\?q=chaise/);
  await expect(page.getByText("Chaise royale dorée").first()).toBeVisible({ timeout: 20_000 });
});

test("la touche Entrée suffit à lancer la recherche", async ({ page }) => {
  await page.goto("/");

  const champ = await ouvrirRecherche(page);
  // Le curseur est déjà dans le champ : sur un téléphone, viser deux fois est pénible.
  await expect(champ).toBeFocused();

  await champ.fill("miroir");
  await champ.press("Enter");
  await expect(page).toHaveURL(/\/boutique\?q=miroir/);
});

test("une recherche vide ne quitte pas la page", async ({ page }) => {
  await page.goto("/contact");

  const champ = await ouvrirRecherche(page);
  await champ.press("Enter");

  // Envoyer un terme vide afficherait le catalogue entier sans que personne l'ait
  // demandé : on reste où l'on est.
  await expect(page).toHaveURL(/\/contact/);
});
