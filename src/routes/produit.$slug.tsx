import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Minus, Plus, ShieldCheck, Truck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ShopLayout } from "@/components/layout/ShopLayout";
import { GalerieProduit } from "@/components/shop/GalerieProduit";
import { ProductCard } from "@/components/shop/ProductCard";
import { SqueletteFicheProduit } from "@/components/shop/Squelettes";
import { formatFcfa } from "@/lib/format";
import { ficheProduitJsonLd, SITE, urlAbsolue } from "@/lib/seo";
import { useQuery } from "@tanstack/react-query";
import { api, ErreurApi as ErreurApiClient } from "@/lib/api";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/produit/$slug")({
  /**
   * L'article est chargé avant le rendu, donc présent dans le HTML servi.
   *
   * Il arrivait auparavant après coup, dans le navigateur : la page envoyée était une
   * coquille vide. Or ni les robots des moteurs génératifs ni l'aperçu de WhatsApp
   * n'exécutent de script — partager un lien produit ne montrait donc ni son nom ni
   * sa photo, et aucune IA ne pouvait citer un seul article.
   */
  loader: async ({ params }) => {
    try {
      return await api.produit(params.slug);
    } catch (erreur) {
      if (erreur instanceof ErreurApiClient && erreur.statut === 404) throw notFound();
      throw erreur;
    }
  },

  head: ({ loaderData }) => {
    const produit = loaderData;
    if (!produit) return {};

    const titre = `${produit.name} — ${formatFcfa(produit.price)} | Deco'Rek`;
    // La description de l'article plutôt qu'une phrase passe-partout : c'est elle qui
    // s'affiche sous le lien dans les résultats de recherche.
    const description = produit.description
      ? produit.description.slice(0, 300)
      : `${produit.name} — livraison à Dakar, paiement par Wave ou Orange Money.`;
    const image = produit.images[0] ? urlAbsolue(produit.images[0]) : undefined;
    const url = `${SITE}/produit/${produit.slug}`;

    return {
      meta: [
        { title: titre },
        { name: "description", content: description },
        { property: "og:type", content: "product" },
        { property: "og:title", content: titre },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        ...(image ? [{ property: "og:image", content: image }] : []),
        // Sans dimensions, WhatsApp affiche parfois une vignette minuscule.
        ...(image ? [{ property: "og:image:alt", content: produit.name }] : []),
        { property: "product:price:amount", content: String(produit.price) },
        { property: "product:price:currency", content: "XOF" },
        {
          property: "product:availability",
          content: produit.stock > 0 ? "in stock" : "out of stock",
        },
        { name: "twitter:card", content: image ? "summary_large_image" : "summary" },
        ...(image ? [{ name: "twitter:image", content: image }] : []),
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [ficheProduitJsonLd(produit)],
    };
  },

  component: ProductPage,
  notFoundComponent: () => (
    <ShopLayout>
      <div className="mx-auto max-w-6xl px-4 py-24 text-center">
        <h1 className="title-lg">Article introuvable</h1>
        <Link to="/boutique" className="mt-6 inline-block text-sm underline">
          Retour à la boutique
        </Link>
      </div>
    </ShopLayout>
  ),
});

function ProductPage() {
  const { products, categories, addToCart, content } = useStore();
  const [qty, setQty] = useState(1);

  // L'article vient du chargeur de route, exécuté avant le rendu : il est donc déjà
  // dans le HTML envoyé. Le lire ici depuis une requête différée le ferait disparaître
  // de la page servie, ce qui est précisément ce qu'on corrige.
  const product = Route.useLoaderData();

  // Le chargeur lève déjà « introuvable » et remonte les autres pannes à la limite
  // d'erreur de la route : arrivé ici, l'article existe.

  const category = categories.find((c) => c.id === product.categoryId);
  const related = products
    .filter((p) => p.categoryId === product.categoryId && p.id !== product.id)
    .slice(0, 4);

  return (
    <ShopLayout>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <nav className="label-mono text-muted-foreground">
          <Link to="/boutique" className="hover:text-foreground">
            Boutique
          </Link>
          {category && (
            <>
              {" / "}
              <Link
                to="/boutique"
                search={{ categorie: category.slug }}
                className="hover:text-foreground"
              >
                {category.name}
              </Link>
            </>
          )}
        </nav>

        <div className="mt-6 grid gap-10 md:grid-cols-2">
          <GalerieProduit
            images={product.images}
            nom={product.name}
            /* Même place et même allure que sur la vignette du catalogue : la cliente
               qui ouvre la fiche cherche le badge là où elle vient de le voir. Sans
               lui, la fiche affichait deux prix sans dire qu'il s'agit d'une remise. */
            badge={
              product.oldPrice ? (
                <span className="label-mono absolute top-3 left-3 bg-orange-brand px-2 py-1 text-white">
                  Promo
                </span>
              ) : undefined
            }
          />

          <div>
            <p className="label-mono text-muted-foreground">{category?.name ?? "Deco'Rek"}</p>
            <h1 className="title-lg mt-3">{product.name}</h1>
            <p className="mt-4 flex items-baseline gap-3">
              <span className="font-mono text-2xl">{formatFcfa(product.price)}</span>
              {product.oldPrice && (
                <span className="text-sm text-muted-foreground line-through">
                  {formatFcfa(product.oldPrice)}
                </span>
              )}
            </p>
            <p className="mt-6 leading-relaxed text-muted-foreground">{product.description}</p>

            <p className="label-mono mt-6">
              {product.stock === 0 ? (
                <span className="text-destructive">Article épuisé</span>
              ) : product.stock <= product.lowStockThreshold ? (
                <span className="text-orange-brand">Plus que {product.stock} en stock</span>
              ) : (
                <span className="text-muted-foreground">En stock</span>
              )}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <div className="flex items-center border border-border">
                <button
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  className="grid h-11 w-11 place-items-center hover:bg-muted"
                  aria-label="Diminuer"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-10 text-center text-sm">{qty}</span>
                <button
                  onClick={() => setQty((q) => Math.min(product.stock || 1, q + 1))}
                  className="grid h-11 w-11 place-items-center hover:bg-muted"
                  aria-label="Augmenter"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <button
                disabled={product.stock === 0}
                onClick={() => {
                  addToCart(product.id, qty);
                  toast.success("Article ajouté au panier");
                }}
                className="btn-square btn-solid flex-1 disabled:opacity-40"
              >
                Ajouter au panier
              </button>
            </div>

            <div className="mt-8 space-y-3 border-t border-border pt-6 text-sm text-muted-foreground">
              <p className="flex items-start gap-2">
                <Truck className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} />
                Livraison à Dakar sous 24-48h, régions sous 2 à 5 jours.
              </p>
              <p className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} />
                Paiement par Wave ou Orange Money avant expédition.
              </p>
              <p>
                Une question ?{" "}
                <a
                  className="underline"
                  href={`https://wa.me/${content.whatsapp}?text=${encodeURIComponent(`Bonjour, je souhaite des informations sur : ${product.name}`)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Écrivez-nous sur WhatsApp
                </a>
              </p>
            </div>
          </div>
        </div>

        {related.length > 0 && (
          <section className="mt-20">
            <p className="section-index">Sélection</p>
            <h2 className="title-lg mt-4">Vous aimerez aussi.</h2>
            <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-12 lg:grid-cols-4">
              {related.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        )}
      </div>
    </ShopLayout>
  );
}
