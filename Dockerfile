FROM node:20-slim

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    unzip \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Instalar Deno (runtime JS nativo de yt-dlp)
RUN curl -fsSL https://deno.land/install.sh | sh
ENV DENO_INSTALL="/root/.deno"
ENV PATH="$DENO_INSTALL/bin:$PATH"

# Instalar yt-dlp
RUN pip3 install -U yt-dlp --break-system-packages

# Verificar que Deno es visible para yt-dlp
RUN deno --version && yt-dlp --version

WORKDIR /app

COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev

COPY . .

EXPOSE 3000

CMD ["node", "backend/server.js"]
