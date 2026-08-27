import { expect, test } from "./fixtures.js";
import type { Page } from "@playwright/test";
import { confirmerAdresse } from "./mailpit.js";

/**
 * L'espace client et son historique.
 *
 * « Mes commandes » lisait la liste du back-office, qui n'est chargée que pour les
 * administratrices : une cliente n'y retrouvait que les commandes passées pendant sa
 * visite en cours, et repartait en croyant les précédentes perdues.
 */
const marque = Date.now();

async function creerCompte(page: Page, nom: string): Promise<string> {
  const adresse = `espace-${nom}-${marque}@test.sn`;
  await page.goto("/compte");
  await page.getByRole("button", { name: "Créer un compte" }).click();
  await page.getByLabel("Nom complet").fill("Awa Diop");
  await page.getByLabel("Email").fill(adresse);
  await page.getByLabel("Mot de passe", { exact: true }).fill("motdepasse123");
  await page.getByLabel("Confirmer le mot de passe").fill("motdepasse123");
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await confirmerAdresse(page, adresse);
  await expect(page.getByText("Bonjour, Awa Diop")).toBeVisible({ timeout: 15_000 });
  return adresse;
}

async function commander(page: Page): Promise<string> {
  await page.goto("/produit/sous-assiette-solaire-doree");
  await page.getByRole("button", { name: "Ajouter au panier" }).first().click();
  await expect(page.locator("[data-sonner-toast]")).toBeVisible({ timeout: 10_000 });

  await page.goto("/commande");
  await page.getByLabel("Nom complet *").fill("Awa Diop");
  await page.getByLabel("Téléphone *").fill("+221 77 123 45 67");
  await page.getByLabel("Adresse précise *").fill("Route des Almadies, villa 12");
  await page.getByRole("button", { name: /Valider ma commande/ }).click();
  await expect(page).toHaveURL(/\/confirmation\/DR-\d{4}-\d{4}/, { timeout: 20_000 });
  return page.url().split("/confirmation/")[1]!;
}

test("une commande se retrouve après déconnexion et reconnexion", async ({ page }) => {
  const adresse = await creerCompte(page, "historique");
  const numero = await commander(page);

  // Le cœur du défaut corrigé : la session qui suit doit retrouver la commande.
  await page.goto("/compte");
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible({
    timeout: 15_000,
  });

  await page.getByLabel("Email").fill(adresse);
  await page.getByLabel("Mot de passe", { exact: true }).fill("motdepasse123");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText("Bonjour, Awa Diop")).toBeVisible({ timeout: 15_000 });

  await expect(page.getByText(numero)).toBeVisible({ timeout: 20_000 });
  // La vignette et le suivi accompagnent la commande.
  const carte = page.locator("article", { hasText: numero });
  await expect(carte.locator("img").first()).toBeVisible();
  await expect(carte).toContainText("Sous-assiette solaire dorée");
});

test("l'espace résume commandes, livraisons en cours et favoris", async ({ page }) => {
  await creerCompte(page, "reperes");

  // Sans commande, les repères sont à zéro et l'écran le dit franchement.
  await expect(page.getByText("Commandes passées")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Aucune commande pour l'instant.")).toBeVisible();

  await commander(page);
  await page.goto("/compte");

  const commandes = page.locator("div", { has: page.getByText("Commandes passées") }).last();
  await expect(commandes).toContainText("1", { timeout: 20_000 });
  const enCours = page.locator("div", { has: page.getByText("En cours de livraison") }).last();
  await expect(enCours).toContainText("1");
});

test("un visiteur non connecté ne voit pas d'historique", async ({ page }) => {
  await page.goto("/compte");

  // La page présente le formulaire, pas un espace vide qui laisserait croire que les
  // commandes ont disparu.
  await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("Mes commandes")).toHaveCount(0);
});
