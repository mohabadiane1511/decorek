import { expect, test } from "./fixtures.js";

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
