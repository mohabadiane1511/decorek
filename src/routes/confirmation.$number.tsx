import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { ShopLayout } from "@/components/layout/ShopLayout";
import { RecapMontants } from "@/components/shop/RecapMontants";
import { formatFcfa, formatDate } from "@/lib/format";
import { useStore } from "@/lib/store";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { LIBELLES_PAIEMENT, lienPreuvePaiement, numeroDePaiement } from "@/lib/paiement";
import type { Order } from "@/data/types";

export const Route = createFileRoute("/confirmation/$number")({
  head: () => ({
    meta: [
      { title: "Commande confirmée | Deco'Rek" },
      {
        name: "description",
        content: "Votre commande Deco'Rek est enregistrée. Réglez par Wave ou Orange Money.",
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
          Commande <span className="text-foreground">{number}</span>. Il reste une étape : régler le
          montant ci-dessous, puis nous envoyer votre reçu.
        </p>

        {/* Placé avant le récapitulatif : c'est ce que la cliente doit faire maintenant.
            Sous le détail de sa commande, il fallait faire défiler pour le découvrir. */}
        {order && <ReglerCommande order={order} />}

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

            <RecapMontants order={order} libelleTotal="Total à régler" />
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

/**
 * Comment régler la commande, et comment le faire savoir.
 *
 * Le paiement précède la livraison : cet écran doit donner le numéro, le montant exact
 * et de quoi transmettre le reçu, sans que la cliente ait à chercher ailleurs. La
 * référence à indiquer en libellé du transfert évite à la boutique de deviner quel
 * virement correspond à quelle commande.
 */
function ReglerCommande({ order }: { order: Order }) {
  const { content } = useStore();
  const [annonce, setAnnonce] = useState(false);

  const numero = numeroDePaiement(content, order.paymentMethod);
  const lien = lienPreuvePaiement(order, content);

  return (
    <section className="mt-10 border border-foreground p-6 text-left">
      <h2 className="font-display text-xl tracking-tight">
        Régler par {LIBELLES_PAIEMENT[order.paymentMethod]}
      </h2>

      {numero ? (
        <dl className="mt-5 space-y-3 text-sm">
          {/* Les trois valeurs se recopient dans l'application de paiement : les rendre
              copiables évite une saisie à la main, où un chiffre se perd vite. Le
              montant est copié en chiffres nus, sans « FCFA » ni espaces, sinon
              l'application le refuse. */}
          <LigneCopiable libelle="Numéro à créditer" valeur={numero} />
          <LigneCopiable
            libelle="Montant exact"
            valeur={String(order.total)}
            affiche={formatFcfa(order.total)}
          />
          <LigneCopiable libelle="À indiquer en libellé" valeur={order.number} />
        </dl>
      ) : (
        // Aucun numéro renseigné : mieux vaut renvoyer vers la boutique que d'afficher
        // un vide où la cliente enverrait son argent au hasard.
        <p className="mt-4 text-sm text-muted-foreground">
          Contactez-nous pour recevoir les coordonnées de paiement.
        </p>
      )}

      <p className="mt-5 text-sm text-muted-foreground">
        Une fois le transfert effectué, envoyez-nous la capture de votre reçu. Votre commande est
        préparée dès que nous l'avons vérifié.
      </p>

      {lien && (
        <a
          href={lien}
          target="_blank"
          rel="noreferrer"
          onClick={() => {
            setAnnonce(true);
            // La commande passe en « paiement à vérifier » : l'équipe voit ainsi qu'une
            // preuve l'attend. L'échec est sans conséquence — le message part quand même,
            // et la vérification se fera à réception.
            void api.annoncerPaiement(order.number, order.customer.phone).catch(() => undefined);
          }}
          className="btn-square btn-solid mt-6 inline-block"
        >
          J'ai payé — envoyer mon reçu
        </a>
      )}

      {annonce && (
        <p className="mt-4 text-sm text-muted-foreground">
          N'oubliez pas de joindre la capture à votre message : WhatsApp ne peut pas l'attacher à
          notre place.
        </p>
      )}
    </section>
  );
}

/** Une valeur à recopier dans l'application de paiement, avec son bouton de copie. */
function LigneCopiable({
  libelle,
  valeur,
  affiche,
}: {
  libelle: string;
  valeur: string;
  affiche?: string;
}) {
  const [copie, setCopie] = useState(false);

  const copier = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(valeur);
      setCopie(true);
      // Le retour disparaît de lui-même : un « copié » qui reste laisse douter de ce
      // qui a été copié en dernier.
      setTimeout(() => setCopie(false), 2000);
    } catch {
      // Presse-papiers refusé par le navigateur : la valeur reste lisible et
      // sélectionnable à la main, on ne bloque rien.
      toast.error("Copie impossible — sélectionnez le texte à la main.");
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <dt className="text-muted-foreground">{libelle}</dt>
      <dd className="flex items-center gap-2">
        <span className="font-mono text-base">{affiche ?? valeur}</span>
        <button
          type="button"
          onClick={() => void copier()}
          aria-label={`Copier : ${libelle}`}
          className="label-mono border border-border px-2 py-1 transition-colors hover:bg-muted"
        >
          {copie ? "Copié" : "Copier"}
        </button>
      </dd>
    </div>
  );
}
