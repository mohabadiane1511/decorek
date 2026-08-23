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

    await page.waitForFunction(() => Array.from(document.images).every((img) => img.complete));

    const images = await page.evaluate(() =>
      Array.from(document.images).map((img) => ({
        src: img.currentSrc || img.src,
        chargée: img.naturalWidth > 0,
      })),
    );

    expect(images.length, `aucune image trouvée sur ${chemin}`).toBeGreaterThan(0);
    expect(
      images.filter((i) => !i.chargée).map((i) => i.src),
      `images non chargées sur ${chemin}`,
    ).toEqual([]);
  });
}
