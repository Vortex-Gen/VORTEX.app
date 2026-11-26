import {
  enqueuePcSyncItem,
  getAppSetting,
  getPcSyncQueueCount,
  getPendingPcSyncItems,
  markPcSyncItemsSynced,
  setAppSetting,
} from './vortexMemoryEngine';

export interface PcBridgeStatus {
  enabled: boolean;
  hostUrl: string;
  reachable: boolean;
  queuedCount: number;
  lastSyncAt: string | null;
  modeLabel: 'STANDBY (DORMANT)' | 'ONLINE & SYNCED' | 'ENABLED (PC OFFLINE)';
}

const DEFAULT_PC_HOST = 'http://vortex.local:8000';

class VortexPcBridgeController {
  async isEnabled(): Promise<boolean> {
    const flag = await getAppSetting('pc_sync_enabled');
    return flag === 'true';
  }

  async getHostUrl(): Promise<string> {
    const saved = await getAppSetting('pc_sync_host_url');
    return saved && saved.trim().length > 4 ? saved.trim() : DEFAULT_PC_HOST;
  }

  async setHostUrl(url: string): Promise<string> {
    const clean = url.trim().replace(/\/+$/, '') || DEFAULT_PC_HOST;
    const normalized = clean.startsWith('http') ? clean : `http://${clean}`;
    await setAppSetting('pc_sync_host_url', normalized);
    return normalized;
  }

  async setEnabled(enabled: boolean): Promise<PcBridgeStatus> {
    await setAppSetting('pc_sync_enabled', enabled ? 'true' : 'false');
    if (enabled) {
      await this.flushQueueIfOnline();
    }
    return this.getStatus();
  }

  async recordLocalDelta(
    entityType: 'MEMORY_NODE' | 'STUDY_CHUNK' | 'CODE_SNIPPET' | 'CHAT_TURN',
    payload: Record<string, any>
  ): Promise<void> {
    // Always store locally in SQLite queue without touching network while in standby
    await enqueuePcSyncItem(entityType, JSON.stringify(payload));
    const active = await this.isEnabled();
    if (active) {
      this.flushQueueIfOnline().catch(() => {});
    }
  }

  async pingPcServer(): Promise<boolean> {
    const active = await this.isEnabled();
    if (!active) return false;

    const host = await this.getHostUrl();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(`${host}/api/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }

  async flushQueueIfOnline(): Promise<{ synced: number; remaining: number }> {
    const active = await this.isEnabled();
    const pendingCount = await getPcSyncQueueCount();
    if (!active || pendingCount === 0) {
      return { synced: 0, remaining: pendingCount };
    }

    const online = await this.pingPcServer();
    if (!online) {
      return { synced: 0, remaining: pendingCount };
    }

    const host = await this.getHostUrl();
    const batch = await getPendingPcSyncItems(40);
    if (batch.length === 0) {
      return { synced: 0, remaining: 0 };
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5500);
      const res = await fetch(`${host}/api/mobile-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device: 'VORTEX_ANDROID_V4',
          timestamp: Date.now(),
          items: batch.map((b) => ({
            id: b.id,
            type: b.entityType,
            payload: b.payloadJson,
            createdAt: b.createdAt,
          })),
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        await markPcSyncItemsSynced(batch.map((b) => b.id));
        await setAppSetting('pc_last_sync_at', new Date().toLocaleTimeString());
        const remaining = await getPcSyncQueueCount();
        return { synced: batch.length, remaining };
      }
    } catch {}

    return { synced: 0, remaining: pendingCount };
  }

  async getStatus(): Promise<PcBridgeStatus> {
    const enabled = await this.isEnabled();
    const hostUrl = await this.getHostUrl();
    const queuedCount = await getPcSyncQueueCount();
    const lastSyncAt = await getAppSetting('pc_last_sync_at');

    if (!enabled) {
      return {
        enabled: false,
        hostUrl,
        reachable: false,
        queuedCount,
        lastSyncAt,
        modeLabel: 'STANDBY (DORMANT)',
      };
    }

    const reachable = await this.pingPcServer();
    return {
      enabled: true,
      hostUrl,
      reachable,
      queuedCount,
      lastSyncAt,
      modeLabel: reachable ? 'ONLINE & SYNCED' : 'ENABLED (PC OFFLINE)',
    };
  }
}

export const vortexPcBridge = new VortexPcBridgeController();
