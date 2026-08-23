import { expect, test } from "@playwright/test";

// Les images étaient servies par le proxy d'assets Lovable, injoignable hors de leur
// infrastructure. Elles vivent désormais dans public/images/ : ce test empêche la régression.
for (const chemin of ["/", "/boutique"]) {
  test(`aucune image cassée sur ${chemin}`, async ({ page }) => {
    await page.goto(chemin);

    // Les cartes produit sont en loading="lazy" : sans défilement, les images hors écran
    // ne sont jamais demandées et paraîtraient cassées.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          let y = 0;
          const pas = () => {
            y += window.innerHeight;
            window.scrollTo(0, y);
            if (y < document.body.scrollHeight) {
              setTimeout(pas, 100);
            } else {
              window.scrollTo(0, 0);
              resolve();
            }
          };
          pas();
        }),
    );

    // Relevé répété plutôt qu'unique : le déclenchement du chargement différé et la
    // réception des images ne sont pas synchrones, et un contrôle pris à un seul instant
    // rend le test instable — il échouait environ une fois sur cinq.
    await expect
      .poll(
        async () =>
          page.evaluate(() =>
            Array.from(document.images)
              .filter((img) => !img.complete || img.naturalWidth === 0)
              .map((img) => img.currentSrc || img.src),
          ),
        { message: `images non chargées sur ${chemin}`, timeout: 15_000 },
      )
      .toEqual([]);

    const total = await page.evaluate(() => document.images.length);
    expect(total, `aucune image trouvée sur ${chemin}`).toBeGreaterThan(0);
  });
}
