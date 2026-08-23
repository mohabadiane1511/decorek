# --- Construction -----------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Le client Prisma est généré, jamais versionné : il doit être produit ici, avant la
# compilation TypeScript qui en dépend. Copier un node_modules depuis un poste ne
# suffirait pas et introduirait des écarts entre environnements.
COPY prisma.config.ts ./
COPY prisma ./prisma
# La génération ne se connecte à rien, mais la configuration exige la variable dès son
# chargement. Elle est fournie en ligne, le temps de cette commande : elle n'est pas
# inscrite dans l'image, et la vraie URL vient de l'environnement au démarrage.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npx prisma generate

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npx tsc -p tsconfig.build.json

# --- Exécution --------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

# Utilisateur non privilégié fourni par l'image : une faille dans l'application ne doit
# pas donner les droits root dans le conteneur.
USER node

EXPOSE 3000
CMD ["node", "dist/server.js"]
