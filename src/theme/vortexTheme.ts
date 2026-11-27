import { Platform } from 'react-native';

export type VortexFontPreset =
  | 'sans'
  | 'aero'
  | 'mono'
  | 'ethnocentric'
  | 'goodtimes'
  | 'vermin'
  | 'deadly';

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

const SYSTEM_SANS = Platform.select({ android: 'sans-serif', default: 'System' }) as string;
const SYSTEM_SANS_MED = Platform.select({ android: 'sans-serif-medium', default: 'System' }) as string;
const SYSTEM_MONO = Platform.select({ android: 'monospace', default: 'Courier' }) as string;

export const VORTEX_FONTS: Record<
  VortexFontPreset,
  {
    label: string;
    tag: string;
    regular: string;
    medium: string;
    bold: string;
    italic: string;
    display: string;
    code: string;
  }
> = {
  sans: {
    label: 'Clean Sans',
    tag: 'Default UI',
    regular: SYSTEM_SANS,
    medium: SYSTEM_SANS_MED,
    bold: SYSTEM_SANS_MED,
    italic: SYSTEM_SANS,
    display: 'Ethnocentric-Regular',
    code: SYSTEM_MONO,
  },
  aero: {
    label: 'Aero Matics',
    tag: 'Cyber Geometric',
    regular: 'AeroMatics-Regular',
    medium: 'AeroMatics-Bold',
    bold: 'AeroMatics-Bold',
    italic: 'AeroMatics-Italic',
    display: 'Ethnocentric-Regular',
    code: SYSTEM_MONO,
  },
  mono: {
    label: 'Cyber Mono',
    tag: 'Terminal Code',
    regular: SYSTEM_MONO,
    medium: SYSTEM_MONO,
    bold: SYSTEM_MONO,
    italic: SYSTEM_MONO,
    display: 'GoodTimes-Regular',
    code: SYSTEM_MONO,
  },
  ethnocentric: {
    label: 'Ethnocentric',
    tag: 'Vortex Core',
    regular: 'Ethnocentric-Regular',
    medium: 'Ethnocentric-Regular',
    bold: 'Ethnocentric-Regular',
    italic: 'Ethnocentric-Regular',
    display: 'Ethnocentric-Regular',
    code: SYSTEM_MONO,
  },
  goodtimes: {
    label: 'Good Times',
    tag: 'Futuristic HUD',
    regular: 'GoodTimes-Regular',
    medium: 'GoodTimes-Regular',
    bold: 'GoodTimes-Regular',
    italic: 'GoodTimes-Regular',
    display: 'GoodTimes-Regular',
    code: SYSTEM_MONO,
  },
  vermin: {
    label: 'Vermin Vibes',
    tag: 'Neon Arcade',
    regular: 'VerminVibes',
    medium: 'VerminVibes',
    bold: 'VerminVibes',
    italic: 'VerminVibes',
    display: 'VerminVibes',
    code: SYSTEM_MONO,
  },
  deadly: {
    label: 'Deadly Advance',
    tag: 'Mecha Tactical',
    regular: 'DeadlyAdvance',
    medium: 'DeadlyAdvance',
    bold: 'DeadlyAdvance',
    italic: 'DeadlyAdvance-Italic',
    display: 'DeadlyAdvance',
    code: SYSTEM_MONO,
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
