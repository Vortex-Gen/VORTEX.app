import { NativeModules } from 'react-native';
import { recordHabit, rememberFact } from './vortexMemoryEngine';

const { VortexBridge } = NativeModules;

export interface SystemTelemetry {
  freeRamMb: number;
  totalRamMb: number;
  ramUsedPercent: number;
  freeStorageGb: number;
  totalStorageGb: number;
  storageUsedPercent: number;
  efficiencyIndex: number;
}

export interface OptimizationReport {
  freedCacheMb: string;
  ramBeforeMb: number;
  ramAfterMb: number;
  ramRecoveredMb: number;
  stepsExecuted: string[];
  summary: string;
}

const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));

/**
 * Reads live RAM, storage, and mathematical efficiency metrics from native Android bridge.
 */
export async function getLiveSystemTelemetry(): Promise<SystemTelemetry> {
  try {
    const raw = await VortexBridge?.getSystemTelemetry?.();
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw || {};
    const freeRamMb = Number(parsed.freeRamMb || 0);
    const totalRamMb = Number(parsed.totalRamMb || 1);
    const freeStorageGb = Number(parsed.freeStorageGb || 0);
    const totalStorageGb = Number(parsed.totalStorageGb || 1);

    const ramUsedPercent = Math.min(100, Math.max(0, Math.round(((totalRamMb - freeRamMb) / totalRamMb) * 100)));
    const storageUsedPercent = Math.min(
      100,
      Math.max(0, Math.round(((totalStorageGb - freeStorageGb) / totalStorageGb) * 100))
    );

    // Golden-ratio weighted system health score (0 - 100)
    const ramFreeRatio = freeRamMb / totalRamMb;
    const storageFreeRatio = freeStorageGb / totalStorageGb;
    const efficiencyIndex = Math.round((ramFreeRatio * 0.618 + storageFreeRatio * 0.382) * 100);

    return {
      freeRamMb,
      totalRamMb,
      ramUsedPercent,
      freeStorageGb,
      totalStorageGb,
      storageUsedPercent,
      efficiencyIndex,
    };
  } catch {
    return {
      freeRamMb: 0,
      totalRamMb: 0,
      ramUsedPercent: 0,
      freeStorageGb: 0,
      totalStorageGb: 0,
      storageUsedPercent: 0,
      efficiencyIndex: 0,
    };
  }
}

/**
 * Layer 1: Sweeps local residual cache, temp files, and triggers JVM memory compaction.
 */
export async function runLocalCacheSweep(): Promise<string> {
  try {
    const freed = await VortexBridge?.sweepJunkCache?.();
    return String(freed || '0.00');
  } catch {
    return '0.00';
  }
}

/**
 * Layer 2: Autonomous System Cleaner — Opens MIUI/Android Security Cleaner and auto-taps clean buttons.
 */
export async function runAutonomousDeepCleaner(): Promise<OptimizationReport> {
  const before = await getLiveSystemTelemetry();
  const steps: string[] = [];

  await VortexBridge?.updateFloatingHud?.('VORTEX ẞ  ◈  DEEP CLEAN', 'Sweeping temp & cache blocks...', 0);
  const freedLocalMb = await runLocalCacheSweep();
  steps.push(`Local cache purged: ${freedLocalMb} MB`);

  // Attempt to launch MIUI Security Cleaner or Android Storage Manager
  let cleanerLaunched = false;
  try {
    cleanerLaunched = Boolean(await VortexBridge?.openApp?.('com.miui.securitycenter'));
    if (!cleanerLaunched) {
      cleanerLaunched = Boolean(await VortexBridge?.openApp?.('com.android.settings'));
    }
  } catch {}

  if (cleanerLaunched && VortexBridge?.readScreen && VortexBridge?.tapText) {
    await wait(1300);
    const screenText: string = (await VortexBridge.readScreen()) || '';
    const lower = screenText.toLowerCase();

    if (lower.includes('cleaner')) {
      await VortexBridge.tapText('Cleaner');
      steps.push('Opened System Cleaner module');
      await wait(2400);
    } else if (lower.includes('storage')) {
      await VortexBridge.tapText('Storage');
      steps.push('Opened Storage analyzer');
      await wait(1600);
    }

    // Scan and tap primary clean action button if available
    const actionTargets = ['Clean up', 'Free up', 'Clean now', 'Optimize'];
    for (const label of actionTargets) {
      const clicked = await VortexBridge.tapText(label);
      if (clicked) {
        steps.push(`Executed system action: ${label}`);
        await wait(1500);
        break;
      }
    }
  }

  const after = await getLiveSystemTelemetry();
  const ramRecoveredMb = Math.max(0, after.freeRamMb - before.freeRamMb);
  const summary = `⊕ Deep Clean Complete | Cache Freed: ${freedLocalMb} MB | Free RAM: ${after.freeRamMb} MB (+${ramRecoveredMb} MB)`;

  await VortexBridge?.updateFloatingHud?.('VORTEX ẞ  ⊕  OPTIMIZED', summary, 5000);
  await recordHabit('system_optimize', 'deep_clean');
  await rememberFact(summary, 'note', 'optimization', 5);

  return {
    freedCacheMb: freedLocalMb,
    ramBeforeMb: before.freeRamMb,
    ramAfterMb: after.freeRamMb,
    ramRecoveredMb,
    stepsExecuted: steps,
    summary,
  };
}

/**
 * Layer 3: Cleans cache of a specific heavy app (e.g., Instagram, Chrome, YouTube) without touching login data.
 */
export async function cleanTargetAppCache(appQuery: string): Promise<string> {
  const cleanName = appQuery.trim();
  if (!cleanName) return '⊗ Specify which app cache to clean.';

  await VortexBridge?.updateFloatingHud?.('VORTEX ẞ  ◈  APP CACHE', `Targeting ${cleanName}...`, 0);

  const openedSettings = await VortexBridge?.openApp?.('com.android.settings');
  if (!openedSettings || !VortexBridge?.tapText) {
    return '⊗ Enable Accessibility Service to automate app cache clearing.';
  }

  await wait(1100);
  await VortexBridge.tapText('Apps');
  await wait(900);
  await VortexBridge.tapText('Manage apps');
  await wait(1000);

  if (VortexBridge?.typeText) {
    await VortexBridge.typeText(cleanName);
    await wait(900);
  }

  const foundApp = await VortexBridge.tapText(cleanName);
  if (!foundApp) {
    await VortexBridge?.updateFloatingHud?.('VORTEX ẞ  ⊗  NOT FOUND', `Could not locate ${cleanName}`, 3200);
    return `⊗ App "${cleanName}" not visible in Manage Apps list.`;
  }

  await wait(1000);
  await VortexBridge.tapText('Clear data');
  await wait(800);

  // Strictly tap "Clear cache" only so account sessions stay intact
  const cleared = await VortexBridge.tapText('Clear cache');
  if (cleared) {
    await wait(600);
    await VortexBridge.tapText('OK');
    await VortexBridge?.updateFloatingHud?.('VORTEX ẞ  ⊕  CACHE CLEARED', `${cleanName} cache wiped`, 4000);
    await recordHabit('app_cache_clean', cleanName);
    return `⊕ ${cleanName} cache cleared safely (login session preserved).`;
  }

  return `≡ Opened ${cleanName} info. Tap Clear cache if protected by system prompt.`;
}

/**
 * Turbo Performance Mode: Sweeps cache, compacts RAM, and returns live telemetry delta.
 */
export async function activateTurboBoost(): Promise<string> {
  const before = await getLiveSystemTelemetry();
  await VortexBridge?.updateFloatingHud?.('VORTEX ẞ  ⟁  TURBO BOOST', 'Compacting memory & purging buffers...', 0);

  const freedMb = await runLocalCacheSweep();
  await wait(500);
  const after = await getLiveSystemTelemetry();
  const deltaRam = Math.max(0, after.freeRamMb - before.freeRamMb);

  const msg = `⟁ Turbo Boost Active | Free RAM: ${after.freeRamMb}/${after.totalRamMb} MB (+${deltaRam} MB) | Cache Purged: ${freedMb} MB | Efficiency: ${after.efficiencyIndex}%`;
  await VortexBridge?.updateFloatingHud?.('VORTEX ẞ  ⟁  TURBO READY', msg, 4500);
  await recordHabit('system_optimize', 'turbo_boost');
  return msg;
}
