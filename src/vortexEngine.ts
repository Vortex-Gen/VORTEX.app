import * as SQLite from 'expo-sqlite';
import * as Speech from 'expo-speech';
import * as FileSystem from 'expo-file-system';
import * as Battery from 'expo-battery';
import * as Brightness from 'expo-brightness';
import * as Contacts from 'expo-contacts';
import * as SMS from 'expo-sms';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Haptics from 'expo-haptics';
import Clipboard from '@react-native-clipboard/clipboard';
import { Audio } from 'expo-av';
import { Linking, NativeModules, PermissionsAndroid, Platform } from 'react-native';

export type ProviderType = 'gemini' | 'elevenlabs';
export type VortexModeType = 'autopilot' | 'architect' | 'offline';
export type VoiceModeType = 'hybrid' | 'elevenlabs' | 'offline';
export type VoiceProfileType = 'brian' | 'callum' | 'george';

export interface ProjectItem {
  id: string;
  name: string;
  description: string;
}

export interface MemoryMessage {
  id?: number;
  role: 'user' | 'model' | 'system';
  content: string;
  timestamp: number;
}

export interface KeyStats {
  id: number;
  provider: ProviderType;
  masked: string;
  status: string;
  usage_count: number;
}

export interface MacroStep {
  action:
    | 'open_app'
    | 'wait'
    | 'tap_text'
    | 'swipe'
    | 'type_text'
    | 'brightness'
    | 'speak'
    | 'back';
  target?: string;
  value?: number;
  text?: string;
}

export interface VortexMacro {
  id: string;
  name: string;
  phrase: string;
  steps: MacroStep[];
}

export interface NativeServiceStatus {
  overlayGranted: boolean;
  orbRunning: boolean;
  accessibilityEnabled: boolean;
  notificationListenerEnabled: boolean;
  activePackage: string;
  lastNotification: string;
}

const VOICE_IDS: Record<VoiceProfileType, string> = {
  brian: 'nPczCjzI2devNBz1zQrb',
  callum: 'N2lVS1w4EtoT3dr4eOWO',
  george: 'JBFqnCBsd6RMkjVDRZzb',
};

const DEFAULT_MACROS: VortexMacro[] = [
  {
    id: 'macro-snap-streak',
    name: 'Snap Streak Flow',
    phrase: 'snap streak bhejo',
    steps: [
      { action: 'open_app', target: 'snapchat' },
      { action: 'wait', value: 2500 },
      { action: 'speak', text: 'Snapchat open hai bro, streak capture aur send complete karo.' },
    ],
  },
  {
    id: 'macro-reels-next',
    name: 'Reels Next Swipe',
    phrase: 'agla reel',
    steps: [
      { action: 'swipe', target: 'up' },
      { action: 'speak', text: 'Next reel.' },
    ],
  },
  {
    id: 'macro-stealth',
    name: 'Night Stealth',
    phrase: 'stealth mode',
    steps: [
      { action: 'brightness', value: 12 },
      { action: 'speak', text: 'Night stealth active, brightness 12 percent.' },
    ],
  },
];

let db: SQLite.SQLiteDatabase | null = null;
let currentSound: Audio.Sound | null = null;

const VortexBridge = Platform.OS === 'android' ? NativeModules.VortexBridge : null;

export async function initVortexDB(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync('vortex_beta_os.db');
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      api_key TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'active',
      cooldown_until INTEGER NOT NULL DEFAULT 0,
      usage_count INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);

  const existingProj = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM projects WHERE id = ?',
    ['vortex-core']
  );
  if (!existingProj) {
    await db.runAsync(
      'INSERT INTO projects (id, name, description, created_at) VALUES (?, ?, ?, ?)',
      ['vortex-core', 'Vortex ẞ Core', 'Autonomous Mobile OS & Automation', Date.now()]
    );
  }

  const existingMacros = await getSetting('macros_json', '');
  if (!existingMacros) {
    await setSetting('macros_json', JSON.stringify(DEFAULT_MACROS));
  }

  return db;
}

export async function getSetting(key: string, fallback = ''): Promise<string> {
  const database = await initVortexDB();
  const row = await database.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    [key]
  );
  return row ? row.value : fallback;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const database = await initVortexDB();
  await database.runAsync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    [key, value]
  );
}

// --- PROJECT ISOLATED MEMORY ---
export async function getProjects(): Promise<ProjectItem[]> {
  const database = await initVortexDB();
  return database.getAllAsync<ProjectItem>(
    'SELECT id, name, description FROM projects ORDER BY created_at ASC'
  );
}

export async function createProject(name: string, description = ''): Promise<ProjectItem> {
  const database = await initVortexDB();
  const id = 'proj-' + Date.now();
  await database.runAsync(
    'INSERT INTO projects (id, name, description, created_at) VALUES (?, ?, ?, ?)',
    [id, name.trim(), description.trim(), Date.now()]
  );
  return { id, name: name.trim(), description: description.trim() };
}

export async function addMemory(
  projectId: string,
  role: 'user' | 'model' | 'system',
  content: string
): Promise<void> {
  const database = await initVortexDB();
  await database.runAsync(
    'INSERT INTO memories (project_id, role, content, timestamp) VALUES (?, ?, ?, ?)',
    [projectId, role, content, Date.now()]
  );
}

export async function getMemories(projectId: string, limit = 30): Promise<MemoryMessage[]> {
  const database = await initVortexDB();
  const rows = await database.getAllAsync<MemoryMessage>(
    'SELECT id, role, content, timestamp FROM memories WHERE project_id = ? ORDER BY timestamp DESC LIMIT ?',
    [projectId, limit]
  );
  return rows.reverse();
}

// --- MACROS ---
export async function getMacros(): Promise<VortexMacro[]> {
  const raw = await getSetting('macros_json', '');
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {}
  return DEFAULT_MACROS;
}

export async function saveMacro(macro: VortexMacro): Promise<VortexMacro[]> {
  const current = await getMacros();
  const filtered = current.filter((m) => m.id !== macro.id);
  const updated = [macro, ...filtered];
  await setSetting('macros_json', JSON.stringify(updated));
  return updated;
}

export async function deleteMacro(id: string): Promise<VortexMacro[]> {
  const current = await getMacros();
  const updated = current.filter((m) => m.id !== id);
  await setSetting('macros_json', JSON.stringify(updated));
  return updated;
}

// --- BACKUP & RESTORE (JSON) ---
export async function exportVaultAndMacrosBackup(): Promise<string> {
  const database = await initVortexDB();
  const keysRows = await database.getAllAsync<{
    provider: ProviderType;
    api_key: string;
    usage_count: number;
  }>('SELECT provider, api_key, usage_count FROM api_keys');
  const macros = await getMacros();
  const payload = {
    app: 'Vortex ẞ',
    exportedAt: new Date().toISOString(),
    keys: keysRows,
    macros,
  };
  const jsonStr = JSON.stringify(payload, null, 2);
  Clipboard.setString(jsonStr);
  return jsonStr;
}

export async function importVaultAndMacrosBackup(rawJson: string): Promise<number> {
  const parsed = JSON.parse(rawJson);
  let importedKeys = 0;
  if (Array.isArray(parsed.keys)) {
    for (const k of parsed.keys) {
      if (k?.api_key && (k?.provider === 'gemini' || k?.provider === 'elevenlabs')) {
        importedKeys += await addBulkKeys(k.provider, String(k.api_key));
      }
    }
  }
  if (Array.isArray(parsed.macros) && parsed.macros.length > 0) {
    await setSetting('macros_json', JSON.stringify(parsed.macros));
  }
  return importedKeys;
}

// --- 20+ API KEY ROTATION VAULT ---
export async function addBulkKeys(provider: ProviderType, rawBlock: string): Promise<number> {
  const database = await initVortexDB();
  const lines = rawBlock
    .split(/[\n,\s]+/)
    .map((k) => k.trim())
    .filter((k) => k.length > 10);

  let count = 0;
  for (const key of lines) {
    const res = await database.runAsync(
      'INSERT OR IGNORE INTO api_keys (provider, api_key, status, cooldown_until, usage_count) VALUES (?, ?, ?, ?, ?)',
      [provider, key, 'active', 0, 0]
    );
    if (res.changes > 0) count++;
  }
  return count;
}

export async function getAllKeyStats(): Promise<KeyStats[]> {
  const database = await initVortexDB();
  const now = Date.now();
  await database.runAsync(
    'UPDATE api_keys SET status = ? WHERE status = ? AND cooldown_until <= ?',
    ['active', 'cooldown', now]
  );
  const rows = await database.getAllAsync<{
    id: number;
    provider: ProviderType;
    api_key: string;
    status: string;
    usage_count: number;
  }>('SELECT id, provider, api_key, status, usage_count FROM api_keys ORDER BY provider, id ASC');

  return rows.map((r) => ({
    id: r.id,
    provider: r.provider,
    masked: r.api_key.slice(0, 6) + '••••' + r.api_key.slice(-4),
    status: r.status,
    usage_count: r.usage_count,
  }));
}

async function getNextKey(provider: ProviderType): Promise<{ id: number; key: string } | null> {
  const database = await initVortexDB();
  const now = Date.now();
  await database.runAsync(
    'UPDATE api_keys SET status = ? WHERE provider = ? AND status = ? AND cooldown_until <= ?',
    ['active', provider, 'cooldown', now]
  );
  const row = await database.getFirstAsync<{ id: number; api_key: string }>(
    'SELECT id, api_key FROM api_keys WHERE provider = ? AND status = ? ORDER BY usage_count ASC, id ASC LIMIT 1',
    [provider, 'active']
  );
  if (!row) return null;
  await database.runAsync('UPDATE api_keys SET usage_count = usage_count + 1 WHERE id = ?', [row.id]);
  return { id: row.id, key: row.api_key };
}

async function cooldownKey(id: number, mins = 60): Promise<void> {
  const database = await initVortexDB();
  await database.runAsync(
    'UPDATE api_keys SET status = ?, cooldown_until = ? WHERE id = ?',
    ['cooldown', Date.now() + mins * 60 * 1000, id]
  );
}

// --- DUAL VOICE ENGINE ---
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triple = (a << 16) | (b << 8) | c;
    result +=
      chars[(triple >> 18) & 63] +
      chars[(triple >> 12) & 63] +
      (i + 1 < bytes.length ? chars[(triple >> 6) & 63] : '=') +
      (i + 2 < bytes.length ? chars[triple & 63] : '=');
  }
  return result;
}

export async function speakVortex(text: string, forceOffline = false): Promise<void> {
  const cleanText = text.replace(/\[\[ACTION:[\s\S]*?\]\]/g, '').replace(/[*#_`]/g, '').trim();
  if (!cleanText) return;

  try {
    Speech.stop();
    if (currentSound) {
      await currentSound.unloadAsync();
      currentSound = null;
    }
  } catch {}

  const voiceMode = (await getSetting('voice_mode', 'hybrid')) as VoiceModeType;
  const voiceProfile = (await getSetting('voice_profile', 'brian')) as VoiceProfileType;
  const voiceId = VOICE_IDS[voiceProfile] || VOICE_IDS.brian;
  const shortAlert = cleanText.length < 42;

  if (!forceOffline && voiceMode !== 'offline' && !(voiceMode === 'hybrid' && shortAlert)) {
    for (let i = 0; i < 4; i++) {
      const elKey = await getNextKey('elevenlabs');
      if (!elKey) break;
      try {
        const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
          method: 'POST',
          headers: {
            'xi-api-key': elKey.key,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: cleanText.slice(0, 450),
            model_id: 'eleven_multilingual_v2',
            voice_settings: { stability: 0.52, similarity_boost: 0.75 },
          }),
        });

        if (res.status === 401 || res.status === 429) {
          await cooldownKey(elKey.id, 720);
          continue;
        }

        if (res.ok) {
          const buf = await res.arrayBuffer();
          const b64 = arrayBufferToBase64(buf);
          const fileUri = `${FileSystem.cacheDirectory}vortex_beta_voice.mp3`;
          await FileSystem.writeAsStringAsync(fileUri, b64, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const { sound } = await Audio.Sound.createAsync({ uri: fileUri });
          currentSound = sound;
          await sound.playAsync();
          return;
        }
      } catch {
        break;
      }
    }
  }

  Speech.speak(cleanText, { language: 'hi-IN', pitch: 0.98, rate: 1.03 });
}

// --- NATIVE BRIDGE & OS CONTROLLER ---
export async function getNativeStatus(): Promise<NativeServiceStatus> {
  if (VortexBridge && typeof VortexBridge.getServiceStatuses === 'function') {
    try {
      return await VortexBridge.getServiceStatuses();
    } catch {}
  }
  return {
    overlayGranted: false,
    orbRunning: false,
    accessibilityEnabled: false,
    notificationListenerEnabled: false,
    activePackage: '',
    lastNotification: '',
  };
}

export async function startFloatingOrb(idleAlpha = 0.1): Promise<string> {
  if (VortexBridge && typeof VortexBridge.startFloatingOrb === 'function') {
    return await VortexBridge.startFloatingOrb(idleAlpha);
  }
  return 'bridge_unavailable';
}

export async function stopFloatingOrb(): Promise<string> {
  if (VortexBridge && typeof VortexBridge.stopFloatingOrb === 'function') {
    return await VortexBridge.stopFloatingOrb();
  }
  return 'bridge_unavailable';
}

export async function openAccessibilitySettings(): Promise<void> {
  if (VortexBridge && typeof VortexBridge.openAccessibilitySettings === 'function') {
    await VortexBridge.openAccessibilitySettings();
  } else if (Platform.OS === 'android') {
    await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.ACCESSIBILITY_SETTINGS);
  }
}

export async function openNotificationSettings(): Promise<void> {
  if (VortexBridge && typeof VortexBridge.openNotificationSettings === 'function') {
    await VortexBridge.openNotificationSettings();
  }
}

export async function requestAllCorePermissions(): Promise<void> {
  if (Platform.OS === 'android') {
    await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.CALL_PHONE,
      PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
      PermissionsAndroid.PERMISSIONS.SEND_SMS,
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    ]);
  }
  try {
    await Contacts.requestPermissionsAsync();
  } catch {}
  try {
    await Brightness.requestPermissionsAsync();
  } catch {}
}

export async function getDeviceTelemetry(): Promise<{ battery: number; freeGB: string }> {
  let battery = 100;
  let freeGB = '0.0';
  try {
    const level = await Battery.getBatteryLevelAsync();
    if (level >= 0) battery = Math.round(level * 100);
  } catch {}
  try {
    const bytes = await FileSystem.getFreeDiskStorageAsync();
    freeGB = (bytes / (1024 * 1024 * 1024)).toFixed(1);
  } catch {}
  return { battery, freeGB };
}

async function findContactNumber(nameQuery: string): Promise<{ name: string; number: string } | null> {
  const { status } = await Contacts.requestPermissionsAsync();
  if (status !== 'granted') return null;
  const { data } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
    name: nameQuery,
  });
  for (const c of data) {
    if (c.phoneNumbers && c.phoneNumbers.length > 0 && c.phoneNumbers[0].number) {
      return {
        name: c.name || nameQuery,
        number: c.phoneNumbers[0].number.replace(/[\s-]/g, ''),
      };
    }
  }
  return null;
}

export async function executeOSAction(action: {
  type: string;
  target?: string;
  message?: string;
  value?: number;
}): Promise<string> {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {}

  const type = (action.type || '').toLowerCase();
  const target = (action.target || '').trim();

  if (type === 'open_app') {
    const normalized = target.toLowerCase();
    if (normalized === 'reels') {
      try {
        await Linking.openURL('instagram://reels_home');
        return 'Opened Instagram Reels';
      } catch {}
    }

    if (VortexBridge && typeof VortexBridge.openAppByName === 'function') {
      try {
        const launched = await VortexBridge.openAppByName(target);
        if (launched) return `Opened ${launched}`;
      } catch {}
    }

    if (VortexBridge && typeof VortexBridge.tapByText === 'function') {
      try {
        const tapped = await VortexBridge.tapByText(target);
        if (tapped) return `Tapped app "${target}" on screen`;
      } catch {}
    }

    return `App "${target}" not found`;
  }

  if (type === 'call') {
    const contact = await findContactNumber(target);
    const num = contact ? contact.number : target.replace(/[^0-9+]/g, '');
    if (!num) return `Contact "${target}" nahi mila`;
    await Linking.openURL(`tel:${num}`);
    return `Calling ${contact ? contact.name : num}`;
  }

  if (type === 'sms') {
    const contact = await findContactNumber(target);
    const num = contact ? contact.number : target.replace(/[^0-9+]/g, '');
    if (!num) return `Contact "${target}" nahi mila`;
    const available = await SMS.isAvailableAsync();
    if (available) {
      await SMS.sendSMSAsync([num], action.message || '');
      return `SMS ready for ${contact ? contact.name : num}`;
    }
    await Linking.openURL(`sms:${num}?body=${encodeURIComponent(action.message || '')}`);
    return `Opened SMS for ${num}`;
  }

  if (type === 'whatsapp') {
    const contact = await findContactNumber(target);
    let num = contact ? contact.number : target.replace(/[^0-9]/g, '');
    if (num.length === 10) num = '91' + num;
    if (!num) return `WhatsApp contact "${target}" nahi mila`;
    await Linking.openURL(
      `whatsapp://send?phone=${num}&text=${encodeURIComponent(action.message || '')}`
    );
    return `WhatsApp opened for ${contact ? contact.name : num}`;
  }

  if (type === 'brightness') {
    const level = Math.max(0.05, Math.min(1, (action.value ?? 50) / 100));
    try {
      await Brightness.setSystemBrightnessAsync(level);
    } catch {
      await Brightness.setBrightnessAsync(level);
    }
    return `Brightness ${Math.round(level * 100)}%`;
  }

  if (type === 'swipe') {
    const ok = VortexBridge?.swipeScreen ? await VortexBridge.swipeScreen(target || 'up') : false;
    return ok ? `Swiped ${target || 'up'}` : 'Accessibility swipe unavailable';
  }

  if (type === 'tap_text') {
    const ok = VortexBridge?.tapByText ? await VortexBridge.tapByText(target) : false;
    return ok ? `Tapped "${target}"` : `Element "${target}" not found`;
  }

  if (type === 'type_text') {
    const ok = VortexBridge?.typeText ? await VortexBridge.typeText(action.message || target) : false;
    return ok ? 'Typed into focused field' : 'No focused input field';
  }

  if (type === 'read_screen') {
    if (VortexBridge?.readScreenText) {
      return await VortexBridge.readScreenText();
    }
    return 'Screen reader unavailable';
  }

  if (type === 'system_settings' && Platform.OS === 'android') {
    const map: Record<string, string> = {
      wifi: IntentLauncher.ActivityAction.WIFI_SETTINGS,
      bluetooth: IntentLauncher.ActivityAction.BLUETOOTH_SETTINGS,
      sound: IntentLauncher.ActivityAction.SOUND_SETTINGS,
      volume: IntentLauncher.ActivityAction.SOUND_SETTINGS,
      storage: IntentLauncher.ActivityAction.INTERNAL_STORAGE_SETTINGS,
      battery: IntentLauncher.ActivityAction.BATTERY_SAVER_SETTINGS,
      accessibility: IntentLauncher.ActivityAction.ACCESSIBILITY_SETTINGS,
    };
    const act = map[target.toLowerCase()] || IntentLauncher.ActivityAction.SETTINGS;
    await IntentLauncher.startActivityAsync(act);
    return `Opened ${target || 'System'} settings`;
  }

  return 'Action processed';
}

export async function runMacro(macro: VortexMacro): Promise<string[]> {
  const logs: string[] = [];
  for (const step of macro.steps) {
    if (step.action === 'wait') {
      const ms = Math.min(8000, Math.max(200, step.value ?? 1000));
      await new Promise((r) => setTimeout(r, ms));
      logs.push(`Waited ${ms}ms`);
    } else if (step.action === 'speak') {
      if (step.text) {
        await speakVortex(step.text, true);
        logs.push(`Spoke: ${step.text}`);
      }
    } else if (step.action === 'open_app') {
      logs.push(await executeOSAction({ type: 'open_app', target: step.target || '' }));
    } else if (step.action === 'swipe') {
      logs.push(await executeOSAction({ type: 'swipe', target: step.target || 'up' }));
    } else if (step.action === 'tap_text') {
      logs.push(await executeOSAction({ type: 'tap_text', target: step.target || '' }));
    } else if (step.action === 'type_text') {
      logs.push(await executeOSAction({ type: 'type_text', message: step.text || '' }));
    } else if (step.action === 'brightness') {
      logs.push(await executeOSAction({ type: 'brightness', value: step.value ?? 50 }));
    } else if (step.action === 'back') {
      const ok = VortexBridge?.pressBack ? await VortexBridge.pressBack() : false;
      logs.push(ok ? 'Pressed Back' : 'Back unavailable');
    }
  }
  return logs;
}

// --- VORTEX CORTEX BRAIN ---
export async function runVortexCommand(
  projectId: string,
  rawUserText: string
): Promise<{ reply: string; actionLogs: string[] }> {
  const cleanedInput =
    rawUserText.replace(/^\s*(hey\s+)?vortex[,:\s-]*/i, '').trim() || rawUserText.trim();
  await addMemory(projectId, 'user', cleanedInput);
  const lower = cleanedInput.toLowerCase();
  const actionLogs: string[] = [];

  // 1. Check Custom Macros by phrase
  const macros = await getMacros();
  const matchedMacro = macros.find((m) => lower.includes(m.phrase.toLowerCase().trim()));
  if (matchedMacro) {
    const mLogs = await runMacro(matchedMacro);
    actionLogs.push(...mLogs);
    const reply = `Macro "${matchedMacro.name}" execute ho gaya.`;
    await addMemory(projectId, 'model', reply);
    await speakVortex(reply, true);
    return { reply, actionLogs };
  }

  // 2. Fast Zero-Latency Offline Shortcuts
  if (lower === 'swipe up' || lower === 'up swipe' || lower === 'neeche swipe') {
    const log = await executeOSAction({ type: 'swipe', target: 'up' });
    actionLogs.push(log);
    const reply = 'Screen swipe up kar diya.';
    await addMemory(projectId, 'model', reply);
    await speakVortex(reply, true);
    return { reply, actionLogs };
  }

  if (lower.startsWith('tap ') || lower.startsWith('click ')) {
    const btnTarget = cleanedInput.replace(/^(tap|click)\s+/i, '').trim();
    const log = await executeOSAction({ type: 'tap_text', target: btnTarget });
    actionLogs.push(log);
    const reply = `${btnTarget} par tap attempt kiya.`;
    await addMemory(projectId, 'model', reply);
    await speakVortex(reply, true);
    return { reply, actionLogs };
  }

  if (lower.startsWith('open ') || lower.endsWith(' kholo')) {
    const appName = lower.replace(/^open\s+/i, '').replace(/\s+kholo$/i, '').trim();
    const log = await executeOSAction({ type: 'open_app', target: appName });
    actionLogs.push(log);
    const reply = `${appName} open kar diya.`;
    await addMemory(projectId, 'model', reply);
    await speakVortex(reply, true);
    return { reply, actionLogs };
  }

  const brightMatch = lower.match(/brightness\s*(\d+)/);
  if (brightMatch) {
    const val = parseInt(brightMatch[1], 10);
    const log = await executeOSAction({ type: 'brightness', value: val });
    actionLogs.push(log);
    const reply = `Brightness ${val}% par set kar di.`;
    await addMemory(projectId, 'model', reply);
    await speakVortex(reply, true);
    return { reply, actionLogs };
  }

  const mode = (await getSetting('vortex_mode', 'autopilot')) as VortexModeType;
  if (mode === 'offline') {
    const reply =
      'Offline mode active hai. "open <app>", "brightness <0-100>", "swipe up", ya koi macro phrase bolo.';
    await addMemory(projectId, 'model', reply);
    await speakVortex(reply, true);
    return { reply, actionLogs };
  }

  let screenContext = '';
  if (lower.includes('screen') || lower.includes('padho') || lower.includes('kya dikh')) {
    screenContext = await executeOSAction({ type: 'read_screen' });
    actionLogs.push('Read active screen nodes');
  }

  const brainMode = await getSetting('brain_mode', 'cloud');
  const pcUrl = await getSetting('pc_url', 'http://192.168.1.100:8080/v1/chat/completions');
  const history = await getMemories(projectId, 14);

  const systemPrompt = `You are Vortex ẞ, an autonomous Android OS AI assistant.
Current mode: ${mode}.
${screenContext ? `Live Screen Context: ${screenContext}` : ''}
Reply concisely in Hinglish or English matching the user.
For any Android device actions needed, append one or more action tags at the end in exact JSON:
[[ACTION:{"type":"call|sms|whatsapp|open_app|brightness|swipe|tap_text|type_text|system_settings","target":"name_or_app_or_dir","message":"text","value":80}]]`;

  let rawReply = '';

  if (brainMode === 'pc_bridge') {
    const res = await fetch(pcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma-4-12b',
        messages: [
          { role: 'system', content: systemPrompt },
          ...history.map((m) => ({
            role: m.role === 'model' ? 'assistant' : 'user',
            content: m.content,
          })),
        ],
      }),
    });
    const data = await res.json();
    rawReply = data?.choices?.[0]?.message?.content || 'PC Gemma 4 node unreachable.';
  } else {
    for (let attempt = 0; attempt < 25; attempt++) {
      const keyObj = await getNextKey('gemini');
      if (!keyObj) {
        rawReply = 'Saari Gemini API keys cooldown par hain. VAULT tab mein nayi keys add karo.';
        break;
      }

      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${keyObj.key}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemPrompt }] },
              contents: history.map((m) => ({
                role: m.role === 'model' ? 'model' : 'user',
                parts: [{ text: m.content }],
              })),
            }),
          }
        );

        if (res.status === 429 || res.status === 403 || res.status === 400) {
          await cooldownKey(keyObj.id, 60);
          continue;
        }

        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          rawReply = text;
          break;
        }
      } catch {
        rawReply = 'Network error. Offline commands ya macros try karo.';
        break;
      }
    }
  }

  const regex = /\[\[ACTION:([\s\S]*?)\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(rawReply)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      const log = await executeOSAction(parsed);
      actionLogs.push(log);
    } catch {}
  }

  const cleanReply = rawReply.replace(/\[\[ACTION:[\s\S]*?\]\]/g, '').trim();
  await addMemory(projectId, 'model', cleanReply);
  await speakVortex(cleanReply);
  return { reply: cleanReply, actionLogs };
}
