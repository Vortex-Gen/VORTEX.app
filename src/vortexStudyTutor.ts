import { NativeModules } from 'react-native';
import {
  getWeakTopics,
  logWeakTopic,
  queryStudyChunks,
  saveStudyChunk,
} from './vortexMemoryEngine';
import { vortexVoiceEngine } from './vortexVoiceEngine';

const { VortexBridge } = NativeModules;

export type CseSubject =
  | 'DSA'
  | 'OOPS_CPP'
  | 'COA'
  | 'DIGITAL_ELECTRONICS'
  | 'COMPUTER_NETWORKS'
  | 'APPLIED_MATHS'
  | 'GENERAL';

export interface TutorRagContext {
  subject: CseSubject;
  matchedNotes: string[];
  weakTopics: string[];
  systemInjection: string;
}

export interface VivaQuestionState {
  subject: CseSubject;
  question: string;
  expectedKeyPoints: string;
  difficulty: 'EASY' | 'MEDIUM' | 'EXAM_HARD';
}

export interface VivaEvaluationResult {
  scoreOutOf10: number;
  feedback: string;
  idealShortAnswer: string;
  savedAsWeakTopic: boolean;
}

const SUBJECT_KEYWORDS: Record<CseSubject, string[]> = {
  DSA: [
    'linked list', 'stack', 'queue', 'tree', 'bst', 'binary search', 'avl', 'graph',
    'bfs', 'dfs', 'dijkstra', 'sorting', 'quicksort', 'mergesort', 'hashing',
    'time complexity', 'big o', 'recursion', 'pointer', 'array', 'traversal',
  ],
  OOPS_CPP: [
    'c++', 'cpp', 'class', 'object', 'inheritance', 'polymorphism', 'encapsulation',
    'abstraction', 'virtual', 'template', 'constructor', 'destructor', 'friend function',
    'operator overloading', 'cout', 'cin', 'namespace', 'stl',
  ],
  COA: [
    'architecture', 'pipelining', 'risc', 'cisc', 'alu', 'register', 'cache memory',
    'virtual memory', 'paging', 'dma', 'interrupt', 'instruction cycle', 'addressing mode',
    'microprocessor', '8085', '8086', 'control unit', 'gpu', 'multiprocessing',
  ],
  DIGITAL_ELECTRONICS: [
    'flip flop', 'flip-flop', 'jk', 'sr', 'd flip', 't flip', 'k-map', 'karnaugh',
    'boolean', 'logic gate', 'nand', 'nor', 'xor', 'multiplexer', 'mux', 'demux',
    'encoder', 'decoder', 'counter', 'shift register', 'adder', 'half adder', 'full adder',
    'binary', 'hexadecimal', 'octal', 'twos complement',
  ],
  COMPUTER_NETWORKS: [
    'osi', 'tcp/ip', 'tcp', 'udp', 'ip address', 'subnet', 'dns', 'http', 'https',
    'smtp', 'ftp', 'dhcp', 'arp', 'router', 'switch', 'mac address', 'topology',
    'congestion', 'sliding window', 'crc', 'parity', 'firewall', 'network layer',
  ],
  APPLIED_MATHS: [
    'integration', 'integral', 'derivative', 'differentiation', 'differential equation',
    'matrix', 'matrices', 'determinant', 'eigenvalue', 'laplace', 'fourier',
    'partial fraction', 'trigonometry', 'limit', 'dx', 'dy/dx', 'vector calculus',
  ],
  GENERAL: [],
};

export function detectCseSubject(text: string): CseSubject {
  const lower = text.toLowerCase();
  let bestSubject: CseSubject = 'GENERAL';
  let bestHits = 0;

  (Object.keys(SUBJECT_KEYWORDS) as CseSubject[]).forEach((subj) => {
    if (subj === 'GENERAL') return;
    const hits = SUBJECT_KEYWORDS[subj].reduce(
      (acc, kw) => (lower.includes(kw) ? acc + 1 : acc),
      0
    );
    if (hits > bestHits) {
      bestHits = hits;
      bestSubject = subj;
    }
  });

  return bestSubject;
}

export function sanitizeCommentFreeCode(rawCode: string, languageHint = 'cpp'): string {
  const fenceMatch = rawCode.match(/```[a-zA-Z0-9_-]*\n([\s\S]*?)```/);
  let code = fenceMatch ? fenceMatch[1] : rawCode;
  const lang = languageHint.toLowerCase();

  // Remove multi-line /* ... */ comments for C/C++/Java/JS/Kotlin
  if (!lang.includes('py')) {
    code = code.replace(/\/\*[\s\S]*?\*\//g, '');
  }

  const lines = code.split('\n');
  const cleanedLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (lang.includes('py')) {
      if (trimmed.startsWith('#')) continue;
      // Strip inline # comments outside quotes
      let inSingle = false;
      let inDouble = false;
      let cutIdx = -1;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === "'" && !inDouble && line[i - 1] !== '\\') inSingle = !inSingle;
        else if (ch === '"' && !inSingle && line[i - 1] !== '\\') inDouble = !inDouble;
        else if (ch === '#' && !inSingle && !inDouble) {
          cutIdx = i;
          break;
        }
      }
      const res = cutIdx >= 0 ? line.slice(0, cutIdx).trimEnd() : line;
      if (res.trim().length > 0 || trimmed.length === 0) {
        cleanedLines.push(res);
      }
    } else {
      if (trimmed.startsWith('//')) continue;
      let inSingle = false;
      let inDouble = false;
      let cutIdx = -1;
      for (let i = 0; i < line.length - 1; i++) {
        const ch = line[i];
        if (ch === "'" && !inDouble && line[i - 1] !== '\\') inSingle = !inSingle;
        else if (ch === '"' && !inSingle && line[i - 1] !== '\\') inDouble = !inDouble;
        else if (ch === '/' && line[i + 1] === '/' && !inSingle && !inDouble) {
          cutIdx = i;
          break;
        }
      }
      const res = cutIdx >= 0 ? line.slice(0, cutIdx).trimEnd() : line;
      if (res.trim().length > 0 || trimmed.length === 0) {
        cleanedLines.push(res);
      }
    }
  }

  return cleanedLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function ingestNotesToRag(
  subject: CseSubject,
  sourceTitle: string,
  rawText: string
): Promise<number> {
  const normalized = rawText.replace(/\r\n/g, '\n').trim();
  if (!normalized) return 0;

  const chunkSize = 460;
  const overlap = 70;
  let idx = 0;
  let count = 0;

  while (idx < normalized.length) {
    const slice = normalized.slice(idx, idx + chunkSize).trim();
    if (slice.length >= 25) {
      await saveStudyChunk(subject, sourceTitle, slice);
      count++;
    }
    idx += chunkSize - overlap;
  }

  return count;
}

export async function buildTutorPromptContext(
  userQuery: string,
  subjectOverride?: CseSubject
): Promise<TutorRagContext> {
  const subject =
    subjectOverride && subjectOverride !== 'GENERAL'
      ? subjectOverride
      : detectCseSubject(userQuery);

  const matchedNotes = await queryStudyChunks(userQuery, subject === 'GENERAL' ? undefined : subject, 4);
  const weakTopics = await getWeakTopics(subject === 'GENERAL' ? undefined : subject, 5);

  const notesBlock =
    matchedNotes.length > 0
      ? `\n[RETRIEVED SYLLABUS NOTES (${subject})]:\n` +
        matchedNotes.map((n, i) => `(${i + 1}) ${n}`).join('\n')
      : '';

  const weakBlock =
    weakTopics.length > 0
      ? `\n[STUDENT WEAK AREAS TO REINFORCE]: ${weakTopics.join(', ')}`
      : '';

  const systemInjection = `
[CSE SUPER-TUTOR ENGINE ACTIVE • SUBJECT: ${subject}]
1. Provide clear, exam-scoring technical explanations tailored for a Computer Science & Engineering student.
2. Whenever explaining algorithms, trees, graphs, flip-flops, pipelines, or protocols, include a clean \`\`\`diagram\`\`\` block using NodeA[Label] --> NodeB[Label] syntax so it renders as an interactive SVG diagram.
3. For C, C++, or Python code: write 100% clean, runnable, COMMENT-FREE code inside \`\`\`c / \`\`\`cpp / \`\`\`python blocks. Never put // or # comments inside code.
4. For Applied Engineering Mathematics or Digital Electronics numericals: show every intermediate formula step clearly and highlight the final answer in bold.${notesBlock}${weakBlock}
`.trim();

  return {
    subject,
    matchedNotes,
    weakTopics,
    systemInjection,
  };
}

export async function solveScreenProblemAndInject(
  screenDomText: string,
  askAiFn: (prompt: string) => Promise<string>
): Promise<{ code: string; injected: boolean; rawResponse: string }> {
  const prompt = `
Read this active coding screen content and output ONLY pure, runnable, 100% COMMENT-FREE code (C, C++, or Python matching the screen) inside a single fenced code block. Zero explanations, zero comments:

${screenDomText.slice(0, 4000)}
`.trim();

  const rawResponse = await askAiFn(prompt);
  const langMatch = rawResponse.match(/```([a-zA-Z0-9_-]+)/);
  const lang = langMatch?.[1] || 'cpp';
  const cleanCode = sanitizeCommentFreeCode(rawResponse, lang);

  let injected = false;
  if (cleanCode.length > 3 && VortexBridge?.injectTextToScreen) {
    injected = await VortexBridge.injectTextToScreen(cleanCode, false);
  }

  return {
    code: cleanCode,
    injected,
    rawResponse,
  };
}

export async function generateVivaQuestion(
  subject: CseSubject,
  askAiFn: (prompt: string) => Promise<string>
): Promise<VivaQuestionState> {
  const weak = await getWeakTopics(subject === 'GENERAL' ? undefined : subject, 3);
  const focusHint = weak.length > 0 ? `Focus especially on weak topics: ${weak.join(', ')}.` : '';

  const prompt = `
Generate ONE crisp oral viva question for CSE subject "${subject}". ${focusHint}
Return ONLY valid JSON with keys: "question", "expectedKeyPoints", "difficulty" ("EASY" | "MEDIUM" | "EXAM_HARD").
`.trim();

  const raw = await askAiFn(prompt);
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const qState: VivaQuestionState = {
        subject,
        question: String(parsed.question || 'Explain the time complexity of Binary Search.'),
        expectedKeyPoints: String(parsed.expectedKeyPoints || 'O(log n), sorted array, divide and conquer'),
        difficulty: parsed.difficulty === 'EXAM_HARD' ? 'EXAM_HARD' : 'MEDIUM',
      };
      await vortexVoiceEngine.speak(`Viva question for ${subject}: ${qState.question}`);
      return qState;
    }
  } catch {}

  const fallback: VivaQuestionState = {
    subject,
    question: 'What is the difference between a Stack and a Queue with real-world applications?',
    expectedKeyPoints: 'LIFO vs FIFO, push/pop vs enqueue/dequeue, recursion vs scheduling',
    difficulty: 'EASY',
  };
  await vortexVoiceEngine.speak(fallback.question);
  return fallback;
}

export async function evaluateVivaAnswer(
  viva: VivaQuestionState,
  studentAnswer: string,
  askAiFn: (prompt: string) => Promise<string>
): Promise<VivaEvaluationResult> {
  const prompt = `
Evaluate this CSE viva answer.
Subject: ${viva.subject}
Question: ${viva.question}
Expected Key Points: ${viva.expectedKeyPoints}
Student Answer: ${studentAnswer}

Return ONLY valid JSON:
{
  "scoreOutOf10": number,
  "feedback": "short constructive feedback in 2 lines",
  "idealShortAnswer": "crisp 2-sentence model answer"
}
`.trim();

  const raw = await askAiFn(prompt);
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const score = Number(parsed.scoreOutOf10 ?? 6);
      const isWeak = score < 6;
      if (isWeak) {
        await logWeakTopic(viva.subject, viva.question.slice(0, 90), score);
      }
      const res: VivaEvaluationResult = {
        scoreOutOf10: score,
        feedback: String(parsed.feedback || 'Good attempt.'),
        idealShortAnswer: String(parsed.idealShortAnswer || viva.expectedKeyPoints),
        savedAsWeakTopic: isWeak,
      };
      await vortexVoiceEngine.speak(`Score ${score} out of 10. ${res.feedback}`);
      return res;
    }
  } catch {}

  return {
    scoreOutOf10: 7,
    feedback: 'Solid core concept covered.',
    idealShortAnswer: viva.expectedKeyPoints,
    savedAsWeakTopic: false,
  };
}

export async function startCommuteAudioRevision(
  subject: CseSubject,
  topic: string,
  askAiFn: (prompt: string) => Promise<string>
): Promise<string[]> {
  const notes = await queryStudyChunks(topic, subject === 'GENERAL' ? undefined : subject, 4);
  const notesContext = notes.length > 0 ? `\nNotes context:\n${notes.join('\n')}` : '';

  const prompt = `
Create a 4-part spoken audio revision capsule on "${topic}" (${subject}) for a student commuting without looking at the screen.
Separate each part with "|||". Keep each part 3-4 crisp, easy-to-remember sentences with key exam formulas/definitions.${notesContext}
`.trim();

  const raw = await askAiFn(prompt);
  const segments = raw
    .split('|||')
    .map((s) => s.trim())
    .filter((s) => s.length > 10);

  if (segments.length > 0) {
    vortexVoiceEngine.playCommuteCapsule(segments).catch(() => {});
  }
  return segments;
}
