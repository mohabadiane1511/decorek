import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Les photos d'un article.
 *
 * La fiche n'affichait que la première : les autres étaient enregistrées, visibles au
 * back-office, mais introuvables pour la cliente. Sur des pièces de décoration, où
 * l'on veut voir la matière et le dos d'un objet avant d'acheter, cela revenait à
 * cacher l'essentiel.
 *
 * Une image principale, des vignettes dessous, et des flèches pour le tactile. Quand
 * il n'y a qu'une photo, l'affichage reste exactement celui d'avant : ni vignette ni
 * flèche pour meubler.
 */
export function GalerieProduit({
  images,
  nom,
  badge,
}: {
  images: string[];
  nom: string;
  badge?: React.ReactNode;
}) {
  const [index, setIndex] = useState(0);

  // Changer d'article remet la galerie au début : garder la troisième photo
  // sélectionnée montrerait le mauvais objet, ou rien du tout si le nouvel article en
  // a moins.
  useEffect(() => {
    setIndex(0);
  }, [images]);

  const total = images.length;
  const courante = images[Math.min(index, Math.max(0, total - 1))];

  const aller = (pas: number): void => {
    if (total < 2) return;
    // La galerie boucle : après la dernière photo on revient à la première, plutôt que
    // de buter sur une flèche morte.
    setIndex((i) => (i + pas + total) % total);
  };

  return (
    <div>
      <div className="relative mx-auto aspect-[4/5] w-full max-w-[560px] overflow-hidden bg-sand">
        {courante ? (
          <img
            src={courante}
            alt={total > 1 ? `${nom} — photo ${index + 1} sur ${total}` : nom}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="block h-full w-full bg-sand" />
        )}

        {badge}

        {total > 1 && (
          <>
            <button
              type="button"
              onClick={() => aller(-1)}
              aria-label="Photo précédente"
              className="absolute top-1/2 left-3 grid h-10 w-10 -translate-y-1/2 place-items-center bg-background/90 transition-colors hover:bg-background"
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
            </button>
            <button
              type="button"
              onClick={() => aller(1)}
              aria-label="Photo suivante"
              className="absolute top-1/2 right-3 grid h-10 w-10 -translate-y-1/2 place-items-center bg-background/90 transition-colors hover:bg-background"
            >
              <ChevronRight className="h-5 w-5" strokeWidth={1.5} />
            </button>
            <span className="label-mono absolute right-3 bottom-3 bg-background/90 px-2 py-1">
              {index + 1} / {total}
            </span>
          </>
        )}
      </div>

      {total > 1 && (
        // Les vignettes défilent sur un écran étroit plutôt que de rétrécir jusqu'à
        // devenir indéchiffrables.
        <div className="mx-auto mt-3 flex max-w-[560px] gap-3 overflow-x-auto pb-1">
          {images.map((image, i) => (
            <button
              key={image}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Voir la photo ${i + 1}`}
              aria-current={i === index}
              className={`h-20 w-20 shrink-0 overflow-hidden border-2 transition-colors ${
                i === index ? "border-foreground" : "border-transparent hover:border-border"
              }`}
            >
              <img src={image} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
