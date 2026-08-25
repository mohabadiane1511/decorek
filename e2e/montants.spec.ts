import { expect, test, type Page } from "@playwright/test";
import { confirmerAdresse } from "./mailpit.js";

/**
 * Le détail des montants, partout où une commande est montrée.
 *
 * Les écrans n'affichaient que les articles puis le total. Avec un code promo et des
 * frais de livraison, les deux ne s'accordaient plus : un article à 24 000 suivi d'un
 * total de 23 600 se lit comme une erreur de la boutique, alors que le compte est juste.
 */
const marque = Date.now();

/** Passe une commande remisée et renvoie son numéro. */
async function commanderAvecRemise(page: Page, nom: string): Promise<string> {
  const adresse = `montants-${nom}-${marque}@test.sn`;

  await page.goto("/compte");
  await page.getByRole("button", { name: "Créer un compte" }).click();
  await page.getByLabel("Nom complet").fill("Awa Diop");
  await page.getByLabel("Email").fill(adresse);
  await page.getByLabel("Mot de passe", { exact: true }).fill("motdepasse123");
  await page.getByLabel("Confirmer le mot de passe").fill("motdepasse123");
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await confirmerAdresse(page, adresse);

  // La chaise vaut 45 000 : au-dessus du minimum exigé par BIENVENUE10.
  await page.goto("/produit/chaise-royale-doree");
  await page.getByRole("button", { name: "Ajouter au panier" }).first().click();
  await expect(page.locator("[data-sonner-toast]")).toBeVisible({ timeout: 10_000 });

  await page.goto("/commande");
  await page.getByLabel("Nom complet *").fill("Awa Diop");
  await page.getByLabel("Téléphone *").fill("+221 77 123 45 67");
  await page.getByLabel("Adresse précise *").fill("Route des Almadies, villa 12");
  await page.getByLabel("Code promo").fill("BIENVENUE10");
  await page.getByRole("button", { name: "OK" }).click();
  await expect(page.getByText("BIENVENUE10").first()).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: /Valider ma commande/ }).click();
  await expect(page).toHaveURL(/\/confirmation\/DR-\d{4}-\d{4}/, { timeout: 20_000 });
  return page.url().split("/confirmation/")[1]!;
}

/** Lit les montants affichés et vérifie qu'ils s'additionnent. */
async function verifierLeCompte(page: Page): Promise<void> {
  const lire = async (libelle: RegExp): Promise<number> => {
    const ligne = page.locator("div", { has: page.locator("dt", { hasText: libelle }) }).last();
    const texte = await ligne.innerText();
    // Les espaces de séparation des milliers sont retirées, y compris les insécables
    // (U+00A0) et fines insécables (U+202F) que produit le format français.
    const nombres = texte.replace(/[\s\u00A0\u202F]/g, "").match(/(\d+)FCFA/);
    return Number(nombres?.[1] ?? 0);
  };

  const sousTotal = await lire(/^Sous-total$/);
  const remise = await lire(/^Remise/);
  const total = await lire(/^Total/);

  expect(sousTotal, "le sous-total doit être affiché").toBeGreaterThan(0);
  expect(remise, "la remise doit être affichée").toBeGreaterThan(0);
  // Livraison offerte ou facturée : le total se retrouve dans les deux cas.
  const livraison = (await page.locator("dl").last().innerText()).includes("Offerte")
    ? 0
    : await lire(/^Livraison$/);

  expect(total).toBe(sousTotal - remise + livraison);
}

test("la confirmation détaille remise et livraison", async ({ page }) => {
  await commanderAvecRemise(page, "confirmation");

  await expect(page.getByText("Sous-total")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Remise BIENVENUE10/)).toBeVisible();
  await verifierLeCompte(page);
});

test("le suivi détaille remise et livraison", async ({ page }) => {
  const numero = await commanderAvecRemise(page, "suivi");

  await page.goto("/suivi");
  await page.getByLabel("Numéro de commande").fill(numero);
  // Le téléphone n'est demandé qu'aux visiteuses non connectées : la session suffit
  // à prouver que la commande est la sienne.
  const telephone = page.getByLabel("Téléphone");
  if ((await telephone.count()) > 0) await telephone.fill("+221 77 123 45 67");
  await page.getByRole("button", { name: "Rechercher" }).click();

  // Le cas signalé : sans ces lignes, l'article et le total semblaient se contredire.
  await expect(page.getByText("Sous-total")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Remise BIENVENUE10/)).toBeVisible();
  await verifierLeCompte(page);
});

test("l'espace client détaille aussi les montants", async ({ page }) => {
  await commanderAvecRemise(page, "compte");

  await page.goto("/compte");
  await expect(page.getByText("Sous-total").first()).toBeVisible({ timeout: 20_000 });
  await verifierLeCompte(page);
});
