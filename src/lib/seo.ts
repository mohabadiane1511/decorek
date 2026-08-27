import type { Product } from "@/data/types";
import { SITE_URL } from "./site";

/**
 * Ce que les moteurs — de recherche comme génératifs — doivent trouver dans une page.
 *
 * Deux choses seulement, mais indispensables : une adresse canonique, pour que le même
 * article ne compte pas plusieurs fois, et des données structurées, qui donnent le prix
 * et la disponibilité sans avoir à interpréter la mise en page. C'est ce format que
 * lisent aussi bien Google que les moteurs qui répondent en langage naturel.
 */

/**
 * Adresse publique du site, sans barre oblique finale.
 *
 * Reprend la constante déjà utilisée pour les aperçus de partage : deux définitions
 * finiraient par diverger, et un canonique pointant vers le mauvais domaine ferait
 * disparaître le site des résultats.
 */
export const SITE = SITE_URL.replace(/\/$/, "");

/** Complète un chemin en adresse absolue : les aperçus de partage l'exigent. */
export function urlAbsolue(chemin: string): string {
  if (/^https?:\/\//.test(chemin)) return chemin;
  return `${SITE}${chemin.startsWith("/") ? "" : "/"}${chemin}`;
}

/** Balise à insérer dans l'en-tête d'une page. */
type Script = { type: "application/ld+json"; children: string };

function jsonLd(donnees: Record<string, unknown>): Script {
  return {
    type: "application/ld+json",
    // Les chevrons sont échappés : un nom d'article contenant « </script> » couperait
    // la balise et casserait la page.
    children: JSON.stringify(donnees).replace(/</g, "\\u003c"),
  };
}

/** L'entreprise, telle qu'un moteur doit la comprendre. */
export function boutiqueJsonLd(contact?: {
  telephone?: string | undefined;
  email?: string | undefined;
  adresse?: string | undefined;
}): Script {
  return jsonLd({
    "@context": "https://schema.org",
    "@type": "Store",
    name: "Deco'Rek",
    description:
      "Vaisselle, décoration et mobilier de réception à Dakar. Paiement à la livraison, prix en FCFA.",
    url: SITE,
    image: urlAbsolue("/images/logo-decorek.png"),
    // Le pays et la devise valent autant que l'adresse : ils disent à qui s'adresse la
    // boutique, ce qu'une IA reprend pour répondre « où acheter à Dakar ».
    address: {
      "@type": "PostalAddress",
      addressLocality: "Dakar",
      addressCountry: "SN",
      ...(contact?.adresse ? { streetAddress: contact.adresse } : {}),
    },
    areaServed: { "@type": "Country", name: "Sénégal" },
    currenciesAccepted: "XOF",
    paymentAccepted: "Espèces à la livraison",
    ...(contact?.telephone ? { telephone: contact.telephone } : {}),
    ...(contact?.email ? { email: contact.email } : {}),
  });
}

/** Un article, avec son prix et sa disponibilité. */
export function ficheProduitJsonLd(produit: Product): Script {
  return jsonLd({
    "@context": "https://schema.org",
    "@type": "Product",
    name: produit.name,
    description: produit.description,
    image: produit.images.map(urlAbsolue),
    ...(produit.sku ? { sku: produit.sku } : {}),
    brand: { "@type": "Brand", name: "Deco'Rek" },
    offers: {
      "@type": "Offer",
      url: `${SITE}/produit/${produit.slug}`,
      priceCurrency: "XOF",
      price: produit.price,
      // Un prix annoncé sans date de validité est ignoré par certains moteurs.
      priceValidUntil: dansUnAn(),
      availability:
        produit.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@type": "Organization", name: "Deco'Rek" },
    },
  });
}

/** Fil d'ariane : il apparaît sous le lien dans les résultats de recherche. */
export function filAriane(etapes: { nom: string; chemin: string }[]): Script {
  return jsonLd({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: etapes.map((etape, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: etape.nom,
      item: urlAbsolue(etape.chemin),
    })),
  });
}

function dansUnAn(): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return date.toISOString().slice(0, 10);
}
