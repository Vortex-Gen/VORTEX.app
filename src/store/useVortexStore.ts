import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules } from 'react-native';
import { create } from 'zustand';
import {
  sanitizeHexColor,
  VORTEX_ACCENTS,
  VORTEX_FONTS,
  VortexAccentKey,
  VortexFontPreset,
  VortexFontScale,
} from '../theme/vortexTheme';

const { VortexBridge } = NativeModules;

const STORAGE_STATE_KEY = 'VORTEX_PERSISTED_STATE_V5';
const VAULT_GEMINI_KEYS = 'vortex_gemini_keys_pool';
const VAULT_ELEVEN_KEYS = 'vortex_elevenlabs_keys_pool';
const VAULT_APPLOCK_PIN = 'applock_pin';
const VAULT_PC_TOKEN = 'vortex_pc_sync_token';

export type VortexScreenId =
  | 'chat'
  | 'voice_live'
  | 'orb_studio'
  | 'settings'
  | 'image_studio'
  | 'study_notebooks'
  | 'ghost_loop'
  | 'macros_alarms'
  | 'local_ai_wakeword'
  | 'skills_workflows'
  | 'code_canvas';

export type VortexPromptMode = 'auto' | 'code' | 'ghost' | 'study' | 'vision';

export interface VortexAttachment {
  id: string;
  type: 'image' | 'file' | 'screen_capture' | 'clipboard';
  name: string;
  uri?: string;
  base64?: string;
  textContent?: string;
}

export interface VortexDiagramNode {
  id: string;
  label: string;
  sublabel?: string;
  tier: number;
  accent?: string;
}

export interface VortexDiagramEdge {
  from: string;
  to: string;
  label?: string;
}

export interface VortexDiagramSpec {
  title: string;
  nodes: VortexDiagramNode[];
  edges: VortexDiagramEdge[];
}

export interface VortexMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  mode: VortexPromptMode;
  attachments?: VortexAttachment[];
  diagramSpec?: VortexDiagramSpec;
  generatedImageUrl?: string;
  providerTag?: string;
  latencyMs?: number;
  isError?: boolean;
}

export interface VortexChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  branchParentId?: string;
  branchRootMessageId?: string;
  notebookId?: string;
  messages: VortexMessage[];
}

export interface ApiKeyEntry {
  id: string;
  label: string;
  maskedKey: string;
  status: 'active' | 'rate_limited' | 'invalid';
  cooldownUntil: number;
  usageCount: number;
}

export interface VortexMacroItem {
  id: string;
  title: string;
  command: string;
  hour: number;
  minute: number;
  daysMask: number;
  enabled: boolean;
  ringAlarm: boolean;
  lastTriggeredAt?: number;
}

export interface GhostStepLog {
  id: string;
  step: number;
  phase: 'observe' | 'plan' | 'act' | 'verify' | 'safety_pause';
  summary: string;
  domHash?: string;
  targetNode?: string;
  timestamp: number;
  success: boolean;
}

export interface PendingSafetyAction {
  id: string;
  targetApp: string;
  actionType: 'send_message' | 'payment_or_order' | 'delete_data' | 'system_change';
  previewText: string;
  coordinates?: { x: number; y: number };
  createdAt: number;
}

export interface WorkflowRecordedStep {
  id: string;
  order: number;
  action: 'tap' | 'swipe' | 'inject_text' | 'launch_app' | 'wait';
  packageName: string;
  viewId?: string;
  textAnchor?: string;
  descAnchor?: string;
  normX: number;
  normY: number;
  inputValue?: string;
  delayMs: number;
}

export interface VortexWorkflow {
  id: string;
  name: string;
  triggerPhrase: string;
  steps: WorkflowRecordedStep[];
  successCount: number;
  lastRunAt?: number;
}

export interface VortexNotebook {
  id: string;
  subject: string;
  semester: string;
  code: string;
  notes: string;
  updatedAt: number;
}

export interface CodeCanvasPayload {
  title: string;
  language: string;
  code: string;
  diagramSpec?: VortexDiagramSpec;
}

export interface VortexPermissionsSnapshot {
  overlay: boolean;
  accessibility: boolean;
  notificationListener: boolean;
  exactAlarm: boolean;
  batteryIgnored: boolean;
  orbRunning: boolean;
}

export interface VortexTelemetrySnapshot {
  freeRamMb: number;
  totalRamMb: number;
  isLowMemory: boolean;
  freeStorageGb: number;
  totalStorageGb: number;
  batteryPercent: number;
  isCharging: boolean;
  thermalStatus: number;
}

export interface VortexState {
  hydrated: boolean;
  activeScreen: VortexScreenId;
  isDrawerOpen: boolean;
  isPlusSheetOpen: boolean;
  canvasPayload: CodeCanvasPayload | null;

  sessions: VortexChatSession[];
  activeSessionId: string;
  activePromptMode: VortexPromptMode;
  pendingAttachments: VortexAttachment[];
  isGenerating: boolean;

  geminiKeyPool: ApiKeyEntry[];
  elevenLabsKeyPool: ApiKeyEntry[];
  elevenLabsVoiceId: string;
  voiceLanguage: 'hi-IN' | 'en-IN' | 'ur-IN';

  localModelPath: string;
  localModelName: string;
  localModelSizeMb: number;
  localModelLoaded: boolean;
  preferOfflineBrain: boolean;
  localThreads: number;
  localContextSize: number;

  wakewordEnabled: boolean;
  wakewordEngine: 'offline_vad_kws' | 'picovoice_ppn';
  wakewordPhrase: string;
  ppnModelPath: string;
  zeroBeepMute: boolean;

  orbEnabled: boolean;
  orbOpacity: number;
  orbAccentKey: VortexAccentKey;
  orbStealthMode: boolean;
  orbAutoStartBoot: boolean;
  autoUnlockAppLock: boolean;
  hasAppLockPin: boolean;

  fontPreset: VortexFontPreset;
  fontScale: VortexFontScale;

  macros: VortexMacroItem[];
  workflows: VortexWorkflow[];
  isRecordingWorkflow: boolean;
  recordedDraftSteps: WorkflowRecordedStep[];

  ghostLoop: {
    status:
      | 'idle'
      | 'observing'
      | 'planning'
      | 'acting'
      | 'verifying'
      | 'awaiting_approval'
      | 'completed'
      | 'halted';
    goal: string;
    currentStep: number;
    maxSteps: number;
    logs: GhostStepLog[];
    pendingSafety: PendingSafetyAction | null;
  };

  notebooks: VortexNotebook[];
  activeNotebookId: string | null;

  pcSync: {
    host: string;
    port: number;
    status: 'standby_offline' | 'probing' | 'connected';
    pendingQueueCount: number;
    lastSyncAt?: number;
  };

  permissions: VortexPermissionsSnapshot;
  telemetry: VortexTelemetrySnapshot;

  hydrateStore: () => Promise<void>;
  persistStore: () => Promise<void>;
  setActiveScreen: (screen: VortexScreenId) => void;
  setDrawerOpen: (open: boolean) => void;
  setPlusSheetOpen: (open: boolean) => void;
  openCodeCanvas: (payload: CodeCanvasPayload) => void;
  closeCodeCanvas: () => void;

  setPromptMode: (mode: VortexPromptMode) => void;
  addPendingAttachment: (att: VortexAttachment) => void;
  removePendingAttachment: (id: string) => void;
  clearPendingAttachments: () => void;
  setIsGenerating: (val: boolean) => void;

  createNewSession: (title?: string, notebookId?: string) => string;
  switchSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  togglePinSession: (sessionId: string) => void;
  renameSession: (sessionId: string, newTitle: string) => void;
  branchFromMessage: (messageId: string) => string | null;
  appendMessage: (sessionId: string, msg: VortexMessage) => void;
  updateMessageContent: (sessionId: string, messageId: string, content: string, extra?: Partial<VortexMessage>) => void;

  addGeminiApiKey: (rawKey: string, label?: string) => Promise<boolean>;
  removeGeminiApiKey: (id: string) => Promise<void>;
  getRawGeminiKeys: () => Promise<string[]>;
  markGeminiKeyStatus: (maskedPrefix: string, status: ApiKeyEntry['status'], cooldownMs?: number) => void;

  addElevenLabsApiKey: (rawKey: string, label?: string) => Promise<boolean>;
  removeElevenLabsApiKey: (id: string) => Promise<void>;
  getRawElevenLabsKeys: () => Promise<string[]>;
  markElevenLabsKeyStatus: (maskedPrefix: string, status: ApiKeyEntry['status'], cooldownMs?: number) => void;
  setElevenLabsVoiceId: (voiceId: string) => void;
  setVoiceLanguage: (lang: 'hi-IN' | 'en-IN' | 'ur-IN') => void;

  setLocalModelConfig: (cfg: {
    path?: string;
    name?: string;
    sizeMb?: number;
    loaded?: boolean;
    preferOffline?: boolean;
    threads?: number;
    contextSize?: number;
  }) => void;
  setWakewordConfig: (cfg: {
    enabled?: boolean;
    engine?: 'offline_vad_kws' | 'picovoice_ppn';
    phrase?: string;
    ppnPath?: string;
    zeroBeepMute?: boolean;
  }) => void;

  updateOrbSettings: (cfg: {
    enabled?: boolean;
    opacity?: number;
    accentKey?: VortexAccentKey;
    stealthMode?: boolean;
    autoStartBoot?: boolean;
  }) => Promise<void>;
  setFontConfig: (preset: VortexFontPreset, scale: VortexFontScale) => void;
  saveAppLockPin: (pin: string) => Promise<boolean>;
  setAutoUnlockAppLock: (enabled: boolean) => void;

  upsertMacro: (macro: VortexMacroItem) => Promise<void>;
  toggleMacro: (id: string) => Promise<void>;
  deleteMacro: (id: string) => Promise<void>;

  startGhostLoop: (goal: string, maxSteps?: number) => void;
  updateGhostLoop: (patch: Partial<VortexState['ghostLoop']>) => void;
  appendGhostLog: (log: GhostStepLog) => void;
  resolveSafetyAction: (approved: boolean) => void;
  haltGhostLoop: (reason?: string) => void;

  setWorkflowRecording: (recording: boolean) => void;
  addRecordedStep: (step: WorkflowRecordedStep) => void;
  saveDraftWorkflow: (name: string, triggerPhrase: string) => void;
  deleteWorkflow: (id: string) => void;

  upsertNotebook: (nb: VortexNotebook) => void;
  setActiveNotebook: (id: string | null) => void;

  updatePcSync: (patch: Partial<VortexState['pcSync']>) => void;
  savePcSyncToken: (token: string) => Promise<boolean>;
  refreshNativeDiagnostics: () => Promise<void>;
}

function maskSecretKey(raw: string): string {
  const clean = raw.trim();
  if (clean.length <= 8) return '****';
  return `${clean.slice(0, 6)}...${clean.slice(-4)}`;
}

function createDefaultSession(): VortexChatSession {
  const now = Date.now();
  return {
    id: `session_${now}`,
    title: 'VORTEX Autonomous Core',
    createdAt: now,
    updatedAt: now,
    pinned: true,
    messages: [],
  };
}

const DEFAULT_NOTEBOOKS: VortexNotebook[] = [
  {
    id: 'nb_ds_c',
    subject: 'Data Structures & C++',
    semester: 'SBTET CSE 3rd Sem',
    code: 'CS-303',
    notes: 'Linked Lists, Stacks, Queues, Binary Search Trees, Sorting & Searching algorithms.',
    updatedAt: Date.now(),
  },
  {
    id: 'nb_cn_coa',
    subject: 'Computer Networks & COA',
    semester: 'SBTET CSE 3rd Sem',
    code: 'CS-304',
    notes: 'OSI 7 Layers, TCP/IP, Subnetting, Pipelining, Cache Mapping, ALU Architecture.',
    updatedAt: Date.now(),
  },
];

const initialSession = createDefaultSession();

export const useVortexStore = create<VortexState>((set, get) => ({
  hydrated: false,
  activeScreen: 'chat',
  isDrawerOpen: false,
  isPlusSheetOpen: false,
  canvasPayload: null,

  sessions: [initialSession],
  activeSessionId: initialSession.id,
  activePromptMode: 'auto',
  pendingAttachments: [],
  isGenerating: false,

  geminiKeyPool: [],
  elevenLabsKeyPool: [],
  elevenLabsVoiceId: 'N2lEZeeBudC5cNxqDtxf',
  voiceLanguage: 'hi-IN',

  localModelPath: '',
  localModelName: 'Qwen2.5-Coder-1.5B-Instruct-Q4_K_M.gguf',
  localModelSizeMb: 0,
  localModelLoaded: false,
  preferOfflineBrain: false,
  localThreads: 4,
  localContextSize: 1024,

  wakewordEnabled: true,
  wakewordEngine: 'offline_vad_kws',
  wakewordPhrase: 'Hey Vortex',
  ppnModelPath: '',
  zeroBeepMute: true,

  orbEnabled: false,
  orbOpacity: 0.4,
  orbAccentKey: 'sky',
  orbStealthMode: false,
  orbAutoStartBoot: true,
  autoUnlockAppLock: true,
  hasAppLockPin: false,

  fontPreset: 'aero',
  fontScale: 'standard',

  macros: [],
  workflows: [],
  isRecordingWorkflow: false,
  recordedDraftSteps: [],

  ghostLoop: {
    status: 'idle',
    goal: '',
    currentStep: 0,
    maxSteps: 12,
    logs: [],
    pendingSafety: null,
  },

  notebooks: DEFAULT_NOTEBOOKS,
  activeNotebookId: null,

  pcSync: {
    host: 'vortex.local',
    port: 8765,
    status: 'standby_offline',
    pendingQueueCount: 0,
  },

  permissions: {
    overlay: false,
    accessibility: false,
    notificationListener: false,
    exactAlarm: false,
    batteryIgnored: false,
    orbRunning: false,
  },

  telemetry: {
    freeRamMb: 1850,
    totalRamMb: 4096,
    isLowMemory: false,
    freeStorageGb: 24,
    totalStorageGb: 64,
    batteryPercent: 80,
    isCharging: false,
    thermalStatus: 0,
  },

  hydrateStore: async () => {
    try {
      const rawState = await AsyncStorage.getItem(STORAGE_STATE_KEY);
      if (rawState) {
        const parsed = JSON.parse(rawState);
        const validSessions =
          Array.isArray(parsed.sessions) && parsed.sessions.length > 0
            ? parsed.sessions
            : [createDefaultSession()];
        const activeId = validSessions.some((s: VortexChatSession) => s.id === parsed.activeSessionId)
          ? parsed.activeSessionId
          : validSessions[0].id;

        set({
          sessions: validSessions,
          activeSessionId: activeId,
          geminiKeyPool: Array.isArray(parsed.geminiKeyPool) ? parsed.geminiKeyPool : [],
          elevenLabsKeyPool: Array.isArray(parsed.elevenLabsKeyPool) ? parsed.elevenLabsKeyPool : [],
          elevenLabsVoiceId: parsed.elevenLabsVoiceId || 'N2lEZeeBudC5cNxqDtxf',
          voiceLanguage: parsed.voiceLanguage || 'hi-IN',
          localModelPath: parsed.localModelPath || '',
          localModelName: parsed.localModelName || 'Qwen2.5-Coder-1.5B-Instruct-Q4_K_M.gguf',
          localModelSizeMb: Number(parsed.localModelSizeMb) || 0,
          preferOfflineBrain: Boolean(parsed.preferOfflineBrain),
          localThreads: Number(parsed.localThreads) || 4,
          localContextSize: Number(parsed.localContextSize) || 1024,
          wakewordEnabled: parsed.wakewordEnabled !== false,
          wakewordEngine: parsed.wakewordEngine === 'picovoice_ppn' ? 'picovoice_ppn' : 'offline_vad_kws',
          wakewordPhrase: parsed.wakewordPhrase || 'Hey Vortex',
          ppnModelPath: parsed.ppnModelPath || '',
          zeroBeepMute: parsed.zeroBeepMute !== false,
          orbEnabled: Boolean(parsed.orbEnabled),
          orbOpacity: typeof parsed.orbOpacity === 'number' ? parsed.orbOpacity : 0.4,
          orbAccentKey: parsed.orbAccentKey && VORTEX_ACCENTS[parsed.orbAccentKey as VortexAccentKey]
            ? parsed.orbAccentKey
            : 'sky',
          orbStealthMode: Boolean(parsed.orbStealthMode),
          orbAutoStartBoot: parsed.orbAutoStartBoot !== false,
          autoUnlockAppLock: parsed.autoUnlockAppLock !== false,
          fontPreset:
            parsed.fontPreset && VORTEX_FONTS[parsed.fontPreset as VortexFontPreset]
              ? parsed.fontPreset
              : 'aero',
          fontScale: parsed.fontScale || 'standard',
          macros: Array.isArray(parsed.macros) ? parsed.macros : [],
          workflows: Array.isArray(parsed.workflows) ? parsed.workflows : [],
          notebooks: Array.isArray(parsed.notebooks) && parsed.notebooks.length > 0
            ? parsed.notebooks
            : DEFAULT_NOTEBOOKS,
          pcSync: parsed.pcSync
            ? { ...get().pcSync, ...parsed.pcSync, status: 'standby_offline' }
            : get().pcSync,
        });
      }

      if (VortexBridge?.getSecureVaultItem) {
        const storedPin = await VortexBridge.getSecureVaultItem(VAULT_APPLOCK_PIN);
        set({ hasAppLockPin: Boolean(storedPin && storedPin.length >= 4) });
      }
    } catch (_e) {
    } finally {
      set({ hydrated: true });
      await get().refreshNativeDiagnostics();
    }
  },

  persistStore: async () => {
    try {
      const s = get();
      const trimmedSessions = s.sessions.slice(0, 40).map((sess) => ({
        ...sess,
        messages: sess.messages.slice(-80).map((m) => ({
          ...m,
          attachments: m.attachments?.map((a) => ({
            id: a.id,
            type: a.type,
            name: a.name,
            uri: a.uri,
          })),
        })),
      }));

      const snapshot = {
        sessions: trimmedSessions,
        activeSessionId: s.activeSessionId,
        geminiKeyPool: s.geminiKeyPool,
        elevenLabsKeyPool: s.elevenLabsKeyPool,
        elevenLabsVoiceId: s.elevenLabsVoiceId,
        voiceLanguage: s.voiceLanguage,
        localModelPath: s.localModelPath,
        localModelName: s.localModelName,
        localModelSizeMb: s.localModelSizeMb,
        preferOfflineBrain: s.preferOfflineBrain,
        localThreads: s.localThreads,
        localContextSize: s.localContextSize,
        wakewordEnabled: s.wakewordEnabled,
        wakewordEngine: s.wakewordEngine,
        wakewordPhrase: s.wakewordPhrase,
        ppnModelPath: s.ppnModelPath,
        zeroBeepMute: s.zeroBeepMute,
        orbEnabled: s.orbEnabled,
        orbOpacity: s.orbOpacity,
        orbAccentKey: s.orbAccentKey,
        orbStealthMode: s.orbStealthMode,
        orbAutoStartBoot: s.orbAutoStartBoot,
        autoUnlockAppLock: s.autoUnlockAppLock,
        fontPreset: s.fontPreset,
        fontScale: s.fontScale,
        macros: s.macros,
        workflows: s.workflows,
        notebooks: s.notebooks,
        pcSync: s.pcSync,
      };
      await AsyncStorage.setItem(STORAGE_STATE_KEY, JSON.stringify(snapshot));
    } catch (_e) {
    }
  },

  setActiveScreen: (screen) => set({ activeScreen: screen, isDrawerOpen: false, isPlusSheetOpen: false }),
  setDrawerOpen: (open) => set({ isDrawerOpen: open, isPlusSheetOpen: false }),
  setPlusSheetOpen: (open) => set({ isPlusSheetOpen: open }),
  openCodeCanvas: (payload) => set({ canvasPayload: payload, activeScreen: 'code_canvas' }),
  closeCodeCanvas: () => set({ canvasPayload: null, activeScreen: 'chat' }),

  setPromptMode: (mode) => set({ activePromptMode: mode }),
  addPendingAttachment: (att) =>
    set((state) => ({
      pendingAttachments: [...state.pendingAttachments.slice(-4), att],
    })),
  removePendingAttachment: (id) =>
    set((state) => ({
      pendingAttachments: state.pendingAttachments.filter((a) => a.id !== id),
    })),
  clearPendingAttachments: () => set({ pendingAttachments: [] }),
  setIsGenerating: (val) => set({ isGenerating: val }),

  createNewSession: (title, notebookId) => {
    const now = Date.now();
    const id = `session_${now}_${Math.floor(Math.random() * 1000)}`;
    const newSess: VortexChatSession = {
      id,
      title: title?.trim() || 'New Autonomous Session',
      createdAt: now,
      updatedAt: now,
      pinned: false,
      notebookId,
      messages: [],
    };
    set((state) => ({
      sessions: [newSess, ...state.sessions],
      activeSessionId: id,
      activeScreen: 'chat',
      isDrawerOpen: false,
    }));
    void get().persistStore();
    return id;
  },

  switchSession: (sessionId) => {
    set({ activeSessionId: sessionId, activeScreen: 'chat', isDrawerOpen: false });
    void get().persistStore();
  },

  deleteSession: (sessionId) => {
    set((state) => {
      const remaining = state.sessions.filter((s) => s.id !== sessionId);
      const safeList = remaining.length > 0 ? remaining : [createDefaultSession()];
      const nextActive =
        state.activeSessionId === sessionId ? safeList[0].id : state.activeSessionId;
      return {
        sessions: safeList,
        activeSessionId: nextActive,
      };
    });
    void get().persistStore();
  },

  togglePinSession: (sessionId) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, pinned: !s.pinned } : s
      ),
    }));
    void get().persistStore();
  },

  renameSession: (sessionId, newTitle) => {
    const clean = newTitle.trim();
    if (!clean) return;
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, title: clean, updatedAt: Date.now() } : s
      ),
    }));
    void get().persistStore();
  },

  branchFromMessage: (messageId) => {
    const state = get();
    const current = state.sessions.find((s) => s.id === state.activeSessionId);
    if (!current) return null;
    const msgIdx = current.messages.findIndex((m) => m.id === messageId);
    if (msgIdx < 0) return null;

    const now = Date.now();
    const branchId = `branch_${now}`;
    const slicedMessages = current.messages.slice(0, msgIdx + 1);
    const branchedSession: VortexChatSession = {
      id: branchId,
      title: `Branch: ${current.title.slice(0, 24)}`,
      createdAt: now,
      updatedAt: now,
      pinned: false,
      branchParentId: current.id,
      branchRootMessageId: messageId,
      notebookId: current.notebookId,
      messages: slicedMessages,
    };

    set({
      sessions: [branchedSession, ...state.sessions],
      activeSessionId: branchId,
      activeScreen: 'chat',
    });
    void get().persistStore();
    return branchId;
  },

  appendMessage: (sessionId, msg) => {
    set((state) => ({
      sessions: state.sessions.map((s) => {
        if (s.id !== sessionId) return s;
        const autoTitle =
          s.messages.length === 0 && msg.role === 'user'
            ? msg.content.trim().slice(0, 34) || s.title
            : s.title;
        return {
          ...s,
          title: autoTitle,
          updatedAt: Date.now(),
          messages: [...s.messages, msg],
        };
      }),
    }));
    void get().persistStore();
  },

  updateMessageContent: (sessionId, messageId, content, extra) => {
    set((state) => ({
      sessions: state.sessions.map((s) => {
        if (s.id !== sessionId) return s;
        return {
          ...s,
          updatedAt: Date.now(),
          messages: s.messages.map((m) =>
            m.id === messageId ? { ...m, content, ...(extra || {}) } : m
          ),
        };
      }),
    }));
  },

  addGeminiApiKey: async (rawKey, label) => {
    const clean = rawKey.trim();
    if (clean.length < 16) return false;
    try {
      const existingRaw = await get().getRawGeminiKeys();
      if (existingRaw.includes(clean)) return true;

      const updatedRaw = [...existingRaw, clean];
      if (VortexBridge?.saveSecureVaultItem) {
        await VortexBridge.saveSecureVaultItem(VAULT_GEMINI_KEYS, JSON.stringify(updatedRaw));
      }

      const entry: ApiKeyEntry = {
        id: `gem_${Date.now()}_${Math.floor(Math.random() * 999)}`,
        label: label?.trim() || `Gemini Node #${updatedRaw.length}`,
        maskedKey: maskSecretKey(clean),
        status: 'active',
        cooldownUntil: 0,
        usageCount: 0,
      };
      set((state) => ({ geminiKeyPool: [...state.geminiKeyPool, entry] }));
      await get().persistStore();
      return true;
    } catch (_e) {
      return false;
    }
  },

  removeGeminiApiKey: async (id) => {
    const state = get();
    const targetIdx = state.geminiKeyPool.findIndex((k) => k.id === id);
    if (targetIdx < 0) return;

    const rawList = await get().getRawGeminiKeys();
    const nextRaw =
      rawList.length === state.geminiKeyPool.length
        ? rawList.filter((_, idx) => idx !== targetIdx)
        : rawList.filter(
            (rawKey) => maskSecretKey(rawKey) !== state.geminiKeyPool[targetIdx].maskedKey
          );

    if (VortexBridge?.saveSecureVaultItem) {
      await VortexBridge.saveSecureVaultItem(VAULT_GEMINI_KEYS, JSON.stringify(nextRaw));
    }
    set({
      geminiKeyPool: state.geminiKeyPool.filter((k) => k.id !== id),
    });
    await get().persistStore();
  },


  getRawGeminiKeys: async () => {
    try {
      if (!VortexBridge?.getSecureVaultItem) return [];
      const rawJson = await VortexBridge.getSecureVaultItem(VAULT_GEMINI_KEYS);
      if (!rawJson) return [];
      const arr = JSON.parse(rawJson);
      return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string' && x.length > 10) : [];
    } catch (_e) {
      return [];
    }
  },

  markGeminiKeyStatus: (maskedPrefix, status, cooldownMs = 60000) => {
    set((state) => ({
      geminiKeyPool: state.geminiKeyPool.map((k) =>
        k.maskedKey === maskedPrefix
          ? {
              ...k,
              status,
              cooldownUntil: status === 'rate_limited' ? Date.now() + cooldownMs : 0,
              usageCount: status === 'active' ? k.usageCount + 1 : k.usageCount,
            }
          : k
      ),
    }));
  },

  addElevenLabsApiKey: async (rawKey, label) => {
    const clean = rawKey.trim();
    if (clean.length < 16) return false;
    try {
      const existingRaw = await get().getRawElevenLabsKeys();
      if (existingRaw.includes(clean)) return true;

      const updatedRaw = [...existingRaw, clean];
      if (VortexBridge?.saveSecureVaultItem) {
        await VortexBridge.saveSecureVaultItem(VAULT_ELEVEN_KEYS, JSON.stringify(updatedRaw));
      }

      const entry: ApiKeyEntry = {
        id: `el_${Date.now()}_${Math.floor(Math.random() * 999)}`,
        label: label?.trim() || `ElevenLabs Voice #${updatedRaw.length}`,
        maskedKey: maskSecretKey(clean),
        status: 'active',
        cooldownUntil: 0,
        usageCount: 0,
      };
      set((state) => ({ elevenLabsKeyPool: [...state.elevenLabsKeyPool, entry] }));
      await get().persistStore();
      return true;
    } catch (_e) {
      return false;
    }
  },

  removeElevenLabsApiKey: async (id) => {
    const state = get();
    const targetIdx = state.elevenLabsKeyPool.findIndex((k) => k.id === id);
    if (targetIdx < 0) return;

    const rawList = await get().getRawElevenLabsKeys();
    const nextRaw =
      rawList.length === state.elevenLabsKeyPool.length
        ? rawList.filter((_, idx) => idx !== targetIdx)
        : rawList.filter(
            (rawKey) => maskSecretKey(rawKey) !== state.elevenLabsKeyPool[targetIdx].maskedKey
          );

    if (VortexBridge?.saveSecureVaultItem) {
      await VortexBridge.saveSecureVaultItem(VAULT_ELEVEN_KEYS, JSON.stringify(nextRaw));
    }
    set({
      elevenLabsKeyPool: state.elevenLabsKeyPool.filter((k) => k.id !== id),
    });
    await get().persistStore();
  },


  getRawElevenLabsKeys: async () => {
    try {
      if (!VortexBridge?.getSecureVaultItem) return [];
      const rawJson = await VortexBridge.getSecureVaultItem(VAULT_ELEVEN_KEYS);
      if (!rawJson) return [];
      const arr = JSON.parse(rawJson);
      return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string' && x.length > 10) : [];
    } catch (_e) {
      return [];
    }
  },

  markElevenLabsKeyStatus: (maskedPrefix, status, cooldownMs = 60000) => {
    set((state) => ({
      elevenLabsKeyPool: state.elevenLabsKeyPool.map((k) =>
        k.maskedKey === maskedPrefix
          ? {
              ...k,
              status,
              cooldownUntil: status === 'rate_limited' ? Date.now() + cooldownMs : 0,
              usageCount: status === 'active' ? k.usageCount + 1 : k.usageCount,
            }
          : k
      ),
    }));
  },

  setElevenLabsVoiceId: (voiceId) => {
    set({ elevenLabsVoiceId: voiceId.trim() || 'N2lEZeeBudC5cNxqDtxf' });
    void get().persistStore();
  },

  setVoiceLanguage: (lang) => {
    set({ voiceLanguage: lang });
    void get().persistStore();
  },

  setLocalModelConfig: (cfg) => {
    set((state) => ({
      localModelPath: cfg.path !== undefined ? cfg.path : state.localModelPath,
      localModelName: cfg.name !== undefined ? cfg.name : state.localModelName,
      localModelSizeMb: cfg.sizeMb !== undefined ? cfg.sizeMb : state.localModelSizeMb,
      localModelLoaded: cfg.loaded !== undefined ? cfg.loaded : state.localModelLoaded,
      preferOfflineBrain: cfg.preferOffline !== undefined ? cfg.preferOffline : state.preferOfflineBrain,
      localThreads: cfg.threads !== undefined ? Math.min(8, Math.max(1, cfg.threads)) : state.localThreads,
      localContextSize:
        cfg.contextSize !== undefined ? Math.min(2048, Math.max(512, cfg.contextSize)) : state.localContextSize,
    }));
    void get().persistStore();
  },

  setWakewordConfig: (cfg) => {
    set((state) => ({
      wakewordEnabled: cfg.enabled !== undefined ? cfg.enabled : state.wakewordEnabled,
      wakewordEngine: cfg.engine !== undefined ? cfg.engine : state.wakewordEngine,
      wakewordPhrase: cfg.phrase !== undefined ? cfg.phrase : state.wakewordPhrase,
      ppnModelPath: cfg.ppnPath !== undefined ? cfg.ppnPath : state.ppnModelPath,
      zeroBeepMute: cfg.zeroBeepMute !== undefined ? cfg.zeroBeepMute : state.zeroBeepMute,
    }));
    void get().persistStore();
  },

  updateOrbSettings: async (cfg) => {
    const prev = get();
    const nextEnabled = cfg.enabled !== undefined ? cfg.enabled : prev.orbEnabled;
    const nextOpacity =
      cfg.opacity !== undefined ? Math.min(1.0, Math.max(0.15, cfg.opacity)) : prev.orbOpacity;
    const nextAccent = cfg.accentKey !== undefined ? cfg.accentKey : prev.orbAccentKey;
    const nextStealth = cfg.stealthMode !== undefined ? cfg.stealthMode : prev.orbStealthMode;
    const nextBoot = cfg.autoStartBoot !== undefined ? cfg.autoStartBoot : prev.orbAutoStartBoot;

    set({
      orbEnabled: nextEnabled,
      orbOpacity: nextOpacity,
      orbAccentKey: nextAccent,
      orbStealthMode: nextStealth,
      orbAutoStartBoot: nextBoot,
    });

    const hex = sanitizeHexColor(VORTEX_ACCENTS[nextAccent]?.primary, '#38BDF8');
    try {
      if (VortexBridge) {
        if (nextEnabled) {
          if (prev.permissions.orbRunning) {
            await VortexBridge.updateFloatingOrb(nextOpacity, hex, nextStealth);
          } else {
            await VortexBridge.startFloatingOrb(nextOpacity, hex, nextStealth);
          }
        } else {
          await VortexBridge.stopFloatingOrb();
        }
      }
    } catch (_e) {
    }

    await get().persistStore();
    await get().refreshNativeDiagnostics();
  },

  setFontConfig: (preset, scale) => {
    set({ fontPreset: preset, fontScale: scale });
    void get().persistStore();
  },

  saveAppLockPin: async (pin) => {
    const clean = pin.replace(/[^0-9]/g, '');
    if (clean.length < 4 || clean.length > 8) return false;
    try {
      if (VortexBridge?.saveSecureVaultItem) {
        await VortexBridge.saveSecureVaultItem(VAULT_APPLOCK_PIN, clean);
        set({ hasAppLockPin: true });
        return true;
      }
      return false;
    } catch (_e) {
      return false;
    }
  },

  setAutoUnlockAppLock: (enabled) => {
    set({ autoUnlockAppLock: enabled });
    void get().persistStore();
  },

  upsertMacro: async (macro) => {
    set((state) => {
      const exists = state.macros.some((m) => m.id === macro.id);
      const nextList = exists
        ? state.macros.map((m) => (m.id === macro.id ? macro : m))
        : [macro, ...state.macros];
      return { macros: nextList };
    });

    try {
      if (VortexBridge) {
        if (macro.enabled) {
          const payload = JSON.stringify({
            command: macro.command,
            label: macro.title,
            ringAlarm: macro.ringAlarm,
          });
          await VortexBridge.scheduleMacroAlarm(
            macro.id,
            macro.hour,
            macro.minute,
            macro.daysMask,
            payload
          );
        } else {
          await VortexBridge.cancelMacroAlarm(macro.id);
        }
      }
    } catch (_e) {
    }
    await get().persistStore();
  },

  toggleMacro: async (id) => {
    const target = get().macros.find((m) => m.id === id);
    if (!target) return;
    await get().upsertMacro({ ...target, enabled: !target.enabled });
  },

  deleteMacro: async (id) => {
    set((state) => ({
      macros: state.macros.filter((m) => m.id !== id),
    }));
    try {
      if (VortexBridge?.cancelMacroAlarm) {
        await VortexBridge.cancelMacroAlarm(id);
      }
    } catch (_e) {
    }
    await get().persistStore();
  },

  startGhostLoop: (goal, maxSteps = 12) => {
    set({
      activeScreen: 'ghost_loop',
      ghostLoop: {
        status: 'observing',
        goal: goal.trim(),
        currentStep: 1,
        maxSteps: Math.min(25, Math.max(1, maxSteps)),
        logs: [],
        pendingSafety: null,
      },
    });
  },

  updateGhostLoop: (patch) => {
    set((state) => ({
      ghostLoop: { ...state.ghostLoop, ...patch },
    }));
  },

  appendGhostLog: (log) => {
    set((state) => ({
      ghostLoop: {
        ...state.ghostLoop,
        logs: [...state.ghostLoop.logs.slice(-39), log],
      },
    }));
  },

  resolveSafetyAction: (approved) => {
    set((state) => ({
      ghostLoop: {
        ...state.ghostLoop,
        status: approved ? 'acting' : 'halted',
        pendingSafety: null,
      },
    }));
  },

  haltGhostLoop: (reason) => {
    set((state) => ({
      ghostLoop: {
        ...state.ghostLoop,
        status: 'halted',
        pendingSafety: null,
        logs: reason
          ? [
              ...state.ghostLoop.logs,
              {
                id: `halt_${Date.now()}`,
                step: state.ghostLoop.currentStep,
                phase: 'safety_pause',
                summary: reason,
                timestamp: Date.now(),
                success: false,
              },
            ]
          : state.ghostLoop.logs,
      },
    }));
  },

  setWorkflowRecording: (recording) => {
    set({
      isRecordingWorkflow: recording,
      recordedDraftSteps: recording ? [] : get().recordedDraftSteps,
    });
  },

  addRecordedStep: (step) => {
    set((state) => ({
      recordedDraftSteps: [...state.recordedDraftSteps, step],
    }));
  },

  saveDraftWorkflow: (name, triggerPhrase) => {
    const steps = get().recordedDraftSteps;
    if (steps.length === 0) return;
    const wf: VortexWorkflow = {
      id: `wf_${Date.now()}`,
      name: name.trim() || 'Recorded Ghost Macro',
      triggerPhrase: triggerPhrase.trim().toLowerCase(),
      steps,
      successCount: 0,
    };
    set((state) => ({
      workflows: [wf, ...state.workflows],
      isRecordingWorkflow: false,
      recordedDraftSteps: [],
    }));
    void get().persistStore();
  },

  deleteWorkflow: (id) => {
    set((state) => ({
      workflows: state.workflows.filter((w) => w.id !== id),
    }));
    void get().persistStore();
  },

  upsertNotebook: (nb) => {
    set((state) => {
      const exists = state.notebooks.some((n) => n.id === nb.id);
      const next = exists
        ? state.notebooks.map((n) => (n.id === nb.id ? nb : n))
        : [nb, ...state.notebooks];
      return { notebooks: next };
    });
    void get().persistStore();
  },

  setActiveNotebook: (id) => {
    set({ activeNotebookId: id });
    void get().persistStore();
  },   

  updatePcSync: (patch) => {
    set((state) => ({
      pcSync: { ...state.pcSync, ...patch },
    }));
  },

  savePcSyncToken: async (token) => {
    const clean = token.trim();
    if (clean.length < 8) return false;
    try {
      if (VortexBridge?.saveSecureVaultItem) {
        await VortexBridge.saveSecureVaultItem(VAULT_PC_TOKEN, clean);
        return true;
      }
      return false;
    } catch (_e) {
      return false;
    }
  },

  refreshNativeDiagnostics: async () => {
    try {
      if (!VortexBridge) return;
      const [perms, tel] = await Promise.all([
        VortexBridge.checkPermissionsStatus(),
        VortexBridge.getSystemTelemetry(),
      ]);
      set({
        permissions: perms,
        telemetry: tel,
        orbEnabled: Boolean(perms?.orbRunning),
      });
    } catch (_e) {
    }
  },
}));
