import { Platform, TextStyle, ViewStyle } from 'react-native';

export type PromptInjectionModeId =
  | 'AUTONOMOUS_DEFAULT'
  | 'DIRECT_CODE_INJECT'
  | 'CSE_SUPER_TUTOR'
  | 'GHOST_AUTOPILOT'
  | 'VERIFIED_RESEARCH';

export interface PromptModeVisual {
  id: PromptInjectionModeId;
  label: string;
  shortTag: string;
  accent: string;
  bgTint: string;
  borderTint: string;
  description: string;
}

export const VORTEX_COLORS = {
  // Pitch-Black OLED Base
  canvas: '#000000',
  surfaceElevated: '#090D16',
  surfaceCard: '#0E1422',
  surfaceGlass: 'rgba(11, 16, 28, 0.94)',
  surfaceInput: '#111827',

  // User Prompt Box Palette (Distinct Indigo-Slate)
  userBoxBg: '#141D31',
  userBoxBorder: '#3B82F6',
  userText: '#F8FAFC',
  userMetaText: '#93C5FD',

  // AI Response Typography Palette (High-Contrast Color-Coded)
  aiTextPrimary: '#F1F5F9',
  aiTextSecondary: '#CBD5E1',
  aiTextMuted: '#64748B',
  aiHeadingCyan: '#38BDF8',
  aiAccentEmerald: '#34D399',
  aiAccentAmber: '#FBBF24',
  aiAccentViolet: '#A78BFA',
  aiAccentRose: '#FB7185',

  // Specialized Box Borders & Fills
  codeBoxBg: '#070B12',
  codeBoxHeader: '#0D1422',
  codeBoxBorder: '#1E3A5F',

  promptBoxBg: '#120D24',
  promptBoxHeader: '#1A1233',
  promptBoxBorder: '#7C3AED',

  diagramBoxBg: '#071318',
  diagramBoxHeader: '#0B1E26',
  diagramBoxBorder: '#0284C7',

  linkBoxBg: '#091512',
  linkBoxBorder: '#059669',

  imageBoxBg: '#140F1D',
  imageBoxBorder: '#C084FC',

  // Borders & Dividers
  borderSubtle: '#1E293B',
  borderGlowCyan: '#38BDF8',
  borderGlowEmerald: '#10B981',

  // Status Indicators
  statusOnline: '#22C55E',
  statusStandby: '#F59E0B',
  statusOffline: '#EF4444',
} as const;

export const VORTEX_SYNTAX_COLORS = {
  keyword: '#C084FC',     // Purple: int, void, class, def, const, return, if, for
  type: '#38BDF8',        // Cyan: String, Int, vector, List, Promise, bool
  function: '#60A5FA',    // Sky Blue: main(), solve(), traverse(), printf()
  string: '#34D399',      // Emerald: "hello", 'a'
  number: '#FBBF24',      // Amber: 0, 42, 3.14, 0xFF
  operator: '#F472B6',    // Pink: =, +, ->, ::, &&
  preprocessor: '#FB923C',// Orange: #include, import, @Override
  comment: '#64748B',     // Muted Slate
  plain: '#E2E8F0',       // Crisp Light Text
} as const;

export const VORTEX_FONTS = {
  sansHeading: Platform.select({
    ios: 'System',
    android: 'sans-serif-medium',
    default: 'System',
  }),
  sansBody: Platform.select({
    ios: 'System',
    android: 'sans-serif',
    default: 'System',
  }),
  userPrompt: Platform.select({
    ios: 'System',
    android: 'sans-serif-medium',
    default: 'System',
  }),
  mono: Platform.select({
    ios: 'Menlo',
    android: 'monospace',
    default: 'monospace',
  }),
} as const;

export const VORTEX_TYPOGRAPHY: Record<string, TextStyle> = {
  heroBrand: {
    fontFamily: VORTEX_FONTS.sansHeading,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: VORTEX_COLORS.aiHeadingCyan,
  },
  sectionTitle: {
    fontFamily: VORTEX_FONTS.sansHeading,
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 30,
    color: VORTEX_COLORS.aiHeadingCyan,
    marginTop: 10,
    marginBottom: 6,
  },
  subHeading: {
    fontFamily: VORTEX_FONTS.sansHeading,
    fontSize: 19,
    fontWeight: '700',
    lineHeight: 26,
    color: VORTEX_COLORS.aiAccentEmerald,
    marginTop: 8,
    marginBottom: 4,
  },
  userPromptText: {
    fontFamily: VORTEX_FONTS.userPrompt,
    fontSize: 17.5,
    fontWeight: '600',
    lineHeight: 25,
    color: VORTEX_COLORS.userText,
  },
  aiBodyText: {
    fontFamily: VORTEX_FONTS.sansBody,
    fontSize: 18,
    fontWeight: '400',
    lineHeight: 28,
    color: VORTEX_COLORS.aiTextPrimary,
  },
  aiBoldHighlight: {
    fontFamily: VORTEX_FONTS.sansHeading,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 28,
    color: VORTEX_COLORS.aiAccentAmber,
  },
  aiInlineCode: {
    fontFamily: VORTEX_FONTS.mono,
    fontSize: 15.5,
    color: VORTEX_COLORS.aiHeadingCyan,
    backgroundColor: '#0F172A',
  },
  codeBlockText: {
    fontFamily: VORTEX_FONTS.mono,
    fontSize: 15,
    lineHeight: 22.5,
    color: VORTEX_SYNTAX_COLORS.plain,
  },
  promptBlockText: {
    fontFamily: VORTEX_FONTS.mono,
    fontSize: 15.5,
    lineHeight: 23,
    color: '#EDE9FE',
  },
  bentoTitle: {
    fontFamily: VORTEX_FONTS.sansHeading,
    fontSize: 17,
    fontWeight: '800',
    color: VORTEX_COLORS.aiTextPrimary,
  },
  bentoValue: {
    fontFamily: VORTEX_FONTS.sansHeading,
    fontSize: 24,
    fontWeight: '800',
    color: VORTEX_COLORS.aiHeadingCyan,
  },
  badgeText: {
    fontFamily: VORTEX_FONTS.sansHeading,
    fontSize: 12.5,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
};

export const VORTEX_BOX_STYLES: Record<string, ViewStyle> = {
  userBubbleBox: {
    alignSelf: 'flex-end',
    maxWidth: '88%',
    backgroundColor: VORTEX_COLORS.userBoxBg,
    borderColor: VORTEX_COLORS.userBoxBorder,
    borderWidth: 1.5,
    borderRadius: 22,
    borderBottomRightRadius: 6,
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginVertical: 10,
  },
  aiResponseContainer: {
    alignSelf: 'stretch',
    backgroundColor: VORTEX_COLORS.canvas,
    paddingHorizontal: 4,
    paddingVertical: 8,
    marginVertical: 6,
  },
  codeBox: {
    backgroundColor: VORTEX_COLORS.codeBoxBg,
    borderColor: VORTEX_COLORS.codeBoxBorder,
    borderWidth: 1.5,
    borderRadius: 18,
    overflow: 'hidden',
    marginVertical: 12,
  },
  promptInjectBox: {
    backgroundColor: VORTEX_COLORS.promptBoxBg,
    borderColor: VORTEX_COLORS.promptBoxBorder,
    borderWidth: 1.5,
    borderRadius: 18,
    overflow: 'hidden',
    marginVertical: 12,
  },
  diagramBox: {
    backgroundColor: VORTEX_COLORS.diagramBoxBg,
    borderColor: VORTEX_COLORS.diagramBoxBorder,
    borderWidth: 1.5,
    borderRadius: 18,
    overflow: 'hidden',
    marginVertical: 12,
  },
  verifiedLinkBox: {
    backgroundColor: VORTEX_COLORS.linkBoxBg,
    borderColor: VORTEX_COLORS.linkBoxBorder,
    borderWidth: 1.2,
    borderRadius: 16,
    padding: 14,
    marginVertical: 6,
  },
  aiImageBox: {
    backgroundColor: VORTEX_COLORS.imageBoxBg,
    borderColor: VORTEX_COLORS.imageBoxBorder,
    borderWidth: 1.5,
    borderRadius: 20,
    overflow: 'hidden',
    marginVertical: 12,
  },
  bentoCard: {
    backgroundColor: VORTEX_COLORS.surfaceCard,
    borderColor: VORTEX_COLORS.borderSubtle,
    borderWidth: 1.3,
    borderRadius: 20,
    padding: 16,
  },
  commandDockCapsule: {
    backgroundColor: VORTEX_COLORS.surfaceInput,
    borderColor: '#263449',
    borderWidth: 1.5,
    borderRadius: 30,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
};

export const PROMPT_INJECTION_MODES: Record<PromptInjectionModeId, PromptModeVisual> = {
  AUTONOMOUS_DEFAULT: {
    id: 'AUTONOMOUS_DEFAULT',
    label: 'Autonomous Core',
    shortTag: 'CORE',
    accent: '#38BDF8',
    bgTint: '#0A1929',
    borderTint: '#0284C7',
    description: 'Balanced OS autopilot, rich visual cards, verified links, and neural voice.',
  },
  DIRECT_CODE_INJECT: {
    id: 'DIRECT_CODE_INJECT',
    label: 'Pure Code Injector',
    shortTag: 'CODE-ONLY',
    accent: '#34D399',
    bgTint: '#071F18',
    borderTint: '#059669',
    description: 'Zero explanation, zero comments—outputs pure runnable code ready for screen injection.',
  },
  CSE_SUPER_TUTOR: {
    id: 'CSE_SUPER_TUTOR',
    label: 'CSE Study Tutor',
    shortTag: 'TUTOR',
    accent: '#FBBF24',
    bgTint: '#231906',
    borderTint: '#D97706',
    description: 'Syllabus RAG notes, step-by-step Maths/Circuits, SVG diagrams, and Viva drills.',
  },
  GHOST_AUTOPILOT: {
    id: 'GHOST_AUTOPILOT',
    label: 'Human Ghost Mode',
    shortTag: 'GHOST',
    accent: '#A78BFA',
    bgTint: '#19102E',
    borderTint: '#7C3AED',
    description: 'Bezier human touch, Chromium WebView agent, form fill, and multi-step UI navigation.',
  },
  VERIFIED_RESEARCH: {
    id: 'VERIFIED_RESEARCH',
    label: 'Live Web + Link Reader',
    shortTag: 'WEB-READ',
    accent: '#FB7185',
    bgTint: '#260C14',
    borderTint: '#E11D48',
    description: 'Visits and reads live web pages, fetches real web images, and verifies every URL.',
  },
};

export interface VortexFeatureItem {
  id: string;
  title: string;
  category: 'VOICE' | 'VISION' | 'TUTOR' | 'GHOST' | 'SYSTEM';
  status: 'ACTIVE' | 'STANDBY';
  summary: string;
}

export const VORTEX_COMPLETE_FEATURES: VortexFeatureItem[] = [
  {
    id: 'unified_orb',
    title: 'Unified 40% Dim ẞ Orb',
    category: 'VISION',
    status: 'ACTIVE',
    summary: 'Single floating orb (40% idle opacity) with HUD capsule, double-tap mic, and long-press screen scan.',
  },
  {
    id: 'porcupine_wakeword',
    title: 'Zero-Beep "Hey Vortex" Wakeword',
    category: 'VOICE',
    status: 'ACTIVE',
    summary: 'Offline Porcupine wakeword + AudioManager stream ducking + Stealth zero-icon privacy mode.',
  },
  {
    id: 'elevenlabs_tts',
    title: 'ElevenLabs Neural Voice + Barge-In',
    category: 'VOICE',
    status: 'ACTIVE',
    summary: 'Streaming multilingual voice replies with multi-key rotation and instant voice interrupt.',
  },
  {
    id: 'ghost_phone_web',
    title: 'Human Ghost Mode (Phone + Web)',
    category: 'GHOST',
    status: 'ACTIVE',
    summary: 'Cubic Bezier swipes, micro-jitter taps, human typing cadence, and Chromium WebView automation.',
  },
  {
    id: 'live_link_reader',
    title: 'Live Web Search & Link Page Reader',
    category: 'GHOST',
    status: 'ACTIVE',
    summary: 'Fetches and reads live URLs before citing, verifies HTTP 200 status, and loads web image strips.',
  },
  {
    id: 'pollinations_studio',
    title: 'Pollinations.ai Free HD Image Studio',
    category: 'VISION',
    status: 'ACTIVE',
    summary: 'Generates HD visuals via Flux/Z-Image directly inside chat cards with Save & Remix controls.',
  },
  {
    id: 'cse_rag_tutor',
    title: 'CSE Study RAG + Diagram + Viva Tutor',
    category: 'TUTOR',
    status: 'ACTIVE',
    summary: 'SQLite notes vault (DSA, OOPS, COA, DE, CN, Maths), SVG flowcharts, step-by-step solver, and Viva.',
  },
  {
    id: 'screen_code_injector',
    title: 'Screen-to-Solve Code Injector',
    category: 'TUTOR',
    status: 'ACTIVE',
    summary: 'Reads coding problems from screen and injects comment-free runnable code into editors.',
  },
  {
    id: 'notif_clipboard_macros',
    title: 'WhatsApp Auto-Reply & Clipboard Pulse',
    category: 'SYSTEM',
    status: 'ACTIVE',
    summary: 'RemoteInput direct message replies, clipboard error interceptor, App-Lock vault, and RAM cleaner.',
  },
  {
    id: 'pc_sync_standby',
    title: 'PC Wi-Fi Bridge (vortex.local)',
    category: 'SYSTEM',
    status: 'STANDBY',
    summary: 'Dormant local SQLite sync queue ready for future 1-tap activation with desktop FastAPI server.',
  },
];
