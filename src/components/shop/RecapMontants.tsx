import { formatFcfa } from "@/lib/format";
import type { Order } from "@/data/types";

/**
 * Détail de ce qui compose le montant d'une commande.
 *
 * Les écrans n'affichaient que les articles puis le total. Dès qu'un code promo ou des
 * frais de livraison entraient en jeu, les deux ne s'accordaient plus : un article à
 * 24 000 suivi d'un total de 23 600 se lit comme une erreur de la boutique, alors que
 * le compte est juste. L'e-mail de confirmation détaillait déjà ces lignes ; les pages
 * disent maintenant la même chose.
 */
export function RecapMontants({
  order,
  libelleTotal = "Total",
}: {
  order: Order;
  libelleTotal?: string;
}) {
  return (
    <dl className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
      <Ligne libelle="Sous-total" valeur={formatFcfa(order.subtotal)} />

      {order.discount > 0 && (
        <Ligne
          libelle={`Remise${order.promoCode ? ` ${order.promoCode}` : ""}`}
          valeur={`−${formatFcfa(order.discount)}`}
        />
      )}

      <Ligne
        libelle="Livraison"
        // Zéro affiché « Offerte » : « 0 FCFA » se lit comme un oubli, alors que la
        // gratuité au-delà d'un montant est un argument de la boutique.
        valeur={order.delivery.fee === 0 ? "Offerte" : formatFcfa(order.delivery.fee)}
      />

      <div className="flex justify-between border-t border-border pt-3 font-medium">
        <dt>{libelleTotal}</dt>
        <dd className="font-mono">{formatFcfa(order.total)}</dd>
      </div>
    </dl>
  );
}

function Ligne({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <dt>{libelle}</dt>
      <dd className="font-mono">{valeur}</dd>
    </div>
  );
}
