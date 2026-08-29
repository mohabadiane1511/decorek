import { expect, test } from "./fixtures.js";
import { confirmerAdresse } from "./mailpit.js";

/**
 * Le règlement précède la livraison.
 *
 * La cliente paie par Wave ou Orange Money, puis envoie sa capture sur WhatsApp. Un
 * lien WhatsApp ne peut pas transporter d'image : il pré-remplit le texte, et c'est
 * elle qui joint le reçu. Le message doit donc porter tout ce qu'il faut pour
 * rapprocher le paiement de la commande sans poser de question.
 */
async function commander(page: import("@playwright/test").Page, mode: string): Promise<string> {
  await page.goto("/produit/sous-assiette-solaire-doree");
  await page.getByRole("button", { name: "Ajouter au panier" }).first().click();
  await expect(page.locator("[data-sonner-toast]")).toBeVisible({ timeout: 10_000 });

  await page.goto("/commande");
  await page.getByLabel("Nom complet *").fill("Awa Diop");
  await page.getByLabel("Téléphone *").fill("+221 77 123 45 67");
  await page.getByLabel("Adresse précise *").fill("Route des Almadies, villa 12");
  await page.getByRole("radio", { name: new RegExp(mode, "i") }).check();
  await page.getByRole("button", { name: /Valider ma commande/ }).click();
  await expect(page).toHaveURL(/\/confirmation\/DR-\d{4}-\d{4}/, { timeout: 20_000 });
  return page.url().split("/confirmation/")[1]!;
}

test("la confirmation donne le numéro à créditer et le montant exact", async ({ page }) => {
  const numero = await commander(page, "Wave");

  await expect(page.getByRole("heading", { name: /Régler par Wave/ })).toBeVisible({
    timeout: 20_000,
  });
  // Les trois informations sans lesquelles le transfert ne peut pas aboutir.
  await expect(page.getByText("+221 77 000 11 22")).toBeVisible();
  await expect(page.getByText("Montant exact")).toBeVisible();
  // La référence en libellé évite à la boutique de deviner quel virement va où.
  await expect(page.getByText(numero).first()).toBeVisible();
});

test("le numéro à créditer se copie d'un bouton", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await commander(page, "Wave");

  // Seul le numéro se copie : c'est lui qu'on saisit dans l'application de paiement,
  // et où un chiffre perdu envoie l'argent ailleurs.
  await page.getByRole("button", { name: "Copier : Numéro à créditer" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("+221 77 000 11 22");

  // Le bouton confirme d'une coche, sans texte : l'intitulé reste porté par le libellé
  // accessible, pour qui navigue à la voix.
  await expect(page.getByRole("button", { name: "Copier : Numéro à créditer" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Copier : Montant/ })).toHaveCount(0);
});

test("le bouton WhatsApp porte toute la commande dans son message", async ({ page }) => {
  const numero = await commander(page, "Orange Money");

  const lien = page.getByRole("link", { name: /J'ai payé/ });
  await expect(lien).toBeVisible({ timeout: 20_000 });

  const href = (await lien.getAttribute("href")) ?? "";
  expect(href).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);

  const message = decodeURIComponent(href.split("?text=")[1] ?? "");
  expect(message).toContain(numero);
  expect(message).toContain("Awa Diop");
  expect(message).toContain("+221 77 123 45 67");
  expect(message).toContain("Sous-assiette solaire dorée");
  expect(message).toContain("Almadies");
  expect(message).toContain("Route des Almadies, villa 12");
  expect(message).toContain("TOTAL PAYÉ");
  expect(message).toContain("Orange Money");
});

test("annoncer son paiement met la commande en attente de vérification", async ({ page }) => {
  const numero = await commander(page, "Wave");

  // Le clic ouvrirait WhatsApp : on ne suit pas le lien, on déclenche seulement
  // l'annonce, puis on lit le statut réel côté serveur.
  await page.getByRole("link", { name: /J'ai payé/ }).click({ modifiers: ["Alt"] });
  await expect(page.getByText(/joindre la capture/i)).toBeVisible({ timeout: 15_000 });

  await expect
    .poll(
      async () => {
        const r = await page.request.post("/api/commandes/suivi", {
          data: { numero, telephone: "+221 77 123 45 67" },
        });
        return ((await r.json()) as { status: string }).status;
      },
      { timeout: 20_000 },
    )
    .toBe("paiement_annonce");
});

test("le suivi montre que le paiement attend vérification", async ({ page }) => {
  const numero = await commander(page, "Wave");
  await page.getByRole("link", { name: /J'ai payé/ }).click({ modifiers: ["Alt"] });
  await expect(page.getByText(/joindre la capture/i)).toBeVisible({ timeout: 15_000 });

  await page.goto("/suivi");
  await page.getByLabel("Numéro de commande").fill(numero);
  const telephone = page.getByLabel("Téléphone");
  if ((await telephone.count()) > 0) await telephone.fill("+221 77 123 45 67");
  await page.getByRole("button", { name: "Rechercher" }).click();

  await expect(page.getByText("Paiement à vérifier").first()).toBeVisible({ timeout: 20_000 });
});

test("une commande non annoncée reste en attente", async ({ page }) => {
  const numero = await commander(page, "Wave");

  // Rien n'est marqué payé tant que la cliente n'a rien déclaré — et même alors, la
  // vérification reste humaine.
  const r = await page.request.post("/api/commandes/suivi", {
    data: { numero, telephone: "+221 77 123 45 67" },
  });
  const commande = (await r.json()) as { status: string; paid: boolean };
  expect(commande.status).toBe("en_attente");
  expect(commande.paid).toBe(false);
});

test("le back-office montre le mode de règlement et rappelle de vérifier", async ({ page }) => {
  const numero = await commander(page, "Wave");
  await page.getByRole("link", { name: /J'ai payé/ }).click({ modifiers: ["Alt"] });
  await expect(page.getByText(/joindre la capture/i)).toBeVisible({ timeout: 15_000 });

  const adresse = `paiement-bo-${Date.now()}@decorek.sn`;
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
  await page.getByRole("button", { name: "Commandes" }).click();
  const carte = page.locator("article", { hasText: numero }).first();

  await expect(carte).toContainText("Réglé par Wave", { timeout: 20_000 });
  // Le rappel n'est pas décoratif : cocher sur la seule foi d'une capture revient à
  // expédier sans avoir été payée.
  await expect(carte).toContainText(/Vérifiez dans Wave avant d'expédier/);
});

test("les numéros de paiement se règlent depuis le back-office", async ({ page }) => {
  const adresse = `paiement-cfg-${Date.now()}@decorek.sn`;
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
  await page.getByRole("button", { name: "Contenu" }).click();
  await expect(page.getByLabel("Numéro Wave")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel("Numéro Orange Money")).toBeVisible();
});

test("le site n'annonce plus le paiement à la livraison", async ({ request }) => {
  // Promettre un règlement à réception alors qu'on le demande d'avance ferait perdre
  // la commande au moment de payer.
  // « à la réception » compte autant que « à la livraison » : c'est la même promesse,
  // et c'est cette seconde formulation qui avait échappé au premier passage.
  const interdits = [/paiement (uniquement )?à la livraison/i, /à la réception/i, /vous réglerez/i];

  for (const chemin of ["/", "/boutique", "/livraison", "/cgv", "/commande", "/llms.txt"]) {
    const contenu = await (await request.get(chemin)).text();
    for (const interdit of interdits) {
      expect(contenu, `${chemin} annonce encore un règlement à réception`).not.toMatch(interdit);
    }
  }
});
