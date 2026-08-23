# Refonte visuelle — direction éditoriale monochrome (référence Koya Atelier)

Objectif : passer du style actuel (serif Cormorant, cartes douces, grandes images) à la direction des captures fournies : blanc pur, noir profond, un seul accent orange issu du logo, typographie grotesque très grasse en capitales, libellés en monospace, images produits plus petites et grille plus dense.

## Système de design

- Typographie : titres en grotesque ultra-gras (Archivo Black / Archivo 800) en CAPITALES, très serrées, avec point final ("LA BOUTIQUE.").
- Libellés, boutons, badges, prix secondaires : monospace en capitales, letter-spacing large, ~11-12px ("01 / 05 — SÉLECTION", "AJOUTER AU PANIER").
- Corps de texte : sans-serif neutre, gris chaud.
- Couleurs : fond blanc, texte noir (#0A0A0A), accent orange unique du logo (liens actifs, badge "sur commande", curseur de prix). Suppression du dégradé amber/orange/rouge des blocs héros. Le sable devient un gris très clair uniquement pour les fonds d'image.
- Rayons à 0 (angles droits partout), bordures fines 1px, aucune ombre portée.
- Animations discrètes : soulignés qui se dessinent, fondu-montée à l'apparition des sections, zoom image très léger.

## Structure des pages

**Accueil** — sections numérotées `01 / 05 … 05 / 05` :
1. Barre d'annonce noire en haut (code promo), fermable.
2. Héro en deux colonnes : à gauche titre géant + accroche + deux boutons carrés ; à droite grande photo pleine hauteur avec étiquette blanche "NOUVEAU — <produit>".
3. Collections : deux (ou trois) grandes tuiles image avec titre en blanc en bas et lien souligné "VOIR LA COLLECTION →".
4. Sélection : grille de 4 produits + lien "TOUTE LA BOUTIQUE →" aligné à droite du titre.
5. Newsletter sur fond noir : titre géant à gauche, champ e-mail souligné + bouton encadré à droite.
6. Pied de page noir : logo, texte marque, 4 colonnes de liens, ligne légale + réseaux/WhatsApp.

**En-tête** — logo à gauche, navigation centrée en monospace capitales (lien actif orange souligné), icônes à droite (recherche, compte, panier avec pastille). Menu plein écran sur mobile.

**Boutique** — titre "LA BOUTIQUE" + compteur "N PIÈCES", barre de filtres sur une ligne : catégories en onglets carrés (actif noir plein), sélecteurs, curseur "PRIX MAX", tri, "RÉINITIALISER" + bascule grille/liste. Grille 3 colonnes desktop / 2 mobile.

**Carte produit** — badges carrés en haut à gauche (NOUVEAU, PROMO, ÉPUISÉ), image en ratio 4/5 nettement plus petite qu'aujourd'hui, puis catégorie en monospace à gauche et prix à droite sur la même ligne, nom du produit en dessous, et bouton pleine largeur encadré "AJOUTER AU PANIER".

**Fiche produit, panier, commande, compte, suivi, pages contenu** — mêmes tokens : titres capitales grasses, libellés monospace, boutons carrés noir plein / contour, tableaux à filets fins.

**Admin** — reprise des mêmes tokens en version compacte (onglets carrés, tableaux à filets, boutons monospace), aucune modification fonctionnelle.

## Taille des images

- Cartes produit : ratio 4/5, grille max 3 colonnes desktop, gouttières plus larges → visuels sensiblement réduits.
- Fiche produit : galerie limitée en largeur (max ~560px) avec miniatures verticales, plus de photo pleine largeur.
- Héro et tuiles collection : hauteurs plafonnées (`max-h`) pour éviter les images géantes sur grand écran.

## Détails techniques

- `src/styles.css` : nouveaux tokens (noir/blanc/orange), `--radius: 0`, familles `--font-display` (Archivo Black), `--font-mono` (JetBrains Mono), `--font-sans` (Archivo/Inter-like) ; polices chargées via `<link>` dans `src/routes/__root.tsx`.
- Utilitaires ajoutés : `.label-mono` (monospace capitales espacé), `.title-xl` (titre géant), `.btn-square`, `.section-index`.
- Refonte des composants `Header`, `Footer`, `ShopLayout`, `ProductCard`, `OrderTimeline` et de toutes les routes publiques ; ajout d'une barre d'annonce et d'un bandeau cookies discret.
- Aucun changement de logique métier : mocks, panier, promos, commandes et admin restent identiques.
