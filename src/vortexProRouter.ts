import { DeviceEventEmitter, NativeModules } from 'react-native';
import {
  executeWithKeyRotation,
  initMemoryCore,
  recallRelevantMemories,
  recordHabit,
  rememberFact,
} from './vortexMemoryEngine';
import {
  activateTurboBoost,
  cleanTargetAppCache,
  runAutonomousDeepCleaner,
} from './vortexSystemOptimizer';
import {
  analyzeScreenOrImage,
  runAutonomousScreenLoop,
  solveAndInjectScreenCode,
} from './vortexCodeAndVision';
import {
  autoFillCredentialOnScreen,
  controlTorch,
  executeDevicePowerAction,
  initProVault,
  openAndAutoUnlockApp,
  performLiveWebSearch,
  setPrivacyShield,
  startAppLockAutoWatcher,
  startOneTimeAppLockLearning,
} from './vortexProModules';

const { VortexBridge } = NativeModules;

export interface ProDispatchResult {
  handled: boolean;
  response: string;
  moduleTag: string;
  generatedCode?: string;
}

const DEFAULT_GEMINI_KEY =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_GEMINI_API_KEY) || '';

let wakeListenerStarted = false;

/**
 * Boots SQLite neural memory, App-Lock auto-watcher, and 24/7 native wakeword listener.
 */
export async function bootVortexProCore(
  onWakeExecution?: (command: string, result: ProDispatchResult) => void
): Promise<void> {
  await initMemoryCore();
  await initProVault();
  startAppLockAutoWatcher();

  if (!wakeListenerStarted) {
    wakeListenerStarted = true;
    DeviceEventEmitter.addListener('VortexWakeCommand', async (rawSpoken: string) => {
      const cmd = String(rawSpoken || '').trim();
      if (!cmd) return;
      const res = await dispatchVortexProCommand(cmd, DEFAULT_GEMINI_KEY);
      if (onWakeExecution) {
        onWakeExecution(cmd, res);
      }
    });
  }
}

/**
 * Central Autonomous Command Router:
 * Routes voice/text commands across Code Solver, Vision, App-Lock Vault, Cleaner, Power, Search, and Memory.
 */
export async function dispatchVortexProCommand(
  rawInput: string,
  fallbackGeminiKey: string = DEFAULT_GEMINI_KEY
): Promise<ProDispatchResult> {
  const text = rawInput.trim();
  const lower = text.toLowerCase();

  if (!text) {
    return { handled: false, response: '', moduleTag: 'IDLE' };
  }

  // 1. Explicit Memory Save ("yaad rakho...", "remember...")
  if (/^(remember|yaad rakho|note that|save note)\b/i.test(lower)) {
    const fact = text.replace(/^(remember|yaad rakho|note that|save note)\s*/i, '').trim();
    await rememberFact(fact, 'preference', 'explicit', 9);
    await recordHabit('memory_store', 'explicit_note');
    return {
      handled: true,
      moduleTag: 'MEMORY',
      response: `⊕ Indexed into permanent neural memory: "${fact}"`,
    };
  }

  // 2. Screen-to-Code Solver & Direct Editor Injector
  if (
    /(solve|code|program|script|question|q\b|bug|fix|error).*(code|editor|daal|dal|inject|likh|solve|run|commit)/i.test(
      lower
    ) ||
    /(yeh solve karo|is question ka code|code nikal|code likho|inject code)/i.test(lower)
  ) {
    const trigger: 'run' | 'commit' | 'none' = lower.includes('commit')
      ? 'commit'
      : /\b(run|execute|submit)\b/i.test(lower)
        ? 'run'
        : 'none';

    const solved = await solveAndInjectScreenCode(text, trigger, fallbackGeminiKey);
    return {
      handled: true,
      moduleTag: 'CODE_AGENT',
      generatedCode: solved.code,
      response: `${solved.injected ? '⊕' : '≡'} [${solved.language}] ${solved.summary}`,
    };
  }

  // 3. Cast-Style Live Screen & Image Vision Analyzer
  if (
    /(screen|image|photo|pic|kya likha|samjhao|explain this|read screen|screen dekho|padho)/i.test(
      lower
    )
  ) {
    const analysis = await analyzeScreenOrImage(text, fallbackGeminiKey);
    return {
      handled: true,
      moduleTag: 'VISION',
      response: analysis,
    };
  }

  // 4. Deep Phone Cleaner, App Cache Sweeper & Turbo RAM Boost
  if (/(clean|cache|junk|storage|optimize|saaf|boost|ram)/i.test(lower)) {
    const appCacheMatch = lower.match(
      /(?:clean|clear|saaf)\s+([a-z0-9._-]+)\s+(?:ka\s+)?cache/i
    );
    if (appCacheMatch?.[1] && !['all', 'full', 'phone', 'pura', 'saara'].includes(appCacheMatch[1])) {
      const msg = await cleanTargetAppCache(appCacheMatch[1]);
      return { handled: true, moduleTag: 'OPTIMIZER', response: msg };
    }

    if (/(turbo|ram|boost|speed)/i.test(lower)) {
      const msg = await activateTurboBoost();
      return { handled: true, moduleTag: 'OPTIMIZER', response: msg };
    }

    const report = await runAutonomousDeepCleaner();
    return {
      handled: true,
      moduleTag: 'OPTIMIZER',
      response: report.summary,
    };
  }

  // 5. One-Time App-Lock Learning & Privacy Shield
  if (/(learn|seekho|save).*(lock|pin|password)/i.test(lower)) {
    const target =
      text
        .replace(/(learn|seekho|save|app|lock|pin|password|ka|ki)/gi, '')
        .trim() || 'instagram';
    const msg = await startOneTimeAppLockLearning(target);
    return { handled: true, moduleTag: 'VAULT', response: msg };
  }

  if (/privacy shield\s*(on|enable|chalu)/i.test(lower)) {
    return { handled: true, moduleTag: 'VAULT', response: setPrivacyShield(true) };
  }
  if (/privacy shield\s*(off|disable|band)/i.test(lower)) {
    return { handled: true, moduleTag: 'VAULT', response: setPrivacyShield(false) };
  }

  // 6. Password Vault Auto-Fill
  if (/(fill|bharo|daalo|autofill).*(password|login|credential|id)/i.test(lower)) {
    const hint = text.replace(/(fill|bharo|daalo|autofill|password|login|credential|id|ka|mera)/gi, '').trim();
    const msg = await autoFillCredentialOnScreen(hint);
    return { handled: true, moduleTag: 'VAULT', response: msg };
  }

  // 7. Device Power, Lock, Wake, Split-Screen & Torch Controls
  if (/\b(lock phone|phone lock|screen lock|lock karo|device lock)\b/i.test(lower)) {
    const msg = await executeDevicePowerAction('lock');
    return { handled: true, moduleTag: 'POWER', response: msg };
  }
  if (/\b(wake screen|screen on|wake up)\b/i.test(lower)) {
    const msg = await executeDevicePowerAction('wake');
    return { handled: true, moduleTag: 'POWER', response: msg };
  }
  if (/\b(restart|reboot)\b/i.test(lower)) {
    const msg = await executeDevicePowerAction('restart');
    return { handled: true, moduleTag: 'POWER', response: msg };
  }
  if (/\b(power off|shut down|switch off|turn off phone)\b/i.test(lower)) {
    const msg = await executeDevicePowerAction('power_off');
    return { handled: true, moduleTag: 'POWER', response: msg };
  }
  if (/\b(power menu)\b/i.test(lower)) {
    const msg = await executeDevicePowerAction('power_menu');
    return { handled: true, moduleTag: 'POWER', response: msg };
  }
  if (/\b(split screen)\b/i.test(lower)) {
    const msg = await executeDevicePowerAction('split_screen');
    return { handled: true, moduleTag: 'POWER', response: msg };
  }
  if (/\b(torch|flashlight)\b/i.test(lower)) {
    const enable = !/\b(off|band|disable)\b/i.test(lower);
    const msg = await controlTorch(enable);
    return { handled: true, moduleTag: 'HARDWARE', response: msg };
  }

  // 8. Live Web Search
  if (/^(search|web search|google|look up|dhundo|khojo)\b/i.test(lower) || /\bsearch karo\b/i.test(lower)) {
    const query = text
      .replace(/^(search|web search|google|look up|dhundo|khojo)\s*/i, '')
      .replace(/\bsearch karo\b/gi, '')
      .trim();
    const ans = await performLiveWebSearch(query || text, fallbackGeminiKey);
    return { handled: true, moduleTag: 'WEB_SEARCH', response: ans };
  }

  // 9. Open & Auto-Unlock App ("Instagram kholo", "Open WhatsApp")
  const openMatch = lower.match(/^(?:open|launch|kholo)\s+([a-z0-9._\s-]+)$/i);
  if (openMatch?.[1]) {
    const targetApp = openMatch[1].trim();
    const msg = await openAndAutoUnlockApp(targetApp);
    return { handled: true, moduleTag: 'APP_LAUNCH', response: msg };
  }

  // 10. Multi-Step Autonomous Screen Task ("WhatsApp par...", "Send message...")
  if (
    /(whatsapp par|message bhejo|send message|tap on|click on|scroll down|scroll up|swipe)/i.test(
      lower
    )
  ) {
    const loopResult = await runAutonomousScreenLoop(text, 6, fallbackGeminiKey);
    return { handled: true, moduleTag: 'AUTONOMOUS', response: loopResult };
  }

  // 11. Memory-Augmented Neural Conversation (with Multi-Key Auto-Rotation)
  const relevantMemories = await recallRelevantMemories(text, 6);
  const memoryBlock =
    relevantMemories.length > 0
      ? `Persistent User Memory:\n${relevantMemories.map((m) => `- [${m.category}]${m.content}`).join('\n')}`
      : 'No prior memory entries yet.';

  const reply = await executeWithKeyRotation('gemini', fallbackGeminiKey, async (apiKey) => {
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
                text: [
                  'You are Vortex ẞ, a precision personal OS AI assistant.',
                  'Rules: Answer directly, concisely, and naturally in the user language (Hinglish/English). Never use emojis.',
                  memoryBlock,
                  `User: ${text}`,
                ].join('\n\n'),
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.45,
          maxOutputTokens: 1024,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini Chat HTTP ${response.status}`);
    }

    const data = await response.json();
    return (
      data?.candidates?.[0]?.content?.parts
        ?.map((p: any) => p?.text || '')
        .join('\n')
        .trim() || '≡ Neural core ready.'
    );
  });

  await rememberFact(`Q: ${text} | A: ${reply.slice(0, 240)}`, 'conversation', 'chat', 5);
  await VortexBridge?.updateFloatingHud?.('VORTEX ẞ  ⊕  RESPONSE', reply.slice(0, 140), 4500);

  return {
    handled: true,
    moduleTag: 'NEURAL_CORE',
    response: reply,
  };
}
