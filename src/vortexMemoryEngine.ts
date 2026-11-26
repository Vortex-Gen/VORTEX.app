import * as SQLite from 'expo-sqlite';

export type ApiProviderName = 'gemini' | 'elevenlabs' | 'picovoice' | 'pollinations';

export interface StoredApiKey {
  id: number;
  provider: ApiProviderName;
  label: string;
  apiKey: string;
  status: 'ACTIVE' | 'QUOTA_EXCEEDED' | 'ERROR';
  lastError: string;
  usageCount: number;
  lastUsedAt: number;
}

export interface MemoryNodeItem {
  id: number;
  category: string;
  content: string;
  tags: string;
  importance: number;
  createdAt: number;
}

export interface StudyChunkItem {
  id: number;
  subject: string;
  sourceTitle: string;
  chunkText: string;
  createdAt: number;
}

export interface CustomMacroItem {
  id: number;
  triggerPhrase: string;
  actionType: 'PROMPT' | 'SYSTEM_ACTION' | 'APP_LAUNCH' | 'STUDY_MODE';
  actionPayload: string;
  enabled: boolean;
}

export interface AppLockRule {
  id: number;
  packageName: string;
  lockType: 'PIN' | 'PATTERN';
  secretData: string;
  autoUnlockEnabled: boolean;
}

export interface HabitEntry {
  id: number;
  title: string;
  streak: number;
  lastDoneDate: string;
}

export interface PcSyncQueueRow {
  id: number;
  entityType: string;
  payloadJson: string;
  createdAt: number;
}

let dbInstance: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) return dbInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const db = SQLite.openDatabaseSync('vortex_autonomous_v4.db');

    await db.execAsync(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS vortex_settings (
        setting_key TEXT PRIMARY KEY NOT NULL,
        setting_value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS vortex_api_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        label TEXT NOT NULL,
        api_key TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        last_error TEXT NOT NULL DEFAULT '',
        usage_count INTEGER NOT NULL DEFAULT 0,
        last_used_at INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS vortex_memory_nodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL DEFAULT 'GENERAL',
        content TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '',
        importance INTEGER NOT NULL DEFAULT 3,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS vortex_study_chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subject TEXT NOT NULL,
        source_title TEXT NOT NULL,
        chunk_text TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS vortex_weak_topics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subject TEXT NOT NULL,
        topic TEXT NOT NULL UNIQUE,
        lowest_score INTEGER NOT NULL DEFAULT 5,
        attempts INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS vortex_macros (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trigger_phrase TEXT NOT NULL UNIQUE,
        action_type TEXT NOT NULL,
        action_payload TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS vortex_app_locks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        package_name TEXT NOT NULL UNIQUE,
        lock_type TEXT NOT NULL,
        secret_data TEXT NOT NULL,
        auto_unlock_enabled INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS vortex_habits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL UNIQUE,
        streak INTEGER NOT NULL DEFAULT 0,
        last_done_date TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS vortex_pc_sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        synced INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
    `);

    // Seed default macros & habits on first boot
    const macroCountRow = await db.getFirstAsync<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM vortex_macros'
    );
    if ((macroCountRow?.cnt ?? 0) === 0) {
      await db.runAsync(
        `INSERT OR IGNORE INTO vortex_macros (trigger_phrase, action_type, action_payload, enabled) VALUES
         ('study mode', 'STUDY_MODE', 'Sweep RAM, activate CSE Super-Tutor mode, and prepare syllabus RAG', 1),
         ('exam mode', 'STUDY_MODE', 'Enable focus mode, boost memory, and summarize weak CSE topics', 1),
         ('turbo clean', 'SYSTEM_ACTION', 'SWEEP_RAM_AND_CACHE', 1),
         ('lock phone', 'SYSTEM_ACTION', 'LOCK_SCREEN', 1)`
      );
    }

    const habitCountRow = await db.getFirstAsync<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM vortex_habits'
    );
    if ((habitCountRow?.cnt ?? 0) === 0) {
      await db.runAsync(
        `INSERT OR IGNORE INTO vortex_habits (title, streak, last_done_date) VALUES
         ('Daily DSA & C++ Coding Practice', 0, ''),
         ('CSE Subject Revision (30 Mins)', 0, ''),
         ('VORTEX Project Build & Commit', 0, '')`
      );
    }

    dbInstance = db;
    return db;
  })();

  return initPromise;
}

export async function initVortexDatabase(): Promise<void> {
  await getDb();
}

// ============================================================================
// 1. APP SETTINGS STORE
// ============================================================================

export async function getAppSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ setting_value: string }>(
    'SELECT setting_value FROM vortex_settings WHERE setting_key = ?',
    [key]
  );
  return row ? row.setting_value : null;
}

export async function setAppSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO vortex_settings (setting_key, setting_value)
     VALUES (?, ?)
     ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value`,
    [key, value]
  );
}

// ============================================================================
// 2. MULTI-KEY POOL & AUTO-ROTATOR (Gemini, ElevenLabs, Picovoice, Pollinations)
// ============================================================================

export async function addApiKeyToPool(
  provider: ApiProviderName,
  apiKey: string,
  label?: string
): Promise<void> {
  const clean = apiKey.trim();
  if (!clean) return;
  const db = await getDb();
  const finalLabel = label?.trim() || `${provider.toUpperCase()} Key`;
  await db.runAsync(
    `INSERT INTO vortex_api_keys (provider, label, api_key, status, last_error, usage_count, last_used_at)
     VALUES (?, ?, ?, 'ACTIVE', '', 0, 0)
     ON CONFLICT(api_key) DO UPDATE SET
       provider = excluded.provider,
       label = excluded.label,
       status = 'ACTIVE',
       last_error = ''`,
    [provider, finalLabel, clean]
  );
}

export async function removeApiKeyById(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM vortex_api_keys WHERE id = ?', [id]);
}

export async function listApiKeys(provider?: ApiProviderName): Promise<StoredApiKey[]> {
  const db = await getDb();
  const rows = provider
    ? await db.getAllAsync<any>(
        'SELECT * FROM vortex_api_keys WHERE provider = ? ORDER BY id DESC',
        [provider]
      )
    : await db.getAllAsync<any>('SELECT * FROM vortex_api_keys ORDER BY provider ASC, id DESC');

  return rows.map((r) => ({
    id: r.id,
    provider: r.provider,
    label: r.label,
    apiKey: r.api_key,
    status: r.status,
    lastError: r.last_error,
    usageCount: r.usage_count,
    lastUsedAt: r.last_used_at,
  }));
}

export async function getNextApiKey(provider: ApiProviderName): Promise<StoredApiKey | null> {
  const db = await getDb();
  // Prefer ACTIVE keys ordered by least recently used (round-robin rotation)
  let row = await db.getFirstAsync<any>(
    `SELECT * FROM vortex_api_keys
     WHERE provider = ? AND status = 'ACTIVE'
     ORDER BY last_used_at ASC, id ASC LIMIT 1`,
    [provider]
  );

  // If all keys hit quota/error earlier, retry oldest cooled-down key
  if (!row) {
    row = await db.getFirstAsync<any>(
      `SELECT * FROM vortex_api_keys
       WHERE provider = ?
       ORDER BY last_used_at ASC, id ASC LIMIT 1`,
      [provider]
    );
  }

  if (!row) return null;

  const now = Date.now();
  await db.runAsync(
    'UPDATE vortex_api_keys SET usage_count = usage_count + 1, last_used_at = ? WHERE id = ?',
    [now, row.id]
  );

  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    apiKey: row.api_key,
    status: row.status,
    lastError: row.last_error,
    usageCount: row.usage_count + 1,
    lastUsedAt: now,
  };
}

export async function markApiKeyStatus(
  id: number,
  status: 'ACTIVE' | 'QUOTA_EXCEEDED' | 'ERROR',
  lastError = ''
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE vortex_api_keys SET status = ?, last_error = ? WHERE id = ?',
    [status, lastError.slice(0, 180), id]
  );
}

// ============================================================================
// 3. LONG-TERM RAG MEMORY GRAPH
// ============================================================================

function tokenizeForRag(text: string): string[] {
  const stop = new Set([
    'the', 'is', 'in', 'at', 'of', 'on', 'and', 'a', 'to', 'for', 'with',
    'ka', 'ki', 'ke', 'hai', 'ko', 'me', 'se', 'aur', 'bhi', 'bro', 'please',
    'what', 'how', 'why', 'explain', 'give', 'write', 'code',
  ]);
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !stop.has(w));
}

function scoreRagOverlap(queryTokens: string[], candidateText: string): number {
  if (queryTokens.length === 0) return 1;
  const target = candidateText.toLowerCase();
  let score = 0;
  for (const tok of queryTokens) {
    if (target.includes(tok)) {
      score += tok.length >= 5 ? 3 : 2;
    }
  }
  return score;
}

export async function saveMemoryNode(
  content: string,
  category = 'USER_FACT',
  tags = '',
  importance = 3
): Promise<void> {
  const clean = content.trim();
  if (!clean) return;
  const db = await getDb();
  const now = Date.now();
  await db.runAsync(
    'INSERT INTO vortex_memory_nodes (category, content, tags, importance, created_at) VALUES (?, ?, ?, ?, ?)',
    [category, clean, tags, importance, now]
  );
  await enqueuePcSyncItem(
    'MEMORY_NODE',
    JSON.stringify({ category, content: clean, tags, importance, createdAt: now })
  );
}

export async function listAllMemories(limit = 60): Promise<MemoryNodeItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM vortex_memory_nodes ORDER BY importance DESC, created_at DESC LIMIT ?',
    [limit]
  );
  return rows.map((r) => ({
    id: r.id,
    category: r.category,
    content: r.content,
    tags: r.tags,
    importance: r.importance,
    createdAt: r.created_at,
  }));
}

export async function deleteMemoryNode(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM vortex_memory_nodes WHERE id = ?', [id]);
}

export async function retrieveRelevantMemories(query: string, topK = 6): Promise<MemoryNodeItem[]> {
  const all = await listAllMemories(120);
  if (all.length === 0) return [];
  const qTokens = tokenizeForRag(query);

  const scored = all.map((item) => {
    const overlap = scoreRagOverlap(qTokens, `${item.category} ${item.tags} ${item.content}`);
    const totalScore = overlap * 2 + item.importance;
    return { item, totalScore, overlap };
  });

  scored.sort((a, b) => b.totalScore - a.totalScore);
  return scored.slice(0, topK).map((s) => s.item);
}

// ============================================================================
// 4. CSE SYLLABUS & NOTES RAG STORE + WEAK TOPICS TRACKER
// ============================================================================

export async function saveStudyChunk(
  subject: string,
  sourceTitle: string,
  chunkText: string
): Promise<void> {
  const clean = chunkText.trim();
  if (!clean) return;
  const db = await getDb();
  const now = Date.now();
  await db.runAsync(
    'INSERT INTO vortex_study_chunks (subject, source_title, chunk_text, created_at) VALUES (?, ?, ?, ?)',
    [subject, sourceTitle, clean, now]
  );
  await enqueuePcSyncItem(
    'STUDY_CHUNK',
    JSON.stringify({ subject, sourceTitle, chunkText: clean, createdAt: now })
  );
}

export async function queryStudyChunks(
  query: string,
  subject?: string,
  topK = 4
): Promise<string[]> {
  const db = await getDb();
  const rows = subject
    ? await db.getAllAsync<any>(
        'SELECT * FROM vortex_study_chunks WHERE subject = ? ORDER BY created_at DESC LIMIT 100',
        [subject]
      )
    : await db.getAllAsync<any>(
        'SELECT * FROM vortex_study_chunks ORDER BY created_at DESC LIMIT 100'
      );

  if (rows.length === 0) return [];
  const qTokens = tokenizeForRag(query);

  const ranked = rows
    .map((r) => ({
      text: `[${r.subject} • ${r.source_title}] ${r.chunk_text}`,
      score: scoreRagOverlap(qTokens, `${r.source_title} ${r.chunk_text}`),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return ranked.slice(0, topK).map((r) => r.text);
}

export async function getStudyVaultStats(): Promise<{ totalChunks: number; subjects: string[] }> {
  const db = await getDb();
  const cntRow = await db.getFirstAsync<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM vortex_study_chunks'
  );
  const subRows = await db.getAllAsync<{ subject: string }>(
    'SELECT DISTINCT subject FROM vortex_study_chunks'
  );
  return {
    totalChunks: cntRow?.cnt ?? 0,
    subjects: subRows.map((s) => s.subject),
  };
}

export async function logWeakTopic(subject: string, topic: string, score: number): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO vortex_weak_topics (subject, topic, lowest_score, attempts, updated_at)
     VALUES (?, ?, ?, 1, ?)
     ON CONFLICT(topic) DO UPDATE SET
       lowest_score = MIN(vortex_weak_topics.lowest_score, excluded.lowest_score),
       attempts = vortex_weak_topics.attempts + 1,
       updated_at = excluded.updated_at`,
    [subject, topic.trim(), score, now]
  );
}

export async function getWeakTopics(subject?: string, limit = 5): Promise<string[]> {
  const db = await getDb();
  const rows = subject
    ? await db.getAllAsync<{ topic: string }>(
        'SELECT topic FROM vortex_weak_topics WHERE subject = ? ORDER BY lowest_score ASC, updated_at DESC LIMIT ?',
        [subject, limit]
      )
    : await db.getAllAsync<{ topic: string }>(
        'SELECT topic FROM vortex_weak_topics ORDER BY lowest_score ASC, updated_at DESC LIMIT ?',
        [limit]
      );
  return rows.map((r) => r.topic);
}

// ============================================================================
// 5. CUSTOM MACROS, APP-LOCK VAULT & HABIT TRACKER
// ============================================================================

export async function listCustomMacros(): Promise<CustomMacroItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>('SELECT * FROM vortex_macros ORDER BY id ASC');
  return rows.map((r) => ({
    id: r.id,
    triggerPhrase: r.trigger_phrase,
    actionType: r.action_type,
    actionPayload: r.action_payload,
    enabled: r.enabled === 1,
  }));
}

export async function saveCustomMacro(
  triggerPhrase: string,
  actionType: CustomMacroItem['actionType'],
  actionPayload: string
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO vortex_macros (trigger_phrase, action_type, action_payload, enabled)
     VALUES (?, ?, ?, 1)
     ON CONFLICT(trigger_phrase) DO UPDATE SET
       action_type = excluded.action_type,
       action_payload = excluded.action_payload,
       enabled = 1`,
    [triggerPhrase.trim().toLowerCase(), actionType, actionPayload.trim()]
  );
}

export async function saveAppLockRule(
  packageName: string,
  lockType: 'PIN' | 'PATTERN',
  secretData: string
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO vortex_app_locks (package_name, lock_type, secret_data, auto_unlock_enabled)
     VALUES (?, ?, ?, 1)
     ON CONFLICT(package_name) DO UPDATE SET
       lock_type = excluded.lock_type,
       secret_data = excluded.secret_data,
       auto_unlock_enabled = 1`,
    [packageName.trim(), lockType, secretData.trim()]
  );
}

export async function getAppLockRule(packageName: string): Promise<AppLockRule | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>(
    'SELECT * FROM vortex_app_locks WHERE package_name = ? AND auto_unlock_enabled = 1',
    [packageName]
  );
  if (!row) return null;
  return {
    id: row.id,
    packageName: row.package_name,
    lockType: row.lock_type,
    secretData: row.secret_data,
    autoUnlockEnabled: row.auto_unlock_enabled === 1,
  };
}

export async function listHabits(): Promise<HabitEntry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>('SELECT * FROM vortex_habits ORDER BY id ASC');
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    streak: r.streak,
    lastDoneDate: r.last_done_date,
  }));
}

export async function completeHabitToday(id: number): Promise<void> {
  const db = await getDb();
  const today = new Date().toISOString().slice(0, 10);
  const row = await db.getFirstAsync<any>('SELECT * FROM vortex_habits WHERE id = ?', [id]);
  if (!row || row.last_done_date === today) return;
  await db.runAsync(
    'UPDATE vortex_habits SET streak = streak + 1, last_done_date = ? WHERE id = ?',
    [today, id]
  );
}

// ============================================================================
// 6. STANDBY PC SYNC DELTA QUEUE
// ============================================================================

export async function enqueuePcSyncItem(entityType: string, payloadJson: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO vortex_pc_sync_queue (entity_type, payload_json, synced, created_at) VALUES (?, ?, 0, ?)',
    [entityType, payloadJson, Date.now()]
  );
  // Keep queue bounded to latest 500 items while PC is offline
  await db.runAsync(
    `DELETE FROM vortex_pc_sync_queue WHERE id NOT IN (
       SELECT id FROM vortex_pc_sync_queue ORDER BY id DESC LIMIT 500
     )`
  );
}

export async function getPendingPcSyncItems(limit = 40): Promise<PcSyncQueueRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM vortex_pc_sync_queue WHERE synced = 0 ORDER BY id ASC LIMIT ?',
    [limit]
  );
  return rows.map((r) => ({
    id: r.id,
    entityType: r.entity_type,
    payloadJson: r.payload_json,
    createdAt: r.created_at,
  }));
}

export async function markPcSyncItemsSynced(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(`UPDATE vortex_pc_sync_queue SET synced = 1 WHERE id IN (${placeholders})`, ids);
}

export async function getPcSyncQueueCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM vortex_pc_sync_queue WHERE synced = 0'
  );
  return row?.cnt ?? 0;
  }
