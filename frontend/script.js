const socket = io();

const state = {
  quality: '1080',
  currentJobId: null,
};
  
const API_BASE_URL = 'https//:server-ytdown-production-6818.up.railway.app'; 

fetch(`${API_BASE_URL}/download?...`)

const els = {
  urlInput: document.getElementById('urlInput'),
  fetchBtn: document.getElementById('fetchBtn'),
  errorMsg: document.getElementById('errorMsg'),
  videoInfo: document.getElementById('videoInfo'),
  thumb: document.getElementById('thumb'),
  vtitle: document.getElementById('vtitle'),
  vauthor: document.getElementById('vauthor'),
  vbadge2: document.getElementById('vbadge2'),
  formatArea: document.getElementById('formatArea'),
  dlBtn: document.getElementById('dlBtn'),
  progressWrap: document.getElementById('progressWrap'),
  progressFill: document.getElementById('progressFill'),
  progressLabel: document.getElementById('progressLabel'),
  successMsg: document.getElementById('successMsg'),
};

function showErr(msg) {
  els.errorMsg.textContent = msg;
  els.errorMsg.classList.add('visible');
}

function resetFetchBtn() {
  els.fetchBtn.disabled = false;
  els.fetchBtn.textContent = 'Get Video';
}

function formatDuration(sec) {
  if (sec === undefined || sec === null) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function renderSizes(sizes) {
  document.querySelectorAll('.fmt-size').forEach((el) => {
    const key = el.dataset.size;
    const mb = sizes[key];
    if (mb === null || mb === undefined) {
      el.textContent = 'tamaño no disponible';
    } else if (mb >= 1024) {
      el.textContent = `≈ ${(mb / 1024).toFixed(2)} GB`;
    } else {
      el.textContent = `≈ ${mb} MB`;
    }
  });
}

function resetSizes() {
  document.querySelectorAll('.fmt-size').forEach((el) => {
    el.textContent = 'calculando...';
  });
}

async function fetchVideo() {
  const url = els.urlInput.value.trim();
  els.errorMsg.classList.remove('visible');
  els.videoInfo.classList.remove('visible');
  els.formatArea.classList.add('hidden');
  els.successMsg.classList.remove('visible');
  resetSizes();

  if (!url) return showErr('Pega un link de YouTube primero.');
  if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
    return showErr('Ese no parece un link de YouTube. Revisalo e intenta de nuevo.');
  }

  els.fetchBtn.disabled = true;
  els.fetchBtn.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span>';

  try {
    const res = await fetch('/api/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo obtener el video.');

    els.vtitle.textContent = data.title || 'YouTube Video';
    els.vauthor.textContent = [data.uploader, formatDuration(data.duration)].filter(Boolean).join(' · ');
    els.vbadge2.textContent = 'Video';
    els.thumb.innerHTML = data.thumbnail
      ? `<img src="${data.thumbnail}" alt="thumb" onerror="this.parentNode.textContent='▶'"/>`
      : '▶';

    els.videoInfo.classList.add('visible');
    els.formatArea.classList.remove('hidden');
    renderSizes(data.sizes || {});
  } catch (err) {
    showErr(err.message);
  } finally {
    resetFetchBtn();
  }
}

function pick(el) {
  document.querySelectorAll('.fmt').forEach((f) => f.classList.remove('selected'));
  el.classList.add('selected');
  state.quality = el.dataset.fmt;
}

async function startDownload() {
  const url = els.urlInput.value.trim();
  if (!url) return;

  els.dlBtn.disabled = true;
  els.dlBtn.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span>';
  els.progressWrap.classList.add('active');
  els.progressLabel.classList.add('active');
  els.successMsg.classList.remove('visible');
  els.progressFill.style.width = '0%';
  els.progressLabel.textContent = 'Preparando su descarga...';

  try {
    const res = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, quality: state.quality }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Algo salio mal. No se pudo iniciar la descarga.');

    state.currentJobId = data.jobId;
    socket.emit('join', data.jobId);
  } catch (err) {
    finishWithError(err.message);
  }
}

function finishWithError(msg) {
  els.progressWrap.classList.remove('active');
  els.progressLabel.classList.remove('active');
  showErr(msg);
  els.dlBtn.disabled = false;
  els.dlBtn.innerHTML = '↓ Descargar Ahora';
}

socket.on('progress', ({ percent, downloadedMB, totalMB, speedMBps, eta }) => {
  els.progressFill.style.width = percent + '%';

  let label = `Descargando... ${Math.round(percent)}%`;
  if (downloadedMB !== null && downloadedMB !== undefined && totalMB) {
    label += ` — ${downloadedMB} MB de ${totalMB} MB`;
  }
  if (speedMBps) {
    label += ` · ${speedMBps} MB/s`;
  }
  if (eta) {
    label += ` · ETA ${eta}`;
  }
  els.progressLabel.textContent = label;
});

socket.on('done', ({ filename }) => {
  els.progressWrap.classList.remove('active');
  els.progressLabel.classList.remove('active');
  els.successMsg.classList.add('visible');
  els.dlBtn.disabled = false;
  els.dlBtn.innerHTML = '↓ Descargar de nuevo';
  els.dlBtn.style.background = 'var(--green)';

  // Dispara la descarga del archivo ya procesado en el servidor.
  const a = document.createElement('a');
  a.href = `/api/file/${state.currentJobId}`;
  a.download = filename.replace(/^.*?__/, '');
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => {
    els.dlBtn.innerHTML = '↓ Descargar Ahora';
    els.dlBtn.style.background = '';
    els.progressFill.style.width = '0%';
  }, 4000);
});

socket.on('error', ({ message }) => finishWithError(message));

els.urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') fetchVideo();
});

els.fetchBtn.addEventListener('click', fetchVideo);
els.dlBtn.addEventListener('click', startDownload);
document.querySelectorAll('.fmt').forEach((el) => el.addEventListener('click', () => pick(el)));
