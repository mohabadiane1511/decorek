import { test as base, expect } from "@playwright/test";

/**
 * Le `test` de Playwright, complété d'une attente d'hydratation.
 *
 * Les pages sont rendues par le serveur : leur contenu s'affiche avant que le script
 * ne soit prêt, et un clic émis dans cet intervalle est simplement perdu. Sans cette
 * attente, un test paraîtrait échouer alors que le site fonctionne — il aurait
 * seulement agi trop tôt.
 *
 * L'attente est posée sur la navigation elle-même plutôt que rappelée dans chaque
 * test : on ne peut pas oublier ce qu'on n'a pas à écrire.
 */
export const test = base.extend({
  // Le second paramètre s'appelle « use » chez Playwright : renommé ici, faute de quoi
  // le linter React le prend pour un hook.
  page: async ({ page }, utiliser) => {
    const naviguer = page.goto.bind(page);

    // Posé par l'application une fois React monté. Le délai reste large : en
    // développement, le premier chargement compile les modules à la demande.
    const attendreInteractif = () =>
      page.waitForSelector("html[data-pret='1']", { timeout: 30_000 }).catch(() => undefined);

    page.goto = async (url, options) => {
      const reponse = await naviguer(url, options);
      await attendreInteractif();
      return reponse;
    };

    // Le retour arrière recharge la page comme une navigation ordinaire : sans cette
    // attente, l'écran revient mais ne répond pas encore.
    const revenir = page.goBack.bind(page);
    page.goBack = async (options) => {
      const reponse = await revenir(options);
      await attendreInteractif();
      return reponse;
    };

    await utiliser(page);
  },
});

export { expect };
