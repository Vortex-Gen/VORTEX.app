import * as SQLite from 'expo-sqlite';
import * as Speech from 'expo-speech';
import * as FileSystem from 'expo-file-system';
import * as Battery from 'expo-battery';
import * as Brightness from 'expo-brightness';
import * as Contacts from 'expo-contacts';
import * as SMS from 'expo-sms';
import * as IntentLauncher from 'expo-intent-launcher';
import { Audio } from 'expo-av';
import { Linking, PermissionsAndroid, Platform } from 'react-native';

export type ProviderType = 'gemini' | 'elevenlabs';

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

let db: SQLite.SQLiteDatabase | null = null;
let currentSound: Audio.Sound | null = null;

export async function initVortexDB(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync('vortex_os_v1.db');
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

  const existing = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM projects WHERE id = ?',
    ['vortex-core']
  );
  if (!existing) {
    await db.runAsync(
      'INSERT INTO projects (id, name, description, created_at) VALUES (?, ?, ?, ?)',
      ['vortex-core', 'VORTEX Core OS', 'Main Mobile Assistant & Device Automation', Date.now()]
    );
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

export async function getMemories(projectId: string, limit = 25): Promise<MemoryMessage[]> {
  const database = await initVortexDB();
  const rows = await database.getAllAsync<MemoryMessage>(
    'SELECT id, role, content, timestamp FROM memories WHERE project_id = ? ORDER BY timestamp DESC LIMIT ?',
    [projectId, limit]
  );
  return rows.reverse();
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

// --- DUAL VOICE ENGINE (ELEVENLABS + ANDROID OFFLINE TTS) ---
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

  const voiceMode = await getSetting('voice_mode', 'hybrid');
  const shortAlert = cleanText.length < 45;

  if (!forceOffline && voiceMode !== 'offline' && !shortAlert) {
    for (let i = 0; i < 5; i++) {
      const elKey = await getNextKey('elevenlabs');
      if (!elKey) break;
      try {
        const res = await fetch(
          'https://api.elevenlabs.io/v1/text-to-speech/nPczCjzI2devNBz1zQrb',
          {
            method: 'POST',
            headers: {
              'xi-api-key': elKey.key,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              text: cleanText.slice(0, 450),
              model_id: 'eleven_multilingual_v2',
              voice_settings: { stability: 0.5, similarity_boost: 0.75 },
            }),
          }
        );

        if (res.status === 401 || res.status === 429) {
          await cooldownKey(elKey.id, 720);
          continue;
        }

        if (res.ok) {
          const buf = await res.arrayBuffer();
          const b64 = arrayBufferToBase64(buf);
          const fileUri = `${FileSystem.cacheDirectory}vortex_voice.mp3`;
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

// --- ANDROID OS AUTOMATION CONTROLLER ---
export async function requestAllCorePermissions(): Promise<void> {
  if (Platform.OS === 'android') {
    await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.CALL_PHONE,
      PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
      PermissionsAndroid.PERMISSIONS.SEND_SMS,
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    ]);
  }
  await Contacts.requestPermissionsAsync();
  await Brightness.requestPermissionsAsync();
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

const APP_SCHEMES: Record<string, { url: string; pkg: string }> = {
  instagram: { url: 'instagram://app', pkg: 'com.instagram.android' },
  reels: { url: 'instagram://reels_home', pkg: 'com.instagram.android' },
  whatsapp: { url: 'whatsapp://send', pkg: 'com.whatsapp' },
  snapchat: { url: 'snapchat://', pkg: 'com.snapchat.android' },
  youtube: { url: 'vnd.youtube://', pkg: 'com.google.android.youtube' },
  chrome: { url: 'googlechrome://', pkg: 'com.android.chrome' },
  camera: { url: 'android.media.action.IMAGE_CAPTURE', pkg: '' },
};

export async function executeOSAction(action: {
  type: string;
  target?: string;
  message?: string;
  value?: number;
}): Promise<string> {
  const type = (action.type || '').toLowerCase();
  const target = (action.target || '').trim();

  if (type === 'open_app') {
    const key = target.toLowerCase();
    const app = APP_SCHEMES[key];
    if (app) {
      try {
        await Linking.openURL(app.url);
        return `Opened ${target}`;
      } catch {
        if (app.pkg && Platform.OS === 'android') {
          await IntentLauncher.startActivityAsync('android.intent.action.MAIN', {
            packageName: app.pkg,
          });
          return `Launched ${target}`;
        }
      }
    }
    return `App ${target} launch requested`;
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
    return `WhatsApp chat opened for ${contact ? contact.name : num}`;
  }

  if (type === 'brightness') {
    const level = Math.max(0.05, Math.min(1, (action.value ?? 50) / 100));
    try {
      await Brightness.setSystemBrightnessAsync(level);
    } catch {
      await Brightness.setBrightnessAsync(level);
    }
    return `Brightness set to ${Math.round(level * 100)}%`;
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

// --- HYBRID BRAIN ROUTER (GEMINI 20-KEY POOL + FUTURE PC GEMMA 4 BRIDGE) ---
export async function runVortexCommand(
  projectId: string,
  userText: string
): Promise<{ reply: string; actionLog?: string }> {
  await addMemory(projectId, 'user', userText);
  const lower = userText.toLowerCase().trim();

  // Fast Zero-Latency Offline Intent Check
  if (lower.startsWith('open ') || lower.endsWith(' kholo')) {
    const appName = lower.replace('open ', '').replace(' kholo', '').trim();
    const log = await executeOSAction({ type: 'open_app', target: appName });
    const reply = `Done bro, ${appName} open kar diya.`;
    await addMemory(projectId, 'model', reply);
    await speakVortex(reply, true);
    return { reply, actionLog: log };
  }

  const brightMatch = lower.match(/brightness\s*(\d+)/);
  if (brightMatch) {
    const val = parseInt(brightMatch[1], 10);
    const log = await executeOSAction({ type: 'brightness', value: val });
    const reply = `Brightness ${val}% par set kar di hai.`;
    await addMemory(projectId, 'model', reply);
    await speakVortex(reply, true);
    return { reply, actionLog: log };
  }

  const brainMode = await getSetting('brain_mode', 'cloud');
  const pcUrl = await getSetting('pc_url', 'http://192.168.1.100:8080/v1/chat/completions');
  const history = await getMemories(projectId, 12);

  const systemPrompt = `You are VORTEX, an advanced Android OS AI assistant built by SdaifnY.
Reply naturally in concise Hinglish or English matching the user.
If the user asks to perform an Android device action, append ONE action tag at the very end of your reply in this exact JSON format:
[[ACTION:{"type":"call|sms|whatsapp|open_app|brightness|system_settings","target":"name_or_app","message":"text_if_any","value":80}]]
Examples:
- "Mom ko call karo" -> Calling Mom right now. [[ACTION:{"type":"call","target":"Mom"}]]
- "Abbu jaan ko I am coming message karo" -> Abbu jaan ko SMS bhej raha hoon. [[ACTION:{"type":"sms","target":"Abbu jaan","message":"I am coming"}]]
- "Instagram reels lagao" -> Instagram Reels open kar raha hoon. [[ACTION:{"type":"open_app","target":"reels"}]]
- "Snapchat kholo" -> Snapchat open kar raha hoon. [[ACTION:{"type":"open_app","target":"snapchat"}]]
- "Volume ya sound settings kholo" -> Sound settings open kar raha hoon. [[ACTION:{"type":"system_settings","target":"sound"}]]`;

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
    rawReply = data?.choices?.[0]?.message?.content || 'PC Gemma 4 node connect nahi ho paya.';
  } else {
    for (let attempt = 0; attempt < 25; attempt++) {
      const keyObj = await getNextKey('gemini');
      if (!keyObj) {
        rawReply = 'Saari Gemini API keys abhi cooldown par hain. Key Vault tab mein nayi keys add karo.';
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
        rawReply = 'Network error. Offline commands jaise "open instagram" ya "brightness 50" try karo.';
        break;
      }
    }
  }

  let actionLog: string | undefined;
  const actionMatch = rawReply.match(/\[\[ACTION:([\s\S]*?)\]\]/);
  if (actionMatch) {
    try {
      const parsed = JSON.parse(actionMatch[1]);
      actionLog = await executeOSAction(parsed);
    } catch {}
  }

  const cleanReply = rawReply.replace(/\[\[ACTION:[\s\S]*?\]\]/g, '').trim();
  await addMemory(projectId, 'model', cleanReply);
  await speakVortex(cleanReply);
  return { reply: cleanReply, actionLog };
}
