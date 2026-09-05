# Mettre Deco'Rek en ligne, pas à pas

Ce document part du principe que vous n'utilisez pas Linux au quotidien. Chaque
commande est expliquée, avec ce que vous devez voir à l'écran quand elle réussit.

**Une règle avant de commencer :** une commande qui ne renvoie rien a généralement
réussi. Sous Linux, le silence est bon signe. C'est quand un texte rouge ou le mot
`error` apparaît qu'il faut s'arrêter et lire.

---

## Sommaire

1. [Se connecter au serveur](#1-se-connecter-au-serveur)
2. [Savoir se déplacer](#2-savoir-se-déplacer)
3. [Ouvrir et modifier un fichier](#3-ouvrir-et-modifier-un-fichier)
4. [Remplir le fichier .env](#4-remplir-le-fichier-env)
5. [Faire pointer le domaine sur le VPS](#5-faire-pointer-le-domaine-sur-le-vps)
6. [Démarrer le site](#6-démarrer-le-site)
7. [Préparer la base de données](#7-préparer-la-base-de-données)
8. [Créer votre compte d'administration](#8-créer-votre-compte-dadministration)
9. [Vérifier que tout marche](#9-vérifier-que-tout-marche)
10. [Les réglages à faire dans le back-office](#10-les-réglages-à-faire-dans-le-back-office)
11. [Mettre à jour le site plus tard](#11-mettre-à-jour-le-site-plus-tard)
12. [Quand ça ne marche pas](#12-quand-ça-ne-marche-pas)

---

## 1. Se connecter au serveur

Depuis le terminal de votre Mac :

```sh
ssh root@ADRESSE_IP_DU_VPS
```

Remplacez `ADRESSE_IP_DU_VPS` par l'adresse donnée par Hostinger. Vous pouvez aussi
passer par la console web de Hostinger, comme vous l'avez fait jusqu'ici.

Vous savez que vous êtes sur le serveur quand la ligne commence par `root@srv...`.

---

## 2. Savoir se déplacer

Quatre commandes suffisent.

| Commande | Ce qu'elle fait |
|---|---|
| `pwd` | Affiche où vous êtes |
| `ls` | Liste les fichiers du dossier |
| `ls -la` | Liste **tout**, y compris les fichiers cachés comme `.env` |
| `cd /opt/decorek` | Va dans le dossier du projet |

Les fichiers dont le nom commence par un point sont cachés : `ls` seul ne les montre
pas. C'est le cas de `.env`, qui contient vos mots de passe. Utilisez `ls -la` pour le
voir.

Placez-vous dans le projet, et restez-y pour toute la suite :

```sh
cd /opt/decorek
pwd
```

La dernière commande doit répondre exactement `/opt/decorek`.

---

## 3. Ouvrir et modifier un fichier

L'éditeur le plus simple s'appelle **nano**. Pour ouvrir un fichier :

```sh
nano .env
```

Le fichier s'affiche. Vous vous déplacez avec les **flèches du clavier** — la souris ne
fonctionne pas. Vous écrivez normalement.

En bas de l'écran, une liste de raccourcis. Le `^` signifie la touche **Ctrl**.

| Raccourci | Effet |
|---|---|
| `Ctrl` + `O` puis `Entrée` | **Enregistrer** (O comme « Output ») |
| `Ctrl` + `X` | **Quitter** |
| `Ctrl` + `K` | Supprimer la ligne entière |
| `Ctrl` + `W` | Chercher un mot |

**L'ordre à retenir : `Ctrl+O`, `Entrée`, puis `Ctrl+X`.** Si vous faites `Ctrl+X`
sans avoir enregistré, nano demande `Save modified buffer?` — tapez `y` puis `Entrée`.

Pour seulement lire un fichier sans risquer de le modifier :

```sh
cat .env
```

---

## 4. Remplir le fichier .env

Ce fichier contient les mots de passe et les réglages. Il n'est **jamais** envoyé sur
GitHub : il n'existe que sur ce serveur.

### Générer les mots de passe

Ne réutilisez pas ceux du développement : ils sont visibles dans le dépôt. Générez-en
de nouveaux, un par ligne :

```sh
openssl rand -base64 32
```

Lancez cette commande **cinq fois** et gardez les cinq résultats sous la main — un pour
chaque mot de passe ci-dessous. Vous pouvez les copier-coller depuis le terminal.

### Ouvrir le fichier

```sh
nano .env
```

### Les valeurs à renseigner

Cherchez chaque ligne et remplacez ce qui suit le signe `=`. **Pas d'espace autour du
`=`, pas de guillemets.**

```
POSTGRES_PASSWORD=collez-ici-le-premier-mot-de-passe
REDIS_PASSWORD=collez-ici-le-deuxième
MINIO_ROOT_PASSWORD=collez-ici-le-troisième
AUTH_SECRET=collez-ici-le-quatrième
```

Puis la partie production :

```
SITE_DOMAINE=deco-rek.com
TRAEFIK_RESEAU=decorek_default
TRAEFIK_ENTREE=websecure
TRAEFIK_RESOLVEUR=letsencrypt
```

Ces trois derniers ont été relevés sur votre serveur : ils sont corrects, ne les
changez pas.

### Les e-mails

Sans cette partie, une cliente qui crée un compte ne recevra jamais le lien de
confirmation, et son compte restera inutilisable. **Retirez le `#` devant chaque
ligne** et complétez :

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=votre.adresse@gmail.com
SMTP_PASSWORD=le-mot-de-passe-application-de-16-caracteres
MAIL_FROM=Deco'Rek <votre.adresse@gmail.com>
```

Le mot de passe d'application n'est **pas** celui de votre compte Google. Il se génère
sur <https://myaccount.google.com/apppasswords>, après avoir activé la validation en
deux étapes. Google affiche 16 lettres en quatre groupes : saisissez-les **sans les
espaces**.

Enregistrez : `Ctrl+O`, `Entrée`, `Ctrl+X`.

### Relire ce qui a été enregistré

```sh
grep -v '^#' .env | grep -v '^$'
```

Cette commande affiche les lignes utiles, sans les commentaires. Vérifiez qu'aucune
ligne importante ne finit par `=` tout seul.

---

## 5. Faire pointer le domaine sur le VPS

Un nom de domaine acheté chez Hostinger ne pointe pas sur votre VPS par défaut : il
mène à une page d'attente, sur une autre machine. Tant que ce n'est pas corrigé, rien
ne peut fonctionner — Let's Encrypt irait vérifier le mauvais serveur et refuserait de
délivrer le certificat.

### Relever l'adresse de votre VPS

Sur le serveur :

```sh
curl -4 -s ifconfig.me
```

Le `-4` compte : votre VPS a deux adresses, une IPv4 et une IPv6. Sans cette option, la
commande répond souvent l'IPv6, que vous compareriez à une IPv4 — et vous concluriez à
tort que le DNS est mal réglé.

Notez l'adresse obtenue, du type `72.62.30.119`. C'est elle qu'il faut déclarer.

### Modifier la zone DNS chez Hostinger

1. Connectez-vous à **hPanel** sur <https://hpanel.hostinger.com>
2. Ouvrez la section **Domaines**, puis `deco-rek.com`
3. Cherchez **Zone DNS** (ou « DNS / Nameservers » selon la langue de l'interface)

Vous voyez une liste d'enregistrements. Deux vous concernent, tous deux de **type A** :

| Nom | Pointe vers | À faire |
|---|---|---|
| `@` | une adresse qui n'est pas la vôtre | La remplacer par l'adresse du VPS |
| `www` | idem, ou absent | Même adresse que `@` |

Le `@` désigne le domaine nu, `deco-rek.com`. Le `www` désigne `www.deco-rek.com`.

**Modifiez l'enregistrement existant plutôt que d'en ajouter un second.** Deux
enregistrements A sur le même nom enverraient les visiteurs tantôt sur un serveur,
tantôt sur l'autre — et le site paraîtrait fonctionner une fois sur deux.

Si un champ **TTL** est proposé, mettez la plus petite valeur offerte (souvent 300
secondes) le temps de la mise en route : les corrections seront prises en compte plus
vite.

### Vérifier les serveurs de noms

Toujours dans la fiche du domaine, vérifiez que les **serveurs de noms** (nameservers)
sont bien ceux d'Hostinger, du type `ns1.dns-parking.com`. S'ils pointent ailleurs, la
zone DNS que vous venez de modifier n'est pas celle qui fait autorité, et votre
changement n'aura aucun effet.

### Attendre, puis contrôler

La propagation prend de quelques minutes à quelques heures. Contrôlez depuis le
serveur :

```sh
dig +short deco-rek.com
```

**Cette adresse doit être exactement celle donnée par `curl -4 -s ifconfig.me`.**

Tant qu'elles diffèrent, ne passez pas à la suite : Let's Encrypt validerait un serveur
qui n'est pas le vôtre, aucun certificat ne serait délivré, et le site s'afficherait
avec un avertissement de sécurité.

Si `dig` ne répond rien du tout, c'est que l'enregistrement n'existe pas encore, ou que
la propagation n'est pas terminée. Patientez et réessayez.

Si vous voulez aussi que le domaine réponde en IPv6, ajoutez un enregistrement **AAAA**
pointant vers l'adresse donnée par `curl -6 -s ifconfig.me`. Ce n'est pas nécessaire au
fonctionnement du site.

---

## 6. Démarrer le site

```sh
cd /opt/decorek
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Décomposons :

- `-f docker-compose.yml -f docker-compose.prod.yml` : les deux fichiers de
  configuration, le second complétant le premier pour la production ;
- `up` : démarre ;
- `-d` : en arrière-plan, pour que vous récupériez la main ;
- `--build` : construit les images à partir du code.

**La première fois, comptez cinq à dix minutes.** Beaucoup de texte défile, c'est
normal. Ensuite, vérifiez :

```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

Vous devez voir six lignes — `db`, `cache`, `storage`, `storage-init`, `api`, `site` —
et la colonne `STATUS` doit indiquer `Up` avec `(healthy)`.

Si un service affiche `Restarting` ou `Exited`, allez au chapitre 12.

---

## 7. Préparer la base de données

La base démarre vide. Deux commandes la mettent en état.

Ces commandes passent par un service dédié, `outils`. `run --rm` le démarre le temps
d'une commande puis le supprime : il ne tourne pas en permanence.

Pour éviter de retaper la longue ligne à chaque fois, créez un raccourci — valable
jusqu'à la fermeture de votre session :

```sh
alias dc="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
```

Vous pourrez alors écrire `dc ps` au lieu de la commande entière. Les exemples qui
suivent donnent les deux formes.

### Créer les tables

```sh
dc --profile outils run --rm outils npm run db:deploy
```

Sans le raccourci :

```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  --profile outils run --rm outils npm run db:deploy
```

Vous devez lire `All migrations have been successfully applied.` — ou
`No pending migrations to apply.` si la base est déjà à jour, ce qui est tout aussi bon.

### Installer le catalogue de départ

```sh
dc --profile outils run --rm outils npm run db:seed
```

Vous devez lire `Données de démonstration en place.`

Cette commande installe les huit articles de démonstration, les catégories, les zones
de livraison et les textes du site. Elle peut être relancée sans danger : elle n'efface
aucun article que vous auriez ajouté et ne change aucune référence déjà attribuée.

---

## 8. Créer votre compte d'administration

**L'ordre compte.** Le compte doit d'abord exister avant d'être promu.

1. Ouvrez <https://deco-rek.com/compte> dans votre navigateur
2. Cliquez sur **Créer un compte**, avec l'adresse que vous utiliserez pour gérer la
   boutique
3. Ouvrez l'e-mail reçu et cliquez sur le lien de confirmation
4. Puis, sur le serveur :

```sh
dc --profile outils run --rm outils npm run db:admin -- votre.adresse@exemple.com
```

Remplacez l'adresse par la vôtre. Vous devez lire
`votre.adresse@exemple.com est désormais administrateur.`

Si le message dit que le compte est introuvable, c'est que l'étape 2 n'a pas été faite :
le compte doit exister avant d'être promu.

Rechargez ensuite <https://deco-rek.com/compte> : un bouton **Back-office** doit
apparaître.

Si vous n'avez pas reçu l'e-mail, c'est que la configuration SMTP est incomplète.
Reprenez le chapitre 4, puis relancez :

```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d api
```

---

## 9. Vérifier que tout marche

### Le site répond en HTTPS

```sh
curl -sI https://deco-rek.com | head -3
```

Vous devez voir `HTTP/2 200`. Un message parlant de certificat signifie que le
certificat n'a pas encore été délivré — revoyez le chapitre 5.

### Les pages partent complètes

```sh
curl -s https://deco-rek.com/produit/chaise-royale-doree | grep -c "Chaise royale"
```

Le résultat doit être **supérieur à zéro**. C'est la vérification la plus importante du
lot : elle prouve que la page contient déjà le nom de l'article avant tout affichage.
C'est ce dont dépendent l'aperçu WhatsApp — la photo et le titre quand on partage un
lien — et les moteurs de recherche.

Si le résultat est `0`, le site n'arrive pas à joindre l'API. Voyez le chapitre 12.

### Le plan du site

```sh
curl -s https://deco-rek.com/sitemap.xml | head -5
```

Vous devez voir du XML mentionnant `deco-rek.com`.

### Dans le navigateur

Ouvrez <https://deco-rek.com> et vérifiez :

- le cadenas s'affiche dans la barre d'adresse ;
- les photos des articles apparaissent — elles passent par `/media` ;
- une fiche produit s'ouvre et affiche ses images.

---

## 10. Les réglages à faire dans le back-office

Rendez-vous sur <https://deco-rek.com/admin>, onglet **Contenu**.

**À changer impérativement** — ce sont aujourd'hui des numéros de démonstration qui ne
mènent nulle part :

- **Numéro Wave** : celui où les clientes envoient leur paiement
- **Numéro Orange Money** : idem
- **WhatsApp** : le numéro qui recevra les reçus de paiement

Vérifiez aussi le téléphone, l'adresse e-mail, l'adresse postale, et les liens des
réseaux sociaux — un champ laissé vide retire simplement l'icône du pied de page.

Passez ensuite une commande de test complète, de bout en bout, pour vérifier que le
bouton WhatsApp ouvre bien une conversation vers votre numéro.

---

## 11. Mettre à jour le site plus tard

Quand du nouveau code est prêt :

```sh
cd /opt/decorek
alias dc="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
git pull
dc up -d --build
dc --profile outils run --rm outils npm run db:deploy
```

La dernière ligne applique les éventuelles évolutions de la base. Elle ne fait rien
s'il n'y en a pas — la lancer systématiquement ne coûte rien et évite un oubli.

Vos données ne sont jamais touchées par une mise à jour : elles vivent dans des volumes
Docker, séparés du code.

---

## 12. Quand ça ne marche pas

### Lire ce que disent les services

```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail 50 api
```

Remplacez `api` par le service qui pose problème : `site`, `db`, `storage`. Cherchez
les lignes contenant `error`.

Pour suivre en direct pendant que vous rechargez la page :

```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f site
```

`Ctrl` + `C` pour arrêter de suivre — cela n'arrête pas le service.

### Le site affiche « 404 page not found »

C'est Traefik qui répond : il ne trouve aucune règle pour ce domaine. Vérifiez que
`SITE_DOMAINE` dans `.env` correspond exactement au domaine tapé, puis relancez :

```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Vérifiez aussi le nom du réseau :

```sh
docker network ls | grep decorek
```

Le nom affiché doit être identique à `TRAEFIK_RESEAU` dans `.env`.

### Le certificat n'est pas valide

Let's Encrypt valide en interrogeant le port 80. Vérifiez que le domaine pointe bien
sur le serveur (chapitre 5) et que le port 80 n'est pas bloqué :

```sh
curl -sI http://deco-rek.com | head -3
```

Le certificat peut mettre une minute à être délivré après le premier démarrage.

### Un service redémarre en boucle

Presque toujours un `.env` incomplet. Regardez ses journaux : le message dit
généralement quelle variable manque.

```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail 30 api
```

### Tout redémarrer proprement

```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart
```

**À ne pas confondre** avec la commande suivante, qui supprime les conteneurs. Elle est
sans danger pour vos données — celles-ci sont dans des volumes — mais ne la lancez
qu'en connaissance de cause :

```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml down
```

N'ajoutez **jamais** `-v` à cette commande : cette option effacerait la base de
données, les comptes et les images de la boutique.

---

## Ce qui n'est pas exposé sur Internet

Seul le site est accessible de l'extérieur. La base de données, le cache et le stockage
n'ouvrent aucun port : ils ne se joignent que depuis l'intérieur du serveur.

Les images sont servies sous `/media` plutôt que par l'adresse du stockage, ce qui garde
sa console d'administration hors d'atteinte.
