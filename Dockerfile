FROM node:20-slim

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install -U yt-dlp --break-system-packages

# Decirle a yt-dlp dónde está Node.js para el n-challenge
RUN yt-dlp --version
ENV PATH="/usr/local/bin:$PATH"

WORKDIR /app

COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev

COPY . .

# Configurar yt-dlp para usar Node.js como runtime JS
RUN mkdir -p /root/.config/yt-dlp && \
    echo '--js-runtimes node:/usr/local/bin/node' > /root/.config/yt-dlp/config

EXPOSE 3000

CMD ["node", "backend/server.js"]
