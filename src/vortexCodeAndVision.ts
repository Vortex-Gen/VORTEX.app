import { NativeModules } from 'react-native';
import {
  executeWithKeyRotation,
  recallRelevantMemories,
  recordHabit,
  rememberFact,
} from './vortexMemoryEngine';

const { VortexBridge } = NativeModules;

export interface ScreenSnapshot {
  domSummary: string;
  screenshotBase64: string;
  timestamp: number;
}

export interface CodeSolveResult {
  language: string;
  code: string;
  summary: string;
  injected: boolean;
  actionTriggered: string;
}

const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));

/**
 * Captures both the live Accessibility DOM tree and a silent hardware screenshot (no cast popup).
 */
export async function captureLiveScreenContext(): Promise<ScreenSnapshot> {
  let domSummary = '';
  let screenshotBase64 = '';

  try {
    domSummary = (await VortexBridge?.readScreen?.()) || '';
  } catch {}

  try {
    screenshotBase64 = (await VortexBridge?.captureScreenBase64?.()) || '';
  } catch {}

  return {
    domSummary,
    screenshotBase64,
    timestamp: Date.now(),
  };
}

async function callGeminiMultimodal(
  prompt: string,
  screenshotBase64: string,
  defaultGeminiKey: string = ''
): Promise<string> {
  return executeWithKeyRotation('gemini', defaultGeminiKey, async (apiKey) => {
    const parts: any[] = [{ text: prompt }];
    if (screenshotBase64 && screenshotBase64.length > 100) {
      parts.push({
        inline_data: {
          mime_type: 'image/jpeg',
          data: screenshotBase64,
        },
      });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
      apiKey
    )}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.25,
          maxOutputTokens: 2048,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini Vision HTTP ${response.status}`);
    }

    const data = await response.json();
    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((p: any) => p?.text || '')
        .join('\n')
        .trim() || '';

    if (!text) {
      throw new Error('Empty response from Gemini Vision');
    }
    return text;
  });
}

/**
 * Cast-style Live Screen & Image Analyzer: reads open images, errors, chats, or articles silently.
 */
export async function analyzeScreenOrImage(
  userQuestion: string,
  defaultGeminiKey: string = ''
): Promise<string> {
  await VortexBridge?.updateFloatingHud?.('VORTEX ẞ  ◈  VISION SCAN', 'Capturing live screen...', 0);
  const snap = await captureLiveScreenContext();

  if (!snap.domSummary && !snap.screenshotBase64) {
    await VortexBridge?.updateFloatingHud?.('VORTEX ẞ  ⊗  VISION OFF', 'Enable Accessibility Service', 3200);
    return '⊗ Accessibility Service is off. Enable Vortex ẞ in Accessibility settings for silent screen vision.';
  }

  const memories = await recallRelevantMemories(userQuestion, 4);
  const memoryBlock =
    memories.length > 0
      ? `Relevant Past Memory:\n${memories.map((m) => `- ${m.content}`).join('\n')}`
      : '';

  const prompt = [
    'You are Vortex ẞ, an ultra-fast OS-level AI assistant.',
    'Analyze the live Android screen image and UI accessibility tree below.',
    'Respond directly in natural Hinglish/English without emojis or filler.',
    memoryBlock,
    `UI Tree: ${snap.domSummary}`,
    `User Request: ${userQuestion || 'Explain what is currently on my screen.'}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const answer = await callGeminiMultimodal(prompt, snap.screenshotBase64, defaultGeminiKey);
  await VortexBridge?.updateFloatingHud?.('VORTEX ẞ  ⊕  ANALYZED', answer.slice(0, 140), 5000);
  await recordHabit('screen_vision', 'analyze');
  return answer;
}

/**
 * Autonomous Screen-to-Code Solver & Direct Injector:
 * Reads coding problem (Q) + editor state from screen, generates clean code, and injects it directly.
 */
export async function solveAndInjectScreenCode(
  userInstruction: string = '',
  autoTriggerAction: 'run' | 'commit' | 'none' = 'none',
  defaultGeminiKey: string = ''
): Promise<CodeSolveResult> {
  await VortexBridge?.updateFloatingHud?.('VORTEX ẞ  < / >  SOLVING', 'Reading problem & editor state...', 0);
  const snap = await captureLiveScreenContext();

  const memories = await recallRelevantMemories('code programming python project', 4);
  const memContext =
    memories.length > 0 ? memories.map((m) => `- ${m.content}`).join('\n') : 'None';

  const prompt = [
    'You are Vortex ẞ Autonomous Code Engine.',
    'Inspect the live screen screenshot and UI elements. Extract the coding question (Q), constraints, and any existing starter template in the editor.',
    'Rules:',
    '1. Write complete, bug-free, optimal code matching the target language/template on screen.',
    '2. Do NOT add unnecessary explanatory comments inside the code unless requested.',
    '3. Return your output strictly in these XML tags:',
    '<LANG>language name</LANG>',
    '<SUMMARY>1-line concise explanation of the solution</SUMMARY>',
    '<CODE>',
    'exact runnable code only (no markdown backticks)',
    '</CODE>',
    `User Instruction: ${userInstruction || 'Solve the coding problem on screen and prepare exact code for injection.'}`,
    `User Coding Context:\n${memContext}`,
    `Screen UI Tree:\n${snap.domSummary}`,
  ].join('\n');

  const raw = await callGeminiMultimodal(prompt, snap.screenshotBase64, defaultGeminiKey);

  const langMatch = raw.match(/<LANG>([\s\S]*?)<\/LANG>/i);
  const summaryMatch = raw.match(/<SUMMARY>([\s\S]*?)<\/SUMMARY>/i);
  const codeMatch = raw.match(/<CODE>([\s\S]*?)<\/CODE>/i);

  const language = (langMatch?.[1] || 'Code').trim();
  const summary = (summaryMatch?.[1] || 'Solution synthesized and ready.').trim();
  let cleanCode = (codeMatch?.[1] || raw)
    .replace(/^```[a-zA-Z]*\n?/, '')
    .replace(/```$/, '')
    .trim();

  await VortexBridge?.updateFloatingHud?.('VORTEX ẞ  < / >  INJECTING', `Writing ${language} solution...`, 0);

  // Attempt to inject directly into focused or editable code box on screen
  let injected = false;
  if (VortexBridge?.typeText) {
    injected = Boolean(await VortexBridge.typeText(cleanCode));
    if (!injected && VortexBridge?.tapText) {
      // Try tapping common editor placeholders first, then inject
      const editorHints = ['def ', 'class ', 'public ', '#include', 'function ', 'Type code', 'Editor'];
      for (const hint of editorHints) {
        const tapped = await VortexBridge.tapText(hint);
        if (tapped) {
          await wait(350);
          injected = Boolean(await VortexBridge.typeText(cleanCode));
          if (injected) break;
        }
      }
    }
  }

  let actionTriggered = 'none';
  if (injected && autoTriggerAction !== 'none' && VortexBridge?.tapText) {
    await wait(600);
    const targets =
      autoTriggerAction === 'run'
        ? ['Run', 'Run Code', 'Submit', 'Execute', 'Test']
        : ['Commit changes', 'Commit', 'Save'];
    for (const btn of targets) {
      const clicked = await VortexBridge.tapText(btn);
      if (clicked) {
        actionTriggered = btn;
        break;
      }
    }
  }

  const statusText = injected
    ? `⊕ ${language} code injected${actionTriggered !== 'none' ? ` -> ${actionTriggered}` : ''}. ${summary}`
    : `≡ ${language} code generated (tap editor box & say inject). ${summary}`;

  await VortexBridge?.updateFloatingHud?.('VORTEX ẞ  ⊕  CODE READY', statusText, 5500);
  await recordHabit('code_solver', language);
  await rememberFact(`Solved ${language} problem: ${summary}\n${cleanCode.slice(0, 400)}`, 'project', 'code', 7);

  return {
    language,
    code: cleanCode,
    summary,
    injected,
    actionTriggered,
  };
}

/**
 * Closed-loop Autonomous Agent (Observe -> Think -> Act -> Verify) for multi-step UI tasks.
 */
export async function runAutonomousScreenLoop(
  goal: string,
  maxSteps: number = 6,
  defaultGeminiKey: string = ''
): Promise<string> {
  const history: string[] = [];

  for (let step = 1; step <= maxSteps; step++) {
    await VortexBridge?.updateFloatingHud?.(
      `VORTEX ẞ  ⟁  STEP ${step}/${maxSteps}`,
      `Executing: ${goal.slice(0, 42)}`,
      0
    );

    const snap = await captureLiveScreenContext();
    const prompt = [
      'You are Vortex ẞ Autonomous UI Controller.',
      `Goal: "${goal}"`,
      `Previous Steps: ${history.length > 0 ? history.join(' -> ') : 'None'}`,
      `Current Screen UI: ${snap.domSummary}`,
      'Decide the SINGLE next atomic UI action. Output ONLY valid JSON:',
      '{"action":"tap_text|tap_xy|type_text|swipe|press_back|press_home|open_app|done","value":"target text or app package or direction","x":0,"y":0,"reason":"short status"}',
    ].join('\n');

    const raw = await callGeminiMultimodal(prompt, snap.screenshotBase64, defaultGeminiKey);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) break;

    let cmd: any;
    try {
      cmd = JSON.parse(jsonMatch[0]);
    } catch {
      break;
    }

    const action = String(cmd.action || 'done');
    const value = String(cmd.value || '');
    const reason = String(cmd.reason || action);
    history.push(`${action}(${value || reason})`);

    if (action === 'done') {
      await VortexBridge?.updateFloatingHud?.('VORTEX ẞ  ⊕  COMPLETED', reason, 4500);
      await recordHabit('autonomous_task', goal.slice(0, 32));
      return `⊕ Task completed: ${reason}`;
    }

    switch (action) {
      case 'tap_text':
        await VortexBridge?.tapText?.(value);
        break;
      case 'tap_xy':
        await VortexBridge?.tapPoint?.(Number(cmd.x || 0), Number(cmd.y || 0));
        break;
      case 'type_text':
        await VortexBridge?.typeText?.(value);
        break;
      case 'swipe':
        await VortexBridge?.swipe?.(value || 'up');
        break;
      case 'press_back':
        await VortexBridge?.pressBack?.();
        break;
      case 'press_home':
        await VortexBridge?.pressHome?.();
        break;
      case 'open_app':
        await VortexBridge?.openApp?.(value);
        break;
    }

    await wait(1100);
  }

  const finalMsg = `≡ Executed ${history.length} autonomous steps: ${history.join(' -> ')}`;
  await VortexBridge?.updateFloatingHud?.('VORTEX ẞ  ≡  LOOP END', finalMsg, 4500);
  return finalMsg;
}
