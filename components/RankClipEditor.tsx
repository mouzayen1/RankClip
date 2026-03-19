'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import {
  Upload,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Play,
  Pause,
  Trash2,
  Download,
  RotateCcw,
  Edit3,
  RefreshCw,
  AlertTriangle,
  Check,
  Loader2,
  Sparkles,
  X,
} from 'lucide-react';
import {
  Clip,
  OverlayConfig,
  STEPS,
  Step,
  RESOLUTIONS,
  DEFAULT_RESOLUTION,
  HIGHLIGHT_COLORS,
  RANK_COLORS,
  FONTS,
} from '@/lib/types';
import {
  generateTestClip,
  generateThumbnail,
  drawOverlay,
  exportVideo,
  ExportProgress,
} from '@/lib/video';

// ─── Helpers ──────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Main Component ───────────────────────────────────────────────

export default function RankClipEditor() {
  const [step, setStep] = useState<Step>('Setup');
  const [config, setConfig] = useState<OverlayConfig>({
    prefix: 'Top 5',
    highlight: 'funniest',
    suffix: 'moments',
    highlightColor: HIGHLIGHT_COLORS[0],
    font: FONTS[0].value,
    clipDuration: 4,
    resolution: DEFAULT_RESOLUTION,
  });
  const [clips, setClips] = useState<Clip[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress>({ percent: 0, status: '' });
  const [exportedUrl, setExportedUrl] = useState<string | null>(null);
  const [generatingTests, setGeneratingTests] = useState(false);
  const [testGenProgress, setTestGenProgress] = useState(0);

  const stepIndex = STEPS.indexOf(step);

  const canProceed = useCallback(() => {
    if (step === 'Setup') return config.prefix || config.highlight || config.suffix;
    if (step === 'Upload') return clips.length >= 2;
    if (step === 'Rank') return clips.length >= 2;
    return true;
  }, [step, config, clips]);

  const goNext = () => {
    const i = STEPS.indexOf(step);
    if (i < STEPS.length - 1) setStep(STEPS[i + 1]);
  };
  const goBack = () => {
    const i = STEPS.indexOf(step);
    if (i > 0) setStep(STEPS[i - 1]);
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
          <span className="gradient-text">RankClip</span>
        </h1>
        <p className="text-sm text-white/40 hidden sm:block">Ranked video compilation maker</p>
      </header>

      {/* Step Nav */}
      <nav className="flex justify-center gap-2 py-4 px-4">
        {STEPS.map((s, i) => (
          <button
            key={s}
            onClick={() => {
              if (i <= stepIndex || canProceed()) setStep(s);
            }}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              s === step
                ? 'bg-gradient-to-r from-[#FF4444] via-[#FF6B1A] to-[#FFD700] text-black'
                : i < stepIndex
                ? 'bg-white/[0.08] text-white/80 hover:bg-white/[0.12]'
                : 'bg-white/[0.03] text-white/30'
            }`}
          >
            <span className="mr-1.5">{i + 1}.</span>
            {s}
          </button>
        ))}
      </nav>

      {/* Step Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 pb-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
          >
            {step === 'Setup' && (
              <StepSetup
                config={config}
                setConfig={setConfig}
                clips={clips}
                setClips={setClips}
                generatingTests={generatingTests}
                setGeneratingTests={setGeneratingTests}
                testGenProgress={testGenProgress}
                setTestGenProgress={setTestGenProgress}
              />
            )}
            {step === 'Upload' && <StepUpload clips={clips} setClips={setClips} />}
            {step === 'Rank' && <StepRank clips={clips} setClips={setClips} config={config} />}
            {step === 'Export' && (
              <StepExport
                clips={clips}
                config={config}
                exporting={exporting}
                setExporting={setExporting}
                exportProgress={exportProgress}
                setExportProgress={setExportProgress}
                exportedUrl={exportedUrl}
                setExportedUrl={setExportedUrl}
                goToStep={setStep}
              />
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex justify-between mt-8">
          <button
            onClick={goBack}
            className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
              stepIndex === 0
                ? 'opacity-0 pointer-events-none'
                : 'bg-white/[0.06] hover:bg-white/[0.1] text-white/70'
            }`}
          >
            Back
          </button>
          {step !== 'Export' && (
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={goNext}
              disabled={!canProceed()}
              className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-[#FF4444] via-[#FF6B1A] to-[#FFD700] text-black disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
            >
              Continue
            </motion.button>
          )}
        </div>
      </main>
    </div>
  );
}

// ─── Step 1: Setup ────────────────────────────────────────────────

function StepSetup({
  config,
  setConfig,
  clips,
  setClips,
  generatingTests,
  setGeneratingTests,
  testGenProgress,
  setTestGenProgress,
}: {
  config: OverlayConfig;
  setConfig: (c: OverlayConfig) => void;
  clips: Clip[];
  setClips: (c: Clip[]) => void;
  generatingTests: boolean;
  setGeneratingTests: (b: boolean) => void;
  testGenProgress: number;
  setTestGenProgress: (n: number) => void;
}) {
  const previewRef = useRef<HTMLCanvasElement>(null);

  // Live preview
  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = 270;
    const h = 480;
    canvas.width = w;
    canvas.height = h;

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, w, h);

    // Fake video background
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#2d1b4e');
    grad.addColorStop(1, '#1a1a2e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const sampleClips: Clip[] = [
      { id: '1', label: 'Pitbull Chase', file: new File([], ''), thumbnailUrl: null, blobUrl: '' },
      { id: '2', label: 'Epic Fail', file: new File([], ''), thumbnailUrl: null, blobUrl: '' },
      { id: '3', label: 'Caught Lacking', file: new File([], ''), thumbnailUrl: null, blobUrl: '' },
      { id: '4', label: 'Dance Battle', file: new File([], ''), thumbnailUrl: null, blobUrl: '' },
      { id: '5', label: 'Rage Quit', file: new File([], ''), thumbnailUrl: null, blobUrl: '' },
    ];

    drawOverlay(ctx, w, h, config, clips.length > 0 ? clips : sampleClips, 0);
  }, [config, clips]);

  const handleGenerateTests = async () => {
    setGeneratingTests(true);
    setTestGenProgress(0);
    const names = ['Pitbull Chase', 'Epic Fail', 'Caught Lacking', 'Dance Battle', 'Rage Quit'];
    const newClips: Clip[] = [];

    for (let i = 0; i < 5; i++) {
      const file = await generateTestClip(names[i], i, 3000);
      const blobUrl = URL.createObjectURL(file);
      let thumbnailUrl: string | null = null;
      try {
        thumbnailUrl = await generateThumbnail(file);
      } catch {}
      newClips.push({ id: uid(), file, label: names[i], thumbnailUrl, blobUrl });
      setTestGenProgress(((i + 1) / 5) * 100);
    }

    setClips(newClips);
    setGeneratingTests(false);
  };

  return (
    <div className="grid md:grid-cols-[1fr_300px] gap-6">
      <div className="space-y-6">
        {/* Title Fields */}
        <div className="glass-card p-6 space-y-4">
          <h2 className="text-lg font-semibold">Video Title</h2>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-white/40 mb-1 block">Prefix</label>
              <input
                type="text"
                value={config.prefix}
                onChange={(e) => setConfig({ ...config, prefix: e.target.value })}
                placeholder="Top 5"
                className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#FF6B1A]/50"
              />
            </div>
            <div>
              <label className="text-xs text-white/40 mb-1 block">
                Highlight <span style={{ color: config.highlightColor }}>word</span>
              </label>
              <input
                type="text"
                value={config.highlight}
                onChange={(e) => setConfig({ ...config, highlight: e.target.value })}
                placeholder="funniest"
                className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#FF6B1A]/50"
                style={{ color: config.highlightColor }}
              />
            </div>
            <div>
              <label className="text-xs text-white/40 mb-1 block">Suffix</label>
              <input
                type="text"
                value={config.suffix}
                onChange={(e) => setConfig({ ...config, suffix: e.target.value })}
                placeholder="moments"
                className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#FF6B1A]/50"
              />
            </div>
          </div>

          {/* Color Swatches */}
          <div>
            <label className="text-xs text-white/40 mb-2 block">Highlight Color</label>
            <div className="flex gap-2">
              {HIGHLIGHT_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setConfig({ ...config, highlightColor: c })}
                  className="w-8 h-8 rounded-full transition-all hover:scale-110"
                  style={{
                    backgroundColor: c,
                    boxShadow: config.highlightColor === c ? `0 0 0 2px #0A0A0F, 0 0 0 4px ${c}` : 'none',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Font */}
          <div>
            <label className="text-xs text-white/40 mb-1 block">Font</label>
            <div className="grid grid-cols-2 gap-2">
              {FONTS.map((f) => (
                <button
                  key={f.name}
                  onClick={() => setConfig({ ...config, font: f.value })}
                  className={`px-3 py-2 rounded-lg text-sm transition-all ${
                    config.font === f.value
                      ? 'bg-white/[0.12] border border-[#FF6B1A]/50'
                      : 'bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08]'
                  }`}
                  style={{ fontFamily: f.value }}
                >
                  {f.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Duration + Resolution */}
        <div className="glass-card p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-white/40 mb-1 block">Clip Duration (seconds)</label>
              <input
                type="number"
                min={1}
                max={30}
                value={config.clipDuration}
                onChange={(e) => setConfig({ ...config, clipDuration: Math.max(1, Math.min(30, Number(e.target.value))) })}
                className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#FF6B1A]/50"
              />
            </div>
            <div>
              <label className="text-xs text-white/40 mb-1 block">Resolution</label>
              <select
                value={JSON.stringify(config.resolution)}
                onChange={(e) => setConfig({ ...config, resolution: JSON.parse(e.target.value) })}
                className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#FF6B1A]/50 bg-[#0A0A0F]"
              >
                {RESOLUTIONS.map((r) => (
                  <option key={r.label} value={JSON.stringify(r)}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Test Clips */}
          <div className="pt-2">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleGenerateTests}
              disabled={generatingTests}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] transition-all disabled:opacity-50"
            >
              {generatingTests ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 text-[#FFD700]" />
              )}
              {generatingTests ? 'Generating...' : 'Load 5 Test Clips'}
            </motion.button>
            {generatingTests && (
              <div className="mt-3">
                <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-[#FF4444] via-[#FF6B1A] to-[#FFD700]"
                    initial={{ width: 0 }}
                    animate={{ width: `${testGenProgress}%` }}
                  />
                </div>
                <p className="text-xs text-white/40 mt-1">{Math.round(testGenProgress)}%</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Live Preview */}
      <div className="glass-card p-4 flex flex-col items-center">
        <h3 className="text-xs text-white/40 mb-3 font-medium">Live Preview</h3>
        <canvas
          ref={previewRef}
          className="rounded-xl border border-white/[0.06]"
          style={{ width: 270, height: 480 }}
        />
      </div>
    </div>
  );
}

// ─── Step 2: Upload ───────────────────────────────────────────────

function StepUpload({
  clips,
  setClips,
}: {
  clips: Clip[];
  setClips: (c: Clip[]) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files).filter((f) =>
        ['video/mp4', 'video/webm', 'video/quicktime'].includes(f.type)
      );
      const newClips: Clip[] = [];
      for (const file of arr) {
        const blobUrl = URL.createObjectURL(file);
        let thumbnailUrl: string | null = null;
        try {
          thumbnailUrl = await generateThumbnail(file);
        } catch {}
        const label = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
        newClips.push({ id: uid(), file, label, thumbnailUrl, blobUrl });
      }
      setClips([...clips, ...newClips]);
    },
    [clips, setClips]
  );

  const removeClip = (id: string) => {
    const clip = clips.find((c) => c.id === id);
    if (clip) URL.revokeObjectURL(clip.blobUrl);
    setClips(clips.filter((c) => c.id !== id));
  };

  const updateLabel = (id: string, label: string) => {
    setClips(clips.map((c) => (c.id === id ? { ...c, label } : c)));
  };

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        className={`drop-zone rounded-2xl p-12 text-center cursor-pointer transition-all ${
          dragging ? 'dragging' : ''
        }`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
      >
        <Upload className="w-10 h-10 text-white/20 mx-auto mb-3" />
        <p className="text-white/50 text-sm">
          Drag & drop video clips here, or <span className="text-[#FF6B1A] underline">browse</span>
        </p>
        <p className="text-white/25 text-xs mt-1">MP4, MOV, WebM</p>
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
      </div>

      {/* Clip list */}
      {clips.length > 0 && (
        <div className="space-y-2">
          {clips.map((clip) => (
            <motion.div
              key={clip.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="glass-card p-3 flex items-center gap-3"
            >
              {/* Thumbnail */}
              <div className="w-16 h-[28px] rounded-lg overflow-hidden bg-white/[0.05] flex-shrink-0">
                {clip.thumbnailUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={clip.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">
                    No thumb
                  </div>
                )}
              </div>

              {/* Label */}
              <input
                type="text"
                value={clip.label}
                onChange={(e) => updateLabel(clip.id, e.target.value)}
                className="flex-1 bg-transparent text-sm focus:outline-none border-b border-transparent focus:border-white/20 px-1 py-0.5"
              />

              {/* Remove */}
              <button
                onClick={() => removeClip(clip.id)}
                className="p-1.5 rounded-lg hover:bg-white/[0.08] text-white/30 hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </div>
      )}

      <p className="text-xs text-white/30 text-center">
        {clips.length} clip{clips.length !== 1 ? 's' : ''} added
        {clips.length < 2 && ' — need at least 2'}
      </p>
    </div>
  );
}

// ─── Step 3: Rank ─────────────────────────────────────────────────

function StepRank({
  clips,
  setClips,
}: {
  clips: Clip[];
  setClips: (c: Clip[]) => void;
  config: OverlayConfig;
}) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const moveClip = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= clips.length) return;
    const arr = [...clips];
    [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
    setClips(arr);
  };

  const togglePlay = (clip: Clip) => {
    if (playingId === clip.id) {
      setPlayingId(null);
    } else {
      setPlayingId(clip.id);
    }
  };

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold mb-1">Drag to rank your clips</h2>
      <p className="text-xs text-white/40 mb-4">#1 plays first in the final video</p>

      <Reorder.Group
        axis="y"
        values={clips}
        onReorder={setClips}
        className="space-y-2"
      >
        {clips.map((clip, i) => (
          <Reorder.Item
            key={clip.id}
            value={clip}
            className="glass-card p-3 flex items-center gap-3 cursor-grab active:cursor-grabbing"
          >
            {/* Grip */}
            <GripVertical className="w-4 h-4 text-white/20 flex-shrink-0" />

            {/* Rank number */}
            <span
              className="text-lg font-bold w-8 text-center flex-shrink-0"
              style={{ color: RANK_COLORS[i % RANK_COLORS.length], fontFamily: "'Bebas Neue', sans-serif" }}
            >
              {i + 1}
            </span>

            {/* Thumbnail */}
            <div className="w-12 h-[21px] rounded overflow-hidden bg-white/[0.05] flex-shrink-0">
              {clip.thumbnailUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={clip.thumbnailUrl} alt="" className="w-full h-full object-cover" />
              )}
            </div>

            {/* Label */}
            <span className="flex-1 text-sm truncate">{clip.label}</span>

            {/* Controls */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => togglePlay(clip)}
                className="p-1.5 rounded-lg hover:bg-white/[0.08] text-white/40 hover:text-white transition-colors"
              >
                {playingId === clip.id ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <button
                onClick={() => moveClip(i, -1)}
                disabled={i === 0}
                className="p-1.5 rounded-lg hover:bg-white/[0.08] text-white/30 hover:text-white disabled:opacity-20 transition-colors"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <button
                onClick={() => moveClip(i, 1)}
                disabled={i === clips.length - 1}
                className="p-1.5 rounded-lg hover:bg-white/[0.08] text-white/30 hover:text-white disabled:opacity-20 transition-colors"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </Reorder.Item>
        ))}
      </Reorder.Group>

      {/* Inline video player */}
      <AnimatePresence>
        {playingId && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="glass-card p-4 mt-4 overflow-hidden"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-white/60">
                Preview: {clips.find((c) => c.id === playingId)?.label}
              </span>
              <button
                onClick={() => setPlayingId(null)}
                className="p-1 rounded hover:bg-white/[0.08] text-white/40"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <video
              ref={videoRef}
              src={clips.find((c) => c.id === playingId)?.blobUrl}
              autoPlay
              controls
              className="w-full max-h-[400px] rounded-lg"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Step 4: Export ───────────────────────────────────────────────

function StepExport({
  clips,
  config,
  exporting,
  setExporting,
  exportProgress,
  setExportProgress,
  exportedUrl,
  setExportedUrl,
  goToStep,
}: {
  clips: Clip[];
  config: OverlayConfig;
  exporting: boolean;
  setExporting: (b: boolean) => void;
  exportProgress: ExportProgress;
  setExportProgress: (p: ExportProgress) => void;
  exportedUrl: string | null;
  setExportedUrl: (u: string | null) => void;
  goToStep: (s: Step) => void;
}) {
  const totalDuration = clips.length * config.clipDuration;

  const handleExport = async () => {
    setExporting(true);
    setExportedUrl(null);
    try {
      const url = await exportVideo(clips, config, setExportProgress);
      setExportedUrl(url);
    } catch (err) {
      console.error('Export failed:', err);
      setExportProgress({ percent: 0, status: 'Export failed. Try again.' });
    }
    setExporting(false);
  };

  const handleDownload = () => {
    if (!exportedUrl) return;
    const a = document.createElement('a');
    a.href = exportedUrl;
    const title = `${config.prefix} ${config.highlight} ${config.suffix}`.trim().replace(/\s+/g, '-');
    a.download = `${title}-rankclip.webm`;
    a.click();
  };

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="glass-card p-6">
        <h2 className="text-lg font-semibold mb-4">Export Summary</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold gradient-text" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
              {config.prefix} {config.highlight} {config.suffix}
            </p>
            <p className="text-xs text-white/40 mt-1">Title</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{clips.length}</p>
            <p className="text-xs text-white/40 mt-1">Clips</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{totalDuration}s</p>
            <p className="text-xs text-white/40 mt-1">Duration</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{config.resolution.width}x{config.resolution.height}</p>
            <p className="text-xs text-white/40 mt-1">{config.resolution.aspect}</p>
          </div>
        </div>
      </div>

      {/* Export Button / Progress */}
      {!exportedUrl && (
        <div className="glass-card p-6 text-center">
          {!exporting ? (
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleExport}
              className="px-8 py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-[#FF4444] via-[#FF6B1A] to-[#FFD700] text-black"
            >
              Generate Ranked Video
            </motion.button>
          ) : (
            <div className="space-y-4">
              <div className="h-3 rounded-full bg-white/[0.06] overflow-hidden relative">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-[#FF4444] via-[#FF6B1A] to-[#FFD700] relative progress-shine"
                  animate={{ width: `${exportProgress.percent}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/60">{exportProgress.status}</span>
                <span className="font-bold">{exportProgress.percent}%</span>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2 justify-center mt-4 text-xs text-yellow-500/70">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Don&apos;t switch tabs — the renderer needs this tab active</span>
          </div>
        </div>
      )}

      {/* Result */}
      {exportedUrl && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6 space-y-4"
        >
          <div className="flex items-center gap-2 text-green-400 mb-2">
            <Check className="w-5 h-5" />
            <span className="font-semibold">Video ready!</span>
          </div>

          <video src={exportedUrl} controls className="w-full max-h-[500px] rounded-xl" />

          <div className="flex flex-wrap gap-3">
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleDownload}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-[#FF4444] via-[#FF6B1A] to-[#FFD700] text-black"
            >
              <Download className="w-4 h-4" />
              Download
            </motion.button>
            <button
              onClick={() => {
                setExportedUrl(null);
                handleExport();
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm bg-white/[0.06] hover:bg-white/[0.1] text-white/70"
            >
              <RefreshCw className="w-4 h-4" />
              Re-render
            </button>
            <button
              onClick={() => goToStep('Rank')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm bg-white/[0.06] hover:bg-white/[0.1] text-white/70"
            >
              <Edit3 className="w-4 h-4" />
              Edit Ranking
            </button>
            <button
              onClick={() => {
                setExportedUrl(null);
                goToStep('Setup');
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm bg-white/[0.06] hover:bg-white/[0.1] text-white/70"
            >
              <RotateCcw className="w-4 h-4" />
              Start Over
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
