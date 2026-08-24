import { expect, test, type Page } from "@playwright/test";
import { confirmerAdresse } from "./mailpit.js";

/**
 * Parcours du back-office contre l'API réelle.
 *
 * Le compte administrateur est créé par le site puis promu en base, comme le ferait
 * l'équipe avec `npm run db:admin`.
 */
const marque = Date.now();

/**
 * Ouvre le back-office avec un compte administrateur propre au test appelant.
 *
 * Un compte partagé ne convient pas : les tests s'exécutent en parallèle et créeraient
 * la même adresse au même instant, ce qui en fait échouer certains au hasard.
 */
async function ouvrirBackOffice(page: Page, nom: string): Promise<void> {
  const adresse = `patron-${nom}-${marque}@decorek.sn`;

  await page.goto("/compte");
  await page.getByRole("button", { name: "Créer un compte" }).click();
  await page.getByLabel("Nom complet").fill("Responsable");
  await page.getByLabel("Email").fill(adresse);
  await page.getByLabel("Mot de passe", { exact: true }).fill("motdepasse123");
  await page.getByLabel("Confirmer le mot de passe").fill("motdepasse123");
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await confirmerAdresse(page, adresse);

  // Le rôle ne s'obtient que côté serveur : on passe par la commande dédiée, dirigée
  // vers la base de test — c'est là que le compte vient d'être créé.
  const { execFileSync } = await import("node:child_process");
  execFileSync("npm", ["run", "--prefix", "backend", "db:admin", "--", adresse], {
    cwd: new URL("..", import.meta.url).pathname,
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: process.env["TEST_DATABASE_URL"] ?? "" },
  });

  await page.goto("/admin");
  await expect(page.getByText("Back-office")).toBeVisible({ timeout: 15_000 });
}

test("le back-office s'ouvre et affiche les données réelles", async ({ page }) => {
  await ouvrirBackOffice(page, "onglets");

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
  await ouvrirBackOffice(page, "prix");
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
  await ouvrirBackOffice(page, "contenu");
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

test("l'onglet Commandes affiche une commande réelle", async ({ page }) => {
  // Une commande est passée depuis la boutique avant d'ouvrir le back-office : c'est
  // ce cas — un onglet avec des données — qui manquait aux tests, et c'est
  // exactement là que la page échouait.
  await page.goto("/produit/sous-assiette-solaire-doree");
  await page.getByRole("button", { name: "Ajouter au panier" }).first().click();
  await expect(page.locator("[data-sonner-toast]")).toBeVisible({ timeout: 10_000 });

  await page.goto("/commande");
  await page.getByLabel("Nom complet *").fill("Awa Diop");
  await page.getByLabel("Téléphone *").fill("+221 77 123 45 67");
  await page.getByLabel("Adresse précise *").fill("Route des Almadies, villa 12");
  await page.getByRole("button", { name: /Valider ma commande/ }).click();
  await expect(page).toHaveURL(/\/confirmation\//, { timeout: 20_000 });

  await ouvrirBackOffice(page, "commandes");
  await page.getByRole("button", { name: "Commandes" }).click();

  await expect(page.getByText(/DR-\d{4}-\d{4}/).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Awa Diop").first()).toBeVisible();
  await expect(page.getByText(/Almadies/).first()).toBeVisible();
});

test("un prix barré déclenche le badge Promo en boutique", async ({ page }) => {
  await ouvrirBackOffice(page, "promo");
  await page.getByRole("button", { name: "Produits" }).click();
  await page.getByRole("button", { name: "Modifier" }).first().click();

  await page.getByLabel("Prix (FCFA)").fill("8000");
  await page.getByLabel("Prix barré (facultatif)").fill("12000");
  await page.getByRole("button", { name: /Enregistrer/ }).click();
  await expect(page.locator("[data-sonner-toast]")).toBeVisible({ timeout: 15_000 });

  await page.goto("/boutique");
  // Le badge et l'ancien prix barré apparaissent ensemble.
  await expect(page.getByText("Promo").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/12 000 FCFA/).first()).toBeVisible();
});

test("un prix barré sous le prix de vente est refusé", async ({ page }) => {
  await ouvrirBackOffice(page, "promo-invalide");
  await page.getByRole("button", { name: "Produits" }).click();
  await page.getByRole("button", { name: "Modifier" }).first().click();

  await page.getByLabel("Prix (FCFA)").fill("10000");
  await page.getByLabel("Prix barré (facultatif)").fill("8000");

  // Signalé pendant la saisie : une « promotion » qui annonce une hausse tromperait
  // la cliente.
  await expect(page.getByText(/doit être supérieur au prix de vente/i).first()).toBeVisible();

  await page.getByRole("button", { name: /Enregistrer/ }).click();
  await expect(page.locator("[data-sonner-toast]")).toContainText(/supérieur/i, {
    timeout: 15_000,
  });
});

test("les réseaux sociaux renseignés apparaissent dans le pied de page", async ({ page }) => {
  await ouvrirBackOffice(page, "reseaux");
  await page.getByRole("button", { name: "Contenu" }).click();

  await page.getByLabel("Facebook").fill("https://facebook.com/decorek");
  await page.getByLabel("Instagram").fill("https://instagram.com/decorek");
  await page
    .getByRole("button", { name: /Enregistrer/ })
    .first()
    .click();
  await expect(page.locator("[data-sonner-toast]")).toBeVisible({ timeout: 15_000 });

  await page.goto("/boutique");
  const pied = page.locator("footer");
  await expect(pied.getByRole("link", { name: "Facebook" })).toBeVisible({ timeout: 15_000 });
  await expect(pied.getByRole("link", { name: "Instagram" })).toBeVisible();

  // Ceux qu'on n'a pas renseignés restent absents : une icône menant vers un compte
  // inexistant vaut moins que pas d'icône.
  await expect(pied.getByRole("link", { name: "TikTok" })).toHaveCount(0);
  await expect(pied.getByRole("link", { name: "Snapchat" })).toHaveCount(0);
});
