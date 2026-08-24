/**
 * Silhouettes affichées pendant le chargement.
 *
 * Elles reprennent la forme exacte du contenu attendu — même proportion d'image, mêmes
 * hauteurs de lignes — pour que rien ne se déplace à l'arrivée des données. Un texte
 * « Chargement… » remplacé par une grille fait sauter toute la page ; une silhouette de
 * la bonne taille, non.
 *
 * Angles droits et gris sable, comme le reste du site : le composant `Skeleton` fourni
 * par la bibliothèque arrondit les coins, ce qui jurerait ici.
 */

function Bloc({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-sand ${className}`} />;
}

/** Silhouette d'une carte produit : image en 4/5, catégorie, nom, prix. */
export function SqueletteCarteProduit() {
  return (
    <article aria-hidden="true">
      <Bloc className="aspect-[4/5] w-full" />
      <div className="mt-4 space-y-2">
        <Bloc className="h-2.5 w-1/3" />
        <Bloc className="h-4 w-4/5" />
        <Bloc className="h-3 w-1/4" />
      </div>
    </article>
  );
}

/**
 * Grille de silhouettes, aux mêmes colonnes que le catalogue.
 *
 * Le nombre affiché correspond à une page complète : en montrer moins laisserait
 * croire que le catalogue est presque vide.
 */
export function SqueletteGrilleProduits({ nombre = 8 }: { nombre?: number }) {
  return (
    <div
      className="mt-12 grid grid-cols-2 gap-x-6 gap-y-14 md:grid-cols-3 xl:grid-cols-4"
      role="status"
      aria-label="Chargement des articles"
    >
      {Array.from({ length: nombre }, (_, i) => (
        <SqueletteCarteProduit key={i} />
      ))}
    </div>
  );
}

/** Silhouette d'une fiche produit : galerie à gauche, informations à droite. */
export function SqueletteFicheProduit() {
  return (
    <div
      className="mx-auto max-w-7xl px-4 py-8 sm:px-6"
      role="status"
      aria-label="Chargement de l'article"
    >
      <Bloc className="h-2.5 w-40" />
      <div className="mt-6 grid gap-10 md:grid-cols-2">
        <Bloc className="mx-auto aspect-[4/5] w-full max-w-[560px]" />
        <div className="space-y-4">
          <Bloc className="h-2.5 w-24" />
          <Bloc className="h-8 w-3/4" />
          <Bloc className="h-6 w-32" />
          <div className="space-y-2 pt-4">
            <Bloc className="h-3 w-full" />
            <Bloc className="h-3 w-full" />
            <Bloc className="h-3 w-2/3" />
          </div>
          <Bloc className="h-11 w-full" />
        </div>
      </div>
    </div>
  );
}

/** Silhouette de la page d'accueil, le temps du premier chargement. */
export function SqueletteAccueil() {
  return (
    <div className="flex-1" role="status" aria-label="Chargement de la boutique">
      <Bloc className="h-[60svh] w-full" />
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <Bloc className="h-2.5 w-40" />
        <Bloc className="mt-5 h-10 w-2/3 max-w-lg" />
        <SqueletteGrilleProduits nombre={4} />
      </div>
    </div>
  );
}
