import { expect, test, type Page } from "@playwright/test";
import { confirmerAdresse } from "./mailpit.js";

// Parcours d'achat complet, du catalogue à la confirmation, contre l'API réelle.

async function ajouterAuPanier(page: Page, slug: string, quantite = 1) {
  await page.goto(`/produit/${slug}`);
  for (let i = 1; i < quantite; i += 1) {
    await page.getByRole("button", { name: "Augmenter" }).click();
  }
  // La page propose aussi des articles suggérés, qui ont le même bouton : on vise
  // celui de la fiche affichée.
  await page.getByRole("button", { name: "Ajouter au panier" }).first().click();
  await expect(page.locator("[data-sonner-toast]")).toBeVisible({ timeout: 10_000 });
}

async function remplirLivraison(page: Page) {
  await page.getByLabel("Nom complet *").fill("Awa Diop");
  await page.getByLabel("Téléphone *").fill("+221 77 123 45 67");
  await page.getByLabel("Adresse précise *").fill("Route des Almadies, villa 12");
}

test("une commande passe du panier à la confirmation", async ({ page }) => {
  await ajouterAuPanier(page, "sous-assiette-solaire-doree", 2);

  await page.goto("/commande");
  await remplirLivraison(page);
  await page.getByRole("button", { name: /Valider ma commande/ }).click();

  // Le numéro est attribué par le serveur, au format DR-AAMM-XXXX.
  await expect(page).toHaveURL(/\/confirmation\/DR-\d{4}-\d{4}/, { timeout: 20_000 });
  await expect(page.getByText(/DR-\d{4}-\d{4}/).first()).toBeVisible();
});

test("le panier est conservé si la commande échoue", async ({ page }) => {
  await ajouterAuPanier(page, "sous-assiette-solaire-doree");

  await page.goto("/commande");
  await remplirLivraison(page);

  // L'API tombe au moment de valider : le client doit garder ses articles pour
  // pouvoir réessayer, pas repartir d'un panier vide.
  await page.route("**/api/commandes", (route) => route.abort("failed"));
  await page.getByRole("button", { name: /Valider ma commande/ }).click();

  await expect(page.locator("[data-sonner-toast]")).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/commande/);

  await page.unroute("**/api/commandes");
  await page.goto("/panier");
  await expect(page.getByText(/Sous-total/i)).toBeVisible();
});

test("le champ code promo est fermé à un visiteur non connecté", async ({ page }) => {
  await ajouterAuPanier(page, "chaise-royale-doree");
  await page.goto("/commande");

  // Le serveur refuserait de toute façon : l'interface le dit d'emblée plutôt que de
  // laisser saisir un code pour rien.
  await expect(page.getByLabel("Code promo")).toBeDisabled();
  await expect(page.getByText(/Réservé aux comptes clients/i)).toBeVisible();
});

test("un code promo appliqué par un client connecté réduit le total", async ({ page }) => {
  const email = `promo-${Date.now()}@test.sn`;

  await page.goto("/compte");
  await page.getByRole("button", { name: "Créer un compte" }).click();
  await page.getByLabel("Nom complet").fill("Awa Diop");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill("motdepasse123");
  await page.getByLabel("Confirmer le mot de passe").fill("motdepasse123");
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await confirmerAdresse(page, email);
  await expect(page.getByText("Bonjour, Awa Diop")).toBeVisible({ timeout: 15_000 });

  // 45 000 FCFA : au-dessus du minimum de 20 000 exigé par BIENVENUE10.
  await ajouterAuPanier(page, "chaise-royale-doree");
  await page.goto("/commande");
  await page.getByLabel("Code promo").fill("BIENVENUE10");
  await page.getByRole("button", { name: "OK" }).click();

  // La remise vient du serveur, qui recalcule le sous-total : l'aperçu correspond
  // exactement à ce qui sera facturé. On vise la ligne de remise par son libellé, le
  // montant pouvant coïncider avec des frais de livraison affichés ailleurs.
  const remise = page.locator("div", { has: page.locator("dt", { hasText: "Remise" }) }).last();
  await expect(remise).toContainText("BIENVENUE10", { timeout: 15_000 });
  await expect(remise).toContainText("4 500 FCFA");
});

test("une remise sous le minimum requis est refusée avec son motif", async ({ page }) => {
  const email = `minimum-${Date.now()}@test.sn`;

  await page.goto("/compte");
  await page.getByRole("button", { name: "Créer un compte" }).click();
  await page.getByLabel("Nom complet").fill("Awa Diop");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill("motdepasse123");
  await page.getByLabel("Confirmer le mot de passe").fill("motdepasse123");
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await confirmerAdresse(page, email);
  await expect(page.getByText("Bonjour, Awa Diop")).toBeVisible({ timeout: 15_000 });

  // 8 500 FCFA seulement : sous le minimum de 20 000.
  await ajouterAuPanier(page, "sous-assiette-solaire-doree");
  await page.goto("/commande");
  await page.getByLabel("Code promo").fill("BIENVENUE10");
  await page.getByRole("button", { name: "OK" }).click();

  await expect(page.getByText(/à partir de/i)).toBeVisible({ timeout: 15_000 });
});
