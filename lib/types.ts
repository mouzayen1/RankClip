export interface Clip {
  id: string;
  file: File;
  label: string;
  thumbnailUrl: string | null;
  blobUrl: string;
}

export interface OverlayConfig {
  prefix: string;
  highlight: string;
  suffix: string;
  highlightColor: string;
  font: string;
  clipDuration: number;
  resolution: Resolution;
}

export interface Resolution {
  label: string;
  width: number;
  height: number;
  aspect: string;
}

export const RESOLUTIONS: Resolution[] = [
  { label: '1080x1920 (9:16 Shorts)', width: 1080, height: 1920, aspect: '9:16' },
  { label: '720x1280 (9:16 Fast)', width: 720, height: 1280, aspect: '9:16' },
  { label: '1920x1080 (16:9)', width: 1920, height: 1080, aspect: '16:9' },
  { label: '1080x1080 (1:1)', width: 1080, height: 1080, aspect: '1:1' },
];

export const DEFAULT_RESOLUTION = RESOLUTIONS[1];

export const HIGHLIGHT_COLORS = [
  '#FF4444', '#FF6B1A', '#FFD700', '#22CC66',
  '#1E90FF', '#9B59B6', '#E91E8A', '#00CED1',
];

export const RANK_COLORS = [
  '#FF2020', '#FF6B1A', '#FFB800', '#22CC66', '#1E90FF',
  '#9B59B6', '#E91E8A', '#00CED1', '#FF4500', '#32CD32',
];

export const FONTS = [
  { name: 'Impact', value: 'Impact, sans-serif' },
  { name: 'Anton', value: "'Anton', sans-serif" },
  { name: 'Bebas Neue', value: "'Bebas Neue', sans-serif" },
  { name: 'Oswald', value: "'Oswald', sans-serif" },
];

export const STEPS = ['Setup', 'Upload', 'Rank', 'Export'] as const;
export type Step = (typeof STEPS)[number];
