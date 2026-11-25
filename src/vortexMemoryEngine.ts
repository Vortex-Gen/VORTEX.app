import * as SQLite from 'expo-sqlite';

export type ApiProvider = 'gemini' | 'elevenlabs';

export interface MemoryItem {
  id: number;
  category: 'conversation' | 'project' | 'preference' | 'habit' | 'note';
  tag: string;
  content: string;
  importance: number;
  timestamp: number;
}

export interface ApiKeySlot {
  id: number;
  provider: ApiProvider;
  api_key: string;
  label: string;
  status: 'ACTIVE' | 'COOLDOWN' | 'EXHAUSTED';
  fail_count: number;
  last_used: number;
}

export interface HabitPattern {
  action_type: string;
  target: string;
  hour_bucket: number;
  count: number;
  last_used: number;
}

let dbInstance: SQLite.SQLiteDatabase | null = null;
let isInitialized = false;

// In-memory fallback mirror if SQLite is momentarily locked
const fallbackMemories: MemoryItem[] = [];
const fallbackKeys: ApiKeySlot[] = [];
const fallbackHabits: HabitPattern[] = [];

async function getDb(): Promise<SQLite.SQLiteDatabase | null> {
  if (dbInstance) return dbInstance;
  try {
    dbInstance = await SQLite.openDatabaseAsync('vortex_neural_core.db');
    return dbInstance;
  } catch {
    return null;
  }
}

export async function initMemoryCore(): Promise<boolean> {
  if (isInitialized) return true;
  const db = await getDb();
  if (!db) {
    isInitialized = true;
    return false;
  }

  try {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS episodic_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        tag TEXT NOT NULL,
        content TEXT NOT NULL,
        importance INTEGER DEFAULT 5,
        timestamp INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS habit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action_type TEXT NOT NULL,
        target TEXT NOT NULL,
        hour_bucket INTEGER NOT NULL,
        count INTEGER DEFAULT 1,
        last_used INTEGER NOT NULL,
        UNIQUE(action_type, target, hour_bucket)
      );

      CREATE TABLE IF NOT EXISTS api_key_pool (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        api_key TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        status TEXT DEFAULT 'ACTIVE',
        fail_count INTEGER DEFAULT 0,
        last_used INTEGER DEFAULT 0
      );
    `);
    isInitialized = true;
    return true;
  } catch {
    isInitialized = true;
    return false;
  }
}

/**
 * Stores episodic conversations, project architecture notes, or user preferences permanently.
 */
export async function rememberFact(
  content: string,
  category: MemoryItem['category'] = 'conversation',
  tag: string = 'general',
  importance: number = 6
): Promise<void> {
  const clean = content.trim();
  if (!clean) return;
  await initMemoryCore();
  const now = Date.now();

  const db = await getDb();
  if (db) {
    try {
      await db.runAsync(
        'INSERT INTO episodic_memory (category, tag, content, importance, timestamp) VALUES (?, ?, ?, ?, ?)',
        [category, tag.toLowerCase(), clean, Math.min(10, Math.max(1, importance)), now]
      );
      return;
    } catch {}
  }

  fallbackMemories.unshift({
    id: now,
    category,
    tag: tag.toLowerCase(),
    content: clean,
    importance,
    timestamp: now,
  });
}

/**
 * Retrieves top relevant past memories scored by keyword overlap, importance, and recency.
 */
export async function recallRelevantMemories(query: string, limit: number = 8): Promise<MemoryItem[]> {
  await initMemoryCore();
  const db = await getDb();
  let rows: MemoryItem[] = [];

  if (db) {
    try {
      rows = await db.getAllAsync<MemoryItem>(
        'SELECT * FROM episodic_memory ORDER BY importance DESC, timestamp DESC LIMIT 80'
      );
    } catch {
      rows = [...fallbackMemories];
    }
  } else {
    rows = [...fallbackMemories];
  }

  const tokens = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);

  if (tokens.length === 0) {
    return rows.slice(0, limit);
  }

  const scored = rows.map((item) => {
    const hay = `${item.tag} ${item.content}`.toLowerCase();
    let matchScore = 0;
    for (const tok of tokens) {
      if (hay.includes(tok)) matchScore += 4;
    }
    const ageHours = Math.max(1, (Date.now() - item.timestamp) / 3600000);
    const recencyBoost = 3 / Math.log10(ageHours + 10);
    const totalScore = matchScore + item.importance * 0.6 + recencyBoost;
    return { item, totalScore };
  });

  scored.sort((a, b) => b.totalScore - a.totalScore);
  return scored.slice(0, limit).map((s) => s.item);
}

export async function getRecentMemories(limit: number = 25): Promise<MemoryItem[]> {
  await initMemoryCore();
  const db = await getDb();
  if (db) {
    try {
      return await db.getAllAsync<MemoryItem>(
        'SELECT * FROM episodic_memory ORDER BY timestamp DESC LIMIT ?',
        [limit]
      );
    } catch {}
  }
  return fallbackMemories.slice(0, limit);
}

export async function deleteMemoryById(id: number): Promise<void> {
  await initMemoryCore();
  const db = await getDb();
  if (db) {
    try {
      await db.runAsync('DELETE FROM episodic_memory WHERE id = ?', [id]);
    } catch {}
  }
}

/**
 * Tracks user behavior by hour of day to build autonomous routine intelligence.
 */
export async function recordHabit(actionType: string, target: string): Promise<void> {
  const cleanTarget = target.trim().toLowerCase();
  if (!cleanTarget) return;
  await initMemoryCore();
  const hourBucket = new Date().getHours();
  const now = Date.now();

  const db = await getDb();
  if (db) {
    try {
      await db.runAsync(
        `INSERT INTO habit_logs (action_type, target, hour_bucket, count, last_used)
         VALUES (?, ?, ?, 1, ?)
         ON CONFLICT(action_type, target, hour_bucket)
         DO UPDATE SET count = count + 1, last_used = excluded.last_used`,
        [actionType, cleanTarget, hourBucket, now]
      );
      return;
    } catch {}
  }

  const existing = fallbackHabits.find(
    (h) => h.action_type === actionType && h.target === cleanTarget && h.hour_bucket === hourBucket
  );
  if (existing) {
    existing.count += 1;
    existing.last_used = now;
  } else {
    fallbackHabits.push({ action_type: actionType, target: cleanTarget, hour_bucket: hourBucket, count: 1, last_used: now });
  }
}

export async function getProactiveHabitInsight(): Promise<string> {
  await initMemoryCore();
  const currentHour = new Date().getHours();
  const db = await getDb();
  let habits: HabitPattern[] = [];

  if (db) {
    try {
      habits = await db.getAllAsync<HabitPattern>(
        'SELECT * FROM habit_logs WHERE ABS(hour_bucket - ?) <= 1 ORDER BY count DESC LIMIT 3',
        [currentHour]
      );
    } catch {}
  } else {
    habits = fallbackHabits.filter((h) => Math.abs(h.hour_bucket - currentHour) <= 1);
  }

  if (habits.length === 0) {
    return '≡ Neural habit matrix calibrated. Ready for voice or screen automation.';
  }

  const top = habits[0];
  return `◈ Habit Sync (${currentHour}:00h): Frequent "${top.action_type} -> ${top.target}" detected (${top.count}x). Ready on command.`;
}

// ============================================================================
// MULTI-KEY AUTO-ROTATOR (Zero Quota Downtime for Gemini & ElevenLabs)
// ============================================================================

export async function addApiKeyToPool(
  provider: ApiProvider,
  apiKey: string,
  label?: string
): Promise<boolean> {
  const cleanKey = apiKey.trim();
  if (cleanKey.length < 12) return false;
  await initMemoryCore();
  const tag = label?.trim() || `${provider.toUpperCase()}_${cleanKey.slice(-4)}`;

  const db = await getDb();
  if (db) {
    try {
      await db.runAsync(
        `INSERT INTO api_key_pool (provider, api_key, label, status, fail_count, last_used)
         VALUES (?, ?, ?, 'ACTIVE', 0, 0)
         ON CONFLICT(api_key) DO UPDATE SET status = 'ACTIVE', fail_count = 0`,
        [provider, cleanKey, tag]
      );
      return true;
    } catch {}
  }

  if (!fallbackKeys.some((k) => k.api_key === cleanKey)) {
    fallbackKeys.push({
      id: Date.now(),
      provider,
      api_key: cleanKey,
      label: tag,
      status: 'ACTIVE',
      fail_count: 0,
      last_used: 0,
    });
  }
  return true;
}

/**
 * Allows pasting multiple API keys separated by newlines, spaces, or commas at once.
 */
export async function importBulkApiKeys(provider: ApiProvider, rawText: string): Promise<number> {
  const candidates = rawText
    .split(/[\n,\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 16);

  let added = 0;
  for (let i = 0; i < candidates.length; i++) {
    const ok = await addApiKeyToPool(provider, candidates[i], `${provider.toUpperCase()}_SLOT_${i + 1}`);
    if (ok) added++;
  }
  return added;
}

export async function listApiKeyPool(provider?: ApiProvider): Promise<ApiKeySlot[]> {
  await initMemoryCore();
  const db = await getDb();
  if (db) {
    try {
      if (provider) {
        return await db.getAllAsync<ApiKeySlot>(
          'SELECT * FROM api_key_pool WHERE provider = ? ORDER BY fail_count ASC, last_used ASC',
          [provider]
        );
      }
      return await db.getAllAsync<ApiKeySlot>('SELECT * FROM api_key_pool ORDER BY provider ASC, id ASC');
    } catch {}
  }
  return provider ? fallbackKeys.filter((k) => k.provider === provider) : fallbackKeys;
}

export async function getActiveApiKey(provider: ApiProvider, fallbackEnvKey?: string): Promise<string> {
  await initMemoryCore();
  const db = await getDb();
  const now = Date.now();

  if (db) {
    try {
      // Auto-recover COOLDOWN keys older than 60 seconds
      await db.runAsync(
        `UPDATE api_key_pool SET status = 'ACTIVE' WHERE provider = ? AND status = 'COOLDOWN' AND (? - last_used) > 60000`,
        [provider, now]
      );

      const slot = await db.getFirstAsync<ApiKeySlot>(
        `SELECT * FROM api_key_pool WHERE provider = ? AND status = 'ACTIVE' ORDER BY last_used ASC, fail_count ASC LIMIT 1`,
        [provider]
      );

      if (slot) {
        await db.runAsync('UPDATE api_key_pool SET last_used = ? WHERE id = ?', [now, slot.id]);
        return slot.api_key;
      }
    } catch {}
  }

  const memSlot = fallbackKeys.find((k) => k.provider === provider && k.status === 'ACTIVE');
  if (memSlot) {
    memSlot.last_used = now;
    return memSlot.api_key;
  }

  return fallbackEnvKey || '';
}

export async function markApiKeyError(
  provider: ApiProvider,
  failedKey: string,
  httpStatus: number
): Promise<void> {
  if (!failedKey) return;
  await initMemoryCore();
  const newStatus: ApiKeySlot['status'] = httpStatus === 429 ? 'COOLDOWN' : 'EXHAUSTED';
  const now = Date.now();

  const db = await getDb();
  if (db) {
    try {
      await db.runAsync(
        `UPDATE api_key_pool SET status = ?, fail_count = fail_count + 1, last_used = ? WHERE provider = ? AND api_key = ?`,
        [newStatus, now, provider, failedKey]
      );
      return;
    } catch {}
  }

  const slot = fallbackKeys.find((k) => k.provider === provider && k.api_key === failedKey);
  if (slot) {
    slot.status = newStatus;
    slot.fail_count += 1;
    slot.last_used = now;
  }
}

/**
 * Executes an async API call and automatically rotates through all pooled keys on 429/403 errors.
 */
export async function executeWithKeyRotation<T>(
  provider: ApiProvider,
  defaultKey: string,
  executor: (key: string) => Promise<T>
): Promise<T> {
  const pool = await listApiKeyPool(provider);
  const maxAttempts = Math.max(1, pool.length + 1);
  let lastError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const activeKey = await getActiveApiKey(provider, defaultKey);
    if (!activeKey) break;

    try {
      return await executor(activeKey);
    } catch (err: any) {
      lastError = err;
      const msg = String(err?.message || err || '');
      const status = msg.includes('429') ? 429 : msg.includes('403') || msg.includes('401') ? 403 : 0;
      if (status > 0) {
        await markApiKeyError(provider, activeKey, status);
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error(`All ${provider} API keys exhausted or unavailable.`);
}
