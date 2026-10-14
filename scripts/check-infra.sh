#!/usr/bin/env bash
# Vérifie que l'infrastructure locale est réellement utilisable : les conteneurs sont
# sains, et chaque service répond à une vraie requête. Un conteneur « up » ne prouve rien.
set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.dev.yml"

if [ ! -f .env ]; then
  echo "✗ .env absent — copier .env.example en .env" >&2
  exit 1
fi
set -a && . ./.env && set +a

echec=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
rate() { printf '  \033[31m✗\033[0m %s\n' "$1"; echec=1; }

echo "État des conteneurs"
for service in db cache storage mail api; do
  etat=$($COMPOSE ps --format '{{.Health}}' "$service" 2>/dev/null | head -1)
  [ "$etat" = "healthy" ] && ok "$service : $etat" || rate "$service : ${etat:-absent}"
done

echo "Connexions"
$COMPOSE exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c 'SELECT 1' >/dev/null 2>&1 \
  && ok "postgres : requête exécutée" || rate "postgres : requête refusée"

if $COMPOSE exec -T cache redis-cli -a "$REDIS_PASSWORD" --no-auth-warning ping 2>/dev/null | grep -q PONG; then
  ok "redis : PONG"
  # Le mot de passe doit être exigé : un Redis ouvert est une compromission classique.
  # Contrôle imbriqué à dessein — sur un Redis éteint, l'absence de réponse ressemble
  # à un refus d'authentification et produirait une fausse alerte de sécurité.
  if $COMPOSE exec -T cache redis-cli --no-auth-warning ping 2>&1 | grep -qi 'NOAUTH\|Authentication'; then
    ok "redis : mot de passe exigé"
  else
    rate "redis : accessible SANS mot de passe"
  fi
else
  rate "redis : pas de réponse"
fi

$COMPOSE exec -T storage curl -fsS http://127.0.0.1:9000/health >/dev/null 2>&1 \
  && ok "stockage : prêt" || rate "stockage : non prêt"

echo "Bucket"
# Aller-retour complet : un bucket qui existe ne prouve pas qu'on peut y écrire.
# Passe par le conteneur storage-init, le seul qui porte les identifiants.
if $COMPOSE run --rm --no-deps -T --entrypoint sh storage-init -c "
  set -e
  echo sonde | aws s3 cp - 's3://$MINIO_BUCKET/.sonde'
  test \"\$(aws s3 cp 's3://$MINIO_BUCKET/.sonde' -)\" = sonde
  aws s3 rm 's3://$MINIO_BUCKET/.sonde'
" >/dev/null 2>&1; then
  ok "bucket ${MINIO_BUCKET} : écriture, lecture et suppression"
else
  rate "bucket ${MINIO_BUCKET} : aller-retour impossible"
fi

# Les images sont publiques une à une, mais la liste du bucket ne doit pas l'être.
if [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
      "http://localhost:${MINIO_PORT:-59000}/${MINIO_BUCKET}/")" = "403" ]; then
  ok "bucket ${MINIO_BUCKET} : liste refusée aux anonymes"
else
  rate "bucket ${MINIO_BUCKET} : liste du contenu OUVERTE aux anonymes"
fi

echo "API"
sante=$(curl -s --max-time 10 "http://localhost:${API_PORT:-53000}/api/health" || echo "")
if printf '%s' "$sante" | grep -q '"database":"ok"'; then
  ok "api : en ligne, base joignable"
else
  rate "api : contrôle de santé en échec (${sante:-aucune réponse})"
fi

# L'administration doit refuser un visiteur sans session, en toutes circonstances.
if [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
      "http://localhost:${API_PORT:-53000}/api/admin/verification")" = "401" ]; then
  ok "api : administration fermée sans session"
else
  rate "api : administration ACCESSIBLE sans session"
fi

# Les routes de diagnostic doivent rester absentes de l'image de production.
if [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
      "http://localhost:${API_PORT:-53000}/api/_diag/boom")" = "404" ]; then
  ok "api : routes de diagnostic absentes"
else
  rate "api : routes de diagnostic EXPOSÉES"
fi

echo "Messagerie"
if curl -s --max-time 10 "http://localhost:${MAIL_UI_PORT:-58025}/api/v1/info" | grep -q .; then
  ok "mailpit : boîte de développement joignable"
else
  rate "mailpit : injoignable"
fi

echo "Exposition réseau"
# En dev les ports sont liés à 127.0.0.1 : ils ne doivent pas répondre sur l'IP du poste.
ip=$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "")
if [ -n "$ip" ]; then
  if nc -z -w 2 "$ip" 5432 2>/dev/null; then
    rate "postgres joignable depuis $ip — port lié à 0.0.0.0"
  else
    ok "postgres non joignable depuis $ip"
  fi
else
  echo "  – adresse du poste introuvable, contrôle ignoré"
fi

[ "$echec" -eq 0 ] && echo "Infrastructure opérationnelle." || { echo "Infrastructure incomplète." >&2; exit 1; }
