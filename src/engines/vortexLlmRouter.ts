import * as FileSystem from 'expo-file-system';
import { NativeModules } from 'react-native';
import { RagProjectScope, retrieveRagContext } from '../db/vortexSqliteRag';
import {
  useVortexStore,
  VortexDiagramSpec,
  VortexPromptMode,
} from '../store/useVortexStore';

const { VortexBridge } = NativeModules;

export interface LlmTurnMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  imageBase64?: string;
  mimeType?: string;
}

export interface LlmGenerateParams {
  prompt: string;
  history?: LlmTurnMessage[];
  mode?: VortexPromptMode;
  imageBase64?: string;
  mimeType?: string;
  useRag?: boolean;
  ragScope?: RagProjectScope;
  forceOffline?: boolean;
  jsonResponse?: boolean;
  stripCodeComments?: boolean;
  onToken?: (partialText: string) => void;
}

export interface LlmGenerateOutput {
  text: string;
  providerTag: string;
  model: string;
  resolvedMode: VortexPromptMode;
  latencyMs: number;
  diagramSpec?: VortexDiagramSpec;
  ragMatchesCount: number;
}

const GEMINI_MODEL_CASCADE = ['gemini-2.5-flash', 'gemini-2.0-flash'];

const DEFAULT_GGUF_DIRS = [
  'file:///storage/emulated/0/Vortex/models/',
  `${FileSystem.documentDirectory ?? ''}models/`,
];

const SYSTEM_INSTRUCTIONS: Record<VortexPromptMode, string> = {
  auto: 'You are VORTEX Beta, an autonomous Android AI assistant. Respond directly, accurately, and concisely. When code is requested, provide clean production code without inline comments.',
  code: 'You are VORTEX Code Engine. Output clean, compilable, production-ready code strictly without any inline comments or placeholder stubs. Keep explanations brief and technical.',
  ghost:
    'You are VORTEX Autonomous Ghost Planner. Analyze Android screen DOM nodes and screenshots to decide the exact next UI action (tap, swipe, inject_text, back, launch_app, or done) with precise coordinates and safety awareness.',
  study:
    'You are VORTEX CSE Diploma Tutor for SBTET engineering subjects. Explain concepts clearly with step-by-step logic, formulas, exam key points, and comment-free C/C++/Python implementations.',
  vision:
    'You are VORTEX Visual Co-Pilot. Inspect screenshots, camera captures, circuits, handwritten notes, or UI elements accurately and give actionable answers.',
};

function maskKeyForStore(raw: string): string {
  const clean = raw.trim();
  if (clean.length <= 8) return '****';
  return `${clean.slice(0, 6)}...${clean.slice(-4)}`;
}

function detectEffectiveMode(
  requestedMode: VortexPromptMode,
  prompt: string,
  hasImage: boolean
): VortexPromptMode {
  if (requestedMode !== 'auto') return requestedMode;
  if (hasImage) return 'vision';

  const lower = prompt.toLowerCase();
  if (
    /\b(open|tap|click|scroll|swipe|type into|inject|unlock|automate|screen|whatsapp reply)\b/.test(
      lower
    )
  ) {
    return 'ghost';
  }
  if (
    /\b(code|program|function|class|kotlin|c\+\+|cpp|python|typescript|react|bug|compile|error|algorithm|sort|tree|linked list)\b/.test(
      lower
    )
  ) {
    return 'code';
  }
  if (
    /\b(explain|syllabus|sbtet|diploma|viva|exam|coa|digital electronics|computer networks|data structures|diagram|flowchart)\b/.test(
      lower
    )
  ) {
    return 'study';
  }
  return 'auto';
}

function inferRagScope(mode: VortexPromptMode, prompt: string): RagProjectScope {
  const lower = prompt.toLowerCase();
  if (/\b(usb|boot|iso|recovery|bios|partition)\b/.test(lower)) {
    return 'usb_recovery';
  }
  if (
    mode === 'study' ||
    /\b(sbtet|diploma|cpp|c\+\+|dsa|coa|avl|osi|tcp|boolean|flip flop|exam|viva)\b/.test(lower)
  ) {
    return 'cse_diploma';
  }
  if (/\b(vortex|orb|ghost|wakeword|elevenlabs|gemini|gguf|kotlin|bridge)\b/.test(lower)) {
    return 'vortex';
  }
  return 'general';
}

function stripInlineCommentsFromCodeBlocks(markdown: string): string {
  return markdown.replace(/```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g, (_full, lang, body) => {
    const cleanLines = body
      .split('\n')
      .map((line: string) => {
        if (/^\s*\/\//.test(line)) return '';
        let inSingle = false;
        let inDouble = false;
        let inTemplate = false;
        for (let i = 0; i < line.length - 1; i += 1) {
          const ch = line[i];
          const next = line[i + 1];
          const prev = i > 0 ? line[i - 1] : '';
          if (ch === "'" && !inDouble && !inTemplate && prev !== '\\') {
            inSingle = !inSingle;
          } else if (ch === '"' && !inSingle && !inTemplate && prev !== '\\') {
            inDouble = !inDouble;
          } else if (ch === '`' && !inSingle && !inDouble && prev !== '\\') {
            inTemplate = !inTemplate;
          } else if (!inSingle && !inDouble && !inTemplate && ch === '/' && next === '/') {
            return line.slice(0, i).replace(/\s+$/, '');
          }
        }
        return line;
      })
      .filter((line: string, idx: number, arr: string[]) => {
        if (line.trim() !== '') return true;
        return idx > 0 && arr[idx - 1].trim() !== '';
      });

    return `\`\`\`${lang}\n${cleanLines.join('\n').trim()}\n\`\`\``;
  });
}

function extractDiagramSpec(text: string): {
  cleanedText: string;
  diagramSpec?: VortexDiagramSpec;
} {
  const match = text.match(/```vortex-diagram\s*\n([\s\S]*?)```/i);
  if (!match) {
    return { cleanedText: text };
  }
  try {
    const parsed = JSON.parse(match[1].trim());
    if (
      parsed &&
      typeof parsed.title === 'string' &&
      Array.isArray(parsed.nodes) &&
      Array.isArray(parsed.edges)
    ) {
      const cleanedText = text.replace(match[0], '').trim();
      return {
        cleanedText,
        diagramSpec: {
          title: parsed.title,
          nodes: parsed.nodes,
          edges: parsed.edges,
        },
      };
    }
  } catch (_e) {
  }
  return { cleanedText: text };
}

class VortexLlmRouter {
  private llamaContext: any = null;
  private loadedModelPath = '';
  private initLock: Promise<boolean> | null = null;
  private roundRobinIndex = 0;

  public async resolveLocalGgufPath(): Promise<string | null> {
    const store = useVortexStore.getState();
    const candidates: string[] = [];

    if (store.localModelPath && store.localModelPath.trim().length > 0) {
      candidates.push(store.localModelPath.trim());
    }

    for (const dir of DEFAULT_GGUF_DIRS) {
      if (!dir) continue;
      try {
        const info = await FileSystem.getInfoAsync(dir);
        if (info.exists && info.isDirectory) {
          const entries = await FileSystem.readDirectoryAsync(dir);
          const ggufFiles = entries.filter((f) => f.toLowerCase().endsWith('.gguf'));
          const preferred =
            ggufFiles.find((f) => f.toLowerCase().includes('qwen')) || ggufFiles[0];
          if (preferred) {
            candidates.push(`${dir}${preferred}`);
          }
        }
      } catch (_e) {
      }
    }

    for (const candidate of candidates) {
      try {
        if (VortexBridge?.validateAndStageAsset) {
          const staged = await VortexBridge.validateAndStageAsset(candidate, 'gguf');
          if (staged?.verified && staged?.stagedPath) {
            store.setLocalModelConfig({
              path: staged.stagedPath,
              name: staged.stagedPath.split('/').pop() || store.localModelName,
              sizeMb: Math.round(staged.sizeMb || 0),
            });
            return staged.stagedPath;
          }
        } else {
          const info = await FileSystem.getInfoAsync(candidate);
          if (info.exists && !info.isDirectory) {
            return candidate.replace(/^file:\/\//, '');
          }
        }
      } catch (_e) {
      }
    }

    return null;
  }

  public async ensureLocalEngineReady(customPath?: string): Promise<boolean> {
    if (this.llamaContext && (!customPath || customPath === this.loadedModelPath)) {
      return true;
    }
    if (this.initLock) {
      return this.initLock;
    }

    this.initLock = (async () => {
      const store = useVortexStore.getState();
      try {
        const targetPath = customPath || (await this.resolveLocalGgufPath());
        if (!targetPath) {
          store.setLocalModelConfig({ loaded: false });
          return false;
        }

        if (this.llamaContext) {
          try {
            await this.llamaContext.release();
          } catch (_e) {
          }
          this.llamaContext = null;
        }

        const llamaModule = require('llama.rn');
        this.llamaContext = await llamaModule.initLlama({
          model: targetPath.replace(/^file:\/\//, ''),
          use_mlock: true,
          n_ctx: store.localContextSize || 1024,
          n_threads: store.localThreads || 4,
        });
        this.loadedModelPath = targetPath;
        store.setLocalModelConfig({ path: targetPath, loaded: true });
        return true;
      } catch (_e) {
        this.llamaContext = null;
        this.loadedModelPath = '';
        store.setLocalModelConfig({ loaded: false });
        return false;
      } finally {
        this.initLock = null;
      }
    })();

    return this.initLock;
  }

  public async unloadLocalEngine(): Promise<void> {
    if (this.llamaContext) {
      try {
        await this.llamaContext.release();
      } catch (_e) {
      }
      this.llamaContext = null;
      this.loadedModelPath = '';
    }
    useVortexStore.getState().setLocalModelConfig({ loaded: false });
  }

  private buildSystemPrompt(
    mode: VortexPromptMode,
    ragContext: string,
    notebookContext: string,
    includeDiagramHint: boolean
  ): string {
    const sections = [SYSTEM_INSTRUCTIONS[mode]];

    if (includeDiagramHint && (mode === 'study' || mode === 'code')) {
      sections.push(
        'When a visual tree, flowchart, or architecture diagram clarifies the answer, optionally append a fenced ```vortex-diagram JSON block with {"title":"...","nodes":[{"id":"n1","label":"...","tier":0}],"edges":[{"from":"n1","to":"n2","label":"..."}]}.'
      );
    }

    if (notebookContext) {
      sections.push(`Active CSE Notebook Notes:\n${notebookContext}`);
    }

    if (ragContext) {
      sections.push(`Retrieved SQLite Memory Context:\n${ragContext}`);
    }

    return sections.join('\n\n');
  }

  public async generate(params: LlmGenerateParams): Promise<LlmGenerateOutput> {
    const startedAt = Date.now();
    const store = useVortexStore.getState();
    const effectiveMode = detectEffectiveMode(
      params.mode || store.activePromptMode,
      params.prompt,
      Boolean(params.imageBase64)
    );

    let ragContext = '';
    let ragMatchesCount = 0;
    if (params.useRag !== false && !params.jsonResponse) {
      const scope = params.ragScope || inferRagScope(effectiveMode, params.prompt);
      const rag = await retrieveRagContext(params.prompt, {
        preferredScope: scope,
        topK: 4,
        maxTotalChars: 1800,
      });
      ragContext = rag.formattedContext;
      ragMatchesCount = rag.matches.length;
    }

    let notebookContext = '';
    if (store.activeNotebookId) {
      const nb = store.notebooks.find((n) => n.id === store.activeNotebookId);
      if (nb) {
        notebookContext = `${nb.subject} (${nb.code} • ${nb.semester}): ${nb.notes.slice(0, 1200)}`;
      }
    }

    const systemInstruction = this.buildSystemPrompt(
      effectiveMode,
      ragContext,
      notebookContext,
      !params.jsonResponse
    );

    const shouldUseLocalFirst =
      Boolean(params.forceOffline) || (store.preferOfflineBrain && !params.imageBase64);

    let rawOutputText = '';
    let providerTag = 'Gemini Cloud';
    let usedModel = GEMINI_MODEL_CASCADE[0];

    if (shouldUseLocalFirst) {
      const localRes = await this.executeLocalGguf(params, systemInstruction);
      rawOutputText = localRes.text;
      providerTag = 'Local GGUF';
      usedModel = localRes.model;
    } else {
      try {
        const cloudRes = await this.executeGeminiFailover(
          params,
          effectiveMode,
          systemInstruction
        );
        rawOutputText = cloudRes.text;
        providerTag = cloudRes.providerTag;
        usedModel = cloudRes.model;
      } catch (cloudErr) {
        if (params.imageBase64) {
          throw cloudErr;
        }
        const localRes = await this.executeLocalGguf(params, systemInstruction);
        rawOutputText = localRes.text;
        providerTag = 'Local GGUF Fallback';
        usedModel = localRes.model;
      }
    }

    const shouldStripComments =
      params.stripCodeComments !== false && !params.jsonResponse;
    const commentCleanText = shouldStripComments
      ? stripInlineCommentsFromCodeBlocks(rawOutputText)
      : rawOutputText;

    const { cleanedText, diagramSpec } = params.jsonResponse
      ? { cleanedText: commentCleanText, diagramSpec: undefined }
      : extractDiagramSpec(commentCleanText);

    return {
      text: cleanedText,
      providerTag,
      model: usedModel,
      resolvedMode: effectiveMode,
      latencyMs: Date.now() - startedAt,
      diagramSpec,
      ragMatchesCount,
    };
  }

  private async executeGeminiFailover(
    params: LlmGenerateParams,
    mode: VortexPromptMode,
    systemInstruction: string
  ): Promise<{ text: string; providerTag: string; model: string }> {
    const store = useVortexStore.getState();
    const rawKeys = await store.getRawGeminiKeys();
    if (rawKeys.length === 0) {
      throw new Error('No Gemini API keys configured in vault');
    }

    const now = Date.now();
    const eligibleKeys = rawKeys.filter((raw) => {
      const masked = maskKeyForStore(raw);
      const meta = store.geminiKeyPool.find((k) => k.maskedKey === masked);
      if (!meta) return true;
      if (meta.status === 'invalid') return false;
      if (meta.status === 'rate_limited' && meta.cooldownUntil > now) return false;
      return true;
    });

    const keysToTry = eligibleKeys.length > 0 ? eligibleKeys : rawKeys;
    let lastError: Error = new Error('All Gemini API nodes failed');

    for (const modelName of GEMINI_MODEL_CASCADE) {
      for (let attempt = 0; attempt < keysToTry.length; attempt += 1) {
        const idx = (this.roundRobinIndex + attempt) % keysToTry.length;
        const apiKey = keysToTry[idx];
        const masked = maskKeyForStore(apiKey);

        try {
          const text = await this.callGeminiRestApi(
            apiKey,
            modelName,
            params,
            mode,
            systemInstruction
          );
          this.roundRobinIndex = (idx + 1) % keysToTry.length;
          store.markGeminiKeyStatus(masked, 'active');
          if (params.onToken) {
            params.onToken(text);
          }
          return {
            text,
            providerTag: `Gemini Node #${idx + 1}`,
            model: modelName,
          };
        } catch (err: any) {
          lastError = err instanceof Error ? err : new Error(String(err));
          const msg = lastError.message;
          if (msg.includes('HTTP 429') || msg.includes('RESOURCE_EXHAUSTED')) {
            store.markGeminiKeyStatus(masked, 'rate_limited', 60_000);
          } else if (msg.includes('HTTP 400') && msg.includes('API_KEY_INVALID')) {
            store.markGeminiKeyStatus(masked, 'invalid');
          } else if (msg.includes('HTTP 403')) {
            store.markGeminiKeyStatus(masked, 'invalid');
          }
        }
      }
    }

    throw lastError;
  }

  private async callGeminiRestApi(
    apiKey: string,
    modelName: string,
    params: LlmGenerateParams,
    mode: VortexPromptMode,
    systemInstruction: string
  ): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(
      apiKey
    )}`;


    const contents: any[] = [];
    if (params.history && params.history.length > 0) {
      for (const turn of params.history.slice(-10)) {
        if (turn.role === 'system') continue;
        const parts: any[] = [{ text: turn.content }];
        if (turn.imageBase64) {
          parts.push({
            inlineData: {
              mimeType: turn.mimeType || 'image/jpeg',
              data: turn.imageBase64,
            },
          });
        }
        contents.push({
          role: turn.role === 'assistant' ? 'model' : 'user',
          parts,
        });
      }
    }

    const userParts: any[] = [{ text: params.prompt }];
    if (params.imageBase64) {
      userParts.push({
        inlineData: {
          mimeType: params.mimeType || 'image/jpeg',
          data: params.imageBase64,
        },
      });
    }
    contents.push({ role: 'user', parts: userParts });

    const payload: any = {
      systemInstruction: {
        parts: [{ text: systemInstruction }],
      },
      contents,
      generationConfig: {
        temperature: mode === 'code' || mode === 'ghost' ? 0.2 : 0.65,
        maxOutputTokens: 2048,
      },
    };

    if (params.jsonResponse) {
      payload.generationConfig.responseMimeType = 'application/json';
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 28_000);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Gemini HTTP ${res.status}: ${errBody.slice(0, 240)}`);
      }

      const data = await res.json();
      const output = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!output || typeof output !== 'string') {
        throw new Error('Empty response candidate from Gemini');
      }
      return output.trim();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async executeLocalGguf(
    params: LlmGenerateParams,
    systemInstruction: string
  ): Promise<{ text: string; model: string }> {
    const ready = await this.ensureLocalEngineReady();
    if (!ready || !this.llamaContext) {
      throw new Error(
        'Offline GGUF model not loaded. Place Qwen2.5-Coder GGUF in /Vortex/model/ or add a Gemini key.'
      );
    }

    let chatMl = `<|im_start|>system\n${systemInstruction}<|im_end|>\n`;
    if (params.history && params.history.length > 0) {
      for (const turn of params.history.slice(-4)) {
        if (turn.role === 'system') continue;
        chatMl += `<|im_start|>${turn.role}\n${turn.content}<|im_end|>\n`;
      }
    }
    chatMl += `<|im_start|>user\n${params.prompt}<|im_end|>\n<|im_start|>assistant\n`;

    let accumulated = '';
    const completion = await this.llamaContext.completion(
      {
        prompt: chatMl,
        n_predict: 1024,
        temperature: 0.25,
        stop: ['<|im_end|>', '<|endoftext|>', '</s>'],
      },
      (chunk: { token?: string }) => {
        if (chunk?.token) {
          accumulated += chunk.token;
          if (params.onToken) {
            params.onToken(accumulated);
          }
        }
      }
    );

    const finalText = (completion?.text || accumulated).trim();
    const modelLabel =
      useVortexStore.getState().localModelName || 'Qwen2.5-Coder-1.5B-GGUF';
    return {
      text: finalText,
      model: modelLabel,
    };
  }
}

export const vortexLlmRouter = new VortexLlmRouter();
