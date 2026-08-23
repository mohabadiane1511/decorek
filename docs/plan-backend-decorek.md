# Deco'Rek — Plan backend (architecture dockerisée)

> **Contexte** : le front est une maquette complète dont toutes les données vivent dans
> `src/lib/store.tsx` (React Context + `localStorage`). Ce document décrit le passage à un
> backend réel, entièrement conteneurisé.
>
> **Statut** : plan de référence à suivre lot par lot. Dernière révision : 23 août 2026.

---

## 1. Méthode de travail

Elle s'applique à **chaque lot**, sans exception.

1. **Une branche par lot** : `git switch -c feat/nom-du-lot` depuis `main` à jour.
2. **Le code et ses tests dans la même branche.** Un lot sans test n'est pas terminé.
3. **Vérification dans l'interface** : chaque lot décrit ci-dessous la procédure manuelle
   exacte — URL, actions, résultat attendu. Les tests automatisés ne remplacent pas ce
   passage, ils évitent d'avoir à le refaire à chaque fois.
4. **Fusion dans `main` après validation**, jamais avant.

Convention de nommage : `feat/` pour une fonctionnalité, `chore/` pour l'outillage et
l'infrastructure, `fix/` pour une correction.

### Outillage de test retenu

Le projet n'a aujourd'hui **aucun framework de test** — c'est l'objet du lot 1.

| Niveau | Outil | Ce qu'on y met |
|---|---|---|
| Unitaire | Vitest | Logique métier pure : remises, totaux, slugs, frais de livraison |
| Intégration API | Vitest + `app.request()` de Hono | Endpoints réels contre une base de test, sans passer par le réseau |
| Composant | Vitest + Testing Library | Composants à logique : `ProductCard`, panier, timeline |
| Bout en bout | Playwright | Deux parcours seulement : commande complète, et connexion admin |

Priorité assumée : **tout ce qui touche à l'argent et au stock est testé en premier**. Le reste
vient après. On ne cherche pas un taux de couverture, on cherche à ne pas vendre à 0 FCFA.

---

## 2. Architecture cible

Six services, un seul `docker compose up`.

| Service | Rôle | Image / techno |
|---|---|---|
| `db` | Base de données | `postgres:17-alpine` |
| `cache` | Cache, sessions, limitation de débit | `redis:7-alpine` |
| `storage` | Images produits (S3-compatible) | `minio/minio` |
| `api` | API métier + authentification | Node 22 + Hono + Prisma 7 |
| `web` | Front TanStack Start en SSR | Node 22 (build Nitro) |
| `proxy` | Entrée unique, TLS automatique | `caddy:2-alpine` |

### À quoi sert Redis ici, précisément

Pas au catalogue en priorité : quelques milliers de produits correctement indexés sortent de
Postgres en quelques millisecondes, et y poser un cache trop tôt ajoute surtout un risque
d'incohérence. Redis gagne sa place sur trois autres usages :

1. **Limitation de débit** sur la connexion et le suivi de commande. Portée par l'API plutôt que
   par le proxy, elle connaît l'utilisateur et pas seulement l'adresse IP — et surtout elle
   permet d'utiliser l'**image Caddy standard**, la limitation n'étant pas native dans Caddy.
   C'est une brique de moins à construire et à maintenir.
2. **Sessions** : expiration native par TTL, et déconnexion immédiate sans requête en base.
3. **Agrégations du tableau de bord** (chiffre d'affaires par jour, top ventes) — les seules
   requêtes réellement coûteuses du projet, et elles tolèrent quelques minutes de fraîcheur.

Le cache catalogue vient ensuite, en couche par-dessus des index corrects, avec **invalidation à
la demande** lors des modifications côté admin.

> **À garder en tête** : quand le catalogue grossira, le facteur limitant ne sera pas la base mais
> le poids des pages sur une connexion mobile sénégalaise. Cinq cents produits mal compressés
> pèseront plus lourd que n'importe quelle requête SQL. Pagination stricte, images redimensionnées
> côté serveur et chargement différé comptent davantage que le cache.

Le proxy route `/` vers `web`, `/api/*` vers `api`, `/media/*` vers `storage`. Un seul domaine
public, donc ni CORS ni cookies tiers, et des cookies de session `httpOnly` + `SameSite=Strict`.

**Règle de sécurité non négociable** : `ports:` n'apparaît que sur `proxy`. Jamais sur `db`,
`cache`, `storage` ou `api` — Docker écrit directement dans iptables et court-circuiterait le
pare-feu de l'hôte, exposant le service sur Internet malgré un UFW qui l'affiche fermé. Un Redis
exposé sans mot de passe est l'une des compromissions les plus courantes qui soient. Pour déboguer
depuis le poste local, on passe par un tunnel SSH.

### Organisation du dépôt

Un seul dépôt, deux applications côte à côte :

```
src/         front TanStack Start (existant)
backend/     API, schéma, migrations et seed  ← tout le code serveur va ici
e2e/         tests de bout en bout
scripts/     outillage (vérification d'infrastructure, sauvegardes)
docs/        ce plan et la passation
```

**Tout le code backend vit dans `backend/`**, y compris son `package.json`, son `schema.prisma`,
ses migrations et ses tests. Le front n'importe jamais depuis `backend/`.

**Pourquoi Hono** : tout reste en TypeScript, et `app.request()` permet de tester les endpoints
sans lancer de serveur ni ouvrir de port.

**Pourquoi Prisma 7** : `schema.prisma` devient la source de vérité, les migrations sont
versionnées (`migrate dev` en local, `migrate deploy` en production), et Prisma Studio donne une
vue directe sur les données pendant le développement. Surtout, depuis la version 7 le client
**n'embarque plus de moteur Rust** : plus de binaire natif à faire correspondre à Alpine et à
OpenSSL, ce qui était le piège classique de Prisma en conteneur. L'accès à Postgres passe par un
adaptateur explicite, `@prisma/adapter-pg`.

### Deux jeux de types, et c'est voulu

Prisma **génère** ses propres types depuis le schéma. Ils ne remplacent pas `src/data/types.ts` :

- **Types Prisma** — représentation de la base, internes au backend. Ils reflètent les écarts
  assumés du §3 : images dans une table séparée, mouvements de stock, utilisations de promo.
- **`src/data/types.ts`** — contrat de l'API, ce que le front reçoit. Un produit y garde
  `images: string[]`, et les champs internes comme `internalNote` n'y apparaissent pas.

Le backend convertit explicitement de l'un vers l'autre. Cette couche n'est pas une lourdeur
administrative : le schéma diverge volontairement du modèle qu'affiche le front, et sans elle
c'est la structure de la base qui dicterait l'interface — ou pire, des champs internes qui
fuiteraient dans les réponses publiques.

---

## 3. Les lots

### Phase 0 — Fondations

#### Lot 1 — Outillage de test · `chore/tooling-tests`

Mettre en place Vitest, Testing Library et Playwright, avec les scripts `npm run test`,
`test:watch` et `test:e2e`. Ajouter un test de démonstration sur `formatFcfa()` de
[format.ts](../src/lib/format.ts), qui existe déjà et se teste sans dépendance.

*Tests* : le test de `formatFcfa()` passe.
*Vérification* : `npm run test` s'exécute et affiche un test au vert.
*Fin de lot* : la commande de test existe et fonctionne sur un projet propre.

#### Lot 2 — Infrastructure Docker · `chore/docker-infra`

`docker-compose.yml` avec `db`, `cache` et `storage`, volumes nommés persistants, `healthcheck`
sur les trois, bucket `decorek-media` créé au démarrage. Redis protégé par mot de passe et
`maxmemory-policy allkeys-lru`, pour qu'une saturation évince les clés froides au lieu de faire
tomber le service. `.env.example` versionné, `.env` ignoré par git.

*Tests* : script de vérification qui attend les trois `healthcheck` au vert.
*Vérification* : `docker compose up -d`, puis la console MinIO répond, `psql` et `redis-cli` se
connectent depuis un tunnel SSH — mais **aucun des trois ports n'est joignable depuis
l'extérieur**. À vérifier explicitement depuis une machine tierce.
*Fin de lot* : les trois services démarrent et persistent après un `docker compose restart`.

---

### Phase 1 — Socle de données

#### Lot 3 — Schéma · `feat/db-schema`

`backend/prisma/schema.prisma` reprenant `src/data/types.ts`, avec quatre écarts délibérés :

| Table | Écart vs. la maquette | Raison |
|---|---|---|
| `product_images` | table séparée avec `position` | le réordonnancement par glisser-déposer devient une mise à jour de `position` |
| `stock_movements` | journal des mouvements | corrige le trou décrit en §4 |
| `promo_redemptions` | une ligne par utilisation | permet de savoir *qui* a utilisé un code et de plafonner par client |
| `order_number_counters` | compteur par mois | remplace le tirage aléatoire qui collisionne (§4) |

Les autres suivent la passation : `categories`, `products`, `orders`, `order_items` (snapshot du
prix, du nom et de l'image), `delivery_regions`, `delivery_areas`, `site_content` (singleton),
`users`, et `user_roles` **en table séparée**.

Une séquence Postgres unique ne convient pas pour les numéros de commande : le format
`DR-YYMM-XXXX` ne réserve que quatre chiffres, et un compteur global finirait par déborder. On
utilise donc une table de compteurs, un par mois, incrémentée par un `INSERT … ON CONFLICT DO
UPDATE` — atomique même sous forte concurrence, et qui repart de 1 chaque mois.

Les garde-fous que le langage de Prisma ne sait pas exprimer (contraintes `CHECK`) sont ajoutés
par une migration SQL écrite à la main, que `prisma migrate` intègre normalement : montants
positifs, remise plafonnée au sous-total, total égal à `sous-total − remise + livraison`, stock
jamais négatif, pourcentage de promotion inférieur à 100, fenêtre de validité cohérente.

*Tests* : migration appliquée sur une base vierge sans erreur ; contraintes d'unicité vérifiées
(slug produit, numéro de commande, code promo) ; `prisma migrate diff` ne détecte aucun écart
entre le schéma et la base, ce qui garantit qu'aucune modification n'a été appliquée à la main
sans migration correspondante.
*Vérification* : `npx prisma studio` affiche toutes les tables, vides.
*Fin de lot* : `npm run db:migrate` construit le schéma complet depuis une base vierge.

#### Lot 4 — Données initiales · `feat/db-seed`

Import de [seed.ts](../src/data/seed.ts) en base et envoi des **images produits** vers MinIO, les
URLs en base pointant vers `/media/...`.

Seules les images de produits partent au stockage : ce sont des données, modifiables depuis
l'administration. Le logo et l'image du héros restent dans `public/images/` — ce sont des
éléments de l'interface, servis directement par le front, et les faire transiter par le stockage
ajouterait une dépendance sans rien apporter.

Les commandes de démonstration ne sont pas importées : elles devraient s'accompagner de
mouvements de stock cohérents, et une base sans fausses ventes rend les calculs vérifiables.

*Tests* : après seed, 5 catégories, 8 produits, 5 régions, 16 zones, 2 promos ; chaque produit a
au moins une image dont l'URL **répond réellement en 200 avec un type d'image** ; positions
d'images contiguës à partir de zéro.
*Vérification* : les images apparaissent dans la console MinIO.
*Fin de lot* : `npm run db:seed` est rejouable sans doublon.

---

### Phase 2 — API en lecture

#### Lot 5 — Ossature de l'API · `feat/api-bootstrap`

Service Hono conteneurisé, **dans `backend/`** : configuration, `/api/health`, format d'erreur
unifié, validation par `zod` (déjà une dépendance du projet), journalisation.

Le client Prisma étant généré, `prisma generate` doit tourner à la construction de l'image, avant
la compilation TypeScript — un `node_modules` copié depuis le poste ne suffit pas. Le contrôle de
santé vérifie la connexion à Postgres, pas seulement que le processus répond.

*Tests* : `/api/health` répond 200 ; une requête invalide renvoie une erreur au format attendu.
*Fin de lot* : `docker compose up` démarre aussi l'API, joignable **uniquement** via le proxy.

#### Lot 6 — Catalogue · `feat/api-catalogue`

`GET /api/produits` (filtres catégorie, recherche, prix, tri, pagination), `GET /api/produits/:slug`,
`GET /api/categories`.

*Tests* : chaque filtre et chaque tri isolément ; pagination cohérente ; un slug inconnu renvoie 404.
*Fin de lot* : les mêmes résultats que la boutique actuelle, servis par la base.

#### Lot 7 — Contenu et livraison · `feat/api-contenu-livraison`

`GET /api/contenu` et `GET /api/livraison`.

*Tests* : contenu singleton renvoyé ; régions renvoyées avec leurs zones et frais.
*Fin de lot* : les pages de contenu peuvent être alimentées par l'API.

#### Lot 8 — Cache et limitation de débit · `feat/cache-redis`

Branchement de Redis sur l'API, dans cet ordre de priorité :

- **Limitation de débit** réutilisable, appliquée plus tard à la connexion (lot 10) et au suivi
  de commande (lot 14). Compteur par fenêtre glissante, clé dérivée de l'IP et, si disponible,
  de l'utilisateur.
- **Cache du catalogue** et du contenu du site, avec **invalidation à la demande**. Stratégie
  retenue : un compteur de version (`catalogue:version`) intégré aux clés de cache. Une
  modification côté admin incrémente le compteur, ce qui périme d'un coup toutes les entrées
  dérivées — plutôt que de traquer chaque clé une par une, ce qui finit toujours par laisser
  passer un cas.
- **TTL de sécurité** sur chaque entrée, pour qu'un oubli d'invalidation se résorbe seul.

Prérequis assumé : les index Postgres du catalogue sont posés **avant** le cache, pas à sa place.
Un cache devant une requête non indexée ne fait que masquer le problème jusqu'au premier
redémarrage.

*Tests* : une seconde requête identique ne touche pas la base ; l'incrément de version périme
bien les entrées ; le TTL expire ; **si Redis est éteint, l'API répond quand même** en tapant
directement la base — le cache ne doit jamais être un point de défaillance unique ; au-delà du
seuil de débit, réponse 429.
*Vérification* : charger `/boutique` deux fois et observer la disparition des requêtes SQL dans
les logs, puis modifier un produit en base et vérifier que la page reflète le changement.
*Fin de lot* : cache actif, invalidable, et facultatif au sens strict.

---

### Phase 3 — Front en lecture

#### Lot 9 — Branchement du catalogue · `feat/front-query-catalogue`

Premier contact entre le front et l'API, via React Query — dont le `QueryClientProvider` est
**déjà monté** dans [__root.tsx:130](../src/routes/__root.tsx#L130) mais inutilisé. Accueil,
boutique et fiche produit passent sur l'API. Le panier **reste en `localStorage`**.

⚠️ **C'est ici que le coût réel apparaît.** Les 18 méthodes de `useStore()` sont *synchrones*
(`placeOrder(order): void`). Les passer en asynchrone change leurs signatures et impose de gérer
chargement, erreur et état vide. La passation affirme que l'UI ne changera pas : c'est inexact.
On migre donc **écran par écran**, les autres continuant de lire le store mock entre-temps.

*Tests* : composants montés avec un client React Query moqué — états chargement, erreur, vide.
*Vérification* : `/boutique` affiche les 8 produits, les filtres et le tri fonctionnent, la fiche
produit s'ouvre. Couper l'API doit afficher une erreur lisible, pas une page blanche.
*Fin de lot* : le catalogue ne dépend plus du seed côté client.

---

### Phase 4 — Authentification

#### Lot 10 — Auth côté serveur · `feat/auth-backend`

Better Auth : email/mot de passe, Google, lien magique. Cookies `httpOnly`, **sessions stockées
dans Redis** avec expiration par TTL — une déconnexion prend effet immédiatement, sans requête
en base. Rôle admin lu depuis `user_roles` et vérifié **côté serveur** à chaque requête admin.
Limitation de débit du lot 8 appliquée à la connexion et à la demande de lien magique.

*Tests* : inscription, connexion, déconnexion ; un utilisateur sans rôle reçoit 403 sur une route
admin ; une session expirée est refusée ; après déconnexion l'ancien cookie ne passe plus ;
au-delà du seuil de tentatives de connexion, réponse 429.
*Fin de lot* : les routes admin sont inaccessibles sans rôle, vérifié par test, et la connexion
résiste au bourrinage.

#### Lot 11 — Auth côté front · `feat/auth-front`

Page `/compte` branchée sur la vraie authentification. **Suppression du mock** qui accorde
aujourd'hui les pleins pouvoirs à toute adresse commençant par « admin »
([compte.tsx:44](../src/routes/compte.tsx#L44), [admin.tsx:53](../src/routes/admin.tsx#L53)).

*Tests* : bout en bout — connexion, accès refusé à `/admin` pour un client, accordé pour un admin.
*Vérification* : créer un compte `client@test.sn`, tenter d'ouvrir `/admin` → refus. Le tenter
avec `admin@decorek.sn` → accès. Puis essayer `adminfake@test.sn` → **doit être refusé**.
*Fin de lot* : la faille est fermée et un test l'empêche de revenir.

---

### Phase 5 — Commandes

#### Lot 12 — Commandes côté serveur · `feat/api-commandes`

Le cœur métier. Création **transactionnelle** via `prisma.$transaction` en mode interactif :
commande, mouvements de stock et utilisation du code promo dans une seule transaction. Le
décrément de stock doit poser un verrou sur les lignes concernées (`SELECT … FOR UPDATE`, via
`$queryRaw` si nécessaire) — sans lui, deux commandes simultanées sur le dernier article passent
toutes les deux. Numéro issu de la séquence. Montants **recalculés
serveur** à partir de la base — le client n'envoie que des identifiants et des quantités.
Validation des promos côté serveur, réservée aux comptes connectés.

*Tests*, les plus importants du projet :
- remise en pourcentage et en montant fixe, arrondis compris ;
- livraison offerte au-delà du seuil, et facturée juste en dessous ;
- commande refusée si le stock est insuffisant ;
- montant falsifié par le client → ignoré, total recalculé ;
- code promo au-delà de `maxUses` → refusé ;
- promo refusée à un invité ;
- deux commandes simultanées sur le dernier article → une seule passe ;
- échec en cours de transaction → aucune écriture partielle.

*Fin de lot* : impossible de commander à un prix que l'on choisit soi-même.

#### Lot 13 — Tunnel côté front · `feat/front-commande`

Panier et tunnel branchés sur l'API, avec états de chargement et gestion d'erreur.

*Tests* : parcours complet en bout en bout, du panier à la confirmation.
*Vérification* : commander deux articles, appliquer `BIENVENUE10` connecté, vérifier le total à
l'écran, puis vérifier en base que le stock a baissé et que le numéro suit le format `DR-YYMM-XXXX`.
*Fin de lot* : une commande réelle traverse toute la chaîne.

#### Lot 14 — Suivi · `feat/suivi-commande`

`GET /api/commandes/suivi/:numero`, protégé par la **limitation de débit** du lot 8 — sans quoi
les numéros sont énumérables et exposent nom, téléphone et adresse des clients. Cette réponse
n'est jamais mise en cache : elle contient des données personnelles et doit refléter le statut réel.

*Tests* : numéro valide renvoie la commande ; numéro inconnu renvoie 404 ; au-delà du seuil, 429 ;
un changement de statut est visible immédiatement.
*Fin de lot* : le suivi fonctionne et résiste à l'énumération.

---

### Phase 6 — Back-office

#### Lot 15 — CRUD admin · `feat/api-admin-crud`

Produits, catégories, stocks, commandes, promos, zones, contenu. Changement de statut avec
mouvement de stock associé — **y compris le retour** d'une commande annulée vers un statut actif,
que la maquette ne gère pas (§4).

Toute écriture qui touche le catalogue ou le contenu **incrémente `catalogue:version`** (lot 8),
ce qui périme le cache public. Les statistiques du tableau de bord sont mises en cache avec un
TTL court, ces agrégations étant les requêtes les plus lourdes du projet.

*Tests* : chaque endpoint refuse un non-admin ; annulation restaure le stock ; réactivation le
redécrémente ; pas de double restauration ; **après modification d'un produit, l'API publique
renvoie la nouvelle valeur dès la requête suivante**.
*Vérification* : modifier le prix d'un produit dans l'admin, puis recharger `/boutique` dans une
fenêtre de navigation privée — le nouveau prix doit apparaître immédiatement.
*Fin de lot* : le cycle de vie d'une commande est cohérent dans tous les sens, et le cache ne
sert jamais de donnée périmée.

#### Lot 16 — Images produits · `feat/images-upload`

Envoi direct du navigateur vers MinIO par URL présignée, sans transiter par l'API. **Fin du
base64.** Type et poids validés côté serveur avant émission de l'URL.

*Tests* : URL présignée émise pour un type autorisé, refusée sinon ; ordre des images conservé.
*Vérification* : dans l'admin, téléverser trois images, les réordonner, enregistrer, recharger —
l'ordre tient et la première sert de couverture.
*Fin de lot* : plus aucune image en base64.

#### Lot 17 — Front admin · `feat/front-admin`

Les 8 onglets branchés sur l'API.

*Vérification* : parcourir chaque onglet, modifier une valeur, recharger, vérifier la persistance.
*Fin de lot* : `src/lib/store.tsx` ne sert plus que le panier. Le seed devient un jeu de données
de développement.

---

### Phase 7 — Mise en production

#### Lot 18 — Conteneurisation du front · `chore/dockerize-web`

Dockerfile multi-étapes pour `web`. **Le build se fait hors du VPS** si celui-ci a 2 Go de RAM :
un build Vite peut réclamer un à deux gigaoctets. Avec six services dont Postgres, Redis et
MinIO, viser **4 Go de RAM au minimum**.

#### Lot 19 — Proxy et durcissement · `chore/caddy-securite`

**Image Caddy standard** — la limitation de débit étant portée par l'API via Redis (lot 8), il
n'y a pas d'image sur mesure à construire ni à maintenir à jour. TLS automatique, en-têtes de
sécurité (HSTS, CSP, anti-clickjacking), et vérification qu'aucun service autre que le proxy ne
publie de port. Durcissement SSH par clés uniquement, secrets hors du `docker-compose.yml`.

#### Lot 20 — Sauvegardes · `chore/backups`

Sauvegarde planifiée de Postgres et du bucket, **restauration testée au moins une fois** — une
sauvegarde jamais restaurée n'est pas une sauvegarde. Attention : `docker compose down -v`
détruit les volumes.

**Redis n'est pas sauvegardé** : son contenu doit être intégralement reconstructible depuis
Postgres. C'est la contrepartie de la règle du lot 8 — perdre le cache ne doit coûter que des
performances, jamais une donnée. Les sessions y font exception assumée : vider Redis déconnecte
tout le monde, ce qui est gênant mais sans gravité.

---

## 4. Défauts de la maquette à ne pas reproduire

**Numéros de commande.** `orderNumber()` tire quatre chiffres au hasard
([store.tsx:243](../src/lib/store.tsx#L243)). Les collisions sont quasi certaines dès quelques
centaines de commandes dans un même mois — et c'est la seule clé dont dispose un client pour
suivre sa commande. Séquence Postgres et contrainte d'unicité.

**Stock.** `setOrderStatus` restaure le stock au passage en `annulee` ou `non_honoree` et se
protège correctement contre une double restauration. Mais le chemin inverse manque : repasser une
commande annulée en `confirmee` **ne redécrémente pas** le stock. Un journal de mouvements rend
cette incohérence structurellement impossible.

**Codes promo.** La validation vit entièrement côté client, donc le plafond `maxUses` est
contournable. À refaire côté serveur, dans la transaction de création de commande.

**Montants.** Le total est calculé dans le navigateur. Tout doit être recalculé côté serveur.

**Rôles.** Toute adresse commençant par « admin » ouvre le back-office, et le contrôle est
purement côté client. Vérification serveur obligatoire, via `user_roles`.
