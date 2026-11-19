# Image du raccourcisseur d'URL : build multi-stage, exécution non-root.
#
#   podman build -t localhost/raccourcisseur-url:1.0.0 .
#
# Image de base officielle, épinglée sur un tag précis (Node.js 26 LTS, Alpine).
ARG NODE_IMAGE=docker.io/library/node:26.13.1-alpine3.24

# --- Étape 1 : installation des dépendances de production ----------------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
# Copier d'abord les seuls manifestes : la couche « npm ci » reste en cache
# tant que les dépendances ne changent pas.
COPY package.json package-lock.json ./
# npm ci : installe exactement le package-lock.json ; --omit=dev : rien de superflu ;
# --ignore-scripts : aucun script d'installation tiers exécuté pendant le build.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --ignore-scripts

# --- Étape 2 : image d'exécution -----------------------------------------------
FROM ${NODE_IMAGE} AS runtime

# Correctifs de sécurité du système de base, puis suppression de npm et npx :
# inutiles à l'exécution, ils embarquent leurs propres dépendances (surface
# d'attaque et vulnérabilités remontées par le scanner).
RUN apk upgrade --no-cache \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

WORKDIR /app
# Fichiers appartenant à root et non modifiables par l'utilisateur d'exécution.
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY public ./public

# Utilisateur non-root « node » (UID 1000) fourni par l'image officielle.
# UID numérique : vérifiable par les outils (runAsNonRoot de Kubernetes, par exemple).
USER 1000:1000

EXPOSE 3000

# Pas de HEALTHCHECK ici : au format OCI (défaut de podman build), il serait ignoré.
# Le healthcheck est déclaré dans compose.yaml et dans l'unité Quadlet.

# Forme exec : node est le PID 1 et reçoit directement SIGTERM (arrêt propre).
CMD ["node", "src/server.js"]
