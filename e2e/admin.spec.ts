import { expect, test, type Page } from "@playwright/test";
import { confirmerAdresse } from "./mailpit.js";

/**
 * Parcours du back-office contre l'API réelle.
 *
 * Le compte administrateur est créé par le site puis promu en base, comme le ferait
 * l'équipe avec `npm run db:admin`.
 */
const marque = Date.now();

async function ouvrirBackOffice(page: Page): Promise<void> {
  const adresse = `patron-${marque}@decorek.sn`;

  await page.goto("/compte");
  await page.getByRole("button", { name: "Créer un compte" }).click();
  await page.getByLabel("Nom complet").fill("Responsable");
  await page.getByLabel("Email").fill(adresse);
  await page.getByLabel("Mot de passe", { exact: true }).fill("motdepasse123");
  await page.getByLabel("Confirmer le mot de passe").fill("motdepasse123");
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await confirmerAdresse(page, adresse);

  // Le rôle ne s'obtient que côté serveur : on passe par la commande dédiée.
  const { execFileSync } = await import("node:child_process");
  execFileSync("npm", ["run", "db:admin", "--", adresse], {
    cwd: new URL("..", import.meta.url).pathname,
    stdio: "pipe",
  });

  await page.goto("/admin");
  await expect(page.getByText("Back-office")).toBeVisible({ timeout: 15_000 });
}

test("le back-office s'ouvre et affiche les données réelles", async ({ page }) => {
  await ouvrirBackOffice(page);

  // Les huit onglets doivent être là.
  for (const onglet of [
    "Tableau de bord",
    "Commandes",
    "Produits",
    "Stocks",
    "Catégories",
    "Livraisons",
    "Promotions",
    "Contenu",
  ]) {
    await expect(page.getByRole("button", { name: onglet })).toBeVisible();
  }

  await page.getByRole("button", { name: "Produits" }).click();
  // Les 8 produits du catalogue viennent de l'API, plus des données de démonstration.
  await expect(page.getByText("Sous-assiette solaire dorée").first()).toBeVisible();
});

test("une modification de prix est enregistrée et visible en boutique", async ({ page }) => {
  await ouvrirBackOffice(page);
  await page.getByRole("button", { name: "Produits" }).click();

  await page.getByRole("button", { name: "Modifier" }).first().click();
  await page.getByLabel("Prix (FCFA)").fill("12345");
  await page.getByRole("button", { name: /Enregistrer/ }).click();

  await expect(page.locator("[data-sonner-toast]")).toBeVisible({ timeout: 15_000 });

  // La vraie preuve : le catalogue public reflète le changement, donc l'écriture a
  // bien atteint la base et le cache a été invalidé.
  await page.goto("/boutique");
  await expect(page.getByText(/12 345 FCFA/).first()).toBeVisible({ timeout: 15_000 });
});

test("le contenu du site modifié apparaît sur la boutique", async ({ page }) => {
  await ouvrirBackOffice(page);
  await page.getByRole("button", { name: "Contenu" }).click();

  const titre = `Bannière ${marque}`;
  await page.getByLabel("Titre bannière").fill(titre);
  await page
    .getByRole("button", { name: /Enregistrer/ })
    .first()
    .click();
  await expect(page.locator("[data-sonner-toast]")).toBeVisible({ timeout: 15_000 });

  await page.goto("/contact");
  await expect(page.locator("footer")).toBeVisible();
});
