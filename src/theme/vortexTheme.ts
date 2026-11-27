import { Platform } from 'react-native';

export type VortexFontPreset = 'sans' | 'mono' | 'serif';
export type VortexFontScale = 'compact' | 'standard' | 'large';
export type VortexAccentKey = 'sky' | 'emerald' | 'violet' | 'amber' | 'crimson';

export interface VortexAccentTheme {
  key: VortexAccentKey;
  label: string;
  primary: string;
  soft: string;
  border: string;
  glow: string;
}

export const VORTEX_ACCENTS: Record<VortexAccentKey, VortexAccentTheme> = {
  sky: {
    key: 'sky',
    label: 'Cyber Sky',
    primary: '#38BDF8',
    soft: 'rgba(56, 189, 248, 0.14)',
    border: 'rgba(56, 189, 248, 0.36)',
    glow: 'rgba(56, 189, 248, 0.28)',
  },
  emerald: {
    key: 'emerald',
    label: 'Matrix Emerald',
    primary: '#10B981',
    soft: 'rgba(16, 185, 129, 0.14)',
    border: 'rgba(16, 185, 129, 0.36)',
    glow: 'rgba(16, 185, 129, 0.28)',
  },
  violet: {
    key: 'violet',
    label: 'Nebula Violet',
    primary: '#818CF8',
    soft: 'rgba(129, 140, 248, 0.14)',
    border: 'rgba(129, 140, 248, 0.36)',
    glow: 'rgba(129, 140, 248, 0.28)',
  },
  amber: {
    key: 'amber',
    label: 'Solar Amber',
    primary: '#F59E0B',
    soft: 'rgba(245, 158, 11, 0.14)',
    border: 'rgba(245, 158, 11, 0.36)',
    glow: 'rgba(245, 158, 11, 0.28)',
  },
  crimson: {
    key: 'crimson',
    label: 'Pulse Crimson',
    primary: '#F43F5E',
    soft: 'rgba(244, 63, 94, 0.14)',
    border: 'rgba(244, 63, 94, 0.36)',
    glow: 'rgba(244, 63, 94, 0.28)',
  },
};

export const VORTEX_PALETTE = {
  oledBlack: '#000000',
  surfaceBase: '#080A0F',
  surfaceCard: '#0E1118',
  surfaceElevated: '#151923',
  surfaceInput: '#161A24',
  surfacePill: '#1C212E',
  glassFill: 'rgba(18, 22, 32, 0.86)',
  glassSheet: 'rgba(12, 15, 22, 0.96)',
  scrim: 'rgba(0, 0, 0, 0.76)',
  borderHairline: 'rgba(255, 255, 255, 0.08)',
  borderStrong: 'rgba(255, 255, 255, 0.15)',
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  success: '#10B981',
  successSoft: 'rgba(16, 185, 129, 0.14)',
  warning: '#F59E0B',
  warningSoft: 'rgba(245, 158, 11, 0.14)',
  danger: '#EF4444',
  dangerSoft: 'rgba(239, 68, 68, 0.14)',
  sendBlue: '#2563EB',
  sendBlueActive: '#3B82F6',
};

export const VORTEX_SYNTAX = {
  background: '#0A0D14',
  headerBg: '#10141F',
  gutterText: '#475569',
  keyword: '#569CD6',
  control: '#C586C0',
  type: '#4EC9B0',
  functionName: '#DCDCAA',
  string: '#CE9178',
  number: '#B5CEA8',
  operator: '#D4D4D4',
  plain: '#E2E8F0',
};

export const VORTEX_FONTS: Record<
  VortexFontPreset,
  { label: string; regular: string; medium: string; bold: string; code: string }
> = {
  sans: {
    label: 'Clean Sans',
    regular: Platform.select({ android: 'sans-serif', default: 'System' }) as string,
    medium: Platform.select({ android: 'sans-serif-medium', default: 'System' }) as string,
    bold: Platform.select({ android: 'sans-serif', default: 'System' }) as string,
    code: Platform.select({ android: 'monospace', default: 'Courier' }) as string,
  },
  mono: {
    label: 'Cyber Mono',
    regular: Platform.select({ android: 'monospace', default: 'Courier' }) as string,
    medium: Platform.select({ android: 'monospace', default: 'Courier' }) as string,
    bold: Platform.select({ android: 'monospace', default: 'Courier' }) as string,
    code: Platform.select({ android: 'monospace', default: 'Courier' }) as string,
  },
  serif: {
    label: 'Editorial Serif',
    regular: Platform.select({ android: 'serif', default: 'Georgia' }) as string,
    medium: Platform.select({ android: 'serif', default: 'Georgia' }) as string,
    bold: Platform.select({ android: 'serif', default: 'Georgia' }) as string,
    code: Platform.select({ android: 'monospace', default: 'Courier' }) as string,
  },
};

export const VORTEX_SCALE_MULTIPLIER: Record<VortexFontScale, number> = {
  compact: 0.92,
  standard: 1.0,
  large: 1.12,
};

export const VORTEX_MOTION = {
  springSnappy: {
    damping: 20,
    stiffness: 260,
    mass: 0.85,
  },
  springGentle: {
    damping: 24,
    stiffness: 170,
    mass: 1.0,
  },
  springDrawer: {
    damping: 26,
    stiffness: 240,
    mass: 0.9,
  },
  timingFast: 180,
  timingSheet: 240,
  timingPulse: 1600,
};

export const VORTEX_LAYOUT = {
  radiusSm: 10,
  radiusMd: 16,
  radiusLg: 22,
  radiusXl: 28,
  radiusPill: 999,
  headerHeight: 54,
  dockHeight: 54,
  drawerWidthRatio: 0.82,
};

const HEX_COLOR_REGEX = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;

export function sanitizeHexColor(input: string | undefined | null, fallback = '#38BDF8'): string {
  if (!input || typeof input !== 'string') return fallback;
  const trimmed = input.trim();
  return HEX_COLOR_REGEX.test(trimmed) ? trimmed : fallback;
}

export function getScaledFontSize(baseSize: number, scale: VortexFontScale): number {
  const factor = VORTEX_SCALE_MULTIPLIER[scale] ?? 1.0;
  return Math.round(baseSize * factor * 10) / 10;
}
