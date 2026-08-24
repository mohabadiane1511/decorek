import { Link } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import type { Product } from "@/data/types";
import { formatFcfa } from "@/lib/format";
import { useStore } from "@/lib/store";
import { toast } from "sonner";

export function ProductCard({ product }: { product: Product }) {
  const { addToCart, categories, basculerFavori, estFavori } = useStore();
  const favori = estFavori(product.id);
  const category = categories.find((c) => c.id === product.categoryId);
  const soldOut = product.stock === 0;

  return (
    <article className="group relative flex h-full flex-col">
      <Link
        to="/produit/$slug"
        params={{ slug: product.slug }}
        className="relative block aspect-[4/5] overflow-hidden bg-sand"
        aria-label={product.name}
      >
        <img
          src={product.images[0]}
          alt={product.name}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
        />
        <div className="absolute top-3 left-3 flex flex-col items-start gap-1.5">
          {product.oldPrice && (
            <span className="label-mono bg-orange-brand px-2 py-1 text-white">Promo</span>
          )}
          {product.featured && !product.oldPrice && (
            <span className="label-mono bg-foreground px-2 py-1 text-background">Sélection</span>
          )}
          {soldOut && (
            <span className="label-mono bg-background px-2 py-1 text-foreground">Épuisé</span>
          )}
        </div>
        {/* Hors du lien : imbriquer un bouton dans un lien empêche de cliquer l'un
            sans déclencher l'autre. */}
      </Link>

      <button
        type="button"
        onClick={() => {
          basculerFavori(product.id);
          toast.success(favori ? "Retiré de vos favoris" : "Ajouté à vos favoris");
        }}
        aria-pressed={favori}
        aria-label={
          favori ? `Retirer ${product.name} des favoris` : `Ajouter ${product.name} aux favoris`
        }
        className="absolute top-3 right-3 grid h-9 w-9 place-items-center bg-background/90 transition-colors hover:bg-background"
      >
        <Heart
          className={`h-4 w-4 ${favori ? "fill-orange-brand text-orange-brand" : "text-foreground"}`}
          strokeWidth={1.5}
        />
      </button>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="label-mono min-w-0 truncate text-muted-foreground">
          {category?.name ?? "Deco'Rek"}
        </span>
        <span className="flex min-w-0 flex-wrap items-baseline gap-2 font-mono text-xs sm:text-sm">
          {product.oldPrice && (
            <span className="text-xs text-muted-foreground line-through">
              {formatFcfa(product.oldPrice)}
            </span>
          )}
          {formatFcfa(product.price)}
        </span>
      </div>

      <Link
        to="/produit/$slug"
        params={{ slug: product.slug }}
        className="mt-1 line-clamp-2 min-h-[2.6em] text-[0.95rem] leading-snug"
      >
        {product.name}
      </Link>

      <button
        type="button"
        disabled={soldOut}
        onClick={() => {
          addToCart(product.id, 1);
          toast.success("Ajouté au panier", { description: product.name });
        }}
        className="btn-square btn-solid mt-auto w-full disabled:cursor-not-allowed disabled:border-border disabled:bg-transparent disabled:text-muted-foreground disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
      >
        {soldOut ? "Indisponible" : "Ajouter au panier"}
      </button>
    </article>
  );
}
