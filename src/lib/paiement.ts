import { formatFcfa } from "@/lib/format";
import type { Order, PaymentMethod, SiteContent } from "@/data/types";

/**
 * Ce qu'il faut pour régler une commande avant sa livraison.
 *
 * Le paiement se fait par Wave ou Orange Money, puis la cliente envoie sa preuve sur
 * WhatsApp. Un lien WhatsApp ne peut pas transporter d'image : il pré-remplit le texte,
 * et c'est la cliente qui joint sa capture. Le message porte donc tout ce qu'il faut
 * pour rapprocher le paiement de la commande sans avoir à poser de question.
 */

export const LIBELLES_PAIEMENT: Record<PaymentMethod, string> = {
  wave: "Wave",
  orange_money: "Orange Money",
  especes: "Espèces à la livraison",
};

/** Le numéro où envoyer l'argent, selon le mode choisi. Vide s'il n'est pas renseigné. */
export function numeroDePaiement(contenu: SiteContent, mode: PaymentMethod): string {
  if (mode === "wave") return contenu.waveNumber.trim();
  if (mode === "orange_money") return contenu.orangeMoneyNumber.trim();
  return "";
}

/**
 * Au-delà, l'adresse du lien devient trop longue et WhatsApp la refuse.
 * Le reste est résumé plutôt que de risquer un lien cassé.
 */
const ARTICLES_DETAILLES = 8;

/** Ne garde que les chiffres : wa.me n'accepte ni espaces ni signe plus. */
function numeroWhatsApp(brut: string): string {
  return brut.replace(/\D/g, "");
}

/** Le message que la cliente enverra avec sa capture. */
export function messagePreuvePaiement(commande: Order): string {
  const lignes: string[] = [
    "Bonjour Deco'Rek,",
    `Commande ${commande.number}`,
    "",
    `${commande.customer.name} — ${commande.customer.phone}`,
    `Livraison : ${commande.delivery.areaName}, ${commande.delivery.regionName}`,
    commande.delivery.address,
    "",
  ];

  const detailles = commande.items.slice(0, ARTICLES_DETAILLES);
  for (const article of detailles) {
    lignes.push(
      `• ${article.quantity} × ${article.name} — ${formatFcfa(article.price * article.quantity)}`,
    );
  }
  const reste = commande.items.length - detailles.length;
  if (reste > 0)
    lignes.push(`• et ${reste} autre${reste > 1 ? "s" : ""} article${reste > 1 ? "s" : ""}`);

  lignes.push("");
  lignes.push(`Sous-total : ${formatFcfa(commande.subtotal)}`);
  if (commande.discount > 0) {
    lignes.push(
      `Remise${commande.promoCode ? ` ${commande.promoCode}` : ""} : -${formatFcfa(commande.discount)}`,
    );
  }
  lignes.push(
    `Livraison : ${commande.delivery.fee === 0 ? "offerte" : formatFcfa(commande.delivery.fee)}`,
  );
  lignes.push(`TOTAL PAYÉ : ${formatFcfa(commande.total)}`);
  lignes.push("");
  lignes.push(`Payé par ${LIBELLES_PAIEMENT[commande.paymentMethod]}.`);
  lignes.push("Voici la capture de mon paiement :");

  return lignes.join("\n");
}

/**
 * Lien WhatsApp prêt à l'emploi, message compris.
 *
 * Renvoie une chaîne vide si le numéro de la boutique n'est pas renseigné : un lien
 * vers un destinataire inexistant enverrait la cliente sur une erreur au moment où elle
 * cherche à payer.
 */
export function lienPreuvePaiement(commande: Order, contenu: SiteContent): string {
  const destinataire = numeroWhatsApp(contenu.whatsapp);
  if (!destinataire) return "";
  return `https://wa.me/${destinataire}?text=${encodeURIComponent(messagePreuvePaiement(commande))}`;
}
