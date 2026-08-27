import { expect, test } from "./fixtures.js";
import type { Page } from "@playwright/test";
import { confirmerAdresse } from "./mailpit.js";

/**
 * Export du classeur depuis le back-office.
 *
 * Vérifié par un vrai téléchargement : servir les bons octets ne suffit pas si le
 * navigateur ne les enregistre pas — un en-tête mal formé et le fichier s'ouvre dans
 * l'onglet en caractères illisibles.
 */
const marque = Date.now();

/**
 * Ouvre le back-office avec un compte propre au test appelant : les tests s'exécutent
 * en parallèle et une adresse partagée serait créée deux fois.
 */
async function ouvrirBackOffice(page: Page, nom: string): Promise<void> {
  const adresse = `export-${nom}-${marque}@decorek.sn`;

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

test("le bouton télécharge un classeur exploitable", async ({ page }) => {
  await ouvrirBackOffice(page, "classeur");
  await page.getByRole("button", { name: "Stocks" }).click();

  const telechargement = page.waitForEvent("download", { timeout: 30_000 });
  await page.getByRole("link", { name: "Exporter en Excel" }).click();
  const fichier = await telechargement;

  expect(fichier.suggestedFilename()).toMatch(/^decorek-inventaire-\d{4}-\d{2}-\d{2}\.xlsx$/);

  // Relu pour de bon : un fichier tronqué porterait le bon nom sans s'ouvrir.
  const chemin = await fichier.path();
  const ExcelJS = (await import("exceljs")).default;
  const classeur = new ExcelJS.Workbook();
  await classeur.xlsx.readFile(chemin);
  expect(classeur.worksheets.map((f) => f.name)).toEqual(["Inventaire", "Ventes"]);

  const inventaire = classeur.getWorksheet("Inventaire")!;
  expect(inventaire.rowCount).toBeGreaterThan(1);
  expect(inventaire.getRow(1).getCell("A").value).toBe("Référence");
});

test("la référence d'un article est visible et cherchable", async ({ page }) => {
  await ouvrirBackOffice(page, "reference");
  await page.getByRole("button", { name: "Produits" }).click();

  // Les articles du catalogue portent une référence attribuée automatiquement.
  await expect(page.locator("tbody tr").first()).toContainText(/DR-\d{4}/, { timeout: 15_000 });

  // La recherche par référence ne ramène que les articles qui la portent. Le nombre
  // exact n'est pas figé : d'autres tests créent des articles dans la même base.
  await page.getByLabel("Rechercher").first().fill("DR-0001");
  await expect(page.locator("tbody tr").first()).toContainText("DR-0001", { timeout: 15_000 });
  await expect
    .poll(
      async () => {
        const lignes = await page.locator("tbody tr").allInnerTexts();
        return lignes.every((l) => l.includes("DR-0001"));
      },
      { timeout: 15_000 },
    )
    .toBe(true);
});
