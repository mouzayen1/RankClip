import { Clip, OverlayConfig, RANK_COLORS, VideoSegment } from './types';

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
  activeIndex: number,
  firstVisibleIndex: number = 0
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
    if (i < firstVisibleIndex) continue;
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

    // 3. RENDER EACH CLIP (countdown: lowest rank first, #1 last)
    // playbackOrder maps step 0,1,2... to clip indices N-1, N-2, ...0
    const totalClips = clips.length;
    let step = 0;

    function renderClip() {
      if (step >= totalClips) {
        onProgress({ percent: 100, status: 'Finalizing...' });
        recorder.stop();
        return;
      }

      // Play from lowest rank to highest: clip N-1 first, clip 0 last
      const clipIndex = totalClips - 1 - step;
      const video = videos[clipIndex];
      video.currentTime = 0;
      video.muted = true;

      // firstVisibleIndex decreases as we reveal more items
      const firstVisibleIndex = clipIndex;

      onProgress({
        percent: 15 + Math.round((step / totalClips) * 80),
        status: `Revealing #${clipIndex + 1}: ${clips[clipIndex].label}`,
      });

      try {
        video.play().catch(() => {});
      } catch {}

      const startTime = performance.now();

      function drawFrame() {
        const elapsed = performance.now() - startTime;

        if (elapsed >= clipDuration) {
          video.pause();
          step++;
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

        // Overlay with countdown reveal
        drawOverlay(ctx, width, height, config, clips, clipIndex, firstVisibleIndex);

        onProgress({
          percent: 15 + Math.round(((step + elapsed / clipDuration) / totalClips) * 80),
          status: `Revealing #${clipIndex + 1}: ${clips[clipIndex].label}`,
        });

        requestAnimationFrame(drawFrame);
      }

      requestAnimationFrame(drawFrame);
    }

    renderClip();
  });
}

// ─── Scene Detection ─────────────────────────────────────────────

export interface DetectionProgress {
  percent: number;
  status: string;
}

/**
 * Analyzes a video for scene changes by comparing pixel differences
 * between sampled frames. Returns timestamps where scene cuts occur.
 */
export async function detectScenes(
  file: File,
  onProgress: (p: DetectionProgress) => void,
  sensitivity: number = 35 // 0-100, higher = more sensitive (more cuts detected)
): Promise<VideoSegment[]> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  video.src = url;

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Video load timed out')), 15000);
    video.onloadeddata = () => {
      clearTimeout(timeout);
      resolve();
    };
    video.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Failed to load video'));
    };
  });

  const duration = video.duration;
  if (!duration || duration < 0.5) {
    URL.revokeObjectURL(url);
    throw new Error('Video is too short to analyze');
  }

  // Sample frames at intervals — ~4 frames/sec for good detection
  const sampleInterval = 0.25;
  const totalSamples = Math.floor(duration / sampleInterval);

  // Small canvas for fast pixel comparison
  const canvas = document.createElement('canvas');
  const sampleWidth = 160;
  const sampleHeight = 90;
  canvas.width = sampleWidth;
  canvas.height = sampleHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  let prevPixels: Uint8ClampedArray | null = null;
  const diffs: { time: number; diff: number }[] = [];

  onProgress({ percent: 0, status: 'Analyzing video for scene changes...' });

  for (let i = 0; i < totalSamples; i++) {
    const time = i * sampleInterval;

    // Seek to time
    await new Promise<void>((resolve) => {
      video.currentTime = time;
      video.onseeked = () => resolve();
      // Safety fallback
      setTimeout(resolve, 2000);
    });

    ctx.drawImage(video, 0, 0, sampleWidth, sampleHeight);
    const imageData = ctx.getImageData(0, 0, sampleWidth, sampleHeight);
    const pixels = imageData.data;

    if (prevPixels) {
      // Calculate mean absolute pixel difference
      let totalDiff = 0;
      const pixelCount = pixels.length / 4;
      for (let p = 0; p < pixels.length; p += 4) {
        totalDiff += Math.abs(pixels[p] - prevPixels[p]);     // R
        totalDiff += Math.abs(pixels[p + 1] - prevPixels[p + 1]); // G
        totalDiff += Math.abs(pixels[p + 2] - prevPixels[p + 2]); // B
      }
      const meanDiff = totalDiff / (pixelCount * 3); // 0-255
      diffs.push({ time, diff: meanDiff });
    }

    prevPixels = new Uint8ClampedArray(pixels);

    if (i % 10 === 0) {
      onProgress({
        percent: Math.round((i / totalSamples) * 80),
        status: `Analyzing frame ${i + 1}/${totalSamples}...`,
      });
    }
  }

  // Find scene cuts: threshold based on sensitivity
  // sensitivity 0 = threshold ~60 (only massive cuts)
  // sensitivity 100 = threshold ~8 (very sensitive)
  const threshold = 60 - (sensitivity / 100) * 52;
  const minSegmentDuration = 1.0; // Minimum 1 second between cuts

  const cutTimes: number[] = [0]; // Always start at 0

  for (let i = 0; i < diffs.length; i++) {
    if (diffs[i].diff > threshold) {
      const lastCut = cutTimes[cutTimes.length - 1];
      if (diffs[i].time - lastCut >= minSegmentDuration) {
        cutTimes.push(diffs[i].time);
      }
    }
  }

  onProgress({ percent: 85, status: 'Generating segment thumbnails...' });

  // Build segments
  const segments: VideoSegment[] = [];
  for (let i = 0; i < cutTimes.length; i++) {
    const startTime = cutTimes[i];
    const endTime = i < cutTimes.length - 1 ? cutTimes[i + 1] : duration;

    // Skip very short trailing segments
    if (endTime - startTime < 0.5) continue;

    // Get thumbnail at segment midpoint
    const thumbTime = startTime + (endTime - startTime) * 0.3;
    let thumbnailUrl: string | null = null;
    try {
      await new Promise<void>((resolve) => {
        video.currentTime = thumbTime;
        video.onseeked = () => resolve();
        setTimeout(resolve, 2000);
      });
      ctx.drawImage(video, 0, 0, sampleWidth, sampleHeight);
      thumbnailUrl = canvas.toDataURL('image/jpeg', 0.7);
    } catch {}

    segments.push({
      id: Math.random().toString(36).slice(2, 10),
      startTime,
      endTime,
      thumbnailUrl,
      label: `Segment ${segments.length + 1}`,
      selected: true,
    });

    onProgress({
      percent: 85 + Math.round(((i + 1) / cutTimes.length) * 15),
      status: `Thumbnail ${i + 1}/${cutTimes.length}...`,
    });
  }

  video.pause();
  video.removeAttribute('src');
  video.load();
  URL.revokeObjectURL(url);

  onProgress({ percent: 100, status: `Found ${segments.length} segments` });
  return segments;
}

/**
 * Extracts a segment from a video file by re-recording the time range
 * using Canvas + MediaRecorder.
 */
export async function extractSegment(
  file: File,
  startTime: number,
  endTime: number,
  onProgress?: (percent: number) => void
): Promise<File> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Load timed out')), 15000);
    video.onloadeddata = () => {
      clearTimeout(timeout);
      resolve();
    };
    video.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Failed to load video'));
    };
  });

  const vw = video.videoWidth || 720;
  const vh = video.videoHeight || 1280;

  const canvas = document.createElement('canvas');
  canvas.width = vw;
  canvas.height = vh;
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

  // Seek to start
  await new Promise<void>((resolve) => {
    video.currentTime = startTime;
    video.onseeked = () => resolve();
    setTimeout(resolve, 3000);
  });

  return new Promise((resolve, reject) => {
    const segDuration = (endTime - startTime) * 1000;

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      const segFile = new File([blob], `segment-${startTime.toFixed(1)}s.webm`, { type: mimeType });
      video.pause();
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      resolve(segFile);
    };

    recorder.onerror = () => reject(new Error('MediaRecorder error'));

    recorder.start(100);

    try {
      video.play().catch(() => {});
    } catch {}

    const renderStart = performance.now();

    function drawFrame() {
      const elapsed = performance.now() - renderStart;
      if (elapsed >= segDuration || video.currentTime >= endTime) {
        recorder.stop();
        return;
      }

      ctx.drawImage(video, 0, 0, vw, vh);
      onProgress?.(Math.round((elapsed / segDuration) * 100));
      requestAnimationFrame(drawFrame);
    }

    requestAnimationFrame(drawFrame);
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
