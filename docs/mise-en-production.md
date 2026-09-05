# Mise en production sur le VPS

Le serveur exécute déjà Traefik, installé avec le VPS. Ce document décrit ce qu'il
reste à faire pour y poser Deco'Rek.

## 1. Le Traefik du VPS

Relevé sur la machine, il tourne en mode réseau **host** : il partage la pile réseau du
serveur et joint les conteneurs par leur adresse interne. Aucun réseau partagé à créer.

Ses réglages, à confirmer après toute réinstallation :

```sh
docker inspect traefik-traefik-1 --format '{{join .Config.Cmd "\n"}}'
```

Ce qui a été trouvé, et qui figure dans `.env.example` :

- entrées `web` (port 80) et `websecure` (port 443) ;
- résolveur de certificats `letsencrypt`, par défi HTTP sur l'entrée `web` — le port 80
  doit donc rester ouvert, sans quoi aucun certificat ne sera délivré ;
- redirection du port 80 vers le 443 **déjà configurée**, inutile de la refaire ;
- `exposedbydefault=false` : seuls les conteneurs portant `traefik.enable=true` sont
  publiés, ce qui laisse base, cache et stockage hors d'atteinte.

`TRAEFIK_RESEAU` désigne le réseau du projet, non celui de Traefik : Compose le nomme
d'après le dossier, donc `decorek_default` si le dépôt est cloné dans `decorek`. Le
vérifier après le premier démarrage avec `docker network ls`.

## 2. Préparer le fichier .env

Copier `.env.example` en `.env`, puis renseigner :

- `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `MINIO_ROOT_PASSWORD` — mots de passe longs et
  distincts, jamais ceux du développement ;
- `AUTH_SECRET` — `openssl rand -base64 32` ;
- `SITE_DOMAINE` — `deco-rek.com` ;
- les variables `SMTP_*` du fournisseur d'e-mails.

Sans ces trois derniers, une cliente ne peut pas confirmer son adresse : son compte
reste inactivable.

## 3. Déployer

```sh
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec api npm run db:deploy
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec api npm run db:seed
```

L'amorçage n'écrase pas les articles existants et ne réattribue aucune référence : il
peut être rejoué sans risque.

## 4. Créer le compte d'administration

```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec api \
  npm run db:admin -- votre.adresse@exemple.com
```

Le compte doit exister — créé depuis le site — avant d'être promu.

## 5. Vérifier

```sh
curl -sI https://deco-rek.com | head -3          # 200 et certificat valide
curl -s https://deco-rek.com/sitemap.xml | head  # le plan du site répond
curl -s https://deco-rek.com/produit/chaise-royale-doree | grep -c "Chaise royale"
```

La dernière commande doit renvoyer un nombre supérieur à zéro : elle prouve que la page
part complète, ce dont dépendent les aperçus WhatsApp et les moteurs de recherche.

Depuis le site, vérifier ensuite que les images s'affichent — elles passent par `/media`
— et renseigner les numéros Wave et Orange Money dans le back-office, onglet Contenu.

## Ce qui n'est pas exposé

Base de données, cache, stockage et messagerie n'ouvrent aucun port : ils ne se
joignent que par le réseau interne de Docker. Les ports du poste de développement
vivent dans `docker-compose.dev.yml`, qui n'est jamais utilisé en production.

Le stockage est servi sous `/media` plutôt que par sa propre adresse : sa console
d'administration reste ainsi hors d'atteinte.
