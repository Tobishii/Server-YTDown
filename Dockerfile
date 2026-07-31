FROM node:20-slim

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    unzip \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Instalar Deno
RUN curl -fsSL https://deno.land/install.sh | sh
ENV DENO_INSTALL="/root/.deno"
ENV PATH="$DENO_INSTALL/bin:$PATH"

# Instalar yt-dlp con el plugin de PO Token
RUN pip3 install -U yt-dlp --break-system-packages && \
    pip3 install -U bgutil-ytdlp-pot-provider --break-system-packages

WORKDIR /app

COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev

COPY . .

EXPOSE 3000

CMD ["node", "backend/server.js"]
