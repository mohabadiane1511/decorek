import { expect, test } from "./fixtures.js";
import type { Page } from "@playwright/test";
import { confirmerAdresse } from "./mailpit.js";

/**
 * Informations personnelles et carnet d'adresses.
 *
 * Une adresse dakaroise tient souvent de la description — « villa 12, en face de la
 * pharmacie » — et se retape mal sur un téléphone : l'enregistrer une fois doit
 * suffire.
 */
const marque = Date.now();

async function creerCompte(page: Page, nom: string): Promise<void> {
  const adresse = `carnet-${nom}-${marque}@test.sn`;
  await page.goto("/compte");
  await page.getByRole("button", { name: "Créer un compte" }).click();
  await page.getByLabel("Nom complet").fill("Awa Diop");
  await page.getByLabel("Email").fill(adresse);
  await page.getByLabel("Mot de passe", { exact: true }).fill("motdepasse123");
  await page.getByLabel("Confirmer le mot de passe").fill("motdepasse123");
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await confirmerAdresse(page, adresse);
  await expect(page.getByText("Bonjour, Awa Diop")).toBeVisible({ timeout: 15_000 });
}

async function enregistrerAdresse(page: Page, libelle: string, texte: string): Promise<void> {
  await page.getByRole("button", { name: "Ajouter une adresse" }).click();
  await page.getByLabel("Nom de l'adresse").fill(libelle);
  await page.getByLabel("Téléphone", { exact: true }).fill("+221 77 123 45 67");
  await page.getByLabel("Adresse précise").fill(texte);
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  // On attend la carte, pas le seul message : la liste se recharge après coup, et agir
  // trop tôt viserait les boutons de la section précédente.
  await expect(page.locator("article", { hasText: libelle })).toBeVisible({ timeout: 20_000 });
}

test("le nom et le téléphone se modifient et survivent au rechargement", async ({ page }) => {
  await creerCompte(page, "profil");

  await page.getByRole("button", { name: "Modifier" }).first().click();
  await page.getByLabel("Nom complet").fill("Awa Diop Ndiaye");
  await page.getByLabel("Téléphone", { exact: true }).fill("+221 77 555 44 33");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.locator("[data-sonner-toast]")).toBeVisible({ timeout: 15_000 });

  await page.reload();
  await expect(page.getByText("+221 77 555 44 33")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Bonjour, Awa Diop Ndiaye")).toBeVisible();
});

test("l'adresse e-mail ne se modifie pas depuis ce formulaire", async ({ page }) => {
  await creerCompte(page, "email");
  await page.getByRole("button", { name: "Modifier" }).first().click();

  // Elle identifie le compte et relie les commandes : la changer est un parcours à
  // part, avec confirmation de la nouvelle adresse.
  await expect(page.getByLabel("Adresse e-mail")).toBeDisabled();
});

test("une adresse enregistrée survit au rechargement", async ({ page }) => {
  await creerCompte(page, "carnet");
  await enregistrerAdresse(page, "Maison", "Route des Almadies, villa 12");

  await page.reload();
  const carte = page.locator("article", { hasText: "Maison" }).first();
  await expect(carte).toContainText("Route des Almadies, villa 12", { timeout: 20_000 });
  // La première adresse devient celle proposée d'office, sans rien demander.
  await expect(carte).toContainText("Par défaut");
  // Les frais viennent de la zone vivante.
  await expect(carte).toContainText("FCFA");
});

test("une adresse se modifie et se supprime", async ({ page }) => {
  await creerCompte(page, "modif");
  await enregistrerAdresse(page, "Bureau", "Plateau, immeuble Kébé");

  await page
    .locator("article", { hasText: "Bureau" })
    .getByRole("button", { name: "Modifier" })
    .click();
  await page.getByLabel("Adresse précise").fill("Plateau, immeuble Kébé, 3e étage");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByText("Plateau, immeuble Kébé, 3e étage")).toBeVisible({
    timeout: 20_000,
  });

  await page
    .locator("article", { hasText: "Bureau" })
    .getByRole("button", { name: "Supprimer" })
    .click();
  await expect(page.getByText("Aucune adresse enregistrée.")).toBeVisible({ timeout: 20_000 });
});

test("l'adresse habituelle remplit le formulaire de commande", async ({ page }) => {
  await creerCompte(page, "commande");
  await enregistrerAdresse(page, "Maison", "Route des Almadies, villa 12");

  await page.goto("/produit/sous-assiette-solaire-doree");
  await page.getByRole("button", { name: "Ajouter au panier" }).first().click();
  await expect(page.locator("[data-sonner-toast]")).toBeVisible({ timeout: 10_000 });

  await page.goto("/commande");
  // C'est tout l'objet du carnet : ne pas retaper une adresse déjà connue.
  await expect(page.getByLabel("Adresse précise *")).toHaveValue("Route des Almadies, villa 12", {
    timeout: 20_000,
  });
  await expect(page.getByLabel("Téléphone *")).toHaveValue("+221 77 123 45 67");

  // La commande passe telle quelle, sans une frappe de plus.
  await page.getByRole("button", { name: /Valider ma commande/ }).click();
  await expect(page).toHaveURL(/\/confirmation\/DR-\d{4}-\d{4}/, { timeout: 20_000 });
});

test("le carnet reste invisible à une visiteuse non connectée", async ({ page }) => {
  await page.goto("/produit/sous-assiette-solaire-doree");
  await page.getByRole("button", { name: "Ajouter au panier" }).first().click();
  await expect(page.locator("[data-sonner-toast]")).toBeVisible({ timeout: 10_000 });

  await page.goto("/commande");
  await expect(page.getByText("Mes adresses enregistrées")).toHaveCount(0);
  // Le formulaire reste utilisable : commander sans compte doit rester possible.
  await expect(page.getByLabel("Adresse précise *")).toBeVisible();
});
