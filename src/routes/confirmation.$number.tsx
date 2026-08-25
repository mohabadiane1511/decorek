import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { ShopLayout } from "@/components/layout/ShopLayout";
import { RecapMontants } from "@/components/shop/RecapMontants";
import { formatFcfa, formatDate } from "@/lib/format";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/confirmation/$number")({
  head: () => ({
    meta: [
      { title: "Commande confirmée | Deco'Rek" },
      {
        name: "description",
        content: "Votre commande Deco'Rek est enregistrée. Paiement à la livraison.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Commande confirmée — Deco'Rek" },
      { property: "og:description", content: "Merci pour votre commande." },
    ],
  }),
  component: Confirmation,
});

function Confirmation() {
  const { number } = Route.useParams();
  const { orders, content } = useStore();
  const order = orders.find((o) => o.number === number);

  return (
    <ShopLayout>
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-orange-brand" strokeWidth={1.25} />
        <h1 className="mt-6 title-lg">Merci, votre commande est validée</h1>
        <p className="mt-3 text-muted-foreground">
          Commande <span className="text-foreground">{number}</span>. Notre équipe vous appelle pour
          confirmer la livraison. Vous réglerez à la réception.
        </p>

        {order && (
          <div className="mt-10 border border-border p-6 text-left text-sm">
            <p className="text-muted-foreground">Passée le {formatDate(order.createdAt)}</p>
            <ul className="mt-4 space-y-3">
              {order.items.map((i) => (
                <li key={i.productId} className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-3">
                    {i.image ? (
                      <img
                        src={i.image}
                        alt={i.name}
                        loading="lazy"
                        className="h-14 w-14 shrink-0 border border-border object-cover"
                      />
                    ) : (
                      <span className="h-14 w-14 shrink-0 border border-border bg-muted" />
                    )}
                    <span className="min-w-0 truncate text-muted-foreground">
                      {i.name} × {i.quantity}
                    </span>
                  </span>
                  <span>{formatFcfa(i.price * i.quantity)}</span>
                </li>
              ))}
            </ul>

            <RecapMontants order={order} libelleTotal="Total à payer à la livraison" />
            <p className="mt-4 text-muted-foreground">
              Livraison : {order.delivery.areaName}, {order.delivery.regionName} —{" "}
              {order.delivery.address}
            </p>
          </div>
        )}

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/suivi" className="btn-square btn-solid">
            Suivre ma commande
          </Link>
          <a
            href={`https://wa.me/${content.whatsapp}?text=${encodeURIComponent(`Bonjour, ma commande ${number}`)}`}
            target="_blank"
            rel="noreferrer"
            className="border border-border px-6 py-3 text-sm transition-colors hover:bg-muted"
          >
            Nous écrire
          </a>
        </div>
      </div>
    </ShopLayout>
  );
}
