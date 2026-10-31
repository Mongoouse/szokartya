# syntax=docker/dockerfile:1
# =============================================================================
# Szókártya API – többlépcsős image.
#   build:   teljes függőségek, Prisma kliens, TypeScript fordítás; a migrációt
#            és a seedet futtató egyszeri konténer is ezt használja
#   runtime: csak futásidejű függőségek, nem root felhasználó
# =============================================================================
# A Prisma motorja a képben már meglévő libssl3-at használja (musl + OpenSSL 3).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
# A postinstall `prisma generate`-et futtat, ehhez kell a (dev) Prisma CLI –
# ezért a build lépés kliensét másoljuk, és a telepítésnél kihagyjuk a szkripteket.
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD wget -qO- http://localhost:3000/api/v1/health >/dev/null || exit 1
CMD ["node", "dist/main.js"]
