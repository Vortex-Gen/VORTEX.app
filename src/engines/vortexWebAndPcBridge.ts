import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { NativeModules } from 'react-native';
import {
  acknowledgePcSyncBatch,
  enqueuePcSyncDelta,
  getPendingPcSyncCount,
  ingestRagMemory,
  peekPcSyncBatch,
} from '../db/vortexSqliteRag';
import { useVortexStore, VortexAttachment } from '../store/useVortexStore';
import { vortexLlmRouter } from './vortexLlmRouter';

const { VortexBridge } = NativeModules;

export type PollinationsModel = 'flux' | 'flux-realism' | 'turbo';
export type ImageAspectRatio = '1:1' | '16:9' | '9:16';

export interface GeneratedImageResult {
  imageUrl: string;
  localUri: string;
  enhancedPrompt: string;
  width: number;
  height: number;
  seed: number;
  model: PollinationsModel;
}

export interface WebPageInspectionResult {
  url: string;
  title: string;
  cleanText: string;
  links: Array<{ label: string; href: string }>;
  fetchedAt: number;
}

export interface PcSyncExecutionReport {
  connected: boolean;
  pushedCount: number;
  remainingCount: number;
  message: string;
}

const ASPECT_DIMENSIONS: Record<ImageAspectRatio, { width: number; height: number }> = {
  '1:1': { width: 1024, height: 1024 },
  '16:9': { width: 1280, height: 720 },
  '9:16': { width: 720, height: 1280 },
};

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'");
}

class VortexWebAndPcBridge {
  public async generatePollinationsImage(params: {
    prompt: string;
    model?: PollinationsModel;
    aspectRatio?: ImageAspectRatio;
    enhancePrompt?: boolean;
    seed?: number;
  }): Promise<GeneratedImageResult> {
    const rawPrompt = params.prompt.trim();
    const model: PollinationsModel = params.model || 'flux';
    const aspect: ImageAspectRatio = params.aspectRatio || '1:1';
    const dims = ASPECT_DIMENSIONS[aspect];
    const seed =
      typeof params.seed === 'number' && params.seed > 0
        ? Math.floor(params.seed)
        : Math.floor(Math.random() * 899999) + 100000;

    let finalPrompt = rawPrompt;
    if (params.enhancePrompt) {
      try {
        const refined = await vortexLlmRouter.generate({
          prompt: `Rewrite this image generation prompt into a vivid, detailed visual description (lighting, composition, textures, style) in under 55 words. Return ONLY the improved prompt text:\n"${rawPrompt}"`,
          mode: 'vision',
          useRag: false,
          stripCodeComments: false,
        });
        if (refined.text && refined.text.length >= 10) {
          finalPrompt = refined.text.replace(/^["']|["']$/g, '').trim();
        }
      } catch (_e) {
      }
    }

    const encodedPrompt = encodeURIComponent(finalPrompt);
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${dims.width}&height=${dims.height}&model=${model}&seed=${seed}&nologo=true&enhance=false`;

    const localUri = `${FileSystem.cacheDirectory}vortex_art_${seed}.jpg`;
    const download = await FileSystem.downloadAsync(imageUrl, localUri);

    return {
      imageUrl,
      localUri: download.uri || imageUrl,
      enhancedPrompt: finalPrompt,
      width: dims.width,
      height: dims.height,
      seed,
      model,
    };
  }

  public async fetchAndInspectWebUrl(rawUrl: string): Promise<WebPageInspectionResult> {
    const normalizedUrl = /^https?:\/\//i.test(rawUrl.trim())
      ? rawUrl.trim()
      : `https://${rawUrl.trim()}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 16_000);

    try {
      const response = await fetch(normalizedUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Linux; Android 14; VORTEX-Autonomous) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
        },
        signal: controller.signal,
      });

      const html = await response.text();
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const title = titleMatch
        ? decodeHtmlEntities(titleMatch[1]).replace(/\s+/g, ' ').trim()
        : normalizedUrl;

      const links: Array<{ label: string; href: string }> = [];
      const anchorRegex = /<a\s+[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let match: RegExpExecArray | null = anchorRegex.exec(html);
      while (match && links.length < 15) {
        const href = match[1].trim();
        const label = decodeHtmlEntities(match[2].replace(/<[^>]+>/g, ' '))
          .replace(/\s+/g, ' ')
          .trim();
        if (href.startsWith('http') && label.length >= 3) {
          links.push({ label: label.slice(0, 70), href });
        }
        match = anchorRegex.exec(html);
      }

      const stripped = decodeHtmlEntities(
        html
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
      )
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 5500);

      void ingestRagMemory({
        scope: 'general',
        title: `Web Snapshot: ${title.slice(0, 90)}`,
        content: `URL: ${normalizedUrl}\n${stripped.slice(0, 2200)}`,
        tags: ['web', 'link-inspect'],
        importance: 2,
        queueForPcSync: false,
      });

      return {
        url: normalizedUrl,
        title,
        cleanText: stripped,
        links,
        fetchedAt: Date.now(),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  public async searchLiveWeb(query: string): Promise<string> {
    const cleanQuery = query.trim();
    if (!cleanQuery) return '';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 14_000);

    try {
      const endpoint = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanQuery)}`;
      const res = await fetch(endpoint, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Linux; Android 14; VORTEX) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36',
        },
        signal: controller.signal,
      });
      const html = await res.text();
      const snippets: string[] = [];
      const snippetRegex = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
      let m: RegExpExecArray | null = snippetRegex.exec(html);
      while (m && snippets.length < 5) {
        const clean = decodeHtmlEntities(m[1].replace(/<[^>]+>/g, ' '))
          .replace(/\s+/g, ' ')
          .trim();
        if (clean.length > 15) {
          snippets.push(`• ${clean}`);
        }
        m = snippetRegex.exec(html);
      }

      return snippets.join('\n');
    } catch (_e) {
      return '';
    } finally {
      clearTimeout(timer);
    }
  }

  public async pickImageAttachment(fromCamera = false): Promise<VortexAttachment | null> {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!perm.granted) return null;

    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.72,
          base64: true,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.72,
          base64: true,
        });

    if (result.canceled || !result.assets?.[0]) return null;
    const asset = result.assets[0];

    return {
      id: `att_img_${Date.now()}`,
      type: 'image',
      name: asset.fileName || `capture_${Date.now()}.jpg`,
      uri: asset.uri,
      base64: asset.base64 || undefined,
    };
  }

  public async pickDocumentAttachment(): Promise<VortexAttachment | null> {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled || !result.assets?.[0]) return null;
    const asset = result.assets[0];

    let textContent = '';
    try {
      const raw = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      textContent = raw.slice(0, 14_000);
    } catch (_e) {
      textContent = `[Binary File Attached: ${asset.name} (${asset.mimeType || 'unknown'})]`;
    }

    return {
      id: `att_doc_${Date.now()}`,
      type: 'file',
      name: asset.name,
      uri: asset.uri,
      textContent,
    };
  }

  public async readClipboardAttachment(): Promise<VortexAttachment | null> {
    const hasStr = await Clipboard.hasStringAsync();
    if (!hasStr) return null;
    const text = (await Clipboard.getStringAsync()).trim();
    if (!text) return null;

    return {
      id: `att_clip_${Date.now()}`,
      type: 'clipboard',
      name: `Clipboard (${text.length} chars)`,
      textContent: text.slice(0, 10_000),
    };
  }

  public async queueCodeFileForPc(filename: string, language: string, code: string): Promise<number> {
    const count = await enqueuePcSyncDelta('code_file', {
      filename,
      language,
      code,
      updatedAt: Date.now(),
    });
    useVortexStore.getState().updatePcSync({ pendingQueueCount: count });
    return count;
  }

  public async probePcCompanion(): Promise<boolean> {
    const store = useVortexStore.getState();
    const { host, port } = store.pcSync;
    store.updatePcSync({ status: 'probing' });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3200);

    try {
      const res = await fetch(`http://${host}:${port}/vortex/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      const online = res.ok;
      const pending = await getPendingPcSyncCount();
      store.updatePcSync({
        status: online ? 'connected' : 'standby_offline',
        pendingQueueCount: pending,
      });
      return online;
    } catch (_e) {
      const pending = await getPendingPcSyncCount();
      store.updatePcSync({
        status: 'standby_offline',
        pendingQueueCount: pending,
      });
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  public async syncOutboxToPc(): Promise<PcSyncExecutionReport> {
    const store = useVortexStore.getState();
    const { host, port } = store.pcSync;
    const batch = await peekPcSyncBatch(30);

    if (batch.length === 0) {
      store.updatePcSync({ pendingQueueCount: 0 });
      return {
        connected: store.pcSync.status === 'connected',
        pushedCount: 0,
        remainingCount: 0,
        message: 'Outbox empty. Everything is already synced.',
      };
    }

    store.updatePcSync({ status: 'probing' });
    let token = '';
    try {
      if (VortexBridge?.getSecureVaultItem) {
        token = (await VortexBridge.getSecureVaultItem('vortex_pc_sync_token')) || '';
      }
    } catch (_e) {
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);

    try {
      const res = await fetch(`http://${host}:${port}/vortex/sync/delta`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          device: 'VORTEX-Android',
          timestamp: Date.now(),
          items: batch,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const remaining = await acknowledgePcSyncBatch(batch.map((b) => b.id));
      store.updatePcSync({
        status: 'connected',
        pendingQueueCount: remaining,
        lastSyncAt: Date.now(),
      });

      return {
        connected: true,
        pushedCount: batch.length,
        remainingCount: remaining,
        message: `Synced ${batch.length} delta nodes to ${host}:${port}.`,
      };
    } catch (_e) {
      const remaining = await getPendingPcSyncCount();
      store.updatePcSync({
        status: 'standby_offline',
        pendingQueueCount: remaining,
      });
      return {
        connected: false,
        pushedCount: 0,
        remainingCount: remaining,
        message: `PC node (${host}:${port}) offline. ${remaining} deltas safely queued in SQLite.`,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

export const vortexWebAndPcBridge = new VortexWebAndPcBridge();
