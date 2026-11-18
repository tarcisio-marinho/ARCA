# ── frontend ──
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# ── backend (bundle único com esbuild) ──
FROM node:22-alpine AS server
WORKDIR /srv
COPY server/package.json server/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY server/ ./
RUN npm run build

# ── runtime: node + ferramentas que o agente dev usa no workspace ──
FROM node:22-alpine
RUN apk add --no-cache bash git python3 curl ripgrep
WORKDIR /app
COPY --from=server /srv/dist/server.mjs /app/server.mjs
COPY --from=web /web/dist /app/web
ENV NODE_ENV=production PORT=8080 \
    WEB_DIR=/app/web CONTENT_DIR=/app/content PDF_DIR=/data/pdfs UPLOAD_DIR=/data/uploads \
    MAPS_DIR=/data/maps ZIM_DIR=/data/zim WORKSPACE_DIR=/workspace
EXPOSE 8080
CMD ["node", "/app/server.mjs"]
