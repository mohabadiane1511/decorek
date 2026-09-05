# Image du site public.
#
# Le rendu se fait côté serveur : ce conteneur exécute du JavaScript, il ne sert pas
# seulement des fichiers. C'est ce qui met le catalogue dans le HTML envoyé, donc à
# portée des robots et des aperçus de partage.

# --- Construction -----------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /depot

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json vite.config.ts ./
COPY src ./src
COPY public ./public

# L'adresse publique est inscrite dans le JavaScript à la construction : elle sert aux
# adresses canoniques et aux aperçus de partage. Une image bâtie sans elle annoncerait
# le domaine par défaut, et les moteurs suivraient une adresse qui n'est pas la sienne.
ARG VITE_SITE_URL=https://deco-rek.com
ENV VITE_SITE_URL=${VITE_SITE_URL}

# Nitro vise Cloudflare par défaut ; ici la cible est un serveur Node ordinaire.
ENV NITRO_PRESET=node-server
RUN npm run build

# --- Exécution --------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# La sortie de Nitro embarque ses dépendances : rien d'autre à installer, et l'image
# reste petite.
COPY --from=build /depot/.output ./.output

# Utilisateur non privilégié fourni par l'image : une faille dans l'application ne doit
# pas donner les droits root dans le conteneur.
USER node

EXPOSE 3000
ENV PORT=3000
CMD ["node", ".output/server/index.mjs"]
