# Schul-Apps-Server (02.10.2026) – eigenes Bild, eigener Container, unabhängig von Gywem Aviation.
#
# Gebaut auf dem VPS aus dem Paket, das scripts/server-paket.mjs schnürt:
#   server/       out/server (start.mjs – der gebündelte Server)
#   oberflaeche/  out/renderer (die Oberfläche)
#   resources/    mitgelieferte Daten (Lehrpläne, Schulverzeichnis, OpenMoji …)
#   package.json  nur playwright-core (PDF über Chromium)
FROM node:24-bookworm-slim

# Chromium für PDF, Schriften für Druckgleichheit (Umlaute, Emoji, Lautschrift)
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium ca-certificates fonts-dejavu-core fonts-liberation fonts-noto-core fonts-noto-color-emoji fonts-noto-extra \
 && rm -rf /var/lib/apt/lists/*

# Die offiziellen KI-Programme für den Abo-Zugang (jede Lehrkraft meldet IHR eigenes Konto an)
# Codex fest auf 0.154.0 (03.10.2026): Ab 0.160 erzeugt Codex Bilder über eine „imagegen“-Fähigkeit, die
# Befehle in einer Sandbox (bwrap) ausführt – im Container gibt es dafür keine Namensräume, und Bilder
# fielen still aus („kein Bildgenerierungswerkzeug verfügbar“). 0.154 hat das Werkzeug noch eingebaut.
ARG CODEX_VERSION=0.154.0
ARG CLAUDE_VERSION=2.1.287
RUN npm install -g --omit=dev @openai/codex@${CODEX_VERSION} @anthropic-ai/claude-code@${CLAUDE_VERSION} \
 && npm cache clean --force

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server ./server
COPY oberflaeche ./oberflaeche
COPY resources ./resources

ENV NODE_ENV=production \
    SCHULAPPS_SERVER=1 \
    SCHULAPPS_PORT=8443 \
    SCHULAPPS_DATEN=/daten \
    SCHULAPPS_SCHLUESSEL=/geheim/hauptschluessel \
    SCHULAPPS_OBERFLAECHE=/app/oberflaeche \
    SCHULAPPS_RESSOURCEN=/app/resources \
    SCHULAPPS_CHROMIUM=/usr/bin/chromium \
    SCHULAPPS_CLI_OPENAI=/usr/local/bin/codex \
    SCHULAPPS_CLI_ANTHROPIC=/usr/local/bin/claude \
    DISABLE_AUTOUPDATER=1

RUN mkdir -p /daten && chown node:node /daten
USER node
EXPOSE 8443
HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
  CMD NODE_TLS_REJECT_UNAUTHORIZED=0 node -e "fetch((process.env.SCHULAPPS_TLS_CERT?'https':'http')+'://127.0.0.1:8443/gesundheit').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" || exit 1
CMD ["node", "--enable-source-maps", "server/start.mjs"]
