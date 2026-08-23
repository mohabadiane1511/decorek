# Deco'Rek — Boutique en ligne (Sénégal) — Version maquette

Site e-commerce complet en français, mobile-first, prix en FCFA, paiement à la livraison. **Aucun back-end : toutes les données sont simulées (mocks) côté front.**

## Direction artistique

Luxe minimaliste, beaucoup de blanc, grandes photos produits sur fond neutre, typographie soignée, animations discrètes.

Palette extraite du logo :
- Anthracite `#2E2E2E` (texte, titres)
- Ambre `#F5A623` (accent principal)
- Orange profond `#F07022` / Rouge `#E23E24` (dégradé réservé aux accents : boutons, filets, badges)
- Blanc `#FFFFFF` et gris très clair `#F7F6F4` (fonds)

Le logo fourni sert d'identité (header, footer, favicon).

## Front boutique

- **Accueil** : bannière, catégories, nouveautés, best-sellers, réassurance (paiement à la livraison, livraison Dakar & régions).
- **Catalogue** : filtres catégorie et prix, tri, recherche, pagination.
- **Fiche produit** : galerie, prix FCFA, description, stock, quantité, produits liés.
- **Panier** (persisté en localStorage) puis **tunnel de commande** en 3 étapes : coordonnées → livraison (région + quartier, frais calculés) → récapitulatif. Confirmation affichée avec numéro de commande simulé.
- **Code promo** : champ visible, utilisable uniquement « connecté » (session simulée), sinon invitation à créer un compte.
- **Espace client** : historique et suivi de statut des commandes (données mockées + commandes passées dans la session).
- **Suivi invité** par numéro de commande.
- **Pages contenu** : contact, livraison, à propos, CGV (textes issus des mocks, modifiables dans l'admin de démo).
- **Bouton WhatsApp flottant** sur tout le site.

## Comptes (simulés)

Écrans de connexion / inscription : email + mot de passe, lien magique, Google — sans vrai back-end, la session est simulée côté client. Le compte n'est requis que pour les codes promo.

## Back office (démo)

Interface admin complète, alimentée par les mêmes mocks, modifications persistées uniquement dans la session/localStorage :
- Produits et catégories (CRUD)
- Stocks et alertes de stock bas
- Commandes : statuts (en attente, confirmée, en préparation, en livraison, livrée, non honorée, annulée), confirmation d'encaissement
- **Zones de livraison** : régions et quartiers de Dakar ajoutables/modifiables avec tarif ; livraison offerte au-delà d'un montant
- Codes promo : montant ou %, dates de validité, minimum d'achat, réservés aux comptes
- Contenu du site : textes, bannières, coordonnées, numéro WhatsApp
- Tableau de bord : chiffre d'affaires, commandes, panier moyen, meilleures ventes, évolution sur période (graphiques sur données mockées)

## Détails techniques

- Pas de base de données, pas d'authentification réelle, pas de server functions.
- Données de démo dans `src/data/` (produits, catégories, commandes, promos, zones, contenu), typées TypeScript.
- État global via un store React (contexte + `localStorage`) pour panier, session simulée, commandes créées et modifications admin.
- Images : les photos fournies servent de catalogue de départ, publiées via Lovable Assets ; visuels complémentaires générés si besoin.
- Architecture pensée pour brancher Lovable Cloud plus tard sans réécrire l'UI (accès données centralisés dans une couche `src/lib/store`).

## Ordre de réalisation

1. Design system, layout (header, footer, WhatsApp flottant), logo/favicon
2. Mocks + couche d'accès aux données
3. Accueil, catalogue, fiche produit
4. Panier, tunnel de commande, code promo
5. Écrans de compte + espace client + suivi
6. Back-office (produits, stocks, commandes, promos, zones, contenu)
7. Tableau de bord, finitions mobile et SEO
