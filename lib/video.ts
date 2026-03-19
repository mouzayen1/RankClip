import fixWebmDuration from 'fix-webm-duration';
import { Clip, OverlayConfig, RANK_COLORS, VideoSegment } from './types';

// ─── Recording Format Helpers ─────────────────────────────────────

/** Pick the best MIME type for MediaRecorder: prefer MP4 (H.264+AAC) for
 *  broad compatibility (TikTok, Instagram, etc.), fall back to WebM. */
export function pickRecorderMime(): { mimeType: string; ext: string } {
  // MP4 — supported in Chrome 120+, Safari
  const mp4Types = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4',
  ];
  for (const t of mp4Types) {
    if (MediaRecorder.isTypeSupported(t)) return { mimeType: t, ext: 'mp4' };
  }
  // WebM fallback
  const webmTypes = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  for (const t of webmTypes) {
    if (MediaRecorder.isTypeSupported(t)) return { mimeType: t, ext: 'webm' };
  }
  return { mimeType: 'video/webm', ext: 'webm' };
}

/** Fix WebM duration/seeking metadata. No-op for MP4. */
export async function fixBlobMetadata(
  blob: Blob,
  durationMs: number
): Promise<Blob> {
  if (blob.type.startsWith('video/mp4')) return blob;
  // fix-webm-duration patches the WebM header with correct duration + cues
  return new Promise<Blob>((resolve) => {
    fixWebmDuration(blob, durationMs, (fixed: Blob) => resolve(fixed));
  });
}

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
  // No fade — instant hard cuts between clips

  onProgress({ percent: 0, status: 'Preloading videos...' });

  // 1. PRELOAD ALL VIDEOS (muted for now — we'll connect audio via Web Audio)
  const videos: HTMLVideoElement[] = [];
  for (let i = 0; i < clips.length; i++) {
    onProgress({
      percent: Math.round(((i + 1) / clips.length) * 10),
      status: `Preloading clip ${i + 1}/${clips.length}...`,
    });
    const v = await preloadVideo(clips[i].blobUrl);
    videos.push(v);
  }

  // 2. SET UP AUDIO — Web Audio API to capture clip audio into the recording
  const audioCtx = new AudioContext();
  // Resume AudioContext — browsers suspend it until a user gesture
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }
  const audioDest = audioCtx.createMediaStreamDestination();

  // Pre-create audio source nodes for each video
  // Note: createMediaElementSource can only be called once per element.
  // Once attached, audio flows ONLY through Web Audio — not the element's
  // default output. The element must NOT be muted for audio to flow.
  const gainNodes: GainNode[] = [];
  for (const v of videos) {
    v.muted = false;
    v.volume = 1;
    const source = audioCtx.createMediaElementSource(v);
    const gain = audioCtx.createGain();
    gain.gain.value = 0; // start silent — we'll enable per-clip
    source.connect(gain);
    gain.connect(audioDest);
    gainNodes.push(gain);
  }

  // 3. SET UP CANVAS + COMBINED STREAM (video + audio)
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const videoStream = canvas.captureStream(30);
  const combinedStream = new MediaStream([
    ...videoStream.getVideoTracks(),
    ...audioDest.stream.getAudioTracks(),
  ]);

  const { mimeType } = pickRecorderMime();
  const recorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: 6000000,
    audioBitsPerSecond: 128000,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const totalDurationMs = clips.length * clipDuration;

  return new Promise((resolve, reject) => {
    recorder.onstop = async () => {
      const rawBlob = new Blob(chunks, { type: mimeType });
      const renderedMs = (recorder as unknown as Record<string, number>)._actualDuration || totalDurationMs;

      // Fix WebM duration/seeking metadata (no-op for MP4)
      const blob = await fixBlobMetadata(rawBlob, renderedMs);
      const url = URL.createObjectURL(blob);

      // CLEANUP
      for (const v of videos) {
        v.pause();
        v.removeAttribute('src');
        v.load();
      }
      audioCtx.close().catch(() => {});

      resolve(url);
    };

    recorder.onerror = () => {
      reject(new Error('MediaRecorder error'));
    };

    recorder.start(100);

    // Use async IIFE since Promise constructor isn't async
    (async () => {

    // 4. PRE-SEEK all videos to time 0
    onProgress({ percent: 12, status: 'Preparing clips...' });
    const seekPromises = videos.map(
      (v) =>
        new Promise<void>((res) => {
          v.currentTime = 0;
          const done = () => res();
          v.addEventListener('seeked', done, { once: true });
          setTimeout(done, 3000);
        })
    );
    await Promise.all(seekPromises);

    // Mute all gain nodes initially
    for (const g of gainNodes) g.gain.value = 0;

    // 5. Helper: seek a video to 0, play it, and wait until it has frames ready
    async function prepareVideo(v: HTMLVideoElement): Promise<void> {
      v.currentTime = 0;
      await new Promise<void>((res) => {
        v.addEventListener('seeked', () => res(), { once: true });
        setTimeout(res, 3000);
      });
      // Temporarily mute for autoplay policy compliance during pre-buffer,
      // then unmute — audio routes through Web Audio, not the element output
      v.muted = true;
      try { await v.play(); } catch {}
      if (v.readyState < 2) {
        await new Promise<void>((res) => {
          const check = () => {
            if (v.readyState >= 2) res();
            else setTimeout(check, 50);
          };
          check();
          setTimeout(res, 2000);
        });
      }
      v.pause();
      v.muted = false; // unmute for actual recording
      v.currentTime = 0;
      await new Promise<void>((res) => {
        v.addEventListener('seeked', () => res(), { once: true });
        setTimeout(res, 1000);
      });
    }

    // 6. PRE-BUFFER ALL CLIPS so there's zero delay between them
    for (let i = 0; i < videos.length; i++) {
      onProgress({
        percent: 12 + Math.round(((i + 1) / videos.length) * 8),
        status: `Buffering clip ${i + 1}/${videos.length}...`,
      });
      await prepareVideo(videos[i]);
    }

    // 7. RENDER EACH CLIP (countdown: lowest rank first, #1 last)
    const totalClips = clips.length;
    const renderStartTime = performance.now();

    for (let step = 0; step < totalClips; step++) {
      const clipIndex = totalClips - 1 - step;
      const video = videos[clipIndex];
      const firstVisibleIndex = clipIndex;

      // Enable audio for this clip, mute all others
      for (let g = 0; g < gainNodes.length; g++) {
        gainNodes[g].gain.value = g === clipIndex ? 1 : 0;
      }

      onProgress({
        percent: 20 + Math.round((step / totalClips) * 75),
        status: `Revealing #${clipIndex + 1}: ${clips[clipIndex].label}`,
      });

      // Play — video is already buffered and seeked to 0, so this is instant
      try { await video.play(); } catch {}

      // Render frames for this clip's duration using setTimeout for
      // reliable rendering on mobile (requestAnimationFrame gets throttled
      // when the device is under heavy load or the tab loses focus).
      const FRAME_INTERVAL = 33; // ~30 fps to match captureStream(30)
      const startTime = performance.now();

      while (true) {
        const elapsed = performance.now() - startTime;

        if (elapsed >= clipDuration) {
          video.pause();
          gainNodes[clipIndex].gain.value = 0;
          break;
        }

        // Black background
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        // Cover-fill video
        try {
          const vw = video.videoWidth || width;
          const vh = video.videoHeight || height;
          const coverScale = Math.max(width / vw, height / vh);
          const sw = vw * coverScale;
          const sh = vh * coverScale;
          const sx = (width - sw) / 2;
          const sy = (height - sh) / 2;
          ctx.drawImage(video, sx, sy, sw, sh);
        } catch {}

        // Overlay with countdown reveal
        drawOverlay(ctx, width, height, config, clips, clipIndex, firstVisibleIndex);

        onProgress({
          percent: 20 + Math.round(((step + elapsed / clipDuration) / totalClips) * 75),
          status: `Revealing #${clipIndex + 1}: ${clips[clipIndex].label}`,
        });

        // Yield to the event loop so MediaRecorder can collect frames
        await new Promise<void>((r) => setTimeout(r, FRAME_INTERVAL));
      }
    }

    const actualDurationMs = performance.now() - renderStartTime;
    onProgress({ percent: 100, status: 'Finalizing...' });
    // Stash actual duration so onstop handler can use it
    (recorder as unknown as Record<string, number>)._actualDuration = actualDurationMs;
    recorder.stop();

    })(); // end async IIFE
  });
}

// ─── Scene Detection ─────────────────────────────────────────────

export interface DetectionProgress {
  percent: number;
  status: string;
}

/**
 * Analyzes a video for scene changes using two detection strategies:
 *
 * 1. BLACK FRAME DETECTION — Identifies dark/black frames (often with text overlays)
 *    that act as dividers between clips. Segments are trimmed so black frames are excluded.
 *
 * 2. HARD CUT DETECTION — Uses adaptive thresholding on pixel differences to find
 *    instant scene changes where there's no black frame at all.
 *
 * The algorithm also tracks per-frame brightness so it can trim black regions from
 * the start/end of each resulting segment.
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

  // Sample at ~8 fps for high accuracy
  const sampleInterval = 0.125;
  const totalSamples = Math.floor(duration / sampleInterval);

  // Small canvas for fast pixel comparison
  const canvas = document.createElement('canvas');
  const sampleWidth = 160;
  const sampleHeight = 90;
  canvas.width = sampleWidth;
  canvas.height = sampleHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  let prevPixels: Uint8ClampedArray | null = null;

  // Per-frame data: brightness + diff from previous frame
  const frames: { time: number; brightness: number; diff: number }[] = [];

  onProgress({ percent: 0, status: 'Scanning video frames...' });

  for (let i = 0; i < totalSamples; i++) {
    const time = i * sampleInterval;

    await new Promise<void>((resolve) => {
      video.currentTime = time;
      video.onseeked = () => resolve();
      setTimeout(resolve, 2000);
    });

    ctx.drawImage(video, 0, 0, sampleWidth, sampleHeight);
    const imageData = ctx.getImageData(0, 0, sampleWidth, sampleHeight);
    const pixels = imageData.data;
    const pixelCount = pixels.length / 4;

    // Calculate mean brightness (0-255)
    let brightnessSum = 0;
    for (let p = 0; p < pixels.length; p += 4) {
      // Luminance: 0.299R + 0.587G + 0.114B
      brightnessSum += pixels[p] * 0.299 + pixels[p + 1] * 0.587 + pixels[p + 2] * 0.114;
    }
    const brightness = brightnessSum / pixelCount;

    // Calculate pixel diff from previous frame
    let diff = 0;
    if (prevPixels) {
      let totalDiff = 0;
      for (let p = 0; p < pixels.length; p += 4) {
        totalDiff += Math.abs(pixels[p] - prevPixels[p]);
        totalDiff += Math.abs(pixels[p + 1] - prevPixels[p + 1]);
        totalDiff += Math.abs(pixels[p + 2] - prevPixels[p + 2]);
      }
      diff = totalDiff / (pixelCount * 3);
    }

    frames.push({ time, brightness, diff });
    prevPixels = new Uint8ClampedArray(pixels);

    if (i % 16 === 0) {
      onProgress({
        percent: Math.round((i / totalSamples) * 70),
        status: `Analyzing frame ${i + 1}/${totalSamples}...`,
      });
    }
  }

  // ── STEP 1: Identify black/dark frame regions ──
  // A frame is "black" if its brightness is below a threshold.
  // Black title cards often have text so brightness can be ~15-30, not pure 0.
  const blackThreshold = 25; // brightness below this = "dark frame"

  // Mark each frame as dark or not
  const isDark = frames.map((f) => f.brightness < blackThreshold);

  // Find contiguous dark regions (potential dividers)
  const darkRegions: { start: number; end: number }[] = [];
  let darkStart: number | null = null;
  for (let i = 0; i < frames.length; i++) {
    if (isDark[i] && darkStart === null) {
      darkStart = i;
    } else if (!isDark[i] && darkStart !== null) {
      const regionDuration = frames[i].time - frames[darkStart].time;
      // Only count dark regions >= 0.2s as intentional dividers (not single dark frames from compression)
      if (regionDuration >= 0.2) {
        darkRegions.push({ start: darkStart, end: i - 1 });
      }
      darkStart = null;
    }
  }
  // Close final dark region if video ends dark
  if (darkStart !== null) {
    const regionDuration = frames[frames.length - 1].time - frames[darkStart].time;
    if (regionDuration >= 0.2) {
      darkRegions.push({ start: darkStart, end: frames.length - 1 });
    }
  }

  // ── STEP 2: Adaptive hard-cut detection on non-dark frames ──
  // Collect diffs only for non-dark frames to compute statistics
  const nonDarkDiffs: number[] = [];
  for (let i = 1; i < frames.length; i++) {
    if (!isDark[i] && !isDark[i - 1] && frames[i].diff > 0) {
      nonDarkDiffs.push(frames[i].diff);
    }
  }

  // Compute median and MAD (median absolute deviation) for robust threshold
  nonDarkDiffs.sort((a, b) => a - b);
  const median = nonDarkDiffs.length > 0
    ? nonDarkDiffs[Math.floor(nonDarkDiffs.length / 2)]
    : 5;
  const mad = nonDarkDiffs.length > 0
    ? nonDarkDiffs.map((d) => Math.abs(d - median)).sort((a, b) => a - b)[
        Math.floor(nonDarkDiffs.length / 2)
      ]
    : 3;

  // Threshold = median + multiplier * MAD
  // sensitivity 0 → multiplier ~8 (very few cuts), sensitivity 100 → multiplier ~2 (many cuts)
  const multiplier = 8 - (sensitivity / 100) * 6;
  const hardCutThreshold = Math.max(median + multiplier * Math.max(mad, 1), 8);

  // Find hard cuts (non-dark to non-dark transitions with high diff)
  const hardCutTimes: number[] = [];
  const minGap = 0.8; // minimum seconds between any two cuts
  for (let i = 1; i < frames.length; i++) {
    if (!isDark[i] && !isDark[i - 1] && frames[i].diff > hardCutThreshold) {
      const lastCut = hardCutTimes.length > 0 ? hardCutTimes[hardCutTimes.length - 1] : -Infinity;
      if (frames[i].time - lastCut >= minGap) {
        hardCutTimes.push(frames[i].time);
      }
    }
  }

  onProgress({ percent: 75, status: 'Building segments...' });

  // ── STEP 3: Merge dark-region boundaries + hard cuts into segment list ──
  // Strategy: dark regions define "gaps" in the video. Content is between gaps.
  // Hard cuts split content regions that have no dark gap inside them.

  // Build a list of "content intervals" by removing dark regions
  type Interval = { start: number; end: number };
  const contentIntervals: Interval[] = [];

  let contentStart = 0;
  for (const region of darkRegions) {
    const regionStartTime = frames[region.start].time;
    const regionEndTime = frames[region.end].time + sampleInterval;

    if (regionStartTime > contentStart + 0.3) {
      contentIntervals.push({ start: contentStart, end: regionStartTime });
    }
    contentStart = regionEndTime;
  }
  // Final interval after last dark region
  if (contentStart < duration - 0.3) {
    contentIntervals.push({ start: contentStart, end: duration });
  }

  // If no dark regions were found, the whole video is one content interval
  if (contentIntervals.length === 0) {
    contentIntervals.push({ start: 0, end: duration });
  }

  // Now split content intervals at hard cuts
  const finalIntervals: Interval[] = [];
  for (const interval of contentIntervals) {
    // Find hard cuts within this interval
    const cutsInInterval = hardCutTimes.filter(
      (t) => t > interval.start + 0.3 && t < interval.end - 0.3
    );

    if (cutsInInterval.length === 0) {
      finalIntervals.push(interval);
    } else {
      let segStart = interval.start;
      for (const cutTime of cutsInInterval) {
        if (cutTime - segStart >= 0.5) {
          finalIntervals.push({ start: segStart, end: cutTime });
        }
        segStart = cutTime;
      }
      if (interval.end - segStart >= 0.5) {
        finalIntervals.push({ start: segStart, end: interval.end });
      }
    }
  }

  // ── STEP 4: Trim black frames from edges of each interval ──
  // Even after removing dark regions, segments may start/end with a couple dark frames
  for (const interval of finalIntervals) {
    // Trim start: advance past dark frames
    for (const f of frames) {
      if (f.time < interval.start) continue;
      if (f.time > interval.start + 1.0) break; // don't trim more than 1s
      if (f.brightness < blackThreshold) {
        interval.start = f.time + sampleInterval;
      } else {
        break;
      }
    }
    // Trim end: pull back past dark frames
    for (let i = frames.length - 1; i >= 0; i--) {
      if (frames[i].time > interval.end) continue;
      if (frames[i].time < interval.end - 1.0) break;
      if (frames[i].brightness < blackThreshold) {
        interval.end = frames[i].time;
      } else {
        break;
      }
    }
  }

  onProgress({ percent: 85, status: 'Generating segment thumbnails...' });

  // ── STEP 5: Build final segments with thumbnails ──
  const segments: VideoSegment[] = [];
  const validIntervals = finalIntervals.filter((iv) => iv.end - iv.start >= 0.5);

  for (let i = 0; i < validIntervals.length; i++) {
    const iv = validIntervals[i];

    // Thumbnail at 30% into the segment (avoids transition artifacts at edges)
    const thumbTime = iv.start + (iv.end - iv.start) * 0.3;
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
      startTime: Math.round(iv.start * 100) / 100,
      endTime: Math.round(iv.end * 100) / 100,
      thumbnailUrl,
      label: '',
      selected: true,
    });

    onProgress({
      percent: 85 + Math.round(((i + 1) / validIntervals.length) * 15),
      status: `Thumbnail ${i + 1}/${validIntervals.length}...`,
    });
  }

  video.pause();
  video.removeAttribute('src');
  video.load();
  URL.revokeObjectURL(url);

  onProgress({ percent: 100, status: `Found ${segments.length} clips` });
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
  video.muted = false; // must be unmuted so audio flows through Web Audio
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

  // Set up Web Audio to capture audio from the video element
  const audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') await audioCtx.resume();
  const audioSource = audioCtx.createMediaElementSource(video);
  const audioDest = audioCtx.createMediaStreamDestination();
  audioSource.connect(audioDest);

  // Combine canvas video track + audio track into one stream
  const videoStream = canvas.captureStream(30);
  const combinedStream = new MediaStream([
    ...videoStream.getVideoTracks(),
    ...audioDest.stream.getAudioTracks(),
  ]);

  const { mimeType } = pickRecorderMime();
  const recorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: 6000000,
    audioBitsPerSecond: 128000,
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

    recorder.onstop = async () => {
      const rawBlob = new Blob(chunks, { type: mimeType });
      const blob = await fixBlobMetadata(rawBlob, segDuration);
      const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
      const segFile = new File([blob], `segment-${startTime.toFixed(1)}s.${ext}`, { type: mimeType });
      video.pause();
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      audioCtx.close().catch(() => {});
      resolve(segFile);
    };

    recorder.onerror = () => reject(new Error('MediaRecorder error'));

    recorder.start(100);

    try {
      video.play().catch(() => {});
    } catch {}

    const renderStart = performance.now();

    (async () => {
      const FRAME_MS = 33; // ~30fps
      while (true) {
        const elapsed = performance.now() - renderStart;
        if (elapsed >= segDuration || video.currentTime >= endTime) {
          recorder.stop();
          return;
        }

        ctx.drawImage(video, 0, 0, vw, vh);
        onProgress?.(Math.round((elapsed / segDuration) * 100));
        await new Promise<void>((r) => setTimeout(r, FRAME_MS));
      }
    })();
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
