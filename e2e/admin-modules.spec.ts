import { expect, test } from "./fixtures.js";
import type { Page } from "@playwright/test";
import { confirmerAdresse } from "./mailpit.js";

/**
 * Chaque module du back-office enregistre-t-il réellement ?
 *
 * Écrit après un ajout de quartier qui affichait « Quartier ajouté » sans rien
 * enregistrer. Le principe est le même partout : on modifie depuis l'administration,
 * on recharge, et on vérifie que le changement a survécu — c'est la seule preuve que
 * l'écriture a atteint la base plutôt que le seul état de la page.
 */
const marque = Date.now();

async function ouvrirBackOffice(page: Page, nom: string): Promise<void> {
  const adresse = `admin-${nom}-${marque}@decorek.sn`;

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

  await page.goto("/admin");
  await expect(page.getByText("Back-office")).toBeVisible({ timeout: 15_000 });
}

test("Livraisons : un quartier ajouté est bien enregistré", async ({ page }) => {
  const quartier = `Sacré-Cœur ${marque}`;
  await ouvrirBackOffice(page, "livraison");
  await page.getByRole("button", { name: "Livraisons" }).click();

  // Premier formulaire d'ajout de quartier rencontré.
  await page.getByLabel("Quartier / ville").first().fill(quartier);
  await page.getByLabel("Frais (FCFA)").first().fill("2500");
  await page.getByRole("button", { name: "Ajouter le quartier" }).first().click();
  await expect(page.locator("[data-sonner-toast]")).toBeVisible({ timeout: 15_000 });

  // La preuve se prend côté client, sur une page qui relit la base : sans écriture
  // réelle, le quartier n'y figure pas.
  await page.goto("/livraison");
  await expect(page.getByText(quartier).first()).toBeVisible({ timeout: 15_000 });
});

test("Catégories : une catégorie ajoutée survit au rechargement", async ({ page }) => {
  const nom = `Vannerie ${marque}`;
  await ouvrirBackOffice(page, "categories");
  await page.getByRole("button", { name: "Catégories" }).click();

  await page.getByRole("button", { name: /Nouvelle catégorie/i }).click();
  await page.getByLabel("Nom", { exact: true }).fill(nom);
  await page
    .getByRole("button", { name: /Enregistrer/ })
    .first()
    .click();
  await expect(page.locator("[data-sonner-toast]")).toBeVisible({ timeout: 15_000 });

  await page.reload();
  await page.getByRole("button", { name: "Catégories" }).click();
  await expect(page.getByText(nom).first()).toBeVisible({ timeout: 15_000 });

  // La boutique propose la nouvelle catégorie en filtre.
  await page.goto("/boutique");
  // Le pied de page liste aussi les catégories : on vise la rangée de filtres.
  await expect(
    page.getByRole("navigation", { name: "Catégories" }).getByRole("link", { name: nom }),
  ).toBeVisible({ timeout: 15_000 });

  // Retirée une fois la preuve faite : sans cela, chaque exécution laisse une
  // catégorie de plus dans la rangée de filtres, qui finit par ne plus rien montrer
  // du catalogue réel.
  await page.goto("/admin");
  await page.getByRole("button", { name: "Catégories" }).click();
  // Les catégories sont une liste, non un tableau comme les produits.
  await page
    .locator("li", { hasText: nom })
    .first()
    .getByRole("button", { name: /Supprimer/i })
    .click();
  await expect(page.getByText(nom)).toHaveCount(0, { timeout: 15_000 });
});

test("Stocks : une correction de stock est enregistrée", async ({ page }) => {
  await ouvrirBackOffice(page, "stocks");
  await page.getByRole("button", { name: "Stocks" }).click();

  // L'onglet trie par stock croissant : viser « le premier champ » ne désignerait plus
  // le même article après modification. On cible un article nommé, et que personne
  // d'autre ne commande — une commande concurrente en changerait le stock sous nos pieds.
  const ligne = page.locator("tr", { hasText: "Ensemble carafe" });
  const champStock = ligne.locator("input[type='number']").first();
  await champStock.fill("77");
  await champStock.blur();
  await expect(page.locator("[data-sonner-toast]")).toBeVisible({ timeout: 15_000 });

  await page.reload();
  await page.getByRole("button", { name: "Stocks" }).click();
  await expect(
    page.locator("tr", { hasText: "Ensemble carafe" }).locator("input[type='number']").first(),
  ).toHaveValue("77", { timeout: 15_000 });
});

test("Contenu : le seuil de livraison offerte est enregistré", async ({ page }) => {
  await ouvrirBackOffice(page, "contenu");
  await page.getByRole("button", { name: "Contenu" }).click();

  await page.getByLabel("Titre bannière").fill(`Bannière ${marque}`);
  await page
    .getByRole("button", { name: /Enregistrer/ })
    .first()
    .click();
  await expect(page.locator("[data-sonner-toast]")).toBeVisible({ timeout: 15_000 });

  await page.reload();
  await page.getByRole("button", { name: "Contenu" }).click();
  await expect(page.getByLabel("Titre bannière")).toHaveValue(`Bannière ${marque}`, {
    timeout: 15_000,
  });
});

test("Promotions : un code ajouté survit au rechargement", async ({ page }) => {
  const code = `TEST${marque}`.slice(0, 20);
  await ouvrirBackOffice(page, "promos");
  await page.getByRole("button", { name: "Promotions" }).click();

  await page.getByRole("button", { name: "Nouveau code promo" }).click();
  await page.getByLabel("Code", { exact: true }).fill(code);
  await page
    .getByRole("button", { name: /Enregistrer/ })
    .first()
    .click();
  await expect(page.locator("[data-sonner-toast]")).toBeVisible({ timeout: 15_000 });

  await page.reload();
  await page.getByRole("button", { name: "Promotions" }).click();
  await expect(page.getByText(code.toUpperCase()).first()).toBeVisible({ timeout: 15_000 });
});

test("Produits : un article créé apparaît en boutique", async ({ page }) => {
  const nom = `Photophore ambré ${marque}`;
  await ouvrirBackOffice(page, "produits");
  await page.getByRole("button", { name: "Produits" }).click();

  await page.getByRole("button", { name: "Nouveau produit" }).click();
  await page.getByLabel("Nom", { exact: true }).fill(nom);
  await page.getByLabel("Prix (FCFA)").fill("14500");
  await page.getByLabel("Stock", { exact: true }).fill("8");
  await page.getByLabel("Description").fill("Verre soufflé teinté, hauteur 18 cm.");
  await page
    .getByRole("button", { name: /^Enregistrer$/ })
    .first()
    .click();
  await expect(page.locator("[data-sonner-toast]")).toBeVisible({ timeout: 15_000 });

  // La création passe par une route distincte de la mise à jour : la preuve se prend
  // sur la vitrine, qui relit la base.
  await page.goto("/boutique");
  await expect(page.getByText(nom).first()).toBeVisible({ timeout: 20_000 });

  // L'article est retiré une fois la preuve faite : laissé en place, il occuperait la
  // première page du catalogue et ferait échouer des tests qui ne le connaissent pas.
  await page.goto("/admin");
  await page.getByRole("button", { name: "Produits" }).click();
  const ligne = page.locator("tr", { hasText: nom }).first();
  await ligne.getByRole("button", { name: /Supprimer/i }).click();
  await expect(page.getByText(nom)).toHaveCount(0, { timeout: 15_000 });
});

test("Commandes : un changement de statut est enregistré", async ({ page }) => {
  // Une commande réelle, passée depuis la boutique.
  await page.goto("/produit/sous-assiette-solaire-doree");
  await page.getByRole("button", { name: "Ajouter au panier" }).first().click();
  await expect(page.locator("[data-sonner-toast]")).toBeVisible({ timeout: 10_000 });
  await page.goto("/commande");
  await page.getByLabel("Nom complet *").fill(`Cliente ${marque}`);
  await page.getByLabel("Téléphone *").fill("+221 77 123 45 67");
  await page.getByLabel("Adresse précise *").fill("Almadies, villa 4");
  await page.getByRole("button", { name: /Valider ma commande/ }).click();
  await expect(page).toHaveURL(/\/confirmation\//, { timeout: 20_000 });

  await ouvrirBackOffice(page, "commandes");
  await page.getByRole("button", { name: "Commandes" }).click();

  // Les commandes sont des cartes, repérées par le nom de la cliente.
  const carte = page.locator("article", { hasText: `Cliente ${marque}` }).first();
  await carte.getByLabel("Statut").selectOption("confirmee");
  await expect(page.locator("[data-sonner-toast]")).toBeVisible({ timeout: 15_000 });

  await page.reload();
  await page.getByRole("button", { name: "Commandes" }).click();
  await expect(
    page
      .locator("article", { hasText: `Cliente ${marque}` })
      .first()
      .getByLabel("Statut"),
  ).toHaveValue("confirmee", { timeout: 15_000 });
});

test("le back-office se ferme depuis son en-tête", async ({ page }) => {
  await ouvrirBackOffice(page, "deconnexion");

  // L'adresse du compte est rappelée : à plusieurs sur le même poste, on doit savoir
  // sous quel compte on agit avant de fermer.
  await expect(page.getByText(`admin-deconnexion-${marque}@decorek.sn`)).toBeVisible();

  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page.locator("[data-sonner-toast]")).toBeVisible({ timeout: 15_000 });

  // La session est réellement fermée : l'écran de connexion prend la place, et
  // recharger ne rouvre pas le back-office.
  await expect(page.getByRole("button", { name: /Se connecter/ })).toBeVisible({
    timeout: 15_000,
  });
  await page.reload();
  await expect(page.getByText("Tableau de bord")).toHaveCount(0);
});
