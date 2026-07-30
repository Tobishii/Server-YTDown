# Imagen base con Node + Python para poder instalar yt-dlp
FROM node:20-slim

# Instalar dependencias del sistema: Python, pip, ffmpeg
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Instalar yt-dlp globalmente vía pip
RUN pip3 install -U yt-dlp --break-system-packages

# Crear directorio de trabajo
WORKDIR /app

# Copiar package.json e instalar dependencias de Node
COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev

# Copiar todo el proyecto
COPY . .

# Puerto que expone la app
EXPOSE 3000

# Comando de inicio
CMD ["node", "backend/server.js"]
