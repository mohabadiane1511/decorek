# Deco'Rek — Plan backend (architecture dockerisée)

> **Contexte** : le front est une maquette complète dont toutes les données vivent dans
> `src/lib/store.tsx` (React Context + `localStorage`). Ce document décrit le passage à un
> backend réel, entièrement conteneurisé.
> **Date** : 23 août 2026

---

## 1. Architecture cible

Cinq services, un seul `docker compose up`.

| Service | Rôle | Image / techno |
|---|---|---|
| `db` | Base de données | `postgres:17-alpine` |
| `storage` | Images produits (S3-compatible) | `minio/minio` |
| `api` | API métier + authentification | Node 22 + Hono + Drizzle |
| `web` | Front TanStack Start en SSR | Node 22 (build Nitro) |
| `proxy` | Entrée unique, TLS automatique | `caddy:2-alpine` |

Le proxy route `/` vers `web`, `/api/*` vers `api`, `/media/*` vers `storage`. Un seul domaine
public, donc pas de CORS ni de cookies tiers à gérer.

**Pourquoi Hono + Drizzle** : tout reste en TypeScript, donc les types de `src/data/types.ts`
deviennent le contrat partagé entre l'API et le front, sans duplication ni génération de code.
Drizzle produit des migrations SQL lisibles, ce qui compte pour une base qu'on administrera
à la main.

**Pourquoi MinIO plutôt qu'un CDN** : le stockage reste dans le compose, donc l'environnement de
développement est identique à la production, et l'API est compatible S3 — basculer plus tard vers
un service managé ne changera qu'une variable d'environnement.

---

## 2. Phases

### Phase 0 — Fondations (avant toute ligne de code)

Le projet **n'est pas un dépôt git**. C'est le premier point à régler : sans historique, aucune
des phases suivantes n'est réversible.

- `git init`, `.gitignore` (vérifier `node_modules`, `.env`, volumes Docker)
- `.env.example` versionné, `.env` jamais commité
- Choix du nom de domaine (alimente `VITE_SITE_URL`, déjà lu par `src/lib/site.ts`)

### Phase 1 — Infrastructure

- `docker-compose.yml` avec `db` et `storage`, volumes nommés persistants, `healthcheck` sur les deux
- Bucket MinIO `decorek-media` créé au démarrage, lecture publique sur `/media/*`
- Objectif de fin de phase : `docker compose up` donne une base et un stockage joignables

### Phase 2 — Schéma de données

Migrations Drizzle reprenant `src/data/types.ts`, avec quatre écarts délibérés :

| Table | Écart vs. la maquette | Raison |
|---|---|---|
| `product_images` | table séparée avec `position`, au lieu d'un tableau | le réordonnancement par drag-and-drop de l'admin devient une simple mise à jour de `position` |
| `stock_movements` | journal des entrées/sorties, au lieu d'un compteur muté | corrige le trou décrit en §4 |
| `promo_redemptions` | une ligne par utilisation, au lieu du compteur `uses` | permet de savoir *qui* a utilisé un code, et de plafonner par client |
| `order_number_seq` | séquence Postgres | remplace le tirage aléatoire à 4 chiffres, qui collisionne (voir §4) |

Les autres tables suivent la passation : `categories`, `products`, `orders`, `order_items`
(snapshot du prix, du nom et de l'image), `delivery_regions`, `delivery_areas`, `site_content`
(singleton), `users`, et `user_roles` **en table séparée** comme préconisé.

Seed initial repris de `src/data/seed.ts`, et envoi des 11 images de `public/images/` vers MinIO.

### Phase 3 — API

Hono + `zod` pour la validation (zod est **déjà** une dépendance du projet).

*Endpoints publics* : catalogue paginé et filtré, produit par slug, catégories, zones de
livraison, contenu du site, création de commande, suivi par numéro.

*Endpoints admin*, tous derrière le middleware de rôle : CRUD produits, catégories, stocks,
commandes, promos, zones, contenu, et statistiques du tableau de bord.

**Règle non négociable** : le client envoie des identifiants et des quantités, jamais des
montants. Sous-total, remise, frais de livraison et total sont recalculés côté serveur à partir
de la base. Sinon n'importe qui peut commander à 0 FCFA.

### Phase 4 — Authentification

Better Auth couvre les trois modes demandés par la passation — email/mot de passe, Google, lien
magique — avec des sessions en base et des cookies `httpOnly`.

Le rôle admin est lu depuis `user_roles` et vérifié **côté serveur** à chaque requête admin. Cela
supprime la faille actuelle : aujourd'hui, tout email commençant par « admin » obtient les pleins
pouvoirs, et le contrôle est purement côté client ([compte.tsx:44](../src/routes/compte.tsx#L44),
[admin.tsx:53](../src/routes/admin.tsx#L53)).

### Phase 5 — Images produits

Upload direct du navigateur vers MinIO par URL présignée, ce qui évite de faire transiter les
fichiers par l'API. Suppression du base64 en `localStorage`. Validation du type et du poids côté
serveur avant émission de l'URL.

### Phase 6 — Branchement du front

**C'est la phase la plus coûteuse, et la passation la sous-estime.** Le document affirme que
« l'UI n'a pas besoin de changer » : c'est inexact. Les 18 méthodes de `useStore()` sont
**synchrones** (`placeOrder(order): void`). Les passer en asynchrone change leurs signatures, et
les 17 fichiers qui les consomment doivent gérer chargement, erreur et état vide.

Stratégie recommandée, écran par écran plutôt qu'en une fois :

1. Les lectures d'abord, via React Query — le `QueryClientProvider` est **déjà monté** dans
   [__root.tsx:130](../src/routes/__root.tsx#L130) mais n'est pas utilisé.
2. Puis les écritures, en commençant par l'admin (peu d'utilisateurs, tolérant aux erreurs) et en
   finissant par le tunnel de commande (le plus critique).
3. Le panier **reste en `localStorage`** : il n'a pas besoin du serveur. Prévoir sa fusion avec le
   compte à la connexion.

### Phase 7 — Conteneurisation du front et mise en ligne

Dockerfile multi-étapes pour `web`, Caddy en frontal, sauvegardes automatiques de `db` et du
bucket, et journalisation.

---

## 3. Ordre de livraison

Les phases 0 à 3 suffisent déjà à faire tourner la boutique en lecture sur de vraies données. Le
site reste utilisable tout du long : tant qu'un écran n'est pas migré, il continue de lire le
store mock.

---

## 4. Défauts de la maquette à ne pas reproduire

**Numéros de commande.** `orderNumber()` tire quatre chiffres au hasard
([store.tsx:243](../src/lib/store.tsx#L243)). Sur un même mois, les collisions sont quasi
certaines dès quelques centaines de commandes — et le numéro est la seule clé dont dispose un
client pour suivre sa commande. Séquence Postgres et contrainte d'unicité.

**Stock.** `setOrderStatus` restaure le stock au passage en `annulee` ou `non_honoree`, et se
protège correctement contre une double restauration. Mais le chemin inverse manque : repasser une
commande annulée en `confirmee` **ne redécrémente pas** le stock. Un journal de mouvements rend
ce genre d'erreur structurellement impossible.

**Codes promo.** La validation vit entièrement côté client. À refaire côté serveur, dans la même
transaction que la création de la commande, sans quoi le plafond `maxUses` est contournable.

**Atomicité.** Créer une commande touche trois choses à la fois : la commande, le stock et le
compteur promo. Une seule transaction, sinon un échec en cours de route laisse la base incohérente.
