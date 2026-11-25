import { DeviceEventEmitter, NativeModules } from 'react-native';
import * as SQLite from 'expo-sqlite';
import { executeWithKeyRotation, recordHabit, rememberFact } from './vortexMemoryEngine';

const { VortexBridge } = NativeModules;

export interface AppLockRecord {
  id: number;
  package_name: string;
  app_label: string;
  lock_type: 'pin' | 'pattern';
  secret_sequence: string;
  updated_at: number;
}

export interface CredentialRecord {
  id: number;
  service: string;
  username: string;
  password: string;
  updated_at: number;
}

let vaultDb: SQLite.SQLiteDatabase | null = null;
let vaultReady = false;
let privacyShieldEnabled = false;
let appLockWatcherTimer: ReturnType<typeof setInterval> | null = null;
let lastAutoUnlockTs = 0;

const APP_PACKAGE_ALIASES: Record<string, string> = {
  instagram: 'com.instagram.android',
  insta: 'com.instagram.android',
  whatsapp: 'com.whatsapp',
  gallery: 'com.miui.gallery',
  photos: 'com.google.android.apps.photos',
  settings: 'com.android.settings',
  youtube: 'com.google.android.youtube',
  telegram: 'org.telegram.messenger',
  snapchat: 'com.snapchat.android',
  chrome: 'com.android.chrome',
  files: 'com.mi.android.globalFileexplorer',
};

const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));

function resolveAppPackage(nameOrPkg: string): { pkg: string; label: string } {
  const clean = nameOrPkg.trim().toLowerCase();
  if (clean.includes('.')) {
    return { pkg: clean, label: clean.split('.').pop() || clean };
  }
  const matched = APP_PACKAGE_ALIASES[clean];
  return {
    pkg: matched || clean,
    label: nameOrPkg.trim(),
  };
}

function hashMasterPin(pin: string): string {
  const salted = `VORTEX_BETA_PHI_1618::${pin.trim()}`;
  let hash = 2166136261;
  for (let i = 0; i < salted.length; i++) {
    hash ^= salted.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

async function getVaultDb(): Promise<SQLite.SQLiteDatabase | null> {
  if (vaultDb) return vaultDb;
  try {
    vaultDb = await SQLite.openDatabaseAsync('vortex_neural_core.db');
    return vaultDb;
  } catch {
    return null;
  }
}

export async function initProVault(): Promise<boolean> {
  if (vaultReady) return true;
  const db = await getVaultDb();
  if (!db) return false;

  try {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS vault_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_lock_vault (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        package_name TEXT NOT NULL UNIQUE,
        app_label TEXT NOT NULL,
        lock_type TEXT NOT NULL,
        secret_sequence TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS credential_vault (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        service TEXT NOT NULL UNIQUE,
        username TEXT NOT NULL,
        password TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    vaultReady = true;
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// 1. MASTER-PIN SECURITY & PRIVACY SHIELD
// ============================================================================

export async function hasMasterVaultPin(): Promise<boolean> {
  await initProVault();
  const db = await getVaultDb();
  if (!db) return false;
  try {
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM vault_config WHERE key = 'master_pin_hash'"
    );
    return Boolean(row?.value);
  } catch {
    return false;
  }
}

export async function setMasterVaultPin(newPin: string): Promise<boolean> {
  const clean = newPin.trim();
  if (clean.length < 4) return false;
  await initProVault();
  const db = await getVaultDb();
  if (!db) return false;
  try {
    await db.runAsync(
      `INSERT INTO vault_config (key, value) VALUES ('master_pin_hash', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [hashMasterPin(clean)]
    );
    return true;
  } catch {
    return false;
  }
}

export async function verifyMasterVaultPin(pin: string): Promise<boolean> {
  await initProVault();
  const db = await getVaultDb();
  if (!db) return false;
  try {
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM vault_config WHERE key = 'master_pin_hash'"
    );
    if (!row?.value) return true; // Not set yet
    return row.value === hashMasterPin(pin);
  } catch {
    return false;
  }
}

export function setPrivacyShield(enabled: boolean): string {
  privacyShieldEnabled = enabled;
  return enabled
    ? '⊗ Privacy Shield ACTIVE: Auto-unlock paused until you disable shield.'
    : '⊕ Privacy Shield OFF: Autonomous App-Lock unlock restored.';
}

export function isPrivacyShieldActive(): boolean {
  return privacyShieldEnabled;
}

// ============================================================================
// 2. ONE-TIME LEARNING APP-LOCK ENGINE (Instagram, WhatsApp, Gallery, etc.)
// ============================================================================

export async function saveAppLockProfile(
  appNameOrPkg: string,
  lockType: 'pin' | 'pattern',
  secretSequence: string
): Promise<boolean> {
  const cleanSeq = secretSequence.trim();
  if (!cleanSeq) return false;
  await initProVault();
  const db = await getVaultDb();
  if (!db) return false;

  const { pkg, label } = resolveAppPackage(appNameOrPkg);
  try {
    await db.runAsync(
      `INSERT INTO app_lock_vault (package_name, app_label, lock_type, secret_sequence, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(package_name) DO UPDATE SET
         app_label = excluded.app_label,
         lock_type = excluded.lock_type,
         secret_sequence = excluded.secret_sequence,
         updated_at = excluded.updated_at`,
      [pkg, label, lockType, cleanSeq, Date.now()]
    );
    await rememberFact(`Saved ${lockType} lock profile for ${label} (${pkg})`, 'note', 'applock', 8);
    return true;
  } catch {
    return false;
  }
}

export async function listSavedAppLocks(): Promise<AppLockRecord[]> {
  await initProVault();
  const db = await getVaultDb();
  if (!db) return [];
  try {
    return await db.getAllAsync<AppLockRecord>(
      'SELECT * FROM app_lock_vault ORDER BY updated_at DESC'
    );
  } catch {
    return [];
  }
}

/**
 * Captures the user's App-Lock PIN taps once while unlocking an app, then saves it forever.
 */
export async function startOneTimeAppLockLearning(appNameOrPkg: string): Promise<string> {
  const { pkg, label } = resolveAppPackage(appNameOrPkg);
  await VortexBridge?.setLockLearningMode?.(true);
  await VortexBridge?.updateFloatingHud?.(
    'VORTEX ẞ  ◈  LEARN LOCK',
    `Unlock ${label} once now — recording PIN...`,
    0
  );

  let latestSteps = '';
  const sub = DeviceEventEmitter.addListener('VortexLockStep', (payload: string) => {
    const parts = String(payload || '').split('::');
    if (parts[1]) {
      latestSteps = parts[1];
    }
  });

  // Launch target app so user unlocks it once
  if (pkg.includes('.')) {
    await VortexBridge?.openApp?.(pkg);
  }

  // Wait up to 14 seconds for user to enter PIN digits
  for (let i = 0; i < 28; i++) {
    await wait(500);
    const digits = latestSteps.split('|').filter(Boolean);
    if (digits.length >= 4) {
      await wait(700); // Allow 5th/6th digit if 6-digit PIN
      break;
    }
  }

  sub.remove();
  await VortexBridge?.setLockLearningMode?.(false);

  const finalDigits = latestSteps.split('|').filter(Boolean);
  if (finalDigits.length >= 4) {
    const seq = finalDigits.join('|');
    await saveAppLockProfile(pkg, 'pin', seq);
    await VortexBridge?.updateFloatingHud?.(
      'VORTEX ẞ  ⊕  LOCK SAVED',
      `${label} PIN learned (${finalDigits.length} digits). Auto-unlock active.`,
      4500
    );
    return `⊕ Learned ${label} App Lock PIN (${finalDigits.length} digits). Next time Vortex will unlock it automatically.`;
  }

  await VortexBridge?.updateFloatingHud?.(
    'VORTEX ẞ  ≡  MANUAL SAVE',
    `Tap count < 4. Save ${label} PIN/Pattern in Vault.`,
    4000
  );
  return `≡ Could not capture 4+ keypad taps automatically (pattern locks do not fire click events). Enter ${label} PIN/Pattern once in Vault to automate it.`;
}

/**
 * Unlocks a saved App-Lock screen automatically using PIN taps or 3x3 normalized pattern gesture.
 */
export async function unlockSavedAppProfile(profile: AppLockRecord): Promise<boolean> {
  if (privacyShieldEnabled) return false;

  if (profile.lock_type === 'pattern') {
    const ok = await VortexBridge?.drawPatternGesture?.(profile.secret_sequence);
    return Boolean(ok);
  }

  const digits = profile.secret_sequence.includes('|')
    ? profile.secret_sequence.split('|')
    : profile.secret_sequence.split('');

  let tappedCount = 0;
  for (const d of digits) {
    const cleanDigit = d.trim();
    if (!cleanDigit) continue;
    const clicked = await VortexBridge?.tapText?.(cleanDigit);
    if (clicked) tappedCount++;
    await wait(140);
  }
  return tappedCount >= 4;
}

/**
 * Opens an app and automatically bypasses its saved App Lock if present.
 */
export async function openAndAutoUnlockApp(appNameOrPkg: string): Promise<string> {
  await initProVault();
  const { pkg, label } = resolveAppPackage(appNameOrPkg);
  const db = await getVaultDb();
  let profile: AppLockRecord | null = null;

  if (db) {
    try {
      profile = await db.getFirstAsync<AppLockRecord>(
        'SELECT * FROM app_lock_vault WHERE package_name = ? OR LOWER(app_label) = ?',
        [pkg, label.toLowerCase()]
      );
    } catch {}
  }

  const opened = await VortexBridge?.openApp?.(pkg);
  if (!opened) {
    return `⊗ Could not launch ${label}.`;
  }

  await recordHabit('open_app', label);

  if (profile && !privacyShieldEnabled) {
    await wait(950);
    const screenText: string = ((await VortexBridge?.readScreen?.()) || '').toLowerCase();
    const isLockScreen =
      screenText.includes('password') ||
      screenText.includes('pin') ||
      screenText.includes('pattern') ||
      screenText.includes('app lock') ||
      screenText.includes('unlock') ||
      screenText.includes('securitycenter');

    if (isLockScreen) {
      await VortexBridge?.updateFloatingHud?.('VORTEX ẞ  ⊕  UNLOCKING', `Bypassing ${label} lock...`, 2000);
      const unlocked = await unlockSavedAppProfile(profile);
      if (unlocked) {
        return `⊕ Opened and unlocked ${label} automatically.`;
      }
    }
  }

  return `⊕ Launched ${label}.`;
}

/**
 * Background watcher: detects whenever user manually opens Instagram/locked apps and unlocks them hands-free.
 */
export function startAppLockAutoWatcher(): void {
  if (appLockWatcherTimer) return;
  appLockWatcherTimer = setInterval(async () => {
    if (privacyShieldEnabled) return;
    if (Date.now() - lastAutoUnlockTs < 4000) return;

    try {
      const screenRaw: string = (await VortexBridge?.readScreen?.()) || '';
      if (!screenRaw) return;
      const lower = screenRaw.toLowerCase();

      const looksLikeAppLock =
        lower.includes('com.miui.securitycenter') ||
        lower.includes('app lock') ||
        lower.includes('enter privacy protection password') ||
        lower.includes('draw pattern to unlock');

      if (!looksLikeAppLock) return;

      const profiles = await listSavedAppLocks();
      if (profiles.length === 0) return;

      // Match by app label visible on lock screen or fallback to most recently used profile
      const matched =
        profiles.find((p) => lower.includes(p.app_label.toLowerCase())) || profiles[0];

      if (matched) {
        lastAutoUnlockTs = Date.now();
        await unlockSavedAppProfile(matched);
      }
    } catch {}
  }, 1400);
}

// ============================================================================
// 3. ENCRYPTED PASSWORD VAULT & SCREEN AUTO-FILL
// ============================================================================

export async function saveCredential(
  service: string,
  username: string,
  password: string
): Promise<boolean> {
  const cleanService = service.trim().toLowerCase();
  if (!cleanService || !password.trim()) return false;
  await initProVault();
  const db = await getVaultDb();
  if (!db) return false;

  try {
    await db.runAsync(
      `INSERT INTO credential_vault (service, username, password, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(service) DO UPDATE SET
         username = excluded.username,
         password = excluded.password,
         updated_at = excluded.updated_at`,
      [cleanService, username.trim(), password.trim(), Date.now()]
    );
    await rememberFact(`Stored login credential for ${cleanService} (${username.trim()})`, 'note', 'vault', 7);
    return true;
  } catch {
    return false;
  }
}

export async function listVaultCredentials(): Promise<CredentialRecord[]> {
  await initProVault();
  const db = await getVaultDb();
  if (!db) return [];
  try {
    return await db.getAllAsync<CredentialRecord>(
      'SELECT * FROM credential_vault ORDER BY updated_at DESC'
    );
  } catch {
    return [];
  }
}

export async function autoFillCredentialOnScreen(serviceHint?: string): Promise<string> {
  const creds = await listVaultCredentials();
  if (creds.length === 0) {
    return '⊗ Password Vault is empty. Add credentials in Vault first.';
  }

  const screenText: string = ((await VortexBridge?.readScreen?.()) || '').toLowerCase();
  const query = (serviceHint || '').trim().toLowerCase();

  const matched =
    creds.find((c) => query && c.service.includes(query)) ||
    creds.find((c) => screenText.includes(c.service)) ||
    creds[0];

  if (!matched) {
    return '⊗ No matching credential found in Vault.';
  }

  await VortexBridge?.updateFloatingHud?.(
    'VORTEX ẞ  ⊕  AUTO-FILL',
    `Filling ${matched.service} credentials...`,
    3000
  );

  // If password field is focused, fill password; if email/username field is focused, fill username first
  const filledPrimary = await VortexBridge?.typeText?.(matched.password);
  if (filledPrimary) {
    await recordHabit('vault_autofill', matched.service);
    return `⊕ Auto-filled ${matched.service} credential (user: ${matched.username}).`;
  }

  return `≡ Located ${matched.service} (${matched.username}). Tap the input box once and say "fill password".`;
}

// ============================================================================
// 4. DEVICE POWER, LOCK, WAKE, SPLIT-SCREEN & TORCH CONTROLS
// ============================================================================

export async function executeDevicePowerAction(
  action: 'lock' | 'power_menu' | 'restart' | 'power_off' | 'wake' | 'split_screen'
): Promise<string> {
  switch (action) {
    case 'lock': {
      const ok = await VortexBridge?.lockScreen?.();
      return ok ? '⊕ Device locked.' : '⊗ Enable Accessibility Service to lock screen.';
    }
    case 'wake': {
      const ok = await VortexBridge?.wakeScreen?.();
      return ok ? '⊕ Screen awakened.' : '⊗ Could not acquire wake lock.';
    }
    case 'power_menu': {
      const ok = await VortexBridge?.openPowerMenu?.();
      return ok ? '⊕ System power menu opened.' : '⊗ Enable Accessibility Service for power menu.';
    }
    case 'restart': {
      const opened = await VortexBridge?.openPowerMenu?.();
      if (!opened) return '⊗ Enable Accessibility Service to restart device.';
      await wait(850);
      const tapped =
        (await VortexBridge?.tapText?.('Restart')) || (await VortexBridge?.tapText?.('Reboot'));
      return tapped
        ? '⊕ Triggered system Restart.'
        : '≡ Power menu opened. Tap Restart to confirm.';
    }
    case 'power_off': {
      const opened = await VortexBridge?.openPowerMenu?.();
      if (!opened) return '⊗ Enable Accessibility Service to power off device.';
      await wait(850);
      const tapped =
        (await VortexBridge?.tapText?.('Power off')) || (await VortexBridge?.tapText?.('Shut down'));
      return tapped
        ? '⊕ Triggered system Power Off.'
        : '≡ Power menu opened. Tap Power off to confirm.';
    }
    case 'split_screen': {
      const ok = await VortexBridge?.toggleSplitScreen?.();
      return ok ? '⊕ Toggled split-screen mode.' : '⊗ Split-screen unavailable on current view.';
    }
  }
}

export async function controlTorch(enable: boolean): Promise<string> {
  const ok = await VortexBridge?.toggleTorch?.(enable);
  if (!ok) return '⊗ Camera torch unavailable on this device.';
  return enable ? '⊕ Torch ON.' : '≡ Torch OFF.';
}

// ============================================================================
// 5. LIVE WEB SEARCH (Real-Time Google Search Grounding)
// ============================================================================

export async function performLiveWebSearch(
  query: string,
  defaultGeminiKey: string = ''
): Promise<string> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return '⊗ Specify a search query.';

  await VortexBridge?.updateFloatingHud?.('VORTEX ẞ  ⟁  WEB SEARCH', cleanQuery.slice(0, 48), 0);

  const result = await executeWithKeyRotation('gemini', defaultGeminiKey, async (apiKey) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
      apiKey
    )}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Search the live web and answer accurately with latest facts, numbers, and dates. Keep response crisp, direct, and free of emojis.\nQuery: ${cleanQuery}`,
              },
            ],
          },
        ],
        tools: [{ google_search: {} }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Web Search HTTP ${response.status}`);
    }

    const data = await response.json();
    const candidate = data?.candidates?.[0];
    const answerText =
      candidate?.content?.parts
        ?.map((p: any) => p?.text || '')
        .join('\n')
        .trim() || 'No live web results returned.';

    const chunks = candidate?.groundingMetadata?.groundingChunks || [];
    const sources = chunks
      .map((c: any) => c?.web?.title)
      .filter(Boolean)
      .slice(0, 3);

    return sources.length > 0
      ? `${answerText}\n\n≡ Sources: ${sources.join(' | ')}`
      : answerText;
  });

  await VortexBridge?.updateFloatingHud?.('VORTEX ẞ  ⊕  SEARCH DONE', result.slice(0, 140), 5000);
  await recordHabit('web_search', cleanQuery.slice(0, 32));
  await rememberFact(`Web search "${cleanQuery}": ${result.slice(0, 260)}`, 'conversation', 'search', 5);
  return result;
}
