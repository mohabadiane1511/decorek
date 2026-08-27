import { expect, test } from "./fixtures.js";
import type { Page } from "@playwright/test";

const TELEPHONE = "+221 77 123 45 67";

/** Passe une commande et renvoie son numéro. */
async function commander(page: Page): Promise<string> {
  await page.goto("/produit/sous-assiette-solaire-doree");
  await page.getByRole("button", { name: "Ajouter au panier" }).first().click();
  await expect(page.locator("[data-sonner-toast]")).toBeVisible({ timeout: 10_000 });

  await page.goto("/commande");
  await page.getByLabel("Nom complet *").fill("Awa Diop");
  await page.getByLabel("Téléphone *").fill(TELEPHONE);
  await page.getByLabel("Adresse précise *").fill("Route des Almadies, villa 12");
  await page.getByRole("button", { name: /Valider ma commande/ }).click();

  await expect(page).toHaveURL(/\/confirmation\/DR-\d{4}-\d{4}/, { timeout: 20_000 });
  return page.url().split("/confirmation/")[1]!;
}

test("le suivi affiche la commande avec numéro et téléphone", async ({ page }) => {
  const numero = await commander(page);

  await page.goto("/suivi");
  await page.getByLabel("Numéro de commande").fill(numero);
  await page.getByLabel("Téléphone").fill(TELEPHONE);
  await page.getByRole("button", { name: "Rechercher" }).click();

  await expect(page.getByText(numero)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/En attente/i).first()).toBeVisible();
});

test("le numéro seul ne suffit pas à consulter une commande", async ({ page }) => {
  const numero = await commander(page);

  await page.goto("/suivi");
  await page.getByLabel("Numéro de commande").fill(numero);
  // Téléphone volontairement laissé vide : les numéros se suivent, et sans seconde
  // information n'importe qui lirait les coordonnées des autres clients.
  await page.getByRole("button", { name: "Rechercher" }).click();

  await expect(page.getByText(/Aucune commande ne correspond/i)).toBeVisible({ timeout: 15_000 });
});

test("un téléphone erroné est refusé comme un numéro inexistant", async ({ page }) => {
  const numero = await commander(page);

  await page.goto("/suivi");
  await page.getByLabel("Numéro de commande").fill(numero);
  await page.getByLabel("Téléphone").fill("77 000 00 00");
  await page.getByRole("button", { name: "Rechercher" }).click();

  await expect(page.getByText(/Aucune commande ne correspond/i)).toBeVisible({ timeout: 15_000 });
});
