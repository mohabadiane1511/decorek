# Deco'Rek — Document de passation (Front → Backend)

> **Destinataire** : Cursor (AI assistant) — responsable du backend.
> **Objet** : Comprendre le projet Deco'Rek, la maquette déjà réalisée côté front, et préparer l'intégration d'un vrai backend.
> **Date** : 23 août 2026

---

## 1. Présentation du projet

**Deco'Rek** est une boutique e-commerce sénégalaise spécialisée dans la vaisselle, la décoration et le mobilier de réception. Le site vend au Sénégal, s'adresse à une clientèle locale, affiche les prix en **FCFA**, et fonctionne en **paiement à la livraison** (aucun paiement en ligne).

### Caractéristiques clés

| Élément | Valeur |
|---|---|
| **Marché** | Sénégal (Dakar + régions) |
| **Langue** | Français uniquement |
| **Devise** | FCFA (Franc CFA) |
| **Approche mobile** | Mobile-first impératif |
| **Paiement** | À la livraison uniquement (espèces ou transfert mobile) |
| **Statut actuel** | Maquette front complète, données simulées (mocks) |

---

## 2. Ce qui a été fait côté front

### 2.1 Maquette complète — toutes les pages

Le front est **entièrement fonctionnel** en mode maquette. Toutes les pages sont construites, navigables, et réactives. Aucun backend n'existe : les données sont simulées via des mocks TypeScript et persistées dans le `localStorage` du navigateur.

### 2.2 Stack technique front

| Techno | Version | Rôle |
|---|---|---|
| **TanStack Start** (React 19) | v1 | Framework full-stack (SSR/SSG) — basé sur Vite 7 |
| **TanStack Router** | v1 | Routing file-based, loaders, search params |
| **Tailwind CSS** | v4 | Styling via `src/styles.css` (native CSS `@import` + `@theme`) |
| **TypeScript** | 5.8 | Typage strict |
| **Sonner** | 2.x | Notifications toast |
| **Lucide React** | 0.575 | Icônes |

> **Note pour le backend** : Aucune technologie backend n'est imposée. Le front est conçu pour que l'accès aux données soit centralisé dans une couche unique (`src/lib/store.tsx`), facilitant le branchement d'un vrai backend sans réécrire l'UI.

### 2.3 Pas de backend actuel — que faut-il remplacer ?

Tout l'état applicatif vit dans **`src/lib/store.tsx`** (un React Context global). Les données de départ viennent de **`src/data/seed.ts`**. Tout est persisté en `localStorage` sous la clé `decorek-store-v2`.

**Le backend devra fournir :**

1. **Authentification réelle** (email/password, Google, lien magique)
2. **Base de données** : produits, catégories, commandes, codes promo, zones de livraison, contenu du site, utilisateurs
3. **API CRUD** pour l'admin (produits, catégories, stocks, commandes, promos, zones, contenu)
4. **Stockage d'images** (upload de photos produits, actuellement en base64 dans le localStorage)
5. **Gestion des rôles** (admin vs client)
6. **Persistance réelle des commandes** (au lieu du localStorage)

---

## 3. Architecture du front

### 3.1 Structure des fichiers

```
src/
├── assets/                    # Images produits + logo (via Lovable Assets, .asset.json)
├── components/
│   ├── layout/
│   │   ├── Header.tsx         # Header sticky : logo, nav, compte, panier, burger mobile
│   │   ├── Footer.tsx         # Footer : newsletter, collections, contact, CGV
│   │   ├── ShopLayout.tsx     # Layout wrapper (Header + Outlet + Footer)
│   │   └── WhatsAppButton.tsx # Bouton flottant WhatsApp
│   └── shop/
│       ├── ProductCard.tsx    # Carte produit (grille boutique)
│       └── OrderTimeline.tsx   # Timeline visuelle de statut de commande
├── data/
│   ├── types.ts               # Toutes les interfaces TypeScript
│   └── seed.ts                # Données de démonstration (produits, commandes, etc.)
├── lib/
│   ├── store.tsx              # ★ État global (React Context + localStorage)
│   ├── format.ts              # formatFcfa(), formatDate(), formatDateShort()
│   ├── utils.ts               # cn() (clsx + tailwind-merge)
│   └── error-capture.ts       # Capture d'erreurs
├── routes/                    # Pages (TanStack Router, file-based)
│   ├── __root.tsx             # Layout racine, fonts, StoreProvider
│   ├── index.tsx              # Accueil (hero plein écran + collections + sélections)
│   ├── boutique.tsx           # Catalogue (filtres, tri, recherche, pagination)
│   ├── produit.$slug.tsx     # Fiche produit (galerie, prix, stock, produits liés)
│   ├── panier.tsx             # Panier
│   ├── commande.tsx           # Tunnel de commande (3 étapes)
│   ├── confirmation.$number.tsx  # Confirmation de commande
│   ├── suivi.tsx              # Suivi de commande par numéro
│   ├── compte.tsx             # Connexion/inscription + espace client
│   ├── admin.tsx              # ★ Back-office complet (8 onglets)
│   ├── contact.tsx            # Page contact
│   ├── cgv.tsx                # Conditions générales de vente
│   ├── a-propos.tsx           # À propos
│   └── livraison.tsx          # Informations de livraison
├── styles.css                 # Design system (tokens, utilitaires CSS)
├── router.tsx                # Config router
├── start.ts                  # Entry point
└── server.ts                 # SSR entry
```

### 3.2 Le store — point d'intégration central

**`src/lib/store.tsx`** est le cœur de l'application. C'est un `React Context` qui gère **tout l'état** :

```typescript
type State = {
  products: Product[];
  categories: Category[];
  orders: Order[];
  promos: PromoCode[];
  regions: DeliveryRegion[];
  content: SiteContent;
  cart: CartLine[];           // { productId, quantity }
  user: SessionUser | null;   // session simulée
};
```

**Méthodes exposées par le store** (toutes synchrones, côté client) :

| Méthode | Description |
|---|---|
| `addToCart(productId, qty)` | Ajoute au panier |
| `setCartQuantity(productId, qty)` | Modifie la quantité |
| `removeFromCart(productId)` | Retire du panier |
| `clearCart()` | Vide le panier |
| `signIn(user)` / `signOut()` | Session simulée |
| `validatePromo(code, subtotal)` | Valide un code promo → `{ promo, discount }` ou `{ error }` |
| `placeOrder(order)` | Crée une commande, décrémente le stock, incrémente l'usage du code promo |
| `updateOrder(id, patch)` | Met à jour une commande |
| `setOrderStatus(id, status)` | Change le statut (+ restaure le stock si annulée/non honorée) |
| `saveProduct(product)` / `deleteProduct(id)` | CRUD produit |
| `saveCategory(cat)` / `deleteCategory(id)` | CRUD catégorie |
| `savePromo(promo)` / `deletePromo(id)` | CRUD code promo |
| `setRegions(regions)` | Met à jour les zones de livraison |
| `setContent(content)` | Met à jour le contenu du site |
| `resetDemo()` | Réinitialise les données de démo |

> **Pour le backend** : remplacer les appels au store par des appels API. L'UI consomme le store via le hook `useStore()` — il suffit de remplacer l'implémentation du store par des appels fetch/server functions.

---

## 4. Design system

### 4.1 Direction artistique

**Luxe minimaliste monochrome** inspiré du site Koya Atelier : épuré, beaucoup d'espace blanc, typographie soignée, angles droits (radius 0), bordures fines de 1px.

### 4.2 Palette de couleurs

Extraite du logo Deco'Rek (orange/noir) :

| Token CSS | Valeur | Usage |
|---|---|---|
| `--background` | `oklch(1 0 0)` (blanc pur) | Fond de page |
| `--foreground` | `oklch(0.16 0 0)` (anthracite ~#2E2E2E) | Texte, titres |
| `--accent` | `oklch(0.58 0.17 42)` (orange ~#F07022) | Boutons, accents, badges |
| `--orange-brand` | `oklch(0.58 0.17 42)` | Orange du logo |
| `--amber-brand` | `oklch(0.72 0.14 62)` | Ambre |
| `--red-brand` | `oklch(0.53 0.18 34)` | Rouge |
| `--sand` | `oklch(0.972 0 0)` (gris très clair) | Fonds neutres |
| `--border` | `oklch(0.9 0 0)` | Bordures 1px |
| `--hero` | `oklch(0.945 0.021 72)` | Fond du hero (beige sable) |

### 4.3 Typographie

| Usage | Police | Classes CSS |
|---|---|---|
| **Titres / display** | Archivo (800, uppercase) | `.font-display`, `.title-xl`, `.title-lg` |
| **Corps de texte** | Archivo | `--font-sans` |
| **Labels, prix, mono** | JetBrains Mono | `.label-mono`, `.section-index` |

Les polices sont chargées via `<link>` dans `src/routes/__root.tsx`.

### 4.4 Utilitaires CSS clés (dans `src/styles.css`)

| Classe | Rôle |
|---|---|
| `btn-square` | Base bouton (angles droits, mono, uppercase, padding) |
| `btn-solid` | Bouton plein orange (fond accent, hover → transparent + bordure accent) |
| `btn-outline` | Bouton contour orange (transparent → hover plein orange) |
| `title-xl` | Titre hero `clamp(2.25rem, 7vw, 5rem)` |
| `title-lg` | Titre section `clamp(1.75rem, 4.5vw, 3rem)` |
| `label-mono` | Label monospace uppercase `0.6875rem`, letter-spacing `0.16em` |
| `section-index` | Numérotation éditoriale (`01 / 05 — Collections`) |
| `link-underline` | Lien avec soulignement |
| `fade-up` | Animation d'apparition au chargement |
| `brand-gradient` | Dégradé ambre → orange → rouge |

---

## 5. Données simulées (mocks)

### 5.1 Fichier `src/data/seed.ts`

Contient toutes les données de démonstration :

- **5 catégories** : Art de la table, Décoration murale, Textile & maison, Mobilier événementiel, Luminaires & guirlandes
- **8 produits** avec images, prix FCFA, stock, descriptions
- **5 régions de livraison** (Dakar, Banlieue, Thiès, Saint-Louis, Ziguinchor) avec 16 quartiers/zones et frais
- **2 codes promo** : `BIENVENUE10` (-10%, min 20 000 FCFA) et `TABLE5000` (-5000 FCFA, min 50 000 FCFA)
- **5 commandes de démonstration** dans différents statuts
- **Contenu du site** : bannière, textes des pages, coordonnées, WhatsApp, seuil de livraison offerte (100 000 FCFA)

### 5.2 Images

Les images produits sont stockées via **Lovable Assets** (fichiers `.asset.json` dans `src/assets/`). Chaque `.asset.json` contient une URL d'accès. Les images uploadées via l'admin (formulaire produit) sont actuellement converties en **base64** et stockées dans le localStorage — **c'est une limite à remplacer par un vrai stockage backend**.

---

## 6. Types de données (`src/data/types.ts`)

Voici tous les types à reproduire côté backend :

### Product

```typescript
type Product = {
  id: string;
  slug: string;               // auto-généré depuis le name, non modifiable
  name: string;
  categoryId: string;
  price: number;              // FCFA
  oldPrice?: number;          // prix barré (promo)
  stock: number;
  lowStockThreshold: number;
  description: string;
  images: string[];           // URLs ou base64 (la 1re = couverture)
  featured: boolean;
  createdAt: string;          // ISO date
};
```

### Category

```typescript
type Category = {
  id: string;
  slug: string;
  name: string;
  description: string;
};
```

### Order + OrderItem

```typescript
type OrderStatus =
  | "en_attente"      // En attente
  | "confirmee"        // Confirmée
  | "preparation"      // En préparation
  | "en_livraison"    // En livraison
  | "livree"           // Livrée
  | "non_honoree"     // Non honorée
  | "annulee";         // Annulée

type OrderItem = {
  productId: string;
  name: string;
  price: number;       // prix unitaire au moment de la commande (snapshot)
  quantity: number;
  image: string;       // snapshot de l'image
};

type Order = {
  id: string;
  number: string;      // format "DR-YYMM-XXXX"
  createdAt: string;    // ISO
  customer: {
    name: string;
    phone: string;
    email?: string;
  };
  delivery: {
    regionId: string;
    regionName: string;
    areaName: string;
    address: string;
    fee: number;        // frais de livraison en FCFA
    note?: string;
  };
  items: OrderItem[];
  subtotal: number;     // somme avant remise et livraison
  discount: number;     // montant de la remise
  promoCode?: string;
  total: number;        // subtotal - discount + fee
  status: OrderStatus;
  paid: boolean;        // encaissement confirmé à la livraison
  userEmail?: string;   // si commandé via un compte
  internalNote?: string;
};
```

### PromoCode

```typescript
type PromoCode = {
  id: string;
  code: string;
  type: "percent" | "amount";
  value: number;          // % ou montant FCFA
  minAmount: number;      // minimum d'achat en FCFA
  startsAt: string;       // ISO date
  endsAt: string;         // ISO date
  maxUses: number;
  uses: number;
  active: boolean;
};
```

### DeliveryRegion + DeliveryArea

```typescript
type DeliveryArea = {
  id: string;
  name: string;     // quartier/zone
  fee: number;      // frais en FCFA
};

type DeliveryRegion = {
  id: string;
  name: string;     // région (Dakar, Thiès, etc.)
  areas: DeliveryArea[];
};
```

### SiteContent

```typescript
type SiteContent = {
  bannerTitle: string;
  bannerSubtitle: string;
  bannerCta: string;
  whatsapp: string;        // numéro WhatsApp sans +
  phone: string;
  email: string;
  address: string;
  freeShippingFrom: number; // seuil de livraison offerte en FCFA
  pages: {
    contact: string;
    livraison: string;
    apropos: string;
    cgv: string;
  };
};
```

### SessionUser

```typescript
type SessionUser = {
  name: string;
  email: string;
  isAdmin: boolean;
};
```

---

## 7. Pages et fonctionnalités détaillées

### 7.1 Front boutique

#### Accueil (`/`)

- **Hero plein écran** (100svh) : image de fond floutée avec voile sombre dégradé, texte centré (accroche, sous-titre, CTA orange)
- **Bande de réassurance** orange : "Paiement à la réception", "Livraison régions", "Vaisselle & décoration", "Conseil WhatsApp"
- **Section Collections** (2 catégories avec image de couverture)
- **Section Sélection** (4 produits featured)
- **Section Nouveautés** (4 produits les plus récents)

#### Boutique (`/boutique`)

- Filtres : catégorie (boutons toggle), recherche texte, slider de prix max
- Tri : nouveautés, prix croissant, prix décroissant
- Pagination (8 produits par page)
- Grille responsive : 2 colonnes mobile, 3 desktop, 4 large
- URL search params : `?categorie=slug&q=texte`

#### Fiche produit (`/produit/$slug`)

- Galerie (1re image en grand, ratio 4:5)
- Prix FCFA + prix barré si promo
- Indicateur de stock (en stock / plus que X / épuisé)
- Sélecteur de quantité
- Bouton "Ajouter au panier"
- Bloc réassurance (livraison, paiement à la livraison, WhatsApp)
- Produits liés (même catégorie)

#### Panier (`/panier`)

- Liste des articles avec image, nom, prix, quantité (+/-), suppression
- Sous-total + mention livraison offerte à partir de X FCFA
- Persistance en localStorage

#### Commande (`/commande`) — Tunnel en 3 étapes sur une page

1. **Coordonnées** : nom, téléphone, email (facultatif)
2. **Livraison** : région (select), quartier/zone (select avec frais affichés), adresse précise, indications livreur
3. **Paiement** : rappel "paiement à la livraison"

- Récapitulatif latéral : articles + miniatures, code promo (réservé aux comptes connectés), calcul du total (subtotal - discount + fee, livraison offerte si subtotal ≥ seuil)
- Validation → génération d'un numéro de commande `DR-YYMM-XXXX` → redirection vers `/confirmation/$number`
- La commande est créée avec le statut `en_attente` et `paid: false`
- Le stock est décrémenté à la validation

#### Confirmation (`/confirmation/$number`)

- Affiche le numéro de commande et un récapitulatif

#### Suivi (`/suivi`)

- Recherche par numéro de commande (invité ou connecté)
- Affiche le statut via une timeline visuelle + liste des articles

#### Compte (`/compte`)

- **Non connecté** : formulaire de connexion / inscription (email + password, bouton Google simulé)
  - Si l'email commence par "admin" → `isAdmin: true` (mock, à remplacer par une vraie gestion de rôles)
- **Connecté** : historique des commandes + timeline de statut + lien vers le back-office si admin

#### Pages contenu

- `/contact` — formulaire de contact + coordonnées + WhatsApp
- `/cgv` — conditions générales (texte éditable dans l'admin)
- `/a-propos` — à propos (texte éditable)
- `/livraison` — zones et frais de livraison affichés depuis les données

#### Bouton WhatsApp flottant

Présent sur toutes les pages via `WhatsAppButton.tsx`. Le numéro vient de `content.whatsapp`.

### 7.2 Back-office (`/admin`)

**Accès protégé** : la route vérifie `store.user?.isAdmin`. Si non admin → écran de connexion admin.

**Identifiants de démo actuels** (mock, côté client uniquement) :
- Email : `admin@decorek.sn`
- Mot de passe : `password123`
- Règle mock : tout email commençant par "admin" est considéré comme admin

> ⚠️ **Cette sécurité est purement côté client et doit être remplacée par une vraie authentification backend avec gestion de rôles serveur.**

#### Onglets du back-office

**1. Tableau de bord** (`dashboard`)
- Filtre période : 7j / 30j / 90j / 1 an
- KPIs : chiffre d'affaires, encaissé, nombre de commandes, alertes stock
- Graphique en barres : évolution du CA par jour
- Top 5 meilleures ventes (quantité + CA)
- Liste des alertes stock bas (stock ≤ lowStockThreshold)

**2. Commandes** (`orders`)
- Filtre par statut (7 statuts + "Toutes")
- Chaque commande : numéro, client, téléphone, date, adresse de livraison, articles avec miniatures
- Actions : changer le statut (select), cocher "Encaissement confirmé" (`paid`), ajouter une note interne
- Logique de stock : si statut → `annulee` ou `non_honoree`, le stock est restauré

**3. Produits** (`products`)
- Liste des produits + bouton "Nouveau produit"
- Formulaire : nom, catégorie, prix, stock, seuil d'alerte, description, images (upload multiple + drag-and-drop pour réorganiser, la 1re image = couverture)
- Slug auto-généré depuis le nom (non modifiable, `readOnly`)
- Suppression produit

**4. Stocks** (`stock`)
- Vue dédiée aux alertes : produits avec stock ≤ seuil
- Modification rapide du stock

**5. Catégories** (`categories`)
- CRUD complet : ajout, renommage, suppression
- Slug auto-généré

**6. Livraisons** (`delivery`)
- CRUD des régions (ajout, renommage, suppression)
- Pour chaque région : CRUD des quartiers/zones avec leurs frais de livraison
- Les modifications se répercutent sur le tunnel de commande

**7. Promotions** (`promos`)
- CRUD des codes promo
- Champs : code, type (percent/amount), valeur, minAmount, dates de validité, maxUses, active
- Affichage du nombre d'utilisations

**8. Contenu** (`content`)
- Édition de tous les textes du site : bannière (titre, sous-titre, CTA), coordonnées (WhatsApp, téléphone, email, adresse), seuil de livraison offerte
- Édition des textes des pages : contact, livraison, à propos, CGV

---

## 8. Règles métier à respecter côté backend

### 8.1 Commandes

- Une commande est créée avec le statut `en_attente` et `paid: false`
- Le stock est **décrémenté** à la validation de la commande
- Si la commande passe à `annulee` ou `non_honoree`, le stock est **restauré**
- Le prix et le nom des produits sont **snapshotés** dans `OrderItem` au moment de la commande (ne pas utiliser de jointure dynamique)
- Le numéro de commande suit le format `DR-YYMM-XXXX` (ex: `DR-2608-1042`)

### 8.2 Codes promo

- Réservés aux **utilisateurs connectés** (un invité ne peut pas appliquer un code)
- Validation : code existe, est actif, date de validité, nombre d'utilisations < max, sous-total ≥ minAmount
- Si `type = "percent"` : `discount = round(subtotal * value / 100)`
- Si `type = "amount"` : `discount = min(value, subtotal)`
- L'usage est incrémenté à chaque commande validée avec le code

### 8.3 Livraison

- Frais calculés selon la zone/quartier choisi
- **Livraison offerte** si le sous-total ≥ `content.freeShippingFrom` (actuellement 100 000 FCFA)
- Les zones et frais sont gérables dans l'admin

### 8.4 Slugs

- Auto-générés depuis le nom du produit/catégorie (slugify : lowercase, suppression des accents, espaces → tirets)
- Non modifiables par l'utilisateur (champ `readOnly` dans le formulaire admin)
- Utilisés dans l'URL : `/produit/$slug`

### 8.5 Authentification

- **Compte client** : email + password, inscription, lien magique, Google
- **Admin** : rôle distinct (ne pas stocker le rôle sur la table user — utiliser une table de rôles séparée)
- Le compte n'est **obligatoire que pour les codes promo** ; la commande en invité est possible
- Un utilisateur connecté voit son historique de commandes dans `/compte`

### 8.6 Images produits

- Upload multiple, réorganisables par drag-and-drop
- La **1re image** est l'image de couverture (affichée dans les cartes, le panier, les commandes)
- Actuellement en base64 dans le localStorage → **remplacer par un vrai stockage backend** (object storage, CDN)

---

## 9. Points d'attention pour le backend

### 9.1 Ce qui doit être persisté en base

| Entité | Table suggérée | Notes |
|---|---|---|
| Produits | `products` | images = tableau d'URLs |
| Catégories | `categories` | |
| Commandes | `orders` + `order_items` | snapshot prix/nom |
| Codes promo | `promo_codes` | tracking des uses |
| Régions de livraison | `delivery_regions` + `delivery_areas` | |
| Contenu du site | `site_content` | singleton ou table key-value |
| Utilisateurs | table d'auth | email, nom |
| Rôles | `user_roles` | table séparée (admin/client) |

### 9.2 Ce qui reste côté client

- Le panier (`cart`) peut rester en localStorage ou être synchronisé avec le compte utilisateur
- La session utilisateur → à remplacer par de vrais tokens/cookies httpOnly

### 9.3 Compatibilité avec le front existant

Le front consomme les données **exclusivement via le hook `useStore()`**. Pour brancher le backend :

1. **Option A (recommandée)** : Remplacer l'implémentation interne du store par des appels API (fetch/server functions), en gardant la même interface publique. L'UI n'a pas besoin de changer.
2. **Option B** : Garder le store mock pour le développement et ajouter une couche d'API séparée.

Les types TypeScript dans `src/data/types.ts` peuvent servir de contrat API direct.

### 9.4 SEO

Chaque route a déjà sa fonction `head()` avec `title`, `description`, `og:title`, `og:description`. Le backend doit fournir les données pour que ces métadonnées soient dynamiques (ex: titre de la fiche produit depuis la base).

---

## 10. Résumé de l'état actuel

| Aspect | Statut |
|---|---|
| Design system | ✅ Complet (monochrome, Archivo, orange du logo) |
| Accueil | ✅ Hero plein écran + sections |
| Boutique + filtres | ✅ Complet |
| Fiche produit | ✅ Complète |
| Panier | ✅ Complet (localStorage) |
| Tunnel de commande | ✅ 3 étapes + code promo |
| Confirmation + suivi | ✅ Complet |
| Compte client (mock) | ✅ Connexion/inscription simulées |
| Back-office (8 onglets) | ✅ Complet (CRUD sur mocks) |
| WhatsApp flottant | ✅ Sur toutes les pages |
| Responsive mobile | ✅ Mobile-first |
| Persistance | ⚠️ localStorage uniquement |
| Authentification | ❌ Simulée (à remplacer) |
| Base de données | ❌ Aucune (mocks) |
| Stockage d'images | ❌ Base64 localStorage |
| API backend | ❌ À créer |

---

## 11. Démarrage rapide pour le backend

1. **Lire** `src/data/types.ts` — c'est le contrat de données
2. **Lire** `src/lib/store.tsx` — c'est l'interface que l'UI consomme
3. **Lire** `src/data/seed.ts` — c'est l'exemple de données à seed
4. **Créer** les tables/migrations correspondant aux types
5. **Créer** les endpoints API (ou server functions) correspondant aux méthodes du store
6. **Remplacer** l'implémentation du store par des appels API
7. **Tester** que l'UI fonctionne sans changement visuel

---

*Document généré le 23 août 2026 — Deco'Rek, Dakar, Sénégal.*
