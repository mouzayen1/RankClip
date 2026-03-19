'use client';

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Scissors,
  Upload,
  Loader2,
  Check,
  X,
  Play,
  Pause,
  ChevronRight,
  SlidersHorizontal,
} from 'lucide-react';
import { Clip, VideoSegment } from '@/lib/types';
import {
  detectScenes,
  DetectionProgress,
  extractSegment,
  generateThumbnail,
} from '@/lib/video';

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

interface VideoSplitterProps {
  onSegmentsReady: (clips: Clip[]) => void;
  onClose: () => void;
}

type SplitterPhase = 'upload' | 'detecting' | 'review' | 'extracting';

export default function VideoSplitter({ onSegmentsReady, onClose }: VideoSplitterProps) {
  const [phase, setPhase] = useState<SplitterPhase>('upload');
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [segments, setSegments] = useState<VideoSegment[]>([]);
  const [progress, setProgress] = useState<DetectionProgress>({ percent: 0, status: '' });
  const [extractProgress, setExtractProgress] = useState({ current: 0, total: 0, percent: 0 });
  const [sensitivity, setSensitivity] = useState(35);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type)) return;

    setSourceFile(file);
    const url = URL.createObjectURL(file);
    setSourceUrl(url);
    setPhase('detecting');

    try {
      const segs = await detectScenes(file, setProgress, sensitivity);
      setSegments(segs);
      setPhase('review');
    } catch (err) {
      console.error('Scene detection failed:', err);
      setProgress({ percent: 0, status: 'Detection failed. Try again.' });
      setPhase('upload');
      URL.revokeObjectURL(url);
      setSourceUrl(null);
    }
  }, [sensitivity]);

  const redetect = async () => {
    if (!sourceFile) return;
    setPhase('detecting');
    try {
      const segs = await detectScenes(sourceFile, setProgress, sensitivity);
      setSegments(segs);
      setPhase('review');
    } catch {
      setProgress({ percent: 0, status: 'Detection failed.' });
      setPhase('review');
    }
  };

  const toggleSegment = (id: string) => {
    setSegments(segments.map(s => s.id === id ? { ...s, selected: !s.selected } : s));
  };

  const updateSegmentLabel = (id: string, label: string) => {
    setSegments(segments.map(s => s.id === id ? { ...s, label } : s));
  };

  const previewSegment = (seg: VideoSegment) => {
    if (previewingId === seg.id) {
      setPreviewingId(null);
      return;
    }
    setPreviewingId(seg.id);
    if (videoRef.current && sourceUrl) {
      videoRef.current.src = sourceUrl;
      videoRef.current.currentTime = seg.startTime;
      videoRef.current.play().catch(() => {});

      // Auto-pause at end of segment
      const checkEnd = () => {
        if (videoRef.current && videoRef.current.currentTime >= seg.endTime) {
          videoRef.current.pause();
          videoRef.current.removeEventListener('timeupdate', checkEnd);
        }
      };
      videoRef.current.addEventListener('timeupdate', checkEnd);
    }
  };

  const handleExtract = async () => {
    if (!sourceFile) return;
    const selected = segments.filter(s => s.selected);
    if (selected.length === 0) return;

    setPhase('extracting');
    setExtractProgress({ current: 0, total: selected.length, percent: 0 });

    const clips: Clip[] = [];

    for (let i = 0; i < selected.length; i++) {
      const seg = selected[i];
      setExtractProgress({
        current: i + 1,
        total: selected.length,
        percent: Math.round((i / selected.length) * 100),
      });

      try {
        const segFile = await extractSegment(sourceFile, seg.startTime, seg.endTime);
        const blobUrl = URL.createObjectURL(segFile);
        let thumbnailUrl: string | null = seg.thumbnailUrl;
        try {
          thumbnailUrl = await generateThumbnail(segFile);
        } catch {}

        clips.push({
          id: uid(),
          file: segFile,
          label: seg.label,
          thumbnailUrl,
          blobUrl,
        });
      } catch (err) {
        console.error(`Failed to extract segment ${i + 1}:`, err);
      }
    }

    setExtractProgress({
      current: selected.length,
      total: selected.length,
      percent: 100,
    });

    // Clean up source
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);

    onSegmentsReady(clips);
  };

  const selectedCount = segments.filter(s => s.selected).length;

  const formatTime = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    const ms = Math.round((t % 1) * 10);
    return `${m}:${s.toString().padStart(2, '0')}.${ms}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="relative z-50 glass-card w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <Scissors className="w-5 h-5 text-[#FF6B1A]" />
            <h2 className="text-lg font-semibold">Auto-Split Video</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/[0.08] text-white/40 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <AnimatePresence mode="wait">
            {/* ── Upload Phase ── */}
            {phase === 'upload' && (
              <motion.div
                key="upload"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="space-y-4"
              >
                <p className="text-sm text-white/50">
                  Upload a long video (compilation, montage) and we&apos;ll automatically detect scene changes and split it into individual clips.
                </p>

                {/* Sensitivity slider */}
                <div className="flex items-center gap-3">
                  <SlidersHorizontal className="w-4 h-4 text-white/40" />
                  <div className="flex-1">
                    <div className="flex justify-between text-xs text-white/40 mb-1">
                      <span>Detection Sensitivity</span>
                      <span>{sensitivity}%</span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={80}
                      value={sensitivity}
                      onChange={(e) => setSensitivity(Number(e.target.value))}
                      className="w-full accent-[#FF6B1A] h-1.5"
                    />
                    <div className="flex justify-between text-xs text-white/25 mt-0.5">
                      <span>Fewer cuts</span>
                      <span>More cuts</span>
                    </div>
                  </div>
                </div>

                {/* Drop zone */}
                <div
                  className={`drop-zone rounded-2xl p-10 text-center cursor-pointer transition-all ${
                    dragging ? 'dragging' : ''
                  }`}
                  onClick={() => inputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
                  }}
                >
                  <Upload className="w-8 h-8 text-white/20 mx-auto mb-2" />
                  <p className="text-white/50 text-sm">
                    Drop a video compilation here, or <span className="text-[#FF6B1A] underline">browse</span>
                  </p>
                  <p className="text-white/25 text-xs mt-1">MP4, MOV, WebM — up to ~3 minutes recommended</p>
                  <input
                    ref={inputRef}
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                  />
                </div>
              </motion.div>
            )}

            {/* ── Detecting Phase ── */}
            {phase === 'detecting' && (
              <motion.div
                key="detecting"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="space-y-4 text-center py-8"
              >
                <Loader2 className="w-10 h-10 text-[#FF6B1A] mx-auto animate-spin" />
                <p className="text-sm text-white/60">{progress.status}</p>
                <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden max-w-sm mx-auto">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-[#FF4444] via-[#FF6B1A] to-[#FFD700] progress-shine relative"
                    animate={{ width: `${progress.percent}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <p className="text-xs text-white/30">{progress.percent}% — Analyzing frames for scene cuts</p>
              </motion.div>
            )}

            {/* ── Review Phase ── */}
            {phase === 'review' && (
              <motion.div
                key="review"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="space-y-4"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm text-white/50">
                    Found <span className="text-white font-semibold">{segments.length}</span> segments. Select the ones you want to use.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSegments(segments.map(s => ({ ...s, selected: true })))}
                      className="text-xs text-[#FF6B1A] hover:underline"
                    >
                      Select all
                    </button>
                    <span className="text-white/20">|</span>
                    <button
                      onClick={() => setSegments(segments.map(s => ({ ...s, selected: false })))}
                      className="text-xs text-white/40 hover:underline"
                    >
                      None
                    </button>
                  </div>
                </div>

                {/* Re-detect with different sensitivity */}
                <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <SlidersHorizontal className="w-4 h-4 text-white/40 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="flex justify-between text-xs text-white/40 mb-1">
                      <span>Sensitivity</span>
                      <span>{sensitivity}%</span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={80}
                      value={sensitivity}
                      onChange={(e) => setSensitivity(Number(e.target.value))}
                      className="w-full accent-[#FF6B1A] h-1.5"
                    />
                  </div>
                  <button
                    onClick={redetect}
                    className="px-3 py-1.5 text-xs rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-white/60 whitespace-nowrap"
                  >
                    Re-detect
                  </button>
                </div>

                {/* Segment list */}
                <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                  {segments.map((seg) => (
                    <div
                      key={seg.id}
                      className={`flex items-center gap-3 p-3 rounded-xl transition-all cursor-pointer ${
                        seg.selected
                          ? 'bg-white/[0.06] border border-[#FF6B1A]/30'
                          : 'bg-white/[0.02] border border-white/[0.04] opacity-50'
                      }`}
                      onClick={() => toggleSegment(seg.id)}
                    >
                      {/* Checkbox */}
                      <div
                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                          seg.selected
                            ? 'bg-[#FF6B1A] border-[#FF6B1A]'
                            : 'border-white/20 bg-transparent'
                        }`}
                      >
                        {seg.selected && <Check className="w-3 h-3 text-black" />}
                      </div>

                      {/* Thumbnail */}
                      <div className="w-20 h-[45px] rounded-lg overflow-hidden bg-white/[0.05] flex-shrink-0">
                        {seg.thumbnailUrl ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={seg.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">
                            —
                          </div>
                        )}
                      </div>

                      {/* Label + time */}
                      <div className="flex-1 min-w-0">
                        <input
                          type="text"
                          value={seg.label}
                          onChange={(e) => {
                            e.stopPropagation();
                            updateSegmentLabel(seg.id, e.target.value);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-full bg-transparent text-sm font-medium focus:outline-none border-b border-transparent focus:border-white/20 px-0.5"
                        />
                        <p className="text-xs text-white/30 mt-0.5">
                          {formatTime(seg.startTime)} → {formatTime(seg.endTime)}
                          <span className="ml-2 text-white/20">
                            ({(seg.endTime - seg.startTime).toFixed(1)}s)
                          </span>
                        </p>
                      </div>

                      {/* Preview button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          previewSegment(seg);
                        }}
                        className="p-1.5 rounded-lg hover:bg-white/[0.08] text-white/30 hover:text-white transition-colors flex-shrink-0"
                      >
                        {previewingId === seg.id ? (
                          <Pause className="w-4 h-4" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>

                {/* Preview video */}
                <AnimatePresence>
                  {previewingId && sourceUrl && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <video
                        ref={videoRef}
                        controls
                        className="w-full max-h-[200px] rounded-xl"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {/* ── Extracting Phase ── */}
            {phase === 'extracting' && (
              <motion.div
                key="extracting"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="space-y-4 text-center py-8"
              >
                <Loader2 className="w-10 h-10 text-[#FF6B1A] mx-auto animate-spin" />
                <p className="text-sm text-white/60">
                  Extracting segment {extractProgress.current}/{extractProgress.total}...
                </p>
                <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden max-w-sm mx-auto">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-[#FF4444] via-[#FF6B1A] to-[#FFD700] progress-shine relative"
                    animate={{ width: `${extractProgress.percent}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <p className="text-xs text-white/30">
                  This re-records each segment — keep this tab active
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        {phase === 'review' && (
          <div className="px-6 py-4 border-t border-white/[0.06] flex items-center justify-between">
            <p className="text-sm text-white/40">
              {selectedCount} of {segments.length} selected
            </p>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleExtract}
              disabled={selectedCount === 0}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-[#FF4444] via-[#FF6B1A] to-[#FFD700] text-black disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Extract {selectedCount} Clips
              <ChevronRight className="w-4 h-4" />
            </motion.button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
