###############################################################################
# Build stage: dev deps + build app
###############################################################################
FROM node:22.20.0-slim@sha256:b21fe589dfbe5cc39365d0544b9be3f1f33f55f3c86c87a76ff65a02f8f5848e AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY next.config.mjs next-env.d.ts ./
COPY public ./public
COPY images ./images
COPY src ./src

RUN npm run build

###############################################################################
# Runtime stage: prod-only deps
###############################################################################
FROM node:22.20.0-slim@sha256:b21fe589dfbe5cc39365d0544b9be3f1f33f55f3c86c87a76ff65a02f8f5848e AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

RUN chown -R node:node /app
USER node
EXPOSE 3000

ENTRYPOINT ["/bin/sh", "/app/entrypoint.sh"]
CMD ["start"]