import * as SQLite from 'expo-sqlite';

export type RagProjectScope = 'vortex' | 'cse_diploma' | 'usb_recovery' | 'general';

export interface RagMemoryRecord {
  id: string;
  scope: RagProjectScope;
  title: string;
  content: string;
  tags: string;
  importance: number;
  contentHash: string;
  createdAt: number;
  updatedAt: number;
  accessCount: number;
}

export interface RagRetrievalMatch {
  record: RagMemoryRecord;
  score: number;
}

export interface PcSyncDeltaItem {
  id: string;
  entityType: 'memory' | 'code_file' | 'session_summary' | 'workflow';
  payloadJson: string;
  createdAt: number;
  retryCount: number;
}

const DB_NAME = 'vortex_autonomous_rag_v5.db';
const MAX_FALLBACK_ITEMS = 120;

const STOP_WORDS = new Set([
  'the',
  'is',
  'at',
  'which',
  'on',
  'and',
  'or',
  'for',
  'to',
  'in',
  'of',
  'a',
  'an',
  'bro',
  'hai',
  'hain',
  'ka',
  'ki',
  'ke',
  'ko',
  'me',
  'mein',
  'se',
  'aur',
  'bhi',
  'kya',
  'karo',
  'do',
  'please',
]);

let dbInstance: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase | null> | null = null;
let useMemoryFallback = false;
const fallbackMemories: RagMemoryRecord[] = [];
const fallbackOutbox: PcSyncDeltaItem[] = [];

function fnv1aHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function tokenizeNormalized(text: string): string[] {
  const cleaned = text
    .toLowerCase()
    .replace(new RegExp('[^a-z0-9_+.#-]', 'g'), ' ')
    .split(new RegExp('\\s+'))
    .filter((tok) => tok.length >= 2 && !STOP_WORDS.has(tok));
  return Array.from(new Set(cleaned)).slice(0, 64);
}

function extractBigrams(tokens: string[]): string[] {
  const bigrams: string[] = [];
  for (let i = 0; i < tokens.length - 1; i += 1) {
    bigrams.push(`${tokens[i]}_${tokens[i + 1]}`);
  }
  return bigrams;
}

async function getDatabase(): Promise<SQLite.SQLiteDatabase | null> {
  if (useMemoryFallback) return null;
  if (dbInstance) return dbInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA cache_size = -4000;
        PRAGMA temp_store = MEMORY;

        CREATE TABLE IF NOT EXISTS vortex_rag_memories (
          id TEXT PRIMARY KEY NOT NULL,
          scope TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          tags TEXT NOT NULL,
          importance INTEGER NOT NULL DEFAULT 3,
          content_hash TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          access_count INTEGER NOT NULL DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_rag_scope ON vortex_rag_memories(scope);
        CREATE INDEX IF NOT EXISTS idx_rag_hash ON vortex_rag_memories(content_hash);
        CREATE INDEX IF NOT EXISTS idx_rag_updated ON vortex_rag_memories(updated_at DESC);

        CREATE TABLE IF NOT EXISTS vortex_pc_sync_outbox (
          id TEXT PRIMARY KEY NOT NULL,
          entity_type TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          retry_count INTEGER NOT NULL DEFAULT 0
        );
      `);
      dbInstance = db;
      return db;
    } catch (_err) {
      useMemoryFallback = true;
      return null;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

export async function ingestRagMemory(params: {
  scope: RagProjectScope;
  title: string;
  content: string;
  tags?: string[];
  importance?: number;
  queueForPcSync?: boolean;
}): Promise<RagMemoryRecord | null> {
  const cleanContent = params.content.trim().slice(0, 6000);
  if (cleanContent.length < 4) return null;

  const cleanTitle = params.title.trim().slice(0, 140) || 'Project Memory Node';
  const safeImportance = Math.min(5, Math.max(1, Math.round(params.importance ?? 3)));
  const tagString = Array.isArray(params.tags)
    ? params.tags.map((t) => t.trim().toLowerCase()).filter(Boolean).join(',')
    : '';
  const contentHash = fnv1aHash(`${params.scope}:${cleanContent.toLowerCase()}`);
  const now = Date.now();

  const db = await getDatabase();
  if (!db) {
    const existingIdx = fallbackMemories.findIndex((m) => m.contentHash === contentHash);
    if (existingIdx >= 0) {
      fallbackMemories[existingIdx] = {
        ...fallbackMemories[existingIdx],
        updatedAt: now,
        importance: Math.max(fallbackMemories[existingIdx].importance, safeImportance),
      };
      return fallbackMemories[existingIdx];
    }

    const record: RagMemoryRecord = {
      id: `mem_${now}_${Math.floor(Math.random() * 9999)}`,
      scope: params.scope,
      title: cleanTitle,
      content: cleanContent,
      tags: tagString,
      importance: safeImportance,
      contentHash,
      createdAt: now,
      updatedAt: now,
      accessCount: 0,
    };
    fallbackMemories.unshift(record);
    if (fallbackMemories.length > MAX_FALLBACK_ITEMS) {
      fallbackMemories.pop();
    }
    return record;
  }

  try {
    const existing = await db.getFirstAsync<{ id: string; importance: number }>(
      'SELECT id, importance FROM vortex_rag_memories WHERE content_hash = ? LIMIT 1',
      [contentHash]
    );

    if (existing) {
      const mergedImp = Math.max(existing.importance, safeImportance);
      await db.runAsync(
        'UPDATE vortex_rag_memories SET title = ?, content = ?, updated_at = ?, importance = ?, tags = ? WHERE id = ?',
        [cleanTitle, cleanContent, now, mergedImp, tagString, existing.id]
      );
      return {
        id: existing.id,
        scope: params.scope,
        title: cleanTitle,
        content: cleanContent,
        tags: tagString,
        importance: mergedImp,
        contentHash,
        createdAt: now,
        updatedAt: now,
        accessCount: 0,
      };
    }

    const id = `mem_${now}_${Math.floor(Math.random() * 9999)}`;
    await db.runAsync(
      `INSERT INTO vortex_rag_memories
       (id, scope, title, content, tags, importance, content_hash, created_at, updated_at, access_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [id, params.scope, cleanTitle, cleanContent, tagString, safeImportance, contentHash, now, now]
    );

    const record: RagMemoryRecord = {
      id,
      scope: params.scope,
      title: cleanTitle,
      content: cleanContent,
      tags: tagString,
      importance: safeImportance,
      contentHash,
      createdAt: now,
      updatedAt: now,
      accessCount: 0,
    };

    if (params.queueForPcSync !== false) {
      await enqueuePcSyncDelta('memory', record);
    }

    return record;
  } catch (_err) {
    return null;
  }
}

export async function retrieveRagContext(
  query: string,
  options?: {
    preferredScope?: RagProjectScope;
    topK?: number;
    maxTotalChars?: number;
  }
): Promise<{ formattedContext: string; matches: RagRetrievalMatch[] }> {
  const topK = Math.min(8, Math.max(1, options?.topK ?? 4));
  const maxTotalChars = Math.min(4000, Math.max(400, options?.maxTotalChars ?? 2200));
  const queryTokens = tokenizeNormalized(query);
  const queryBigrams = extractBigrams(queryTokens);

  let candidates: RagMemoryRecord[] = [];
  const db = await getDatabase();

  if (!db) {
    candidates = [...fallbackMemories];
  } else {
    try {
      const rows = await db.getAllAsync<{
        id: string;
        scope: RagProjectScope;
        title: string;
        content: string;
        tags: string;
        importance: number;
        content_hash: string;
        created_at: number;
        updated_at: number;
        access_count: number;
      }>(
        'SELECT * FROM vortex_rag_memories ORDER BY importance DESC, updated_at DESC LIMIT 220'
      );

      candidates = rows.map((r) => ({
        id: r.id,
        scope: r.scope,
        title: r.title,
        content: r.content,
        tags: r.tags,
        importance: r.importance,
        contentHash: r.content_hash,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        accessCount: r.access_count,
      }));
    } catch (_err) {
      candidates = [...fallbackMemories];
    }
  }

  if (candidates.length === 0) {
    return { formattedContext: '', matches: [] };
  }

  const now = Date.now();
  const scored: RagRetrievalMatch[] = candidates.map((rec) => {
    const docText = `${rec.title} ${rec.tags} ${rec.content}`;
    const docTokens = tokenizeNormalized(docText);
    const docTokenSet = new Set(docTokens);
    const docBigramSet = new Set(extractBigrams(docTokens));

    let tokenHits = 0;
    let prefixHits = 0;
    const tagSet = new Set(
      rec.tags
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
    );
    let tagHits = 0;

    for (const qt of queryTokens) {
      if (docTokenSet.has(qt)) {
        tokenHits += 1;
      } else if (qt.length >= 4) {
        const hasPrefix = Array.from(docTokenSet).some(
          (dt) => dt.startsWith(qt) || qt.startsWith(dt)
        );
        if (hasPrefix) prefixHits += 0.5;
      }
      if (tagSet.has(qt)) {
        tagHits += 1;
      }
    }

    let bigramHits = 0;
    for (const qb of queryBigrams) {
      if (docBigramSet.has(qb)) bigramHits += 1;
    }

    const effectiveHits = tokenHits + prefixHits;
    const lexicalRatio = queryTokens.length > 0 ? effectiveHits / queryTokens.length : 0.2;
    const tagBonus = Math.min(0.9, tagHits * 0.3);
    const scopeBonus = options?.preferredScope && rec.scope === options.preferredScope ? 0.55 : 0;
    const importanceWeight = rec.importance * 0.24;
    const ageDays = Math.max(0, (now - rec.updatedAt) / (1000 * 60 * 60 * 24));
    const recencyBoost = 1 / (1 + ageDays * 0.04);

    const score =
      lexicalRatio * 3.1 +
      bigramHits * 0.85 +
      tagBonus +
      scopeBonus +
      importanceWeight +
      recencyBoost * 0.4;
    return { record: rec, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const selected = scored.slice(0, topK);

  if (db && selected.length > 0) {
    try {
      for (const item of selected) {
        await db.runAsync(
          'UPDATE vortex_rag_memories SET access_count = access_count + 1 WHERE id = ?',
          [item.record.id]
        );
      }
    } catch (_err) {
    }
  }

  let usedChars = 0;
  const blocks: string[] = [];
  for (const item of selected) {
    const snippet = `[${item.record.scope.toUpperCase()} | ${item.record.title}]: ${item.record.content}`;
    if (usedChars + snippet.length > maxTotalChars) {
      const remaining = maxTotalChars - usedChars;
      if (remaining > 80) {
        blocks.push(snippet.slice(0, remaining));
      }
      break;
    }
    blocks.push(snippet);
    usedChars += snippet.length;
  }

  return {
    formattedContext: blocks.join('\n'),
    matches: selected,
  };
}

export async function listRagMemoriesByScope(scope?: RagProjectScope): Promise<RagMemoryRecord[]> {
  const db = await getDatabase();
  if (!db) {
    return scope ? fallbackMemories.filter((m) => m.scope === scope) : [...fallbackMemories];
  }

  try {
    const rows = scope
      ? await db.getAllAsync<any>(
          'SELECT * FROM vortex_rag_memories WHERE scope = ? ORDER BY updated_at DESC LIMIT 100',
          [scope]
        )
      : await db.getAllAsync<any>(
          'SELECT * FROM vortex_rag_memories ORDER BY updated_at DESC LIMIT 100'
        );

    return rows.map((r) => ({
      id: r.id,
      scope: r.scope,
      title: r.title,
      content: r.content,
      tags: r.tags,
      importance: r.importance,
      contentHash: r.content_hash,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      accessCount: r.access_count,
    }));
  } catch (_err) {
    return [];
  }
}

export async function deleteRagMemory(id: string): Promise<boolean> {
  const db = await getDatabase();
  if (!db) {
    const idx = fallbackMemories.findIndex((m) => m.id === id);
    if (idx >= 0) fallbackMemories.splice(idx, 1);
    return true;
  }

  try {
    await db.runAsync('DELETE FROM vortex_rag_memories WHERE id = ?', [id]);
    return true;
  } catch (_err) {
    return false;
  }
}

export async function enqueuePcSyncDelta(
  entityType: PcSyncDeltaItem['entityType'],
  payload: unknown
): Promise<number> {
  const now = Date.now();
  const id = `sync_${now}_${Math.floor(Math.random() * 9999)}`;
  const serialized = JSON.stringify(payload).slice(0, 32000);

  const db = await getDatabase();
  if (!db) {
    fallbackOutbox.push({
      id,
      entityType,
      payloadJson: serialized,
      createdAt: now,
      retryCount: 0,
    });
    if (fallbackOutbox.length > 200) fallbackOutbox.shift();
    return fallbackOutbox.length;
  }

  try {
    await db.runAsync(
      'INSERT INTO vortex_pc_sync_outbox (id, entity_type, payload_json, created_at, retry_count) VALUES (?, ?, ?, ?, 0)',
      [id, entityType, serialized, now]
    );
    const countRow = await db.getFirstAsync<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM vortex_pc_sync_outbox'
    );
    return countRow?.cnt ?? 0;
  } catch (_err) {
    return 0;
  }
}

export async function peekPcSyncBatch(limit = 25): Promise<PcSyncDeltaItem[]> {
  const safeLimit = Math.min(50, Math.max(1, Math.round(limit)));
  const db = await getDatabase();
  if (!db) {
    return fallbackOutbox.slice(0, safeLimit);
  }

  try {
    const rows = await db.getAllAsync<{
      id: string;
      entity_type: PcSyncDeltaItem['entityType'];
      payload_json: string;
      created_at: number;
      retry_count: number;
    }>(
      'SELECT * FROM vortex_pc_sync_outbox ORDER BY created_at ASC LIMIT ?',
      [safeLimit]
    );

    return rows.map((r) => ({
      id: r.id,
      entityType: r.entity_type,
      payloadJson: r.payload_json,
      createdAt: r.created_at,
      retryCount: r.retry_count,
    }));
  } catch (_err) {
    return [];
  }
}

export async function acknowledgePcSyncBatch(ids: string[]): Promise<number> {
  if (ids.length === 0) return getPendingPcSyncCount();
  const db = await getDatabase();
  if (!db) {
    const removeSet = new Set(ids);
    for (let i = fallbackOutbox.length - 1; i >= 0; i -= 1) {
      if (removeSet.has(fallbackOutbox[i].id)) {
        fallbackOutbox.splice(i, 1);
      }
    }
    return fallbackOutbox.length;
  }

  try {
    for (const id of ids) {
      await db.runAsync('DELETE FROM vortex_pc_sync_outbox WHERE id = ?', [id]);
    }
    return await getPendingPcSyncCount();
  } catch (_err) {
    return 0;
  }
}

export async function getPendingPcSyncCount(): Promise<number> {
  const db = await getDatabase();
  if (!db) return fallbackOutbox.length;
  try {
    const row = await db.getFirstAsync<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM vortex_pc_sync_outbox'
    );
    return row?.cnt ?? 0;
  } catch (_err) {
    return 0;
  }
}

export async function seedInitialProjectKnowledge(): Promise<void> {
  await ingestRagMemory({
    scope: 'vortex',
    title: 'VORTEX Autonomous Identity',
    content:
      'VORTEX Beta is an autonomous Android voice assistant and ghost-touch OS engine built with Expo, React Native, Kotlin Accessibility and Floating Overlay services, multi-key Gemini failover, local Qwen2.5-Coder GGUF fallback, and ElevenLabs multilingual voice.',
    tags: ['vortex', 'architecture', 'autonomous', 'offline'],
    importance: 5,
    queueForPcSync: false,
  });

  await ingestRagMemory({
    scope: 'cse_diploma',
    title: 'SBTET CSE Diploma Focus',
    content:
      'Polytechnic CSE 3rd Semester subjects include Object-Oriented Programming in C++, Data Structures, Computer Networks, Digital Electronics, Computer Organization and Architecture, and Applied Engineering Mathematics.',
    tags: ['sbtet', 'cse', 'diploma', 'cpp', 'data-structures'],
    importance: 4,
    queueForPcSync: false,
  });

  await ingestRagMemory({
    scope: 'usb_recovery',
    title: 'Portable USB AI & OS Recovery System',
    content:
      'Final year CSE hardware-software project combining a portable USB bootable OS installer, system recovery toolkit, independent browser, and local offline AI diagnostics.',
    tags: ['usb', 'recovery', 'os', 'final-year-project'],
    importance: 4,
    queueForPcSync: false,
  });
  } 
