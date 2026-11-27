import {
  DeviceEventEmitter,
  EmitterSubscription,
  NativeModules,
} from 'react-native';
import { ingestRagMemory } from '../db/vortexSqliteRag';
import {
  useVortexStore,
  VortexMacroItem,
  VortexMessage,
} from '../store/useVortexStore';
import { vortexGhostAgent } from './vortexGhostAgent';
import { vortexVoiceWakeword } from './vortexVoiceWakeword';

const { VortexBridge } = NativeModules;

export const DAY_BITS = {
  SUN: 1 << 0,
  MON: 1 << 1,
  TUE: 1 << 2,
  WED: 1 << 3,
  THU: 1 << 4,
  FRI: 1 << 5,
  SAT: 1 << 6,
  WEEKDAYS: (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4) | (1 << 5),
  ALL_DAYS: 127,
};

export function formatDaysMaskLabel(daysMask: number): string {
  if (daysMask === 0) return 'Once';
  if (daysMask === DAY_BITS.ALL_DAYS) return 'Every Day';
  if (daysMask === DAY_BITS.WEEKDAYS) return 'Mon–Fri';

  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const active: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    if ((daysMask & (1 << i)) !== 0) {
      active.push(names[i]);
    }
  }
  return active.join(', ') || 'Once';
}

export function formatTime12Hour(hour: number, minute: number): string {
  const h = ((hour % 24) + 24) % 24;
  const m = ((minute % 60) + 60) % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
}

class VortexMacroScheduler {
  private subscriptions: EmitterSubscription[] = [];
  private batteryMonitorTimer: ReturnType<typeof setInterval> | null = null;
  private lowBatteryNotified = false;
  private initialized = false;

  public start(): void {
    if (this.initialized) return;
    this.initialized = true;

    this.subscriptions.push(
      DeviceEventEmitter.addListener('VORTEX_MACRO_TRIGGERED', (event) => {
        void this.handleScheduledMacroFired(event);
      })
    );

    this.subscriptions.push(
      DeviceEventEmitter.addListener('VORTEX_ORB_ACTION', (event) => {
        void this.handleFloatingOrbAction(event);
      })
    );

    this.subscriptions.push(
      DeviceEventEmitter.addListener('VORTEX_CLIPBOARD_RADAR', (event) => {
        void this.handleClipboardRadarEvent(event);
      })
    );

    this.subscriptions.push(
      DeviceEventEmitter.addListener('VORTEX_NOTIFICATION_EVENT', (event) => {
        this.handleIncomingNotificationEvent(event);
      })
    );

    this.subscriptions.push(
      DeviceEventEmitter.addListener('VORTEX_SYSTEM_ASSIST_TRIGGERED', (event) => {
        void this.handleSystemAssistTrigger(event);
      })
    );

    this.batteryMonitorTimer = setInterval(() => {
      void this.evaluateConditionTriggers();
    }, 120_000);

    void this.syncAllEnabledAlarms();
  }

  public stop(): void {
    this.subscriptions.forEach((sub) => sub.remove());
    this.subscriptions = [];
    if (this.batteryMonitorTimer) {
      clearInterval(this.batteryMonitorTimer);
      this.batteryMonitorTimer = null;
    }
    this.initialized = false;
  }

  public async syncAllEnabledAlarms(): Promise<void> {
    const store = useVortexStore.getState();
    for (const macro of store.macros) {
      if (macro.enabled && VortexBridge?.scheduleMacroAlarm) {
        try {
          const payload = JSON.stringify({
            command: macro.command,
            label: macro.title,
            ringAlarm: macro.ringAlarm,
          });
          await VortexBridge.scheduleMacroAlarm(
            macro.id,
            macro.hour,
            macro.minute,
            macro.daysMask,
            payload
          );
        } catch (_e) {
        }
      }
    }
  }

  public async createMacroFromNaturalPrompt(prompt: string): Promise<VortexMacroItem | null> {
    const lower = prompt.toLowerCase();
    const timeMatch = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|baje)?\b/);
    if (!timeMatch) return null;

    let hour = parseInt(timeMatch[1], 10);
    const minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const meridiem = timeMatch[3];

    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    if (!meridiem && /\b(raat|night|evening|sham)\b/.test(lower) && hour < 12) {
      hour += 12;
    }

    let daysMask = 0;
    if (/\b(every day|daily|roz|har roz)\b/.test(lower)) {
      daysMask = DAY_BITS.ALL_DAYS;
    } else if (/\b(mon-fri|weekdays|college days)\b/.test(lower)) {
      daysMask = DAY_BITS.WEEKDAYS;
    } else {
      if (/\bsun/.test(lower)) daysMask |= DAY_BITS.SUN;
      if (/\bmon/.test(lower)) daysMask |= DAY_BITS.MON;
      if (/\btue/.test(lower)) daysMask |= DAY_BITS.TUE;
      if (/\bwed/.test(lower)) daysMask |= DAY_BITS.WED;
      if (/\bthu/.test(lower)) daysMask |= DAY_BITS.THU;
      if (/\bfri/.test(lower)) daysMask |= DAY_BITS.FRI;
      if (/\bsat/.test(lower)) daysMask |= DAY_BITS.SAT;
    }

    const actions: string[] = [];
    if (/\b(ram|sweep|clean|optimize)\b/.test(lower)) actions.push('TURBO_SWEEP');
    if (/\b(viva|study|revision|commute)\b/.test(lower)) actions.push('AUDIO_VIVA');
    if (/\b(orb|floating)\b/.test(lower)) actions.push('START_ORB');
    if (/\b(sync|pc)\b/.test(lower)) actions.push('PC_SYNC');

    const isAlarm = /\b(alarm|jagna|wake)\b/.test(lower);
    const commandStr =
      actions.length > 0 ? actions.join(' + ') : isAlarm ? 'ALARM_RING' : prompt.trim();

    const macro: VortexMacroItem = {
      id: `macro_${Date.now()}`,
      title: isAlarm
        ? `Alarm • ${formatTime12Hour(hour, minute)}`
        : `Routine • ${formatTime12Hour(hour, minute)}`,
      command: commandStr,
      hour: Math.min(23, Math.max(0, hour)),
      minute: Math.min(59, Math.max(0, minute)),
      daysMask,
      enabled: true,
      ringAlarm: isAlarm,
    };

    await useVortexStore.getState().upsertMacro(macro);
    return macro;
  }

  private async handleScheduledMacroFired(event: any): Promise<void> {
    const store = useVortexStore.getState();
    const macroId = String(event?.macroId || '');
    const macro = store.macros.find((m) => m.id === macroId);

    let commandText = '';
    let label = macro?.title || 'Scheduled VORTEX Routine';
    try {
      const parsed = JSON.parse(String(event?.actionPayload || '{}'));
      commandText = parsed.command || macro?.command || '';
      label = parsed.label || label;
    } catch (_e) {
      commandText = macro?.command || '';
    }

    if (macro) {
      await store.upsertMacro({
        ...macro,
        enabled: macro.daysMask > 0 ? macro.enabled : false,
        lastTriggeredAt: Date.now(),
      });
    }

    const results: string[] = [];
    const upperCmd = commandText.toUpperCase();

    if (upperCmd.includes('TURBO_SWEEP') && VortexBridge?.runTurboSweep) {
      const sweep = await VortexBridge.runTurboSweep();
      results.push(`RAM optimized (${Math.round(sweep?.freedMb || 0)} MB freed)`);
    }

    if (upperCmd.includes('START_ORB')) {
      await store.updateOrbSettings({ enabled: true });
      results.push('Floating Orb activated');
    }

    if (upperCmd.includes('AUDIO_VIVA')) {
      store.setActiveScreen('study_notebooks');
      results.push('CSE Audio Viva ready');
    }

    const cleanedNatural = commandText
      .replace(/\b(TURBO_SWEEP|START_ORB|AUDIO_VIVA|ALARM_RING|PC_SYNC)\b/gi, '')
      .replace(/\+/g, '')
      .trim();

    if (cleanedNatural.length >= 3) {
      const exec = await vortexGhostAgent.executeCommand(cleanedNatural);
      if (exec.replyText) {
        results.push(exec.replyText);
      }
    }

    const summary =
      results.length > 0
        ? `[Macro Executed: ${label}] ${results.join(' • ')}`
        : `[Alarm Triggered: ${label}]`;

    this.postSystemBubbleToActiveChat(summary);
    await store.refreshNativeDiagnostics();

    if (store.wakewordEnabled) {
      await vortexVoiceWakeword.speakResponse(summary);
    }
  }

  private async handleFloatingOrbAction(event: any): Promise<void> {
    const action = String(event?.action || '');
    const store = useVortexStore.getState();

    if (action === 'VOICE_CAPTURE') {
      store.setActiveScreen('voice_live');
      await vortexVoiceWakeword.startDirectVoiceCapture();
      return;
    }

    if (action === 'QUICK_INJECT') {
      const res = await vortexGhostAgent.scanAndInjectScreen();
      this.postSystemBubbleToActiveChat(res.replyText);
      if (res.spokenText && store.wakewordEnabled) {
        await vortexVoiceWakeword.speakResponse(res.spokenText);
      }
      return;
    }

    if (action === 'SILENT_SCAN') {
      const res = await vortexGhostAgent.scanAndInjectScreen(
        'Analyze what is currently visible on my screen and summarize or solve any visible error/question concisely.'
      );
      this.postSystemBubbleToActiveChat(res.replyText);
      if (res.spokenText && store.wakewordEnabled) {
        await vortexVoiceWakeword.speakResponse(res.spokenText);
      }
    }
  }

  private async handleClipboardRadarEvent(event: any): Promise<void> {
    const copiedText = String(event?.text || '').trim();
    if (!copiedText) return;

    const preview = copiedText.slice(0, 260);
    this.postSystemBubbleToActiveChat(
      `Clipboard Error / Code Radar detected snippet:\n\n\`\`\`\n${preview}\n\`\`\`\nSay **"fix clipboard"** or tap **Inject** on the floating orb to solve and inject.`
    );

    await ingestRagMemory({
      scope: 'cse_diploma',
      title: 'Clipboard Code / Error Capture',
      content: copiedText.slice(0, 2000),
      tags: ['clipboard', 'error-radar', 'code'],
      importance: 2,
      queueForPcSync: false,
    });
  }

  private handleIncomingNotificationEvent(event: any): void {
    const key = String(event?.key || '');
    const packageName = String(event?.packageName || '');
    const sender = String(event?.title || packageName);
    const body = String(event?.body || '');
    const otp = String(event?.otp || '');
    const canDirectReply = Boolean(event?.canDirectReply);
    const timestamp = Number(event?.timestamp || Date.now());

    vortexGhostAgent.recordIncomingNotification({
      key,
      packageName,
      sender,
      body,
      otp,
      canDirectReply,
      timestamp,
    });

    if (otp) {
      this.postSystemBubbleToActiveChat(`OTP Captured (${sender}): **${otp}**`);
    }
  }

  private async handleSystemAssistTrigger(event: any): Promise<void> {
    const store = useVortexStore.getState();
    store.setActiveScreen('voice_live');

    const pkg = String(event?.packageName || '');
    const nodesJson = String(event?.nodesJson || '[]');
    if (pkg && nodesJson !== '[]') {
      await ingestRagMemory({
        scope: 'vortex',
        title: `Assist Screen Context (${pkg})`,
        content: nodesJson.slice(0, 1800),
        tags: ['assist', 'screen-context'],
        importance: 2,
        queueForPcSync: false,
      });
    }

    if (event?.autoListen !== false) {
      await vortexVoiceWakeword.startDirectVoiceCapture();
    }
  }

  private async evaluateConditionTriggers(): Promise<void> {
    const store = useVortexStore.getState();
    await store.refreshNativeDiagnostics();
    const tel = useVortexStore.getState().telemetry;

    if (tel.batteryPercent > 0 && tel.batteryPercent <= 18 && !tel.isCharging) {
      if (!this.lowBatteryNotified) {
        this.lowBatteryNotified = true;
        await store.updateOrbSettings({ stealthMode: true, opacity: 0.25 });
        this.postSystemBubbleToActiveChat(
          `Battery at ${tel.batteryPercent}%. Switched VORTEX Orb to low-power stealth mode.`
        );
      }
    } else if (tel.isCharging || tel.batteryPercent > 25) {
      this.lowBatteryNotified = false;
    }
  }

  private postSystemBubbleToActiveChat(content: string): void {
    const store = useVortexStore.getState();
    const sessionId = store.activeSessionId;
    if (!sessionId) return;

    const msg: VortexMessage = {
      id: `sys_${Date.now()}_${Math.floor(Math.random() * 999)}`,
      role: 'assistant',
      content,
      timestamp: Date.now(),
      mode: 'ghost',
      providerTag: 'VORTEX Autonomous Engine',
    };
    store.appendMessage(sessionId, msg);
  }
}

export const vortexMacroScheduler = new VortexMacroScheduler();
