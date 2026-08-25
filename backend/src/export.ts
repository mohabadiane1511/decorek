import ExcelJS from "exceljs";
import type { PrismaClient } from "./generated/prisma/client.js";

/**
 * Classeur d'inventaire et de ventes.
 *
 * Un classeur plutôt que deux fichiers séparés : le format le permet, et la cliente
 * n'a qu'une pièce à joindre pour sa comptabilité.
 *
 * Les montants et les dates sortent en nombres et en dates, pas en texte : « 12 000
 * FCFA » écrit tel quel s'aligne à gauche et refuse toute somme, ce qui rend l'export
 * inutilisable pour ce à quoi il sert.
 */

/** Bornes de l'export : au-delà, le fichier devient trop lourd à ouvrir. */
const LIGNES_MAX = 10_000;

const FORMAT_FCFA = '# ##0 "FCFA"';
const FORMAT_DATE = "dd/mm/yyyy hh:mm";

const STATUTS_LISIBLES: Record<string, string> = {
  en_attente: "En attente",
  confirmee: "Confirmée",
  preparation: "En préparation",
  en_livraison: "En livraison",
  livree: "Livrée",
  non_honoree: "Non honorée",
  annulee: "Annulée",
};

/**
 * Neutralise une valeur qu'un tableur pourrait prendre pour une formule.
 *
 * Dans un classeur, une cellule de texte reste du texte — le risque naît quand le
 * fichier est réenregistré en CSV, ce que fait volontiers un comptable. Un nom
 * d'article commençant par « = » deviendrait alors une formule exécutée à l'ouverture.
 * L'apostrophe de tête coûte peu et supprime le cas.
 */
function texteSur(valeur: string | null | undefined): string {
  const brut = (valeur ?? "").toString();
  return /^[=+\-@\t\r]/.test(brut) ? `'${brut}` : brut;
}

function entete(feuille: ExcelJS.Worksheet): void {
  feuille.getRow(1).font = { bold: true };
  feuille.getRow(1).alignment = { vertical: "middle" };
  feuille.views = [{ state: "frozen", ySplit: 1 }];
}

export async function construireClasseur(
  prisma: PrismaClient,
  options: { depuis?: Date | undefined } = {},
): Promise<Uint8Array> {
  const classeur = new ExcelJS.Workbook();
  classeur.creator = "Deco'Rek";
  classeur.created = new Date();

  // ------------------------------------------------------------- Inventaire
  const inventaire = classeur.addWorksheet("Inventaire");
  inventaire.columns = [
    { header: "Référence", key: "sku", width: 14 },
    { header: "Article", key: "name", width: 38 },
    { header: "Catégorie", key: "categorie", width: 22 },
    { header: "Prix", key: "price", width: 14, style: { numFmt: FORMAT_FCFA } },
    { header: "Prix barré", key: "oldPrice", width: 14, style: { numFmt: FORMAT_FCFA } },
    { header: "Stock", key: "stock", width: 9 },
    { header: "Seuil d'alerte", key: "seuil", width: 14 },
    { header: "État", key: "etat", width: 12 },
    { header: "Valeur du stock", key: "valeur", width: 18, style: { numFmt: FORMAT_FCFA } },
  ];
  entete(inventaire);

  const produits = await prisma.product.findMany({
    orderBy: { sku: "asc" },
    include: { category: { select: { name: true } } },
    take: LIGNES_MAX,
  });

  for (const p of produits) {
    inventaire.addRow({
      sku: texteSur(p.sku),
      name: texteSur(p.name),
      categorie: texteSur(p.category.name),
      price: p.price,
      oldPrice: p.oldPrice ?? null,
      stock: p.stock,
      seuil: p.lowStockThreshold,
      etat: p.stock === 0 ? "Épuisé" : p.stock <= p.lowStockThreshold ? "Stock bas" : "OK",
      // Calculée ici plutôt qu'en formule : le fichier reste juste même ouvert dans un
      // tableur qui ne recalcule pas.
      valeur: p.price * p.stock,
    });
  }

  // ----------------------------------------------------------------- Ventes
  const ventes = classeur.addWorksheet("Ventes");
  ventes.columns = [
    { header: "Commande", key: "number", width: 16 },
    { header: "Date", key: "date", width: 18, style: { numFmt: FORMAT_DATE } },
    { header: "Cliente", key: "client", width: 26 },
    { header: "Téléphone", key: "tel", width: 18 },
    { header: "Zone", key: "zone", width: 22 },
    { header: "Statut", key: "statut", width: 16 },
    { header: "Encaissée", key: "paid", width: 12 },
    { header: "Sous-total", key: "subtotal", width: 14, style: { numFmt: FORMAT_FCFA } },
    { header: "Remise", key: "discount", width: 12, style: { numFmt: FORMAT_FCFA } },
    { header: "Livraison", key: "fee", width: 12, style: { numFmt: FORMAT_FCFA } },
    { header: "Total", key: "total", width: 14, style: { numFmt: FORMAT_FCFA } },
    { header: "Articles", key: "articles", width: 60 },
  ];
  entete(ventes);

  const commandes = await prisma.order.findMany({
    ...(options.depuis ? { where: { createdAt: { gte: options.depuis } } } : {}),
    orderBy: { createdAt: "desc" },
    include: { items: true },
    take: LIGNES_MAX,
  });

  for (const o of commandes) {
    ventes.addRow({
      number: texteSur(o.number),
      date: o.createdAt,
      client: texteSur(o.customerName),
      // Le téléphone part en texte : « +221 77… » deviendrait un calcul, et un numéro
      // commençant par zéro perdrait ce zéro.
      tel: texteSur(o.customerPhone),
      zone: texteSur(`${o.areaName}, ${o.regionName}`),
      statut: STATUTS_LISIBLES[o.status] ?? o.status,
      paid: o.paid ? "Oui" : "Non",
      subtotal: o.subtotal,
      discount: o.discount,
      fee: o.deliveryFee,
      total: o.total,
      articles: texteSur(o.items.map((i) => `${i.quantity} × ${i.name}`).join(" ; ")),
    });
  }

  // La note interne n'est jamais exportée : elle sert à l'équipe et peut se retrouver
  // transmise à un tiers avec le fichier.

  // Recopié dans un tableau d'octets simple : le tampon rendu par la bibliothèque peut
  // s'appuyer sur une mémoire partagée, que la réponse HTTP n'accepte pas.
  const donnees = await classeur.xlsx.writeBuffer();
  return new Uint8Array(donnees as ArrayBuffer);
}

/** Nom du fichier proposé au téléchargement. */
export function nomFichier(maintenant = new Date()): string {
  const jour = maintenant.toISOString().slice(0, 10);
  return `decorek-inventaire-${jour}.xlsx`;
}
