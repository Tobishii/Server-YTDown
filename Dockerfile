FROM node:20-slim

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install -U yt-dlp --break-system-packages

WORKDIR /app

RUN yt-dlp --version

COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev

COPY . .

EXPOSE 3000

CMD ["node", "backend/server.js"]
