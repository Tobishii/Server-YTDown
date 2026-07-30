const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Convierte un tamano reportado por yt-dlp (ej. "10.00MiB") a megabytes decimales (MB).
function toMB(value, unit) {
  const n = parseFloat(value);
  switch ((unit || '').toUpperCase()) {
    case 'B':
      return n / (1024 * 1024);
    case 'KIB':
      return n / 1024;
    case 'MIB':
      return n * 1.048576; // MiB -> MB decimal
    case 'GIB':
      return n * 1024 * 1.048576;
    default:
      return n;
  }
}

function bytesToMB(bytes) {
  return bytes / (1024 * 1024);
}

// Estima el peso (en MB) de un formato individual de yt-dlp, con lo que haya disponible.
function estimateFormatMB(fmt, durationSec) {
  if (!fmt) return null;
  if (fmt.filesize) return bytesToMB(fmt.filesize);
  if (fmt.filesize_approx) return bytesToMB(fmt.filesize_approx);
  if (fmt.tbr && durationSec) {
    // tbr viene en kbps (kilobits/seg)
    return (fmt.tbr * 1000 * durationSec) / 8 / (1024 * 1024);
  }
  return null;
}

// Para una altura maxima dada, busca el mejor video-only y el mejor audio-only
// y suma sus tamanos (asi es como se arma el MP4 final con bestvideo+bestaudio).
function estimateMuxedSize(formats, maxHeight, durationSec) {
  const videoCandidates = formats.filter((f) => f.vcodec && f.vcodec !== 'none' && f.height && f.height <= maxHeight);
  const audioCandidates = formats.filter((f) => f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none'));

  if (!videoCandidates.length) return null;

  const bestVideo = videoCandidates.reduce((best, f) => (!best || f.height > best.height ? f : best), null);
  const bestAudio = audioCandidates.reduce((best, f) => (!best || (f.abr || 0) > (best.abr || 0) ? f : best), null);

  const videoMB = estimateFormatMB(bestVideo, durationSec);
  if (videoMB === null) return null;

  // Si el "mejor video" ya trae audio incluido (formato progresivo), no sumamos nada mas.
  if (bestVideo.acodec && bestVideo.acodec !== 'none') return videoMB;

  const audioMB = estimateFormatMB(bestAudio, durationSec);
  return audioMB !== null ? videoMB + audioMB : videoMB;
}

// Estima el tamano final del MP3 a 320kbps CBR (independiente del bitrate original).
function estimateMp3Size(durationSec) {
  if (!durationSec) return null;
  return (320 * 1000 * durationSec) / 8 / (1024 * 1024);
}

function round1(n) {
  return n === null || n === undefined ? null : Math.round(n * 10) / 10;
}

function estimateSizes(formats, durationSec) {
  return {
    1080: round1(estimateMuxedSize(formats, 1080, durationSec)),
    720: round1(estimateMuxedSize(formats, 720, durationSec)),
    480: round1(estimateMuxedSize(formats, 480, durationSec)),
    mp3: round1(estimateMp3Size(durationSec)),
  };
}

/**
 * Obtiene metadata de un video de YouTube usando `yt-dlp -j` (sin descargar nada).
 * @param {string} url
 * @returns {Promise<{title:string, uploader:string, thumbnail:string, duration:number, id:string, sizes:object}>}
 */
function getVideoInfo(url) {
  return new Promise((resolve, reject) => {
    const COOKIES_PATH = path.join(__dirname, '..', '..', 'config', 'cookies.txt');
    const args = [
    '-j',
    '--no-playlist',
    '--skip-download',
    '--no-warnings',
    '--extractor-args', 'youtube:player_client=web,default',
    '--cookies', COOKIES_PATH,
    url
];
    const proc = spawn('yt-dlp', args);

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => (stdout += chunk));
    proc.stderr.on('data', (chunk) => (stderr += chunk));

    proc.on('error', () => {
      reject(new Error('No se encontro yt-dlp. Instalalo con "pip install -U yt-dlp" y asegurate de que este en el PATH.'));
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        const lastLine = stderr.trim().split('\n').filter(Boolean).pop();
        return reject(new Error(lastLine || `yt-dlp salio con codigo ${code}`));
      }
      try {
        const data = JSON.parse(stdout);
        const formats = Array.isArray(data.formats) ? data.formats : [];
        resolve({
          title: data.title,
          uploader: data.uploader || data.channel || '',
          thumbnail: data.thumbnail,
          duration: data.duration,
          id: data.id,
          sizes: estimateSizes(formats, data.duration),
        });
      } catch (err) {
        reject(new Error('No se pudo interpretar la respuesta de yt-dlp.'));
      }
    });
  });
}

/**
 * Devuelve los argumentos de formato de yt-dlp segun la calidad elegida.
 */
function formatArgsFor(quality) {
  switch (quality) {
    case '1080':
      return ['-f', 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]/best', '--merge-output-format', 'mp4'];
    case '720':
      return ['-f', 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best[height<=720]/best', '--merge-output-format', 'mp4'];
    case '480':
      return ['-f', 'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=480]+bestaudio/best[height<=480]/best', '--merge-output-format', 'mp4'];
    case 'mp3':
      return ['-x', '--audio-format', 'mp3', '--audio-quality', '320K'];
    default:
      return ['-f', 'best'];
  }
}

// Linea tipica: "[download]  45.2% of   10.00MiB at    1.20MiB/s ETA 00:05"
// Tambien puede venir sin "at ... ETA" cuando termina, o con "~" si el tamano es estimado.
const PROGRESS_RE = /\[download\]\s+([\d.]+)%\s+of\s+~?\s*([\d.]+)(B|KiB|MiB|GiB)(?:\s+at\s+([\d.]+|Unknown)(B|KiB|MiB|GiB)?\/s)?(?:\s+ETA\s+([\d:]+|Unknown))?/i;

/**
 * Descarga un video con yt-dlp y va reportando progreso por callback.
 * El archivo resultante queda en downloadsDir con nombre "<jobId>__<titulo>.<ext>".
 */
function downloadVideo({ url, quality, jobId, downloadsDir, onProgress, onDone, onError }) {
  const outputTemplate = path.join(downloadsDir, `${jobId}__%(title)s.%(ext)s`);

  const COOKIES_PATH = path.join(__dirname, '..', '..', 'config', 'cookies.txt');
  const args = [
    '--newline',
    '--no-playlist',
    '--no-warnings',
    '--extractor-args', 'youtube:player_client=web,default',
    '--cookies', COOKIES_PATH,
    '-o', outputTemplate,
    ...formatArgsFor(quality),
    url,
];

  const proc = spawn('yt-dlp', args);
  let stderr = '';

  proc.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    const match = text.match(PROGRESS_RE);
    if (match) {
      const [, percent, totalVal, totalUnit, speedVal, speedUnit, eta] = match;
      const totalMB = toMB(totalVal, totalUnit);
      const downloadedMB = totalMB * (parseFloat(percent) / 100);
      const speedMBps = speedVal && speedVal !== 'Unknown' ? toMB(speedVal, speedUnit) : null;

      onProgress({
        percent: parseFloat(percent),
        downloadedMB: Math.round(downloadedMB * 10) / 10,
        totalMB: Math.round(totalMB * 10) / 10,
        speedMBps: speedMBps !== null ? Math.round(speedMBps * 10) / 10 : null,
        eta: eta && eta !== 'Unknown' ? eta : null,
      });
    }
  });

  proc.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  proc.on('error', () => {
    onError('No se encontro yt-dlp. Instalalo con "pip install -U yt-dlp" y asegurar de que este en el PATH.');
  });

  proc.on('close', (code) => {
    if (code !== 0) {
      const lastLine = stderr.trim().split('\n').filter(Boolean).pop();
      onError(lastLine || 'La descarga fallo.');
      return;
    }
    onProgress({ percent: 100, downloadedMB: null, totalMB: null, speedMBps: null, eta: null });
    const files = fs.readdirSync(downloadsDir).filter((f) => f.startsWith(jobId));
    if (files.length) {
      onDone(files[0]);
    } else {
      onError('La descarga termino pero no se encontro el archivo generado.');
    }
  });
}

module.exports = { getVideoInfo, downloadVideo };
