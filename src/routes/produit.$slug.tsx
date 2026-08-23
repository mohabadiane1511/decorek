import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Minus, Plus, ShieldCheck, Truck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ShopLayout } from "@/components/layout/ShopLayout";
import { ProductCard } from "@/components/shop/ProductCard";
import { formatFcfa } from "@/lib/format";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/produit/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `Article ${params.slug.replace(/-/g, " ")} | Deco'Rek` },
      {
        name: "description",
        content: "Découvrez cet article Deco'Rek : prix en FCFA, stock et livraison au Sénégal.",
      },
      { property: "og:title", content: "Article Deco'Rek" },
      {
        property: "og:description",
        content: "Vaisselle et décoration livrées à Dakar, paiement à la livraison.",
      },
    ],
  }),
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
  const { slug } = Route.useParams();
  const { products, categories, addToCart, content } = useStore();
  const [qty, setQty] = useState(1);

  const product = products.find((p) => p.slug === slug);
  if (!product) throw notFound();

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
          <div className="mx-auto aspect-[4/5] w-full max-w-[560px] overflow-hidden bg-sand">
            <img
              src={product.images[0]}
              alt={product.name}
              className="h-full w-full object-cover"
            />
          </div>

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
                <span className="text-orange-brand">
                  Plus que {product.stock} en stock
                </span>
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
                Paiement à la livraison — vous réglez après vérification.
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
