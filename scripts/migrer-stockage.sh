#!/usr/bin/env bash
# Migre les images du stockage MinIO vers RustFS, sans jamais rien effacer côté MinIO.
#
# MinIO ne publie plus d'images Docker : un serveur qui perdrait son cache ne pourrait
# plus démarrer le stockage. Les images sont copiées par l'API S3 (rclone), car RustFS
# ne relit pas les fichiers de MinIO sur disque. Le volume MinIO reste intact : c'est
# lui qui permet de revenir en arrière.
#
# Usage : scripts/migrer-stockage.sh <étape> [--dev] [--oui]
#
# Les étapes, dans l'ordre :
#   inventaire   compte les images du stockage actuel ............... ne modifie rien
#   sauvegarder  archive le volume MinIO dans sauvegardes/ ........... ne modifie rien
#   preparer     démarre un RustFS temporaire à côté de MinIO et y copie les images.
#                Le site reste en ligne ; relançable autant de fois que voulu.
#   finaliser    À LANCER ENVOIS DE PHOTOS SUSPENDUS : dernière copie, comparaison
#                octet par octet, arrêt du RustFS temporaire.
#   basculer     remplace MinIO par RustFS pour le site, puis lance verifier.
#   verifier     contrôle le stockage après la bascule.
#
# En cas de retour à MinIO (ancienne version du code redéployée) :
#   rapatrier    recopie vers MinIO les images envoyées depuis la bascule.
#
# --dev : poste de développement (docker-compose.dev.yml) au lieu de la production.
# --oui : ne pas demander de confirmation (finaliser).
set -euo pipefail

cd "$(dirname "$0")/.."

ETAPE=""
SURCHARGE=docker-compose.prod.yml
CONFIRME=0
for argument in "$@"; do
  case "$argument" in
    --dev) SURCHARGE=docker-compose.dev.yml ;;
    --oui) CONFIRME=1 ;;
    -*) echo "Option inconnue : $argument" >&2; exit 2 ;;
    *) ETAPE="$argument" ;;
  esac
done

COMPOSE=(docker compose -f docker-compose.yml -f "$SURCHARGE")
RCLONE_IMAGE=rclone/rclone:1.69.1
SAUVEGARDES=sauvegardes
REPERE="$SAUVEGARDES/migration-finalisee.txt"

titre() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()    { printf '  \033[32m✓\033[0m %s\n' "$*"; }
note()  { printf '  – %s\n' "$*"; }
arret() { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

if [ ! -f .env ]; then
  arret ".env absent : lancer ce script depuis le dossier du site, sur le serveur."
fi
set -a && . ./.env && set +a
BUCKET=${MINIO_BUCKET:-decorek-media}

# --- Contexte : le stockage en service, son projet, son réseau ---------------------

CONTENEUR=$("${COMPOSE[@]}" ps -q storage 2>/dev/null | head -1)
[ -n "$CONTENEUR" ] || arret "Le service storage ne tourne pas. Démarrer le site d'abord."

IMAGE_ACTUELLE=$(docker inspect -f '{{.Config.Image}}' "$CONTENEUR")
PROJET=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$CONTENEUR")
RESEAU=$(docker inspect -f '{{range $nom, $_ := .NetworkSettings.Networks}}{{println $nom}}{{end}}' "$CONTENEUR" \
  | grep -x "${PROJET}_default" || true)
[ -n "$RESEAU" ] || RESEAU=$(docker inspect -f '{{range $nom, $_ := .NetworkSettings.Networks}}{{println $nom}}{{end}}' "$CONTENEUR" | head -1)

VOLUME_NEUF="${PROJET}_storage-rustfs-data"
TEMPORAIRE="${PROJET}-rustfs-migration"
# Même version que le service storage : on prépare exactement ce qui servira ensuite.
# Après un retour à MinIO, docker-compose.yml ne la mentionne plus : « rapatrier »
# reprend alors celle de la migration.
RUSTFS_IMAGE=$("${COMPOSE[@]}" config --images 2>/dev/null | grep '^rustfs/' | head -1 || true)
RUSTFS_IMAGE=${RUSTFS_IMAGE:-rustfs/rustfs:1.0.1}

est_rustfs() { case "$IMAGE_ACTUELLE" in *rustfs*) return 0 ;; *) return 1 ;; esac; }

exiger_minio() {
  if est_rustfs; then
    arret "Le site utilise déjà RustFS ($IMAGE_ACTUELLE). Cette étape ne vaut qu'avant la bascule.
  Si la bascule s'est faite par erreur avant la copie, revenir à MinIO : voir
  docs/mise-en-production.md, « Revenir à MinIO »."
  fi
}

exiger_rustfs() {
  est_rustfs || arret "Le site utilise encore MinIO ($IMAGE_ACTUELLE) : lancer d'abord « basculer »."
}

temporaire_actif() { [ "$(docker inspect -f '{{.State.Running}}' "$TEMPORAIRE" 2>/dev/null)" = "true" ]; }

# --- rclone : « actuel » est le service storage, « temporaire » le RustFS de migration --
# Les identifiants passent par l'environnement, jamais par la ligne de commande :
# ils resteraient sinon visibles dans la liste des processus.

export RCLONE_S3_FORCE_PATH_STYLE=true
export RCLONE_S3_NO_CHECK_BUCKET=true
for distant in ACTUEL TEMPORAIRE; do
  export "RCLONE_CONFIG_${distant}_TYPE=s3"
  export "RCLONE_CONFIG_${distant}_PROVIDER=Other"
  export "RCLONE_CONFIG_${distant}_ACCESS_KEY_ID=$MINIO_ROOT_USER"
  export "RCLONE_CONFIG_${distant}_SECRET_ACCESS_KEY=$MINIO_ROOT_PASSWORD"
done
export RCLONE_CONFIG_ACTUEL_ENDPOINT=http://storage:9000
export RCLONE_CONFIG_TEMPORAIRE_ENDPOINT="http://$TEMPORAIRE:9000"

rclone() {
  local env=()
  while IFS= read -r nom; do env+=(-e "$nom"); done < <(env | sed -n 's/^\(RCLONE_[A-Z_]*\)=.*/\1/p')
  docker run --rm --network "$RESEAU" "${env[@]}" "$RCLONE_IMAGE" --config "" "$@"
}

# « 17;1361733 » : nombre d'images et taille totale en octets.
compter() {
  rclone size "$1:$BUCKET" --json \
    | sed -E 's/.*"count":([0-9]+).*"bytes":([0-9]+).*/\1;\2/'
}

afficher_compte() {
  local compte=$1
  printf '%s images, %s Ko' "${compte%;*}" "$(( ${compte#*;} / 1024 ))"
}

# --- RustFS temporaire -------------------------------------------------------------

demarrer_temporaire() {
  if temporaire_actif; then
    ok "RustFS temporaire déjà démarré ($TEMPORAIRE)"
    return
  fi
  docker rm -f "$TEMPORAIRE" >/dev/null 2>&1 || true

  if ! docker volume inspect "$VOLUME_NEUF" >/dev/null 2>&1; then
    # Étiqueté comme s'il venait de Compose : le service storage le reprendra tel quel.
    docker volume create \
      --label "com.docker.compose.project=$PROJET" \
      --label "com.docker.compose.volume=storage-rustfs-data" \
      "$VOLUME_NEUF" >/dev/null
    ok "volume $VOLUME_NEUF créé"
  fi

  RUSTFS_ACCESS_KEY="$MINIO_ROOT_USER" RUSTFS_SECRET_KEY="$MINIO_ROOT_PASSWORD" \
  docker run -d --name "$TEMPORAIRE" --network "$RESEAU" \
    -v "$VOLUME_NEUF:/data" \
    -e RUSTFS_ACCESS_KEY -e RUSTFS_SECRET_KEY \
    -e RUSTFS_VOLUMES=/data -e RUSTFS_ADDRESS=0.0.0.0:9000 \
    -e RUSTFS_CONSOLE_ENABLE=false -e RUSTFS_OBS_LOG_DIRECTORY= \
    "$RUSTFS_IMAGE" >/dev/null

  for _ in $(seq 1 60); do
    docker exec "$TEMPORAIRE" curl -fsS http://127.0.0.1:9000/health >/dev/null 2>&1 && break
    sleep 1
  done
  docker exec "$TEMPORAIRE" curl -fsS http://127.0.0.1:9000/health >/dev/null 2>&1 \
    || arret "Le RustFS temporaire ne répond pas. Journal : docker logs $TEMPORAIRE"
  ok "RustFS temporaire démarré ($RUSTFS_IMAGE), sans aucun port ouvert sur Internet"
}

arreter_temporaire() {
  docker rm -f "$TEMPORAIRE" >/dev/null 2>&1 || true
  ok "RustFS temporaire arrêté (ses données restent dans $VOLUME_NEUF)"
}

# --- Étapes -------------------------------------------------------------------------

inventaire() {
  exiger_minio
  titre "Inventaire du stockage actuel ($IMAGE_ACTUELLE)"
  mkdir -p "$SAUVEGARDES"
  local fichier
  fichier="$SAUVEGARDES/inventaire-$(date +%Y%m%d-%H%M%S).txt"
  rclone lsf -R --files-only --format "sp" --separator ";" "actuel:$BUCKET" > "$fichier"
  ok "$(afficher_compte "$(compter actuel)")"
  ok "liste enregistrée dans $fichier"
  note "Rien n'a été modifié."
}

sauvegarder() {
  exiger_minio
  titre "Sauvegarde du volume MinIO"
  local volume archive
  volume=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}' "$CONTENEUR")
  [ -n "$volume" ] || arret "Volume de données de MinIO introuvable."
  mkdir -p "$SAUVEGARDES"
  archive="stockage-minio-$(date +%Y%m%d-%H%M%S).tar.gz"
  # Lecture seule : l'archive ne peut pas abîmer le volume qu'elle copie.
  docker run --rm -v "$volume:/data:ro" -v "$PWD/$SAUVEGARDES:/sauvegardes" \
    --entrypoint tar "$RCLONE_IMAGE" czf "/sauvegardes/$archive" -C /data .
  ok "volume $volume archivé : $SAUVEGARDES/$archive ($(du -h "$SAUVEGARDES/$archive" | cut -f1))"
  note "Rien n'a été modifié. La base de données n'est pas concernée : les liens /media/… ne changent pas."
}

preparer() {
  exiger_minio
  titre "Préparation de RustFS (le site reste en ligne)"
  demarrer_temporaire
  # Même création de bucket et même règle d'accès que le service définitif.
  "${COMPOSE[@]}" run --rm --no-deps -T -e "AWS_ENDPOINT_URL=http://$TEMPORAIRE:9000" storage-init >/dev/null
  ok "bucket $BUCKET prêt, images lisibles par tous, liste refusée"

  titre "Copie MinIO → RustFS"
  rclone copy "actuel:$BUCKET" "temporaire:$BUCKET" --stats 0 2>&1 | sed 's/^/  /'
  rclone check "actuel:$BUCKET" "temporaire:$BUCKET" 2>&1 | sed -n 's/^.*NOTICE: //p' | sed 's/^/  /' \
    || arret "La copie n'est pas complète. Relancer « preparer »."
  ok "MinIO : $(afficher_compte "$(compter actuel)")"
  ok "RustFS : $(afficher_compte "$(compter temporaire)")"
  note "Le RustFS temporaire reste allumé pour l'étape finaliser."
  note "Étape suivante : suspendre les envois de photos, puis lancer « finaliser »."
}

finaliser() {
  exiger_minio
  temporaire_actif || arret "Le RustFS temporaire ne tourne pas : lancer « preparer » d'abord."

  if [ "$CONFIRME" -ne 1 ]; then
    printf '\nAucune photo ne doit être ajoutée ni supprimée dans le back-office\n'
    printf 'jusqu'"'"'à la fin de la bascule. Est-ce bien le cas ? Tapez oui : '
    read -r reponse
    [ "$reponse" = "oui" ] || arret "Abandon : rien n'a été modifié."
  fi

  titre "Dernière copie"
  # sync, pas copy : une photo supprimée depuis « preparer » doit l'être aussi ici.
  # Ne touche qu'au RustFS temporaire ; MinIO n'est que lu.
  rclone sync "actuel:$BUCKET" "temporaire:$BUCKET" --stats 0 2>&1 | sed 's/^/  /'

  titre "Comparaison octet par octet"
  # --download : relit chaque image des deux côtés. Les empreintes S3 ne suffisent pas :
  # celles des fichiers envoyés en plusieurs morceaux ne sont pas comparables.
  if ! rclone check --download "actuel:$BUCKET" "temporaire:$BUCKET" 2>&1 \
      | sed 's/^.*NOTICE: //;s/^/  /'; then
    arret "Des différences subsistent : ne pas basculer. Relancer « finaliser »."
  fi
  local source destination
  source=$(compter actuel)
  destination=$(compter temporaire)
  [ "$source" = "$destination" ] || arret "Comptes différents (MinIO $source, RustFS $destination) : ne pas basculer."
  ok "identiques : $(afficher_compte "$source")"

  printf 'date=%s\ncompte=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$source" > "$REPERE"
  arreter_temporaire
  note "Les envois de photos restent suspendus. Étape suivante : « basculer »."
}

basculer() {
  exiger_minio
  [ -f "$REPERE" ] || arret "Migration non finalisée : lancer « preparer » puis « finaliser »."
  temporaire_actif && arret "Le RustFS temporaire tourne encore : relancer « finaliser »."
  docker volume inspect "$VOLUME_NEUF" >/dev/null 2>&1 || arret "Volume $VOLUME_NEUF introuvable."

  titre "Bascule vers RustFS"
  # --no-deps : seul le stockage est remplacé, l'API et le site ne redémarrent pas.
  "${COMPOSE[@]}" up -d --no-deps --wait storage
  "${COMPOSE[@]}" run --rm --no-deps -T storage-init >/dev/null
  ok "le site utilise maintenant RustFS ; le volume MinIO est conservé"

  CONTENEUR=$("${COMPOSE[@]}" ps -q storage | head -1)
  IMAGE_ACTUELLE=$(docker inspect -f '{{.Config.Image}}' "$CONTENEUR")
  verifier
}

verifier() {
  exiger_rustfs
  titre "Vérification du stockage ($IMAGE_ACTUELLE)"
  docker exec "$CONTENEUR" curl -fsS http://127.0.0.1:9000/health >/dev/null \
    && ok "stockage en bonne santé" || arret "Le stockage ne répond pas."

  local compte attendu chemin code manquantes=0
  compte=$(compter actuel)
  if [ -f "$REPERE" ]; then
    attendu=$(sed -n 's/^compte=//p' "$REPERE")
    if [ "$compte" = "$attendu" ]; then
      ok "$(afficher_compte "$compte"), comme à la fin de la copie"
    elif [ "${compte%;*}" -gt "${attendu%;*}" ]; then
      ok "$(afficher_compte "$compte") (de nouvelles photos ont été ajoutées depuis la copie)"
    else
      arret "$(afficher_compte "$compte") alors que la copie en comptait ${attendu%;*}."
    fi
  else
    note "$(afficher_compte "$compte") (pas de repère de copie à comparer)"
  fi

  # Chaque image doit être lisible sans identifiants, comme la lira un visiteur.
  while IFS= read -r chemin; do
    code=$(docker exec "$CONTENEUR" curl -s -g -o /dev/null -w '%{http_code}' "http://127.0.0.1:9000/$BUCKET/$chemin")
    if [ "$code" != "200" ]; then
      note "illisible ($code) : $chemin"
      manquantes=$((manquantes + 1))
    fi
  done < <(rclone lsf -R --files-only "actuel:$BUCKET")
  [ "$manquantes" -eq 0 ] && ok "toutes les images sont lisibles par les visiteurs" \
    || arret "$manquantes image(s) illisibles par les visiteurs."

  code=$(docker exec "$CONTENEUR" curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:9000/$BUCKET/")
  [ "$code" = "403" ] && ok "la liste du bucket reste refusée aux visiteurs" \
    || arret "La liste du bucket est ouverte aux visiteurs (code $code)."

  note "À faire à la main : ouvrir une fiche produit sur le site, puis ajouter et retirer"
  note "une photo depuis le back-office. Les envois de photos peuvent ensuite reprendre."
}

rapatrier() {
  exiger_minio
  docker volume inspect "$VOLUME_NEUF" >/dev/null 2>&1 || arret "Volume $VOLUME_NEUF introuvable : rien à rapatrier."
  titre "Rapatriement RustFS → MinIO"
  demarrer_temporaire
  # copy, jamais sync : on ajoute à MinIO ce qui lui manque, sans rien y supprimer.
  rclone copy "temporaire:$BUCKET" "actuel:$BUCKET" --stats 0 -v 2>&1 | grep -E 'Copied' | sed 's/^.*INFO  : /  copiée : /' || true
  ok "MinIO : $(afficher_compte "$(compter actuel)")"
  arreter_temporaire
}

case "$ETAPE" in
  inventaire|sauvegarder|preparer|finaliser|basculer|verifier|rapatrier) "$ETAPE" ;;
  *)
    sed -n '2,/^set -euo/p' "$0" | sed '$d; s/^# \{0,1\}//'
    exit 2
    ;;
esac
