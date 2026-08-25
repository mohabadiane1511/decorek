import { Link, useNavigate } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { api } from "@/lib/api";
import { formatFcfa } from "@/lib/format";
import { useDebounce } from "@/lib/useDebounce";

/**
 * Recherche de l'en-tête, avec ses résultats sous le champ.
 *
 * Les articles paraissent à la frappe, avec leur photo et leur prix : taper puis
 * valider pour découvrir une page de résultats coupe l'élan, alors qu'on cherche
 * souvent à reconnaître un article plutôt qu'à le nommer exactement.
 *
 * La touche Entrée reste utile — elle ouvre la boutique filtrée, pour comparer
 * tranquillement — mais elle n'est plus le seul chemin.
 */

/** En dessous, presque tout le catalogue ressort : la liste n'apprendrait rien. */
const MINIMUM_CARACTERES = 2;

/** Assez pour reconnaître un article, assez court pour tenir sur un téléphone. */
const RESULTATS_MAX = 6;

export function RechercheRapide({ surFermeture }: { surFermeture: () => void }) {
  const navigate = useNavigate();
  const champ = useRef<HTMLInputElement>(null);
  const conteneur = useRef<HTMLDivElement>(null);
  const [terme, setTerme] = useState("");
  const [actif, setActif] = useState(-1);
  const identifiantListe = useId();

  const recherche = useDebounce(terme.trim(), 250);
  const assezLong = recherche.length >= MINIMUM_CARACTERES;

  const { data, isFetching } = useQuery({
    queryKey: ["recherche-rapide", recherche],
    queryFn: ({ signal }) => api.produits({ q: recherche, parPage: RESULTATS_MAX }, signal),
    enabled: assezLong,
    // Les résultats précédents restent affichés pendant la frappe suivante : sans
    // cela, la liste clignote à chaque lettre.
    placeholderData: keepPreviousData,
  });

  const resultats = assezLong ? (data?.items ?? []) : [];
  const total = data?.total ?? 0;

  // Le curseur va dans le champ à l'ouverture : viser deux fois au doigt est pénible.
  useEffect(() => {
    champ.current?.focus();
  }, []);

  // Un clic ailleurs referme, comme n'importe quel panneau de ce genre.
  useEffect(() => {
    const surClic = (evenement: MouseEvent): void => {
      if (!conteneur.current?.contains(evenement.target as Node)) surFermeture();
    };
    document.addEventListener("mousedown", surClic);
    return () => document.removeEventListener("mousedown", surClic);
  }, [surFermeture]);

  // Une nouvelle recherche annule la sélection : garder la troisième ligne surlignée
  // alors que la liste a changé ferait ouvrir un article qu'on n'a pas visé.
  useEffect(() => {
    setActif(-1);
  }, [recherche]);

  const ouvrirBoutique = (): void => {
    const q = terme.trim();
    if (!q) return;
    surFermeture();
    void navigate({ to: "/boutique", search: { q } });
  };

  const ouvrirArticle = (slug: string): void => {
    surFermeture();
    void navigate({ to: "/produit/$slug", params: { slug } });
  };

  const surTouche = (evenement: React.KeyboardEvent<HTMLInputElement>): void => {
    if (evenement.key === "Escape") {
      surFermeture();
      return;
    }
    // La liste boucle : arrivé en bas, on repart en haut plutôt que de rester bloqué.
    if (evenement.key === "ArrowDown") {
      if (resultats.length === 0) return;
      evenement.preventDefault();
      setActif((i) => (i + 1 >= resultats.length ? 0 : i + 1));
      return;
    }
    if (evenement.key === "ArrowUp") {
      if (resultats.length === 0) return;
      evenement.preventDefault();
      setActif((i) => (i <= 0 ? resultats.length - 1 : i - 1));
      return;
    }
    if (evenement.key === "Enter") {
      evenement.preventDefault();
      const choisi = resultats[actif];
      // Entrée ouvre l'article surligné s'il y en a un, sinon la boutique filtrée.
      if (choisi) ouvrirArticle(choisi.slug);
      else ouvrirBoutique();
    }
  };

  return (
    <div ref={conteneur} className="border-b border-border bg-background">
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            ouvrirBoutique();
          }}
          className="flex items-center gap-2"
        >
          <input
            ref={champ}
            type="search"
            value={terme}
            onChange={(e) => setTerme(e.target.value)}
            onKeyDown={surTouche}
            placeholder="Rechercher un article…"
            aria-label="Rechercher un article"
            // Décrit comme une liste déroulante : le lecteur d'écran annonce alors
            // l'arrivée des résultats et la ligne surlignée.
            role="combobox"
            aria-expanded={resultats.length > 0}
            aria-controls={identifiantListe}
            aria-autocomplete="list"
            {...(actif >= 0 && resultats[actif]
              ? { "aria-activedescendant": `${identifiantListe}-${actif}` }
              : {})}
            className="h-10 min-w-0 flex-1 border border-input bg-background px-3 text-sm"
          />
          <button type="submit" className="btn-square btn-solid h-10">
            Rechercher
          </button>
        </form>

        <div id={identifiantListe} role="listbox" aria-label="Résultats de la recherche">
          {resultats.map((produit, index) => (
            <Link
              key={produit.id}
              to="/produit/$slug"
              params={{ slug: produit.slug }}
              id={`${identifiantListe}-${index}`}
              role="option"
              aria-selected={index === actif}
              onClick={surFermeture}
              onMouseEnter={() => setActif(index)}
              className={`mt-2 flex items-center gap-3 border border-transparent p-2 transition-colors ${
                index === actif ? "bg-muted" : "hover:bg-muted"
              }`}
            >
              {produit.images[0] ? (
                <img
                  src={produit.images[0]}
                  alt=""
                  loading="lazy"
                  className="h-14 w-14 shrink-0 bg-sand object-cover"
                />
              ) : (
                <span className="h-14 w-14 shrink-0 bg-sand" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{produit.name}</span>
                <span className="mt-0.5 flex items-baseline gap-2">
                  <span className="font-mono text-sm">{formatFcfa(produit.price)}</span>
                  {produit.oldPrice && (
                    <span className="text-xs text-muted-foreground line-through">
                      {formatFcfa(produit.oldPrice)}
                    </span>
                  )}
                  {produit.stock === 0 && (
                    <span className="label-mono text-destructive">Épuisé</span>
                  )}
                </span>
              </span>
            </Link>
          ))}

          {/* Ce qui suit se dit à la voix aussi : sans cela, l'arrivée ou l'absence de
              résultats ne serait perceptible qu'à l'œil. */}
          <p aria-live="polite" className="sr-only">
            {assezLong && !isFetching
              ? total === 0
                ? "Aucun article ne correspond."
                : `${total} article${total > 1 ? "s" : ""} trouvé${total > 1 ? "s" : ""}.`
              : ""}
          </p>

          {assezLong && resultats.length === 0 && !isFetching && (
            <p className="py-4 text-sm text-muted-foreground">
              Aucun article ne correspond à « {recherche} ».
            </p>
          )}

          {total > resultats.length && (
            <button
              type="button"
              onClick={ouvrirBoutique}
              className="label-mono mt-3 w-full border border-border py-3 transition-colors hover:bg-muted"
            >
              Voir les {total} résultats
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
