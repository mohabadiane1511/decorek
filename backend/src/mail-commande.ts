import type { Order } from "../../src/data/types.js";
import type { Config } from "./config.js";
import { rendre, type Article, type Courrier, type Ligne } from "./mail.js";

function fcfa(montant: number): string {
  return `${montant.toLocaleString("fr-FR").replace(/ | /g, " ")} FCFA`;
}

function articles(commande: Order): Article[] {
  return commande.items.map((l) => ({
    nom: l.name,
    quantite: l.quantity,
    prix: fcfa(l.price * l.quantity),
  }));
}

function totaux(commande: Order): Ligne[] {
  const lignes: Ligne[] = [{ libelle: "Sous-total", valeur: fcfa(commande.subtotal) }];
  if (commande.discount > 0) {
    lignes.push({
      libelle: `Remise ${commande.promoCode ?? ""}`.trim(),
      valeur: `-${fcfa(commande.discount)}`,
    });
  }
  lignes.push({
    libelle: "Livraison",
    valeur: commande.delivery.fee === 0 ? "Offerte" : fcfa(commande.delivery.fee),
  });
  lignes.push({ libelle: "Total à régler", valeur: fcfa(commande.total), accentue: true });
  return lignes;
}

function livraison(commande: Order): Ligne[] {
  const lignes: Ligne[] = [
    { libelle: "Zone", valeur: `${commande.delivery.areaName}, ${commande.delivery.regionName}` },
    { libelle: "Adresse", valeur: commande.delivery.address },
  ];
  if (commande.delivery.note)
    lignes.push({ libelle: "Indications", valeur: commande.delivery.note });
  return lignes;
}

/**
 * Confirmation envoyée au client.
 *
 * Ne contient que ce que le client sait déjà : sa propre commande. Aucun lien
 * d'administration, aucun identifiant, et le numéro de commande suffit au suivi — il
 * est protégé côté API par une limitation de débit contre l'énumération.
 */
export async function envoyerConfirmationClient(
  courrier: Courrier,
  config: Config,
  commande: Order,
): Promise<void> {
  const destinataire = commande.customer.email;
  // Commander sans adresse e-mail reste possible : dans ce cas il n'y a rien à envoyer,
  // et l'équipe rappelle au téléphone.
  if (!destinataire) return;

  const { texte, html } = rendre({
    surtitre: `Commande ${commande.number}`,
    titre: "Nous avons bien reçu votre commande",
    intro: `Merci ${commande.customer.name}. Notre équipe vous appelle au ${commande.customer.phone} pour confirmer la livraison. Le règlement se fait à la réception, après vérification de votre colis.`,
    articles: articles(commande),
    totaux: totaux(commande),
    informations: livraison(commande),
    lien: { url: `${config.AUTH_URL}/suivi`, libelle: "Suivre ma commande" },
    conclusion: `Conservez votre numéro de commande : ${commande.number}.`,
  });

  await courrier.envoyer({
    a: destinataire,
    sujet: `Votre commande ${commande.number} — Deco'Rek`,
    texte,
    html,
  });
}

/**
 * Alerte envoyée à l'équipe.
 *
 * Celle-ci porte les coordonnées du client, nécessaires pour organiser la livraison.
 * Elle ne part donc que vers l'adresse configurée du commerce, jamais vers une adresse
 * fournie dans la requête — sans quoi n'importe qui pourrait se faire adresser les
 * données personnelles d'un acheteur en passant une commande.
 */
export async function envoyerAlerteAdministration(
  courrier: Courrier,
  config: Config,
  commande: Order,
  adresseEquipe: string,
): Promise<void> {
  const { texte, html } = rendre({
    surtitre: "Nouvelle commande",
    titre: `${commande.number} — ${fcfa(commande.total)}`,
    intro: `${commande.customer.name} vient de commander. À rappeler au ${commande.customer.phone}${commande.customer.email ? ` (${commande.customer.email})` : ""} pour confirmer la livraison.`,
    articles: articles(commande),
    totaux: totaux(commande),
    informations: livraison(commande),
    lien: { url: `${config.AUTH_URL}/admin`, libelle: "Ouvrir le back-office" },
    conclusion: "Paiement à la livraison : encaissement à confirmer une fois le colis remis.",
  });

  await courrier.envoyer({
    a: adresseEquipe,
    sujet: `Nouvelle commande ${commande.number} — ${fcfa(commande.total)}`,
    texte,
    html,
  });
}
