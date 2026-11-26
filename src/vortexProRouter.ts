import { NativeModules } from 'react-native';
import { PromptInjectionModeId } from './theme/vortexTheme';
import {
  GeneratedAiImage,
  VerifiedWebLink,
  WebImageResult,
} from './components/VortexRichBlocks';
import { ghostBrowserController } from './components/VortexGhostBrowser';
import {
  extractUrlsFromPrompt,
  fetchAndReadLiveUrl,
  generateFreeAiImage,
  searchRealWebImages,
  searchWebAndVerifyLinks,
} from './vortexWebAndImage';
import { vortexVoiceEngine } from './vortexVoiceEngine';
import {
  buildTutorPromptContext,
  CseSubject,
  detectCseSubject,
  sanitizeCommentFreeCode,
} from './vortexStudyTutor';
import { vortexPcBridge } from './vortexPcBridge';
import {
  getNextApiKey,
  listCustomMacros,
  markApiKeyStatus,
  retrieveRelevantMemories,
  saveMemoryNode,
} from './vortexMemoryEngine';

const { VortexBridge } = NativeModules;

export interface VortexAttachment {
  id: string;
  kind: 'image' | 'file' | 'screen';
  name: string;
  mimeType: string;
  base64Data?: string;
  textContent?: string;
  uri?: string;
}

export interface VortexRouterRequest {
  userText: string;
  mode: PromptInjectionModeId;
  subjectHint?: CseSubject;
  attachments?: VortexAttachment[];
  silentVoice?: boolean;
}

export interface VortexRouterResponse {
  replyText: string;
  modeUsed: PromptInjectionModeId;
  webImages?: WebImageResult[];
  verifiedLinks?: VerifiedWebLink[];
  generatedImage?: GeneratedAiImage;
  systemActionBadge?: string;
}

const CORE_IDENTITY_LOCK = `
[SYSTEM KERNEL IDENTITY • STRICT NON-NEGOTIABLE DIRECTIVE]
- Your name is VORTEX ẞ (Autonomous Android OS & CSE Intelligence Core).
- NEVER mention, claim, or imply that you are Gemini, Google, an LLM trained by Google, or any external AI brand. You are exclusively VORTEX ẞ.
- Respond in natural, direct Hinglish or English matching the user's language, with high clarity and zero unnecessary filler.
- Formatting toolkit supported by UI:
  * Use ## for major headings and ### for subheadings.
  * Use **bold** for key highlights and numerical final answers.
  * Put all source code in fenced code blocks (\`\`\`c, \`\`\`cpp, \`\`\`python, \`\`\`kotlin, \`\`\`ts).
  * Put copyable prompts or shell commands inside \`\`\`prompt blocks.
  * Put flowcharts, trees, circuits, or architecture flows inside \`\`\`diagram blocks using "NodeA[Label] --> NodeB[Label]" syntax.
- CRITICAL LINK RULE: Never invent or guess URLs. Cite ONLY the exact URLs provided in [LIVE VERIFIED WEB SOURCES]. If no verified links are supplied, do not fabricate any web link.
`.trim();

function buildModePromptDirective(mode: PromptInjectionModeId): string {
  switch (mode) {
    case 'DIRECT_CODE_INJECT':
      return `
[ACTIVE INJECTION PROFILE: PURE CODE INJECTOR • ZERO BAKWAS MODE]
- Output ONLY pure, complete, runnable code inside a single fenced code block.
- STRICTLY ZERO explanations, ZERO greetings, ZERO markdown text outside the code block, and ZERO inline or block comments (no //, /* */, or # comments) inside the code.
`.trim();

    case 'CSE_SUPER_TUTOR':
      return `
[ACTIVE INJECTION PROFILE: CSE SUPER-TUTOR]
- Deliver exam-ready explanations, step-by-step Engineering Mathematics & Digital Electronics derivations, interactive \`\`\`diagram\`\`\` flowcharts, and 100% comment-free runnable code.
`.trim();

    case 'GHOST_AUTOPILOT':
      return `
[ACTIVE INJECTION PROFILE: HUMAN GHOST AUTOPILOT]
- Analyze the current screen DOM / Ghost WebView snapshot and give precise human-like navigation results or step-by-step UI state feedback.
`.trim();

    case 'VERIFIED_RESEARCH':
      return `
[ACTIVE INJECTION PROFILE: LIVE WEB & LINK READER]
- Synthesize accurate, up-to-date answers strictly grounded in the live-visited page extracts below. Reference only verified links.
`.trim();

    default:
      return `
[ACTIVE INJECTION PROFILE: AUTONOMOUS CORE]
- Act as an autonomous Android OS copilot and technical assistant. Use visual diagrams, structured boxes, and concise actionable answers.
`.trim();
  }
}

function detectImageGenerationIntent(text: string): string | null {
  const lower = text.toLowerCase().trim();
  const triggers = [
    /^(?:generate|create|make|draw|design|render)\s+(?:an?\s+)?(?:hd\s+|4k\s+|ai\s+)?(?:image|picture|photo|wallpaper|art|logo|illustration)\s+(?:of|showing|with|for)?\s*(.+)$/i,
    /^(?:image|photo|wallpaper|art|tasveer)\s+(?:banao|bana|create karo|generate karo)\s*(.+)$/i,
    /^(.+?)\s+(?:ki|ka)\s+(?:image|photo|wallpaper|tasveer)\s+(?:banao|bana|generate karo)$/i,
  ];

  for (const rx of triggers) {
    const m = text.match(rx);
    if (m && m[1] && m[1].trim().length >= 3) {
      return m[1].trim();
    }
  }
  if (lower.startsWith('/imagine ')) {
    return text.slice(9).trim();
  }
  return null;
}

function shouldRunLiveWebResearch(text: string, mode: PromptInjectionModeId): boolean {
  if (mode === 'VERIFIED_RESEARCH') return true;
  const lower = text.toLowerCase();
  return (
    lower.includes('search') ||
    lower.includes('latest') ||
    lower.includes('news') ||
    lower.includes('today') ||
    lower.includes('live') ||
    lower.includes('link') ||
    lower.includes('website') ||
    lower.includes('web se') ||
    lower.includes('images dikha') ||
    lower.includes('photo dikha') ||
    lower.includes('price') ||
    lower.includes('2026')
  );
}

function shouldFetchWebImages(text: string, mode: PromptInjectionModeId): boolean {
  const lower = text.toLowerCase();
  if (
    lower.includes('image') ||
    lower.includes('images') ||
    lower.includes('photo') ||
    lower.includes('diagram') ||
    lower.includes('pinout') ||
    lower.includes('architecture') ||
    lower.includes('dikha')
  ) {
    return true;
  }
  return mode === 'VERIFIED_RESEARCH';
}

async function tryExecuteDirectOsCommand(
  userText: string
): Promise<{ handled: boolean; replyText: string; badge: string } | null> {
  const raw = userText.trim();
  const lower = raw.toLowerCase();

  // 1. Memory save command
  const memMatch = raw.match(/^(?:remember|yaad rakh|yaad rakhna|save memory)\s*[:\-]?\s*(.+)$/i);
  if (memMatch && memMatch[1]) {
    await saveMemoryNode(memMatch[1].trim(), 'USER_PINNED', 'manual', 5);
    return {
      handled: true,
      replyText: `Locked into permanent SQLite RAG memory:\n**"${memMatch[1].trim()}"**`,
      badge: 'MEMORY SAVED',
    };
  }

  // 2. Torch / Flashlight
  if (/\b(torch|flashlight|flash light)\b/.test(lower)) {
    const turnOn = !/\b(off|band|close|disable)\b/.test(lower);
    const ok = await VortexBridge?.toggleTorch?.(turnOn);
    return {
      handled: true,
      replyText: ok
        ? `Hardware LED Torch **${turnOn ? 'ON' : 'OFF'}** kar di hai.`
        : 'Camera torch hardware access unavailable.',
      badge: turnOn ? 'TORCH ON' : 'TORCH OFF',
    };
  }

  // 3. RAM & Cache Sweep
  if (
    lower.includes('clean ram') ||
    lower.includes('boost ram') ||
    lower.includes('sweep cache') ||
    lower.includes('junk clean') ||
    lower.includes('turbo clean')
  ) {
    const freedMb = (await VortexBridge?.sweepJunkCache?.()) ?? 0;
    return {
      handled: true,
      replyText: `**Turbo Memory Sweep Complete:** Cache purged and background processes trimmed (**${freedMb} MB** reclaimed).`,
      badge: `FREED ${freedMb} MB`,
    };
  }

  // 4. Global Hardware / Navigation Actions
  if (lower === 'lock screen' || lower === 'lock phone' || lower === 'phone lock kar') {
    await VortexBridge?.performGlobalActionByName?.('LOCK_SCREEN');
    return { handled: true, replyText: 'Screen locked.', badge: 'DEVICE LOCKED' };
  }
  if (lower === 'power menu' || lower === 'open power menu') {
    await VortexBridge?.performGlobalActionByName?.('POWER_DIALOG');
    return { handled: true, replyText: 'System power dialog opened.', badge: 'POWER MENU' };
  }
  if (lower === 'split screen' || lower === 'toggle split screen') {
    await VortexBridge?.performGlobalActionByName?.('SPLIT_SCREEN');
    return { handled: true, replyText: 'Split-screen toggled.', badge: 'SPLIT SCREEN' };
  }

  // 5. WhatsApp / Notification Direct Reply ("reply to Rahul saying I am coming")
  const replyMatch = raw.match(
    /^(?:reply|msg reply|whatsapp reply)\s+(?:to\s+)?([a-zA-Z0-9_ .-]+?)\s+(?:saying|that|ki|:)\s*(.+)$/i
  );
  if (replyMatch) {
    const target = replyMatch[1].trim();
    const msg = replyMatch[2].trim();
    const ok = await VortexBridge?.replyToNotification?.(target, msg);
    return {
      handled: true,
      replyText: ok
        ? `Direct RemoteInput reply sent to **${target}**:\n> "${msg}"`
        : `Active replyable notification from **${target}** nahi mili (check Notification Listener permission).`,
      badge: ok ? 'DIRECT REPLY SENT' : 'NO ACTIVE THREAD',
    };
  }

  // 6. Direct Phone Call ("call Mom" / "call 9876543210")
  const callMatch = raw.match(/^(?:call|dial)\s+(.+)$/i);
  if (callMatch && callMatch[1] && !lower.includes('api') && !lower.includes('function')) {
    const target = callMatch[1].trim();
    const digits = target.replace(/[^0-9+]/g, '');
    if (digits.length >= 7) {
      const ok = await VortexBridge?.makeDirectCall?.(digits);
      return {
        handled: true,
        replyText: ok ? `Dialing **${digits}**...` : 'Call permission required.',
        badge: 'DIRECT CALL',
      };
    }
    const contactsRaw = (await VortexBridge?.searchContacts?.(target)) || '[]';
    const contacts = JSON.parse(contactsRaw);
    if (Array.isArray(contacts) && contacts.length > 0) {
      const first = contacts[0];
      await VortexBridge?.makeDirectCall?.(first.number);
      return {
        handled: true,
        replyText: `Calling **${first.name}** (${first.number})...`,
        badge: 'CONTACT CALL',
      };
    }
  }

  // 7. Open / Launch Installed App ("open youtube", "launch whatsapp")
  const openAppMatch = raw.match(/^(?:open|launch|start)\s+([a-zA-Z0-9 ._-]{2,28})$/i);
  if (
    openAppMatch &&
    !lower.includes('link') &&
    !lower.includes('http') &&
    !lower.includes('.com') &&
    !lower.includes('.in') &&
    !lower.includes('ghost')
  ) {
    const appQuery = openAppMatch[1].trim();
    const pkg = await VortexBridge?.launchAppByName?.(appQuery);
    if (pkg) {
      return {
        handled: true,
        replyText: `Launched **${appQuery}** (\`${pkg}\`).`,
        badge: 'APP LAUNCHED',
      };
    }
  }

  // 8. Check Custom SQLite Macros
  const macros = await listCustomMacros();
  const matchedMacro = macros.find(
    (m) => m.enabled && lower === m.triggerPhrase.toLowerCase()
  );
  if (matchedMacro) {
    if (matchedMacro.actionPayload === 'SWEEP_RAM_AND_CACHE') {
      const mb = (await VortexBridge?.sweepJunkCache?.()) ?? 0;
      return {
        handled: true,
        replyText: `Macro **${matchedMacro.triggerPhrase}** executed — **${mb} MB** reclaimed.`,
        badge: 'MACRO EXECUTED',
      };
    }
    if (matchedMacro.actionPayload === 'LOCK_SCREEN') {
      await VortexBridge?.performGlobalActionByName?.('LOCK_SCREEN');
      return { handled: true, replyText: 'Macro lock executed.', badge: 'MACRO LOCK' };
    }
  }

  return null;
}

async function tryExecuteGhostWebCommand(
  userText: string
): Promise<{ handled: boolean; replyText: string; links?: VerifiedWebLink[]; badge: string } | null> {
  const raw = userText.trim();
  const lower = raw.toLowerCase();

  // Ghost scroll / click on active web page
  if (lower === 'ghost scroll down' || lower === 'scroll down web') {
    await ghostBrowserController.humanScroll('DOWN');
    return { handled: true, replyText: 'Ghost WebView scrolled down naturally.', badge: 'GHOST SCROLL' };
  }
  if (lower === 'ghost scroll up' || lower === 'scroll up web') {
    await ghostBrowserController.humanScroll('UP');
    return { handled: true, replyText: 'Ghost WebView scrolled up.', badge: 'GHOST SCROLL' };
  }

  const ghostClickMatch = raw.match(/^(?:ghost click|web click)\s+(.+)$/i);
  if (ghostClickMatch && ghostClickMatch[1]) {
    const target = ghostClickMatch[1].trim();
    await ghostBrowserController.clickByText(target);
    return {
      handled: true,
      replyText: `Human-clicked **"${target}"** inside Ghost WebView.`,
      badge: 'GHOST CLICK',
    };
  }

  const ghostOpenMatch = raw.match(/^(?:ghost open|ghost browse|browse)\s+(.+)$/i);
  if (ghostOpenMatch && ghostOpenMatch[1]) {
    const target = ghostOpenMatch[1].trim();
    const url = target.includes('.') && !target.includes(' ')
      ? target
      : `https://duckduckgo.com/?q=${encodeURIComponent(target)}`;
    const snap = await ghostBrowserController.openUrl(url, true);
    const verified: VerifiedWebLink = {
      url: snap.url || url,
      title: snap.title || url,
      domain: url.replace(/^https?:\/\//, '').split('/')[0],
      snippet: snap.textContent.slice(0, 220) || 'Loaded in Ghost Chromium session.',
      extractedContent: snap.textContent,
      verified: true,
      httpStatus: 200,
      readViaGhost: true,
    };
    return {
      handled: true,
      replyText: `Opened **${verified.title}** in Human Ghost Browser and extracted live page DOM.`,
      links: [verified],
      badge: 'GHOST BROWSER',
    };
  }

  return null;
}

export async function callVortexLlmCore(
  fullPrompt: string,
  attachments: VortexAttachment[] = []
): Promise<string> {
  const parts: any[] = [{ text: fullPrompt }];

  for (const att of attachments) {
    if ((att.kind === 'image' || att.kind === 'screen') && att.base64Data) {
      parts.push({
        inlineData: {
          mimeType: att.mimeType || 'image/jpeg',
          data: att.base64Data,
        },
      });
    } else if (att.kind === 'file' && att.textContent) {
      parts.push({
        text: `\n[ATTACHED FILE: ${att.name}]\n${att.textContent.slice(0, 12000)}\n`,
      });
    }
  }

  const models = ['gemini-2.5-flash', 'gemini-2.0-flash'];

  for (let attempt = 0; attempt < 4; attempt++) {
    const keyEntry = await getNextApiKey('gemini');
    if (!keyEntry || !keyEntry.apiKey) {
      return '## API Key Required\nMore (`=`) drawer mein jaakar apni **AI Core API Key** add karo taaki VORTEX ẞ neural engine start ho sake.';
    }

    const modelName = models[attempt % models.length];
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(
      keyEntry.apiKey.trim()
    )}`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: {
            temperature: 0.45,
            maxOutputTokens: 2800,
          },
        }),
      });

      if (!response.ok) {
        const status = response.status;
        await markApiKeyStatus(
          keyEntry.id,
          status === 429 ? 'QUOTA_EXCEEDED' : 'ERROR',
          `HTTP ${status}`
        );
        continue;
      }

      const json = await response.json();
      const candidateText: string =
        json?.candidates?.[0]?.content?.parts
          ?.map((p: any) => p?.text || '')
          .join('')
          .trim() || '';

      if (candidateText) {
        await markApiKeyStatus(keyEntry.id, 'ACTIVE', 'OK');
        return candidateText;
      }
    } catch (err: any) {
      await markApiKeyStatus(keyEntry.id, 'ERROR', String(err?.message || 'NETWORK_ERR'));
    }
  }

  return '## Network / Key Pool Notice\nSabhi configured API keys par temporary limit ya network timeout aaya hai. More (`=`) panel mein key status check karo.';
}

export async function processVortexCommand(
  req: VortexRouterRequest
): Promise<VortexRouterResponse> {
  const userText = req.userText.trim();
  const attachments = req.attachments || [];
  let activeMode = req.mode;

  // 1. Check direct OS / Hardware / Macro commands first
  if (attachments.length === 0) {
    const osResult = await tryExecuteDirectOsCommand(userText);
    if (osResult?.handled) {
      if (!req.silentVoice) {
        vortexVoiceEngine.speak(osResult.replyText).catch(() => {});
      }
      return {
        replyText: osResult.replyText,
        modeUsed: activeMode,
        systemActionBadge: osResult.badge,
      };
    }

    const ghostResult = await tryExecuteGhostWebCommand(userText);
    if (ghostResult?.handled) {
      if (!req.silentVoice) {
        vortexVoiceEngine.speak(ghostResult.replyText).catch(() => {});
      }
      return {
        replyText: ghostResult.replyText,
        modeUsed: 'GHOST_AUTOPILOT',
        verifiedLinks: ghostResult.links,
        systemActionBadge: ghostResult.badge,
      };
    }
  }

  // 2. Check Free Pollinations.ai Image Generation request
  const imagePrompt = detectImageGenerationIntent(userText);
  if (imagePrompt) {
    const polKey = await getNextApiKey('pollinations');
    const generatedImage = await generateFreeAiImage(imagePrompt, {
      model: 'flux',
      apiKey: polKey?.apiKey,
    });
    const replyText = `## AI Studio Render Ready\nGenerated high-resolution visual for **"${imagePrompt}"**.`;
    if (!req.silentVoice) {
      vortexVoiceEngine.speak(`Image taiyar hai: ${imagePrompt}`).catch(() => {});
    }
    return {
      replyText,
      modeUsed: activeMode,
      generatedImage,
      systemActionBadge: 'AI STUDIO • FLUX',
    };
  }

  // 3. Auto-detect CSE Study Tutor intent if user didn't lock another specialized mode
  const detectedSubject = req.subjectHint || detectCseSubject(userText);
  if (
    activeMode === 'AUTONOMOUS_DEFAULT' &&
    detectedSubject !== 'GENERAL' &&
    !/\b(pure code|only code|no explanation|bina explanation)\b/i.test(userText)
  ) {
    activeMode = 'CSE_SUPER_TUTOR';
  }
  if (/\b(pure code|only code|no explanation|no comments|comment free code)\b/i.test(userText)) {
    activeMode = 'DIRECT_CODE_INJECT';
  }

  // 4. Retrieve Long-Term RAG Memories
  const memories = await retrieveRelevantMemories(userText, 5);
  const memoryBlock =
    memories.length > 0
      ? `\n[RETRIEVED USER MEMORY RAG]:\n` +
        memories.map((m) => `- (${m.category}) ${m.content}`).join('\n')
      : '';

  // 5. Retrieve CSE Syllabus Notes RAG if relevant
  let tutorBlock = '';
  if (activeMode === 'CSE_SUPER_TUTOR' || detectedSubject !== 'GENERAL') {
    const tutorCtx = await buildTutorPromptContext(userText, detectedSubject);
    tutorBlock = `\n${tutorCtx.systemInjection}`;
  }

  // 6. Visit any explicit URLs in the prompt + Live Web & Image Search
  const explicitUrls = extractUrlsFromPrompt(userText);
  const visitedLinks: VerifiedWebLink[] = [];
  let webImages: WebImageResult[] = [];

  for (const u of explicitUrls.slice(0, 2)) {
    const page = await fetchAndReadLiveUrl(u, true);
    if (page) visitedLinks.push(page);
  }

  if (shouldRunLiveWebResearch(userText, activeMode) && explicitUrls.length === 0) {
    const searched = await searchWebAndVerifyLinks(userText, 3);
    visitedLinks.push(...searched);
  }

  if (shouldFetchWebImages(userText, activeMode)) {
    webImages = await searchRealWebImages(userText, 5);
  }

  const webContextBlock =
    visitedLinks.length > 0
      ? `\n[LIVE VERIFIED WEB SOURCES (ALREADY VISITED & READ)]:\n` +
        visitedLinks
          .map(
            (l, idx) =>
              `Source ${idx + 1}: ${l.title} (${l.url})\nExtracted Page Content: ${l.extractedContent.slice(
                0,
                1600
              )}`
          )
          .join('\n\n')
      : '';

  // 7. Attach live Ghost DOM context if in Ghost Autopilot mode
  let ghostDomBlock = '';
  if (activeMode === 'GHOST_AUTOPILOT') {
    const screenDom = (await VortexBridge?.dumpScreenDom?.()) || '[]';
    ghostDomBlock = `\n[ACTIVE ANDROID SCREEN DOM]:\n${String(screenDom).slice(0, 2800)}`;
  }

  // 8. Assemble Final Identity-Locked Prompt
  const assembledPrompt = [
    CORE_IDENTITY_LOCK,
    buildModePromptDirective(activeMode),
    memoryBlock,
    tutorBlock,
    webContextBlock,
    ghostDomBlock,
    `\n[USER REQUEST]:\n${userText}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  let finalReply = await callVortexLlmCore(assembledPrompt, attachments);

  // Enforce strict comment-free single code block if in DIRECT_CODE_INJECT mode
  if (activeMode === 'DIRECT_CODE_INJECT') {
    const langMatch = finalReply.match(/```([a-zA-Z0-9_-]+)/);
    const lang = langMatch?.[1] || 'cpp';
    const pure = sanitizeCommentFreeCode(finalReply, lang);
    finalReply = '```' + lang + '\n' + pure + '\n```';
  }

  // Record delta silently for standby PC Sync queue
  vortexPcBridge
    .recordLocalDelta('CHAT_TURN', {
      userText: userText.slice(0, 400),
      replyText: finalReply.slice(0, 800),
      mode: activeMode,
      ts: Date.now(),
    })
    .catch(() => {});

  // Speak response with ElevenLabs unless silent or code-only mode
  if (!req.silentVoice && activeMode !== 'DIRECT_CODE_INJECT') {
    vortexVoiceEngine.speak(finalReply).catch(() => {});
  }

  return {
    replyText: finalReply,
    modeUsed: activeMode,
    webImages: webImages.length > 0 ? webImages : undefined,
    verifiedLinks: visitedLinks.length > 0 ? visitedLinks : undefined,
    systemActionBadge:
      visitedLinks.length > 0
        ? `VERIFIED ${visitedLinks.length} LINKS`
        : activeMode === 'CSE_SUPER_TUTOR'
        ? `TUTOR • ${detectedSubject}`
        : undefined,
  };
}

export async function runSilentScreenVision(
  customQuestion?: string,
  autoInjectCode = false
): Promise<VortexRouterResponse> {
  await VortexBridge?.updateFloatingHud?.(
    'VORTEX VISION',
    'Reading screen & UI tree silently...',
    true
  );

  const [b64, domJson] = await Promise.all([
    VortexBridge?.captureScreenBase64?.() ?? Promise.resolve(null),
    VortexBridge?.dumpScreenDom?.() ?? Promise.resolve('[]'),
  ]);

  const attachments: VortexAttachment[] = [];
  if (b64) {
    attachments.push({
      id: `scr-${Date.now()}`,
      kind: 'screen',
      name: 'ActiveScreen.jpg',
      mimeType: 'image/jpeg',
      base64Data: b64,
    });
  }

  const promptText = autoInjectCode
    ? `Solve the coding problem visible on this screen and output ONLY pure comment-free runnable code.\nScreen DOM:\n${String(
        domJson
      ).slice(0, 3000)}`
    : `${
        customQuestion ||
        'Analyze this active screen: if it is a coding/math/exam question, solve it cleanly with diagram/code; otherwise summarize key info.'
      }\nScreen DOM:\n${String(domJson).slice(0, 2600)}`;

  const res = await processVortexCommand({
    userText: promptText,
    mode: autoInjectCode ? 'DIRECT_CODE_INJECT' : 'CSE_SUPER_TUTOR',
    attachments,
    silentVoice: autoInjectCode,
  });

  if (autoInjectCode) {
    const langMatch = res.replyText.match(/```([a-zA-Z0-9_-]+)/);
    const lang = langMatch?.[1] || 'cpp';
    const pureCode = sanitizeCommentFreeCode(res.replyText, lang);
    const injected = (await VortexBridge?.injectTextToScreen?.(pureCode, false)) ?? false;

    await VortexBridge?.updateFloatingHud?.(
      injected ? 'CODE INJECTED' : 'CODE COPIED',
      injected
        ? 'Pure comment-free code injected into active editor!'
        : 'Code ready — tap inside editor & press INJECT.',
      true
    );

    return {
      ...res,
      systemActionBadge: injected ? 'SCREEN CODE INJECTED' : 'CODE READY',
    };
  }

  const shortHud = res.replyText
    .replace(/```[\s\S]*?```/g, '[Code/Diagram Ready]')
    .replace(/[#*`]/g, '')
    .trim()
    .slice(0, 220);

  await VortexBridge?.updateFloatingHud?.('VORTEX ANALYSIS', shortHud, true);
  return res;
}
    
