# Le contexte de construction est la racine du dépôt, pas backend/ : la compilation a
# besoin de src/data/types.ts, le contrat de données partagé avec le front. On reproduit
# donc l'arborescence du dépôt pour que les chemins relatifs résolvent à l'identique.

# --- Construction -----------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /depot/backend

COPY backend/package.json backend/package-lock.json ./
RUN npm ci

# Le client Prisma est généré, jamais versionné : il doit être produit ici, avant la
# compilation TypeScript qui en dépend. La génération ne se connecte à rien, mais la
# configuration exige la variable dès son chargement ; elle est fournie le temps de cette
# commande et n'est pas inscrite dans l'image.
COPY backend/prisma.config.ts ./
COPY backend/prisma ./prisma
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npx prisma generate

# Types uniquement : l'import disparaît à la compilation, mais tsc en a besoin pour
# vérifier que les réponses de l'API respectent le contrat.
COPY src/data /depot/src/data

# Photos du catalogue de démonstration, lues par l'amorçage pour les envoyer au
# stockage. Elles ne servent qu'à cette étape, jamais à l'exécution de l'API : elles
# restent donc dans l'étape de construction, d'où partent les commandes d'exploitation.
COPY public/images /depot/public/images

COPY backend/tsconfig.json backend/tsconfig.build.json ./
COPY backend/src ./src
RUN npx tsc -p tsconfig.build.json

# --- Exécution --------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Le contrat de données étant importé en tant que types, il ne laisse aucune trace dans
# le JavaScript émis : seul le sous-arbre du backend est nécessaire à l'exécution.
COPY --from=build /depot/backend/dist/backend/src ./dist
COPY --from=build /depot/backend/prisma ./prisma

# Utilisateur non privilégié fourni par l'image : une faille dans l'application ne doit
# pas donner les droits root dans le conteneur.
USER node

EXPOSE 3000
CMD ["node", "dist/server.js"]
