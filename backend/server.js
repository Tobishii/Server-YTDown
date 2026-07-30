const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const { getVideoInfo, downloadVideo } = require('./lib/ytdlp');

const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
const DOWNLOADS_DIR = path.join(__dirname, '..', 'downloads');

if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(cors());
app.use(express.json());
app.use(express.static(FRONTEND_DIR));

const YT_URL_REGEX = /^(https?:\/\/)?(www\.)?(m\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)[\w-]+/i;

function isValidYoutubeUrl(url) {
  return typeof url === 'string' && YT_URL_REGEX.test(url.trim());
}

app.post('/api/info', async (req, res) => {
  const { url } = req.body || {};
  if (!isValidYoutubeUrl(url)) {
    return res.status(400).json({ error: 'Ese no parece un link valido de YouTube.' });
  }
  try {
    const info = await getVideoInfo(url.trim());
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/download', (req, res) => {
  const { url, quality } = req.body || {};
  if (!isValidYoutubeUrl(url)) {
    return res.status(400).json({ error: 'Ese no parece un link valido de YouTube.' });
  }

  const validQualities = ['1080', '720', '480', 'mp3'];
  const q = validQualities.includes(quality) ? quality : '720';
  const jobId = uuidv4();

  res.json({ jobId });

  downloadVideo({
    url: url.trim(),
    quality: q,
    jobId,
    downloadsDir: DOWNLOADS_DIR,
    onProgress: (progress) => io.to(jobId).emit('progress', progress),
    onDone: (filename) => io.to(jobId).emit('done', { filename }),
    onError: (message) => io.to(jobId).emit('error', { message }),
  });
});

app.get('/api/file/:jobId', (req, res) => {
  const { jobId } = req.params;
  // Solo aceptamos UUIDs v4 para evitar path traversal.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
    return res.status(400).send('Job id invalido');
  }

  const files = fs.readdirSync(DOWNLOADS_DIR).filter((f) => f.startsWith(`${jobId}__`));
  if (!files.length) return res.status(404).send('Archivo no encontrado (puede que ya haya sido descargado o haya expirado)');

  const filePath = path.join(DOWNLOADS_DIR, files[0]);
  const displayName = files[0].slice(`${jobId}__`.length);

  res.download(filePath, displayName, (err) => {
    if (!err) fs.unlink(filePath, () => {});
  });
});

io.on('connection', (socket) => {
  socket.on('join', (jobId) => {
    if (typeof jobId === 'string') socket.join(jobId);
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`YTDown corriendo en http://localhost:${PORT}`);
  console.log('El servidor esta corriendo correctamente...');
});
