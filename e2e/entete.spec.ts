import { expect, test } from "./fixtures.js";
import type { Locator, Page } from "@playwright/test";

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

test("les articles paraissent à la frappe, avec photo et prix", async ({ page }) => {
  await page.goto("/contact");
  const champ = await ouvrirRecherche(page);

  // Aucune validation : c'est tout l'objet de cette recherche.
  await champ.fill("chaise");

  const resultat = page.getByRole("option").filter({ hasText: "Chaise royale dorée" });
  await expect(resultat).toBeVisible({ timeout: 20_000 });
  // La photo et le prix sont là : on reconnaît l'article sans le lire en entier.
  await expect(resultat.locator("img")).toBeVisible();
  await expect(resultat).toContainText("FCFA");

  // On est resté sur la page : rien n'a navigué.
  await expect(page).toHaveURL(/\/contact/);
});

test("un résultat mène directement à sa fiche", async ({ page }) => {
  await page.goto("/");
  const champ = await ouvrirRecherche(page);
  await champ.fill("chaise");

  await page.getByRole("option").filter({ hasText: "Chaise royale dorée" }).click();
  await expect(page).toHaveURL(/\/produit\/chaise-royale-doree/);
  // Le panneau se referme derrière soi.
  await expect(page.getByRole("option")).toHaveCount(0);
});

test("les flèches parcourent les résultats et Entrée ouvre le bon", async ({ page }) => {
  await page.goto("/");
  const champ = await ouvrirRecherche(page);
  await champ.fill("chaise");
  await expect(page.getByRole("option").first()).toBeVisible({ timeout: 20_000 });

  await champ.press("ArrowDown");
  await expect(page.getByRole("option").first()).toHaveAttribute("aria-selected", "true");

  await champ.press("Enter");
  await expect(page).toHaveURL(/\/produit\//);
});

test("une recherche sans résultat le dit, sans page vide", async ({ page }) => {
  await page.goto("/");
  const champ = await ouvrirRecherche(page);
  await champ.fill("zzzintrouvable");

  // Le message visible porte le terme cherché ; son jumeau pour lecteurs d'écran, non.
  await expect(page.getByText(/Aucun article ne correspond à/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("option")).toHaveCount(0);
});

test("une seule lettre ne déclenche pas de résultats", async ({ page }) => {
  await page.goto("/");
  const champ = await ouvrirRecherche(page);

  // Presque tout le catalogue ressortirait : la liste n'apprendrait rien et la
  // requête serait gaspillée sur une connexion mobile.
  await champ.fill("c");
  await page.waitForTimeout(1500);
  await expect(page.getByRole("option")).toHaveCount(0);
});

test("un clic en dehors referme le panneau", async ({ page }) => {
  await page.goto("/contact");
  const champ = await ouvrirRecherche(page);
  await champ.fill("chaise");
  await expect(page.getByRole("option").first()).toBeVisible({ timeout: 20_000 });

  await page.locator("footer").click({ position: { x: 5, y: 5 } });
  await expect(page.getByLabel("Rechercher un article")).toHaveCount(0);
});
