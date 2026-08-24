import { expect, test, type Page } from "@playwright/test";
import { attendreMessage, confirmerAdresse, extraireLien } from "./mailpit.js";

// Comptes distincts par exécution : les tests créent de vrais utilisateurs en base.
const marque = Date.now();
const CLIENT = { email: `client-${marque}@test.sn`, mdp: "motdepasse123", nom: "Awa Diop" };
// Adresse qui ouvrait le back-office dans la maquette. Elle ne doit plus rien ouvrir.
const IMPOSTEUR = { email: `admin-faux-${marque}@test.sn`, mdp: "motdepasse123", nom: "Imposteur" };

async function creerCompte(page: Page, compte: { email: string; mdp: string; nom: string }) {
  await page.goto("/compte");
  await page.getByRole("button", { name: "Créer un compte" }).click();
  await page.getByLabel("Nom complet").fill(compte.nom);
  await page.getByLabel("Email").fill(compte.email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(compte.mdp);
  await page.getByLabel("Confirmer le mot de passe").fill(compte.mdp);
  await page.getByRole("button", { name: "Créer mon compte" }).click();

  // L'inscription n'ouvre pas de session : l'adresse doit d'abord être confirmée.
  await expect(page.getByRole("heading", { name: "Confirmez votre adresse" })).toBeVisible({
    timeout: 15_000,
  });
  await confirmerAdresse(page, compte.email);
  await expect(page.getByText(`Bonjour, ${compte.nom}`)).toBeVisible({ timeout: 15_000 });
}

test("un client crée son compte et voit son espace", async ({ page }) => {
  await creerCompte(page, CLIENT);
  await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible();
  // Un client ordinaire ne se voit jamais proposer le back-office.
  await expect(page.getByRole("link", { name: "Back-office" })).toHaveCount(0);
});

test("la déconnexion ferme réellement la session", async ({ page }) => {
  await creerCompte(page, { ...CLIENT, email: `sortie-${marque}@test.sn` });
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible();

  // Rechargement : la session ne doit pas ressusciter depuis le navigateur.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible();
});

test("une adresse commençant par « admin » n'ouvre plus le back-office", async ({ page }) => {
  await creerCompte(page, IMPOSTEUR);

  await page.goto("/admin");
  // Le compte est connecté, mais sans rôle : on l'annonce clairement au lieu de
  // redemander des identifiants.
  await expect(page.getByRole("heading", { name: "Accès refusé." })).toBeVisible();
  await expect(page.getByText(IMPOSTEUR.email)).toBeVisible();
});

test("le back-office est fermé à un visiteur non connecté", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Connexion." })).toBeVisible();
});

test("un mot de passe trop court est refusé avant même l'envoi", async ({ page }) => {
  await page.goto("/compte");
  await page.getByLabel("Email").fill("quelquun@test.sn");
  await page.getByLabel("Mot de passe").fill("court");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText(/au moins 8 caractères/i).first()).toBeVisible();
});

test("des identifiants inconnus affichent un message, pas un plantage", async ({ page }) => {
  await page.goto("/compte");
  await page.getByLabel("Email").fill(`inconnu-${marque}@test.sn`);
  await page.getByLabel("Mot de passe").fill("motdepasse123");
  await page.getByRole("button", { name: "Se connecter" }).click();

  await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible();
  await expect(page.locator("[data-sonner-toast]")).toBeVisible({ timeout: 15_000 });
});

test("deux mots de passe différents bloquent l'inscription", async ({ page }) => {
  await page.goto("/compte");
  await page.getByRole("button", { name: "Créer un compte" }).click();
  await page.getByLabel("Nom complet").fill("Awa Diop");
  await page.getByLabel("Email").fill(`frappe-${marque}@test.sn`);
  await page.getByLabel("Mot de passe", { exact: true }).fill("motdepasse123");
  await page.getByLabel("Confirmer le mot de passe").fill("motdepasse124");

  // L'écart est signalé pendant la saisie, avant même de soumettre.
  await expect(page.getByText(/ne correspondent pas/i).first()).toBeVisible();

  await page.getByRole("button", { name: "Créer mon compte" }).click();
  // Une faute de frappe ici enfermerait le client dehors : le compte ne doit pas
  // être créé, et on reste sur le formulaire.
  await expect(page.getByRole("heading", { name: "Créer un compte" })).toBeVisible();
});

test("l'inscription annonce la confirmation et n'ouvre pas de session", async ({ page }) => {
  const adresse = `attente-${marque}@test.sn`;

  await page.goto("/compte");
  await page.getByRole("button", { name: "Créer un compte" }).click();
  await page.getByLabel("Nom complet").fill("Awa Diop");
  await page.getByLabel("Email").fill(adresse);
  await page.getByLabel("Mot de passe", { exact: true }).fill("motdepasse123");
  await page.getByLabel("Confirmer le mot de passe").fill("motdepasse123");
  await page.getByRole("button", { name: "Créer mon compte" }).click();

  await expect(page.getByRole("heading", { name: "Confirmez votre adresse" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(adresse)).toBeVisible();

  // Le compte existe mais reste inactif : se connecter doit être refusé, avec un
  // motif compréhensible plutôt qu'un « identifiants incorrects » trompeur.
  await page.goto("/compte");
  await page.getByLabel("Email").fill(adresse);
  await page.getByLabel("Mot de passe", { exact: true }).fill("motdepasse123");
  await page.getByRole("button", { name: "Se connecter" }).click();

  await expect(page.getByText(/pas encore confirmée/i)).toBeVisible({ timeout: 15_000 });
});

test("le lien magique connecte sans mot de passe", async ({ page }) => {
  const adresse = `magique-${marque}@test.sn`;
  await creerCompte(page, { email: adresse, mdp: "motdepasse123", nom: "Awa Diop" });
  await page.getByRole("button", { name: "Se déconnecter" }).click();

  await page.getByRole("tab", { name: "Lien par e-mail" }).click();
  // Le champ mot de passe doit disparaître : on ne le demande pas à quelqu'un venu
  // précisément pour s'en passer.
  await expect(page.getByLabel("Mot de passe", { exact: true })).toHaveCount(0);
  await page.getByLabel("Email").fill(adresse);
  await page.getByRole("button", { name: "Recevoir mon lien" }).click();

  const texte = await attendreMessage(adresse, "lien de connexion");
  await page.goto(extraireLien(texte));

  await expect(page.getByText("Bonjour, Awa Diop")).toBeVisible({ timeout: 15_000 });
});

test("la bascule masque le mot de passe et le rétablit", async ({ page }) => {
  await page.goto("/compte");

  // Par défaut : connexion classique.
  await expect(page.getByLabel("Mot de passe", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Lien par e-mail" }).click();
  await expect(page.getByLabel("Mot de passe", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Recevoir mon lien" })).toBeVisible();

  await page.getByRole("tab", { name: "Mot de passe" }).click();
  await expect(page.getByLabel("Mot de passe", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();
});

test("le mot de passe oublié annonce l'envoi sans révéler si le compte existe", async ({
  page,
}) => {
  await page.goto("/compte");
  await page.getByLabel("Email").fill(`inconnu-total-${marque}@test.sn`);
  await page.getByRole("button", { name: "Mot de passe oublié ?" }).click();

  // Formulation volontairement conditionnelle : confirmer l'existence d'un compte
  // permettrait de découvrir qui est client de la boutique.
  await expect(page.getByText(/Si un compte existe/i)).toBeVisible({ timeout: 15_000 });
});
