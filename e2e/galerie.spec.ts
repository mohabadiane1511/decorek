import { expect, test } from "./fixtures.js";
import { confirmerAdresse } from "./mailpit.js";

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

test("beaucoup de photos ne font pas déborder la page sur téléphone", async ({ page }) => {
  // Mesuré avant correction : avec sept photos, la fiche faisait 576 pixels de large
  // sur un écran de 390. La rangée de vignettes, censée défiler, élargissait la case
  // de grille qui la contenait — et avec elle toute la page, barre de navigation
  // comprise. Deux photos ne suffisent pas à le révéler : il en faut assez pour que la
  // rangée dépasse l'écran.
  const adresse = `galerie-${Date.now()}@decorek.sn`;
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

  // Des photos déjà présentes au catalogue, toutes différentes.
  const catalogue = (await (await page.request.get("/api/produits?parPage=48")).json()) as {
    items: { images: string[] }[];
  };
  const images = [...new Set(catalogue.items.flatMap((p) => p.images))].slice(0, 7);
  expect(images.length, "il faut assez de photos pour dépasser l'écran").toBeGreaterThanOrEqual(6);

  const categories = (await (await page.request.get("/api/categories")).json()) as {
    items: { id: string }[];
  };
  const cree = (await (
    await page.request.post("/api/admin/produits", {
      data: {
        name: `Photos multiples ${Date.now()}`,
        categoryId: categories.items[0]!.id,
        price: 5000,
        stock: 3,
        lowStockThreshold: 1,
        description: "",
        featured: false,
        images,
      },
    })
  ).json()) as { id: string; slug: string };

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/produit/${cree.slug}`);
  await expect(page.getByRole("button", { name: /Voir la photo/ })).toHaveCount(images.length, {
    timeout: 20_000,
  });

  const { ecran, document } = await page.evaluate(() => ({
    ecran: window.document.documentElement.clientWidth,
    document: window.document.documentElement.scrollWidth,
  }));
  expect(document, "la page ne doit jamais défiler en largeur").toBeLessThanOrEqual(ecran);

  await page.request.delete(`/api/admin/produits/${cree.id}`);
});
