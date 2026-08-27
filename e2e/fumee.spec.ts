import { expect, test } from "./fixtures.js";

/**
 * Contrôle de fumée : chaque page publique s'affiche sans erreur JavaScript.
 *
 * Ajouté après un incident où un champ absent de la réponse de l'API faisait échouer
 * le pied de page — et, par ricochet, toute la page. Les autres tests visaient des
 * éléments précis et ne remarquaient rien tant que ces éléments-là s'affichaient ;
 * celui-ci écoute les erreurs du navigateur, quelles qu'elles soient.
 */
const PAGES = ["/", "/boutique", "/panier", "/compte", "/contact", "/livraison", "/cgv", "/suivi"];

for (const chemin of PAGES) {
  test(`aucune erreur console sur ${chemin}`, async ({ page }) => {
    const erreurs: string[] = [];
    page.on("pageerror", (e) => erreurs.push(e.message));
    page.on("console", (m) => {
      // Les avertissements de développement de React ne sont pas des défauts.
      if (m.type() === "error" && !m.text().includes("Download the React DevTools")) {
        erreurs.push(m.text());
      }
    });

    await page.goto(chemin, { waitUntil: "networkidle" });

    // Le pied de page est le dernier élément rendu : le voir signifie que l'arbre
    // complet a tenu.
    await expect(page.locator("footer")).toBeVisible();
    expect(erreurs, `erreurs relevées sur ${chemin}`).toEqual([]);
  });
}
