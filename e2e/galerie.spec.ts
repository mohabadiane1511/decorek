import { expect, test } from "./fixtures.js";

/**
 * La galerie de la fiche produit.
 *
 * La fiche n'affichait que la première photo : les autres étaient enregistrées et
 * visibles au back-office, mais introuvables pour la cliente. Sur des pièces de
 * décoration, où l'on veut voir la matière et le revers d'un objet, cela revenait à
 * cacher l'essentiel.
 */
const MULTI = "/produit/anneaux-serviette-ginkgo";
const SIMPLE = "/produit/chaise-royale-doree";

test("un article à plusieurs photos les propose toutes", async ({ page }) => {
  await page.goto(MULTI);

  // Une vignette par photo, et le compteur les annonce.
  const vignettes = page.getByRole("button", { name: /Voir la photo/ });
  await expect(vignettes).toHaveCount(2, { timeout: 20_000 });
  await expect(page.getByText("1 / 2")).toBeVisible();
});

test("changer de vignette change la photo affichée", async ({ page }) => {
  await page.goto(MULTI);
  const principale = page.locator("img[alt*='photo 1 sur 2']");
  await expect(principale).toBeVisible({ timeout: 20_000 });
  const premiere = await principale.getAttribute("src");

  await page.getByRole("button", { name: "Voir la photo 2" }).click();

  await expect(page.locator("img[alt*='photo 2 sur 2']")).toBeVisible();
  const seconde = await page.locator("img[alt*='photo 2 sur 2']").getAttribute("src");
  // Le test vaut par cette comparaison : sans elle, un compteur qui avance sans que
  // l'image change passerait inaperçu.
  expect(seconde).not.toBe(premiere);
});

test("les flèches font défiler les photos et bouclent", async ({ page }) => {
  await page.goto(MULTI);
  await expect(page.getByText("1 / 2")).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "Photo suivante" }).click();
  await expect(page.getByText("2 / 2")).toBeVisible();

  // Après la dernière on revient à la première, plutôt que de buter sur une flèche morte.
  await page.getByRole("button", { name: "Photo suivante" }).click();
  await expect(page.getByText("1 / 2")).toBeVisible();

  await page.getByRole("button", { name: "Photo précédente" }).click();
  await expect(page.getByText("2 / 2")).toBeVisible();
});

test("un article à une seule photo garde une fiche épurée", async ({ page }) => {
  await page.goto(SIMPLE);
  await expect(page.getByRole("heading", { name: "Chaise royale dorée" })).toBeVisible({
    timeout: 20_000,
  });

  // Ni vignette, ni flèche, ni compteur : rien pour meubler quand il n'y a rien à
  // faire défiler.
  await expect(page.getByRole("button", { name: /Voir la photo/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Photo suivante" })).toHaveCount(0);
  await expect(page.getByText(/^\d+ \/ \d+$/)).toHaveCount(0);
});

test("passer d'un article à l'autre repart de la première photo", async ({ page }) => {
  await page.goto(MULTI);
  await page.getByRole("button", { name: "Voir la photo 2" }).click();
  await expect(page.getByText("2 / 2")).toBeVisible({ timeout: 20_000 });

  // Garder la deuxième photo sélectionnée montrerait le mauvais objet.
  await page.goto(SIMPLE);
  await page.goBack();
  await expect(page.getByText("1 / 2")).toBeVisible({ timeout: 20_000 });
});
