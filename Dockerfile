FROM node:20-slim

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Instalar yt-dlp con soporte completo para n-challenge
RUN pip3 install -U yt-dlp[default] --break-system-packages

# Pre-descargar el script del n-challenge solver
RUN yt-dlp --update-to nightly 2>/dev/null || true

WORKDIR /app

# Crear config de yt-dlp con el runtime de JS
RUN mkdir -p /root/.config/yt-dlp && \
    printf -- '--js-runtimes node:/usr/local/bin/node\n' > /root/.config/yt-dlp/config

COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev

COPY . .

EXPOSE 3000

CMD ["node", "backend/server.js"]
