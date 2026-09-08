# TaskFlow single-image build for the Oracle Cloud free-tier VM (API + SPA fallback).
#
# The production UI lives on Vercel; this image also bundles client/dist so the
# API origin can serve the SPA as a same-origin fallback — mirroring the old
# Railway single-service model. VITE_* defaults to same-origin '/api' here;
# Vercel sets its own VITE_API_URL/VITE_SOCKET_URL at its build time.

# ── Stage 1: build the client (SPA) ─────────────────────────────────────
FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ── Stage 2: server (API + Socket.IO + background jobs) ──────────────────
FROM node:20-alpine
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/ ./
# SPA fallback from stage 1 lives one level up (server.js expects ../client/dist).
COPY --from=client-build /app/client/dist /app/client/dist
RUN chown -R node:node /app
USER node
EXPOSE 5000
CMD ["node", "server.js"]