import { Clip, OverlayConfig, RANK_COLORS } from './types';

// ─── Test Clip Generation ─────────────────────────────────────────

export async function generateTestClip(
  name: string,
  index: number,
  durationMs: number = 3000
): Promise<File> {
  const width = 720;
  const height = 1280;
  const fps = 30;
  const totalFrames = Math.round((durationMs / 1000) * fps);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const stream = canvas.captureStream(fps);
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 4000000,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  return new Promise((resolve) => {
    recorder.onstart = () => {
      const colors = ['#FF4444', '#FF6B1A', '#FFD700', '#22CC66', '#1E90FF', '#9B59B6', '#E91E8A', '#00CED1'];
      const bgColor = colors[index % colors.length];

      // Create orbs
      const orbs = Array.from({ length: 12 }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: 20 + Math.random() * 60,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 0.3 + Math.random() * 0.5,
      }));

      let frame = 0;

      function renderFrame() {
        if (frame >= totalFrames) {
          recorder.stop();
          return;
        }

        // Background
        ctx.fillStyle = '#0A0A0F';
        ctx.fillRect(0, 0, width, height);

        // Orbs
        for (const orb of orbs) {
          orb.x += orb.vx;
          orb.y += orb.vy;
          if (orb.x < -orb.r) orb.x = width + orb.r;
          if (orb.x > width + orb.r) orb.x = -orb.r;
          if (orb.y < -orb.r) orb.y = height + orb.r;
          if (orb.y > height + orb.r) orb.y = -orb.r;

          const gradient = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, orb.r);
          gradient.addColorStop(0, orb.color + Math.round(orb.alpha * 255).toString(16).padStart(2, '0'));
          gradient.addColorStop(1, orb.color + '00');
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(orb.x, orb.y, orb.r, 0, Math.PI * 2);
          ctx.fill();
        }

        // Center label
        ctx.save();
        ctx.fillStyle = bgColor;
        ctx.globalAlpha = 0.15;
        const pillW = width * 0.7;
        const pillH = 80;
        const px = (width - pillW) / 2;
        const py = (height - pillH) / 2;
        roundRect(ctx, px, py, pillW, pillH, 20);
        ctx.fill();
        ctx.restore();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = `bold 36px 'DM Sans', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(name, width / 2, height / 2);

        // Frame counter
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = '16px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`Frame ${frame}/${totalFrames}`, width - 20, height - 20);

        frame++;
        requestAnimationFrame(renderFrame);
      }

      requestAnimationFrame(renderFrame);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      const file = new File([blob], `test-clip-${index + 1}.webm`, { type: mimeType });
      resolve(file);
    };

    recorder.start(100);
  });
}

// ─── Thumbnail Generation ─────────────────────────────────────────

export function generateThumbnail(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    const url = URL.createObjectURL(file);
    video.src = url;

    const timeout = setTimeout(() => {
      URL.revokeObjectURL(url);
      reject(new Error('Thumbnail generation timed out'));
    }, 8000);

    video.onloadeddata = () => {
      video.currentTime = 0.5;
    };

    video.onseeked = () => {
      clearTimeout(timeout);
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 284;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const thumb = canvas.toDataURL('image/jpeg', 0.7);
      URL.revokeObjectURL(url);
      video.pause();
      video.removeAttribute('src');
      video.load();
      resolve(thumb);
    };

    video.onerror = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load video'));
    };
  });
}

// ─── Video Preloading ─────────────────────────────────────────────

export function preloadVideo(blobUrl: string): Promise<HTMLVideoElement> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = blobUrl;

    let resolved = false;
    const done = () => {
      if (!resolved) {
        resolved = true;
        resolve(video);
      }
    };

    video.addEventListener('canplaythrough', done, { once: true });
    video.addEventListener('loadeddata', done, { once: true });

    // Safety timeout — blob URLs can be unreliable
    setTimeout(done, 8000);
  });
}

// ─── Overlay Drawing ──────────────────────────────────────────────

export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  config: OverlayConfig,
  clips: Clip[],
  activeIndex: number
) {
  const scale = height / 1920; // Scale relative to 1080x1920 reference
  const font = config.font || "'Bebas Neue', sans-serif";

  // ── Top gradient ──
  const topGrad = ctx.createLinearGradient(0, 0, 0, height * 0.3);
  topGrad.addColorStop(0, 'rgba(0,0,0,0.8)');
  topGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, width, height * 0.3);

  // ── Bottom gradient ──
  const botGrad = ctx.createLinearGradient(0, height * 0.8, 0, height);
  botGrad.addColorStop(0, 'rgba(0,0,0,0)');
  botGrad.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = botGrad;
  ctx.fillRect(0, height * 0.8, width, height * 0.2);

  // ── Title ──
  const titleSize = Math.round(48 * scale);
  ctx.font = `bold ${titleSize}px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const titleY = Math.round(60 * scale);
  // Measure parts for coloring
  const prefixText = config.prefix + ' ';
  const highlightText = config.highlight;
  const suffixText = ' ' + config.suffix;

  const prefixWidth = ctx.measureText(prefixText).width;
  const highlightWidth = ctx.measureText(highlightText).width;
  const suffixWidth = ctx.measureText(suffixText).width;
  const totalWidth = prefixWidth + highlightWidth + suffixWidth;
  let x = (width - totalWidth) / 2;

  // Draw with stroke for readability
  ctx.lineWidth = Math.max(3, Math.round(4 * scale));
  ctx.strokeStyle = 'rgba(0,0,0,0.9)';
  ctx.lineJoin = 'round';

  ctx.textAlign = 'left';
  // Prefix
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeText(prefixText, x, titleY);
  ctx.fillText(prefixText, x, titleY);
  x += prefixWidth;

  // Highlight
  ctx.fillStyle = config.highlightColor;
  ctx.strokeText(highlightText, x, titleY);
  ctx.fillText(highlightText, x, titleY);
  x += highlightWidth;

  // Suffix
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeText(suffixText, x, titleY);
  ctx.fillText(suffixText, x, titleY);

  // ── Rank list ──
  const listStartY = Math.round(140 * scale);
  const itemHeight = Math.round(64 * scale);
  const listX = Math.round(40 * scale);
  const fontSize = Math.round(34 * scale);
  const numSize = Math.round(38 * scale);
  const pillPadX = Math.round(16 * scale);
  const pillPadY = Math.round(8 * scale);
  const pillRadius = Math.round(12 * scale);

  ctx.lineWidth = Math.max(2, Math.round(3 * scale));

  for (let i = 0; i < clips.length; i++) {
    const y = listStartY + i * itemHeight;
    const isActive = i === activeIndex;
    const alpha = isActive ? 1 : 0.7;

    // Active highlight pill
    if (isActive) {
      ctx.save();
      const pillText = `${i + 1}. ${clips[i].label}`;
      ctx.font = `bold ${fontSize}px ${font}`;
      const textW = ctx.measureText(pillText).width;
      const pillW = textW + pillPadX * 2;
      const pillH = fontSize + pillPadY * 2;
      const pillX = listX - pillPadX;
      const pillY = y - pillPadY;

      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      roundRect(ctx, pillX, pillY, pillW, pillH, pillRadius);
      ctx.fill();
      ctx.restore();
    }

    ctx.globalAlpha = alpha;

    // Number
    ctx.font = `bold ${numSize}px ${font}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const numText = `${i + 1}.`;
    const rankColor = RANK_COLORS[i % RANK_COLORS.length];
    ctx.fillStyle = rankColor;
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.strokeText(numText, listX, y);
    ctx.fillText(numText, listX, y);

    const numWidth = ctx.measureText(numText).width + Math.round(8 * scale);

    // Label
    ctx.font = `bold ${fontSize}px ${font}`;
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeText(clips[i].label, listX + numWidth, y + Math.round(2 * scale));
    ctx.fillText(clips[i].label, listX + numWidth, y + Math.round(2 * scale));

    ctx.globalAlpha = 1;
  }
}

// ─── Export Video ─────────────────────────────────────────────────

export interface ExportProgress {
  percent: number;
  status: string;
}

export async function exportVideo(
  clips: Clip[],
  config: OverlayConfig,
  onProgress: (p: ExportProgress) => void
): Promise<string> {
  const { width, height } = config.resolution;
  const clipDuration = config.clipDuration * 1000; // ms

  onProgress({ percent: 0, status: 'Preloading videos...' });

  // 1. PRELOAD ALL VIDEOS
  const videos: HTMLVideoElement[] = [];
  for (let i = 0; i < clips.length; i++) {
    onProgress({
      percent: Math.round(((i + 1) / clips.length) * 15),
      status: `Preloading clip ${i + 1}/${clips.length}...`,
    });
    const v = await preloadVideo(clips[i].blobUrl);
    videos.push(v);
  }

  // 2. SET UP CANVAS + RECORDER
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const stream = canvas.captureStream(30);
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 6000000,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  return new Promise((resolve, reject) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);

      // 5. CLEANUP
      for (const v of videos) {
        v.pause();
        v.removeAttribute('src');
        v.load();
      }

      resolve(url);
    };

    recorder.onerror = () => {
      reject(new Error('MediaRecorder error'));
    };

    recorder.start(100);

    // 3. RENDER EACH CLIP
    let clipIndex = 0;

    function renderClip() {
      if (clipIndex >= clips.length) {
        onProgress({ percent: 100, status: 'Finalizing...' });
        recorder.stop();
        return;
      }

      const video = videos[clipIndex];
      video.currentTime = 0;
      video.muted = true;

      onProgress({
        percent: 15 + Math.round((clipIndex / clips.length) * 80),
        status: `Rendering clip ${clipIndex + 1}/${clips.length}: ${clips[clipIndex].label}`,
      });

      try {
        video.play().catch(() => {});
      } catch {}

      const startTime = performance.now();

      function drawFrame() {
        const elapsed = performance.now() - startTime;

        if (elapsed >= clipDuration) {
          video.pause();
          clipIndex++;
          renderClip();
          return;
        }

        // Black background
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        // Cover-fill video
        try {
          const vw = video.videoWidth || width;
          const vh = video.videoHeight || height;
          const scale = Math.max(width / vw, height / vh);
          const sw = vw * scale;
          const sh = vh * scale;
          const sx = (width - sw) / 2;
          const sy = (height - sh) / 2;
          ctx.drawImage(video, sx, sy, sw, sh);
        } catch {}

        // Overlay
        drawOverlay(ctx, width, height, config, clips, clipIndex);

        onProgress({
          percent: 15 + Math.round(((clipIndex + elapsed / clipDuration) / clips.length) * 80),
          status: `Rendering clip ${clipIndex + 1}/${clips.length}: ${clips[clipIndex].label}`,
        });

        requestAnimationFrame(drawFrame);
      }

      requestAnimationFrame(drawFrame);
    }

    renderClip();
  });
}

// ─── Helpers ──────────────────────────────────────────────────────

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
