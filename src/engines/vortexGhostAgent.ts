import { Dimensions, NativeModules } from 'react-native';
import { ingestRagMemory } from '../db/vortexSqliteRag';
import {
  GhostStepLog,
  PendingSafetyAction,
  useVortexStore,
  VortexWorkflow,
  WorkflowRecordedStep,
} from '../store/useVortexStore';
import { vortexLlmRouter } from './vortexLlmRouter';

const { VortexBridge } = NativeModules;

export interface CapturedDomNode {
  tag: number;
  text: string;
  desc: string;
  viewId: string;
  className: string;
  clickable: boolean;
  editable: boolean;
  scrollable: boolean;
  focused: boolean;
  centerX: number;
  centerY: number;
  bounds: string;
}

export interface ScreenSnapshot {
  packageName: string;
  timestamp: number;
  domHash: string;
  screenshotBase64: string;
  nodes: CapturedDomNode[];
}

export interface AgentExecutionResult {
  handled: boolean;
  replyText: string;
  spokenText?: string;
  actionType:
    | 'os_fast'
    | 'screen_inject'
    | 'workflow_replay'
    | 'closed_loop'
    | 'chat_passthrough';
  stepsExecuted?: number;
}

interface PlannerStepDecision {
  thought: string;
  action: 'tap' | 'swipe' | 'inject_text' | 'launch_app' | 'back' | 'wait' | 'done' | 'fail';
  targetTag?: number;
  x?: number;
  y?: number;
  swipeDirection?: 'up' | 'down' | 'left' | 'right';
  text?: string;
  humanCadence?: boolean;
  appQuery?: string;
  requiresSafetyApproval?: boolean;
  safetyCategory?: PendingSafetyAction['actionType'];
  safetyPreview?: string;
  finalSummary?: string;
}

interface CachedNotificationTarget {
  key: string;
  packageName: string;
  sender: string;
  body: string;
  otp: string;
  canDirectReply: boolean;
  timestamp: number;
}

function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractBalancedJson(raw: string): string {
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end > start) {
    return cleaned.slice(start, end + 1);
  }
  return cleaned;
}

class VortexGhostAgent {
  private isRunning = false;
  private isPaused = false;
  private abortFlag = false;
  private safetyResolver: ((approved: boolean) => void) | null = null;
  private recentNotifications: CachedNotificationTarget[] = [];
  private latestOtp: { code: string; sender: string; timestamp: number } | null = null;

  public recordIncomingNotification(item: CachedNotificationTarget): void {
    this.recentNotifications = [
      item,
      ...this.recentNotifications.filter((n) => n.key !== item.key),
    ].slice(0, 25);

    if (item.otp && item.otp.length >= 4) {
      this.latestOtp = {
        code: item.otp,
        sender: item.sender,
        timestamp: item.timestamp,
      };
    }
  }

  public getLatestOtp(): { code: string; sender: string; timestamp: number } | null {
    return this.latestOtp;
  }

  public pauseLoop(): void {
    this.isPaused = true;
  }

  public resumeLoop(): void {
    this.isPaused = false;
  }

  public stopLoop(reason = 'Stopped by user'): void {
    this.abortFlag = true;
    this.isPaused = false;
    if (this.safetyResolver) {
      this.safetyResolver(false);
      this.safetyResolver = null;
    }
    useVortexStore.getState().haltGhostLoop(reason);
  }

  public submitSafetyDecision(approved: boolean): void {
    useVortexStore.getState().resolveSafetyAction(approved);
    if (this.safetyResolver) {
      const resolve = this.safetyResolver;
      this.safetyResolver = null;
      resolve(approved);
    }
  }

  public async captureLiveScreen(): Promise<ScreenSnapshot | null> {
    try {
      if (!VortexBridge?.captureScreenAndDom) return null;
      const rawJson = await VortexBridge.captureScreenAndDom();
      if (!rawJson || typeof rawJson !== 'string') return null;
      const parsed = JSON.parse(rawJson);
      return {
        packageName: parsed.packageName || 'unknown',
        timestamp: parsed.timestamp || Date.now(),
        domHash: parsed.domHash || '',
        screenshotBase64: parsed.screenshotBase64 || '',
        nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
      };
    } catch (_e) {
      return null;
    }
  }

  public async executeCommand(rawCommand: string): Promise<AgentExecutionResult> {
    const command = rawCommand.trim();
    if (!command) {
      return {
        handled: false,
        replyText: '',
        actionType: 'chat_passthrough',
      };
    }

    const fastResult = await this.tryDeterministicFastCommand(command);
    if (fastResult) {
      return fastResult;
    }

    const matchedWorkflow = this.findMatchingWorkflow(command);
    if (matchedWorkflow) {
      return this.replaySavedWorkflow(matchedWorkflow);
    }

    if (this.isScreenSolveOrInjectIntent(command)) {
      return this.scanAndInjectScreen(command);
    }

    if (this.isAutonomousUiGoal(command)) {
      return this.runClosedLoopGoal(command, 12);
    }

    return {
      handled: false,
      replyText: '',
      actionType: 'chat_passthrough',
    };
  }

  private async tryDeterministicFastCommand(
    command: string
  ): Promise<AgentExecutionResult | null> {
    const lower = command.toLowerCase();

    if (
      /\b(torch|flashlight|flash light)\b/.test(lower) &&
      /\b(on|off|chalu|band|jalao|bujhao|enable|disable|toggle)\b/.test(lower)
    ) {
      const turnOn = /\b(on|chalu|jalao|enable)\b/.test(lower);
      try {
        if (VortexBridge?.toggleTorch) {
          const state = await VortexBridge.toggleTorch(turnOn);
          const msg = state ? 'Flashlight turned ON.' : 'Flashlight turned OFF.';
          return { handled: true, replyText: msg, spokenText: msg, actionType: 'os_fast' };
        }
      } catch (_e) {
      }
    }

    if (
      /\b(turbo sweep|clean ram|ram clean|clear cache|boost phone|optimize phone|ram sweep|memory clean)\b/.test(
        lower
      )
    ) {
      try {
        if (VortexBridge?.runTurboSweep) {
          const res = await VortexBridge.runTurboSweep();
          await useVortexStore.getState().refreshNativeDiagnostics();
          const freed = Math.round(res?.freedMb || 0);
          const avail = Math.round(res?.freeRamMb || 0);
          const msg = `Turbo Sweep complete. Freed ${freed} MB RAM (${avail} MB available now).`;
          return { handled: true, replyText: msg, spokenText: msg, actionType: 'os_fast' };
        }
      } catch (_e) {
      }
    }

    if (
      /\b(battery|ram status|storage status|system status|device stats|free space|kitni battery|kitna ram)\b/.test(
        lower
      ) &&
      !/\b(settings|open|khol)\b/.test(lower)
    ) {
      try {
        if (VortexBridge?.getSystemTelemetry) {
          const tel = await VortexBridge.getSystemTelemetry();
          const freeRam = (tel.freeRamMb / 1024).toFixed(1);
          const totalRam = (tel.totalRamMb / 1024).toFixed(1);
          const freeGb = Number(tel.freeStorageGb || 0).toFixed(1);
          const totalGb = Number(tel.totalStorageGb || 0).toFixed(1);
          const charging = tel.isCharging ? 'Charging' : 'On Battery';
          const msg = `Battery: ${tel.batteryPercent}% (${charging}) | RAM: ${freeRam}/${totalRam} GB free | Storage: ${freeGb}/${totalGb} GB free.`;
          return { handled: true, replyText: msg, spokenText: msg, actionType: 'os_fast' };
        }
      } catch (_e) {
      }
    }

    if (/\b(last otp|latest otp|otp kya|verification code)\b/.test(lower)) {
      if (this.latestOtp) {
        const msg = `Latest OTP from ${this.latestOtp.sender}: ${this.latestOtp.code}`;
        return { handled: true, replyText: msg, spokenText: msg, actionType: 'os_fast' };
      }
      return {
        handled: true,
        replyText: 'No recent OTP captured in notification feed.',
        spokenText: 'No recent OTP found.',
        actionType: 'os_fast',
      };
    }

    const replyMatch = command.match(
      /^(?:reply|whatsapp reply|message reply)\s+(?:to\s+)?([a-zA-Z0-9 _.-]+?)\s*(?::|saying|that|ki|-)\s*(.+)$/i
    );
    if (replyMatch && VortexBridge?.sendDirectReply) {
      const targetSender = replyMatch[1].trim();
      const replyBody = replyMatch[2].trim();
      const cached = this.recentNotifications.find(
        (n) =>
          n.canDirectReply &&
          (n.sender.toLowerCase().includes(targetSender.toLowerCase()) ||
            n.packageName.toLowerCase().includes(targetSender.toLowerCase()))
      );
      if (cached) {
        try {
          const sent = await VortexBridge.sendDirectReply(cached.key, replyBody);
          if (sent) {
            const msg = `Direct reply sent to ${cached.sender}: "${replyBody}"`;
            return { handled: true, replyText: msg, spokenText: msg, actionType: 'os_fast' };
          }
        } catch (_e) {
        }
      }
    }

    const callMatch = command.match(/^(?:call|dial|phone lagao)\s+([+0-9\s-]{5,18})$/i);
    if (callMatch && VortexBridge?.makeDirectCall) {
      const number = callMatch[1].trim();
      try {
        await VortexBridge.makeDirectCall(number);
        const msg = `Calling ${number}...`;
        return { handled: true, replyText: msg, spokenText: msg, actionType: 'os_fast' };
      } catch (_e) {
      }
    }

    const smsMatch = command.match(
      /^(?:send sms|sms)\s+(?:to\s+)?([+0-9]{5,15})\s*(?::|saying|message|-)\s*(.+)$/i
    );
    if (smsMatch && VortexBridge?.sendDirectSms) {
      const number = smsMatch[1].trim();
      const body = smsMatch[2].trim();
      try {
        await VortexBridge.sendDirectSms(number, body);
        const msg = `SMS sent to ${number}.`;
        return { handled: true, replyText: msg, spokenText: msg, actionType: 'os_fast' };
      } catch (_e) {
      }
    }

    if (
      /\b(hide orb|stop orb|orb band|orb off|show orb|start orb|orb chalu|orb on)\b/.test(
        lower
      )
    ) {
      const enable = /\b(show|start|chalu|on)\b/.test(lower);
      await useVortexStore.getState().updateOrbSettings({ enabled: enable });
      const msg = enable ? 'Floating VORTEX Orb activated.' : 'Floating VORTEX Orb hidden.';
      return { handled: true, replyText: msg, spokenText: msg, actionType: 'os_fast' };
    }

    const singleOpenMatch = command.match(
      /^(?:open|launch|start|kholo|khol)\s+([a-zA-Z0-9 ._-]{2,32})$/i
    );
    if (singleOpenMatch && VortexBridge?.launchApp) {
      const appName = singleOpenMatch[1].trim();
      try {
        const launchedPkg = await VortexBridge.launchApp(appName);
        const msg = `Launched ${appName} (${launchedPkg}).`;
        return { handled: true, replyText: msg, spokenText: `Opening ${appName}`, actionType: 'os_fast' };
      } catch (_e) {
      }
    }

    return null;
  }

  private findMatchingWorkflow(command: string): VortexWorkflow | null {
    const lower = command.toLowerCase().trim();
    const workflows = useVortexStore.getState().workflows;
    for (const wf of workflows) {
      if (!wf.triggerPhrase) continue;
      if (lower === wf.triggerPhrase || lower.includes(wf.triggerPhrase)) {
        return wf;
      }
    }
    return null;
  }

  private isScreenSolveOrInjectIntent(command: string): boolean {
    const lower = command.toLowerCase();
    return /\b(inject|auto solve|solve screen|fix screen|screen error|code inject|type answer|paste answer|quick inject|screen pe jo|is screen ko)\b/.test(
      lower
    );
  }

  private isAutonomousUiGoal(command: string): boolean {
    const lower = command.toLowerCase();
    const hasActionVerb =
      /\b(open|launch|khol|kholo|tap|click|dabao|scroll|swipe|search|play|chalao|send|bhej|bhejo|enable|disable|turn on|turn off|go to|navigate|find|check|download|install|automate|type|likho|fill)\b/.test(
        lower
      );
    const isPureCodingOrStudyQuestion =
      /^(?:write|explain|define|what is|how does|difference between|code for|program for|derive|prove|draw)\b/.test(
        lower
      );

    if (isPureCodingOrStudyQuestion && !/\b(on screen|in app|in chrome|in youtube|in whatsapp|in settings)\b/.test(lower)) {
      return false;
    }
    return hasActionVerb && command.split(/\s+/).length >= 2;
  }

  public async scanAndInjectScreen(customInstruction?: string): Promise<AgentExecutionResult> {
    const snapshot = await this.captureLiveScreen();
    if (!snapshot) {
      return {
        handled: true,
        replyText: 'Accessibility Service is inactive. Enable VORTEX Accessibility to scan and inject.',
        spokenText: 'Please enable VORTEX Accessibility service first.',
        actionType: 'screen_inject',
      };
    }

    const domSummary = snapshot.nodes
      .slice(0, 75)
      .map((n) => `[${n.tag}] ${n.text || n.desc} (${n.editable ? 'EDITABLE' : n.clickable ? 'BTN' : 'TXT'})`)
      .join('\n');

    const prompt = [
      customInstruction ||
        'Inspect the active screen. If there is a coding problem, compiler error, or form question, output ONLY the exact comment-free solution code or answer to inject. If it is a messaging app, output ONLY the natural reply text.',
      `Active App Package: ${snapshot.packageName}`,
      `Visible Screen Elements:\n${domSummary}`,
      'Return ONLY the exact text/code to inject into the active input field without markdown fences or explanations.',
    ].join('\n\n');

    const llmRes = await vortexLlmRouter.generate({
      prompt,
      mode: snapshot.screenshotBase64 ? 'vision' : 'code',
      imageBase64: snapshot.screenshotBase64 || undefined,
      mimeType: 'image/jpeg',
      stripCodeComments: true,
    });

    const cleanPayload = llmRes.text
      .replace(/^```[a-zA-Z0-9_+-]*\n?/g, '')
      .replace(/```$/g, '')
      .trim();

    if (!cleanPayload) {
      return {
        handled: true,
        replyText: 'Could not extract an injectable answer from the current screen.',
        spokenText: 'Nothing to inject found on screen.',
        actionType: 'screen_inject',
      };
    }

    const isShortChat = cleanPayload.length <= 140 && !cleanPayload.includes('\n');
    let injected = false;
    try {
      if (VortexBridge?.injectTextToFocusedNode) {
        injected = await VortexBridge.injectTextToFocusedNode(cleanPayload, isShortChat);
      }
    } catch (_e) {
    }

    const replyText = injected
      ? `Injected directly into ${snapshot.packageName}:\n\n\`\`\`\n${cleanPayload}\n\`\`\``
      : `Generated solution for ${snapshot.packageName} (tap input box and retry Inject if not focused):\n\n\`\`\`\n${cleanPayload}\n\`\`\``;

    return {
      handled: true,
      replyText,
      spokenText: injected ? 'Solution injected into screen.' : 'Solution ready on screen.',
      actionType: 'screen_inject',
    };
  }

  public async replaySavedWorkflow(workflow: VortexWorkflow): Promise<AgentExecutionResult> {
    const store = useVortexStore.getState();
    store.startGhostLoop(`Workflow: ${workflow.name}`, workflow.steps.length);
    const { width: screenW, height: screenH } = Dimensions.get('window');

    let completedSteps = 0;
    for (const step of workflow.steps) {
      if (this.abortFlag) break;

      store.updateGhostLoop({
        status: 'acting',
        currentStep: step.order,
      });

      if (step.action === 'launch_app' && step.packageName) {
        await VortexBridge?.launchApp?.(step.packageName);
      } else if (step.action === 'tap') {
        const snap = await this.captureLiveScreen();
        let targetX = step.normX * screenW;
        let targetY = step.normY * screenH;

        if (snap && snap.nodes.length > 0) {
          const semanticMatch =
            (step.viewId && snap.nodes.find((n) => n.viewId === step.viewId)) ||
            (step.textAnchor &&
              snap.nodes.find((n) =>
                n.text.toLowerCase().includes(step.textAnchor!.toLowerCase())
              )) ||
            (step.descAnchor &&
              snap.nodes.find((n) =>
                n.desc.toLowerCase().includes(step.descAnchor!.toLowerCase())
              ));

          if (semanticMatch) {
            targetX = semanticMatch.centerX;
            targetY = semanticMatch.centerY;
          }
        }

        await VortexBridge?.performGhostTap?.(targetX, targetY);
      } else if (step.action === 'inject_text' && step.inputValue) {
        await VortexBridge?.injectTextToFocusedNode?.(step.inputValue, step.inputValue.length <= 120);
      } else if (step.action === 'swipe') {
        await VortexBridge?.performGhostSwipe?.(
          screenW * 0.5,
          screenH * 0.72,
          screenW * 0.5,
          screenH * 0.28,
          360
        );
      }

      completedSteps += 1;
      store.appendGhostLog({
        id: `wf_step_${Date.now()}_${completedSteps}`,
        step: completedSteps,
        phase: 'verify',
        summary: `Executed ${step.action} ${step.textAnchor || step.packageName || ''}`.trim(),
        timestamp: Date.now(),
        success: true,
      });

      await delayMs(Math.max(400, step.delayMs || 850));
    }

    store.updateGhostLoop({ status: 'completed' });
    const summary = `Workflow "${workflow.name}" finished (${completedSteps}/${workflow.steps.length} steps).`;
    return {
      handled: true,
      replyText: summary,
      spokenText: summary,
      actionType: 'workflow_replay',
      stepsExecuted: completedSteps,
    };
  }

  public async runClosedLoopGoal(goal: string, maxSteps = 12): Promise<AgentExecutionResult> {
    if (this.isRunning) {
      this.stopLoop('Preempted by new command');
      await delayMs(200);
    }

    this.isRunning = true;
    this.isPaused = false;
    this.abortFlag = false;

    const store = useVortexStore.getState();
    store.startGhostLoop(goal, maxSteps);

    const actionHistory: string[] = [];
    let stagnantCount = 0;
    let lastDomHash = '';
    let finalSummary = '';
    let executedSteps = 0;

    try {
      for (let stepNum = 1; stepNum <= maxSteps; stepNum += 1) {
        while (this.isPaused && !this.abortFlag) {
          await delayMs(250);
        }
        if (this.abortFlag) {
          finalSummary = 'Autonomous loop halted by user.';
          break;
        }

        store.updateGhostLoop({
          status: 'observing',
          currentStep: stepNum,
        });

        const preSnap = await this.captureLiveScreen();
        if (!preSnap) {
          finalSummary = 'Accessibility Service unavailable. Enable VORTEX Accessibility Service in Settings.';
          store.haltGhostLoop(finalSummary);
          break;
        }

        if (preSnap.domHash === lastDomHash && stepNum > 1) {
          stagnantCount += 1;
        } else {
          stagnantCount = 0;
        }
        lastDomHash = preSnap.domHash;

        store.updateGhostLoop({ status: 'planning' });
        const decision = await this.planNextClosedLoopStep(
          goal,
          preSnap,
          actionHistory,
          stagnantCount
        );

        if (decision.action === 'done') {
          finalSummary = decision.finalSummary || `Goal completed: ${goal}`;
          store.appendGhostLog({
            id: `done_${Date.now()}`,
            step: stepNum,
            phase: 'verify',
            summary: finalSummary,
            domHash: preSnap.domHash,
            timestamp: Date.now(),
            success: true,
          });
          store.updateGhostLoop({ status: 'completed' });
          break;
        }

        if (decision.action === 'fail') {
          finalSummary = decision.finalSummary || `Unable to complete goal: ${decision.thought}`;
          store.haltGhostLoop(finalSummary);
          break;
        }

        const needsGuard =
          Boolean(decision.requiresSafetyApproval) ||
          this.detectHighRiskAction(decision, preSnap);

        if (needsGuard) {
          const pendingSafety: PendingSafetyAction = {
            id: `safe_${Date.now()}`,
            targetApp: preSnap.packageName,
            actionType: decision.safetyCategory || 'send_message',
            previewText:
              decision.safetyPreview ||
              `${decision.action.toUpperCase()}: ${decision.text || decision.thought}`,
            coordinates:
              decision.x !== undefined && decision.y !== undefined
                ? { x: decision.x, y: decision.y }
                : undefined,
            createdAt: Date.now(),
          };

          store.updateGhostLoop({
            status: 'awaiting_approval',
            pendingSafety,
          });
          store.appendGhostLog({
            id: `guard_${Date.now()}`,
            step: stepNum,
            phase: 'safety_pause',
            summary: `Awaiting user approval: ${pendingSafety.previewText}`,
            timestamp: Date.now(),
            success: true,
          });

          const approved = await new Promise<boolean>((resolve) => {
            this.safetyResolver = resolve;
          });

          if (!approved || this.abortFlag) {
            finalSummary = 'Action cancelled at safety checkpoint.';
            store.haltGhostLoop(finalSummary);
            break;
          }
        }

        store.updateGhostLoop({ status: 'acting' });
        const actOutcome = await this.performPlannedAction(decision, preSnap);
        executedSteps += 1;
        actionHistory.push(`Step ${stepNum}: ${actOutcome.logLine}`);

        store.updateGhostLoop({ status: 'verifying' });
        await delayMs(1150);
        const postSnap = await this.captureLiveScreen();
        const uiChanged = Boolean(postSnap && postSnap.domHash !== preSnap.domHash);

        store.appendGhostLog({
          id: `step_${Date.now()}_${stepNum}`,
          step: stepNum,
          phase: 'verify',
          summary: `${actOutcome.logLine} ${uiChanged ? '(UI updated)' : '(State unchanged)'}`,
          domHash: postSnap?.domHash || preSnap.domHash,
          targetNode: actOutcome.targetLabel,
          timestamp: Date.now(),
          success: actOutcome.success,
        });

        if (stepNum === maxSteps && !finalSummary) {
          finalSummary = `Reached max ${maxSteps} steps for "${goal}". Last action: ${actOutcome.logLine}`;
          store.updateGhostLoop({ status: 'completed' });
        }
      }
    } catch (err: any) {
      finalSummary = `Closed-loop error: ${err?.message || 'Unexpected execution failure'}`;
      store.haltGhostLoop(finalSummary);
    } finally {
      this.isRunning = false;
    }

    if (executedSteps > 0) {
      void ingestRagMemory({
        scope: 'vortex',
        title: `Executed Command: ${goal.slice(0, 60)}`,
        content: `Goal: ${goal}\nOutcome: ${finalSummary}\nActions:\n${actionHistory.join('\n')}`,
        tags: ['ghost-loop', 'execution', 'autonomous'],
        importance: 3,
      });
    }

    return {
      handled: true,
      replyText: finalSummary || `Executed ${executedSteps} autonomous steps for "${goal}".`,
      spokenText: finalSummary || 'Task completed.',
      actionType: 'closed_loop',
      stepsExecuted: executedSteps,
    };
  }

  private async planNextClosedLoopStep(
    goal: string,
    snap: ScreenSnapshot,
    history: string[],
    stagnantCount: number
  ): Promise<PlannerStepDecision> {
    const { width, height } = Dimensions.get('window');
    const domLines = snap.nodes
      .slice(0, 90)
      .map(
        (n) =>
          `[${n.tag}] text="${n.text}" desc="${n.desc}" id="${n.viewId}" ${
            n.editable ? 'EDITABLE' : n.clickable ? 'CLICKABLE' : n.scrollable ? 'SCROLLABLE' : 'VIEW'
          } pos=(${n.centerX},${n.centerY})`
      )
      .join('\n');

    const plannerPrompt = [
      `User Goal: "${goal}"`,
      `Screen Resolution: ${Math.round(width)}x${Math.round(height)}`,
      `Current Foreground App: ${snap.packageName}`,
      `Stagnant Repeated Screen Count: ${stagnantCount}`,
      history.length > 0
        ? `Previous Executed Steps:\n${history.slice(-6).join('\n')}`
        : 'Previous Executed Steps: None (First step)',
      `Interactive DOM Nodes (Set-of-Mark):\n${domLines || 'No accessible nodes visible'}`,
      stagnantCount >= 2
        ? 'WARNING: The screen did not change after the last action. Try scrolling, tapping an alternate node, or pressing back.'
        : '',
      `Respond strictly with a single JSON object matching this schema:
{
  "thought": "short reasoning about current screen and next step",
  "action": "tap" | "swipe" | "inject_text" | "launch_app" | "back" | "wait" | "done" | "fail",
  "targetTag": 1,
  "x": 540,
  "y": 1100,
  "swipeDirection": "up",
  "text": "text to type when action is inject_text",
  "humanCadence": true,
  "appQuery": "app name when action is launch_app",
  "requiresSafetyApproval": false,
  "safetyCategory": "send_message",
  "safetyPreview": "description if requiresSafetyApproval is true",
  "finalSummary": "concise completion summary when action is done or fail"
}
Set requiresSafetyApproval=true ONLY when tapping Send on a message/email, confirming a payment/order, deleting files/accounts, or toggling critical security settings.`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const llmOut = await vortexLlmRouter.generate({
      prompt: plannerPrompt,
      mode: 'ghost',
      imageBase64: snap.screenshotBase64 || undefined,
      mimeType: 'image/jpeg',
      useRag: false,
      jsonResponse: true,
      stripCodeComments: false,
    });

    try {
      const parsed = JSON.parse(extractBalancedJson(llmOut.text));
      return {
        thought: String(parsed.thought || ''),
        action: parsed.action || 'fail',
        targetTag: typeof parsed.targetTag === 'number' ? parsed.targetTag : undefined,
        x: typeof parsed.x === 'number' ? parsed.x : undefined,
        y: typeof parsed.y === 'number' ? parsed.y : undefined,
        swipeDirection: parsed.swipeDirection,
        text: typeof parsed.text === 'string' ? parsed.text : undefined,
        humanCadence: parsed.humanCadence !== false,
        appQuery: typeof parsed.appQuery === 'string' ? parsed.appQuery : undefined,
        requiresSafetyApproval: Boolean(parsed.requiresSafetyApproval),
        safetyCategory: parsed.safetyCategory,
        safetyPreview: parsed.safetyPreview,
        finalSummary: parsed.finalSummary,
      };
    } catch (_e) {
      return {
        thought: 'Failed to parse planner JSON',
        action: 'fail',
        finalSummary: 'Autonomous planner received invalid step structure.',
      };
    }
  }

  private detectHighRiskAction(
    decision: PlannerStepDecision,
    snap: ScreenSnapshot
  ): boolean {
    if (decision.action !== 'tap' || !decision.targetTag) return false;
    const node = snap.nodes.find((n) => n.tag === decision.targetTag);
    if (!node) return false;
    const label = `${node.text} ${node.desc} ${node.viewId}`.toLowerCase();
    return /\b(pay now|place order|confirm payment|delete permanently|factory reset|uninstall|send message)\b/.test(
      label
    );
  }

  private async performPlannedAction(
    decision: PlannerStepDecision,
    snap: ScreenSnapshot
  ): Promise<{ success: boolean; logLine: string; targetLabel?: string }> {
    const { width, height } = Dimensions.get('window');
    const store = useVortexStore.getState();

    if (decision.action === 'launch_app' && decision.appQuery) {
      try {
        const pkg = await VortexBridge?.launchApp?.(decision.appQuery);
        if (store.isRecordingWorkflow) {
          this.captureRecordedStep('launch_app', pkg || decision.appQuery, 0.5, 0.5);
        }
        return {
          success: true,
          logLine: `Launched "${decision.appQuery}"`,
          targetLabel: pkg,
        };
      } catch (_e) {
        return { success: false, logLine: `App not found: ${decision.appQuery}` };
      }
    }

    if (decision.action === 'tap') {
      const matchedNode =
        decision.targetTag !== undefined
          ? snap.nodes.find((n) => n.tag === decision.targetTag)
          : undefined;
      const tapX = matchedNode ? matchedNode.centerX : decision.x ?? width * 0.5;
      const tapY = matchedNode ? matchedNode.centerY : decision.y ?? height * 0.5;
      const label = matchedNode
        ? matchedNode.text || matchedNode.desc || `Node #${matchedNode.tag}`
        : `(${Math.round(tapX)}, ${Math.round(tapY)})`;

      const ok = Boolean(await VortexBridge?.performGhostTap?.(tapX, tapY));
      if (ok && store.isRecordingWorkflow) {
        this.captureRecordedStep(
          'tap',
          snap.packageName,
          tapX / Math.max(1, width),
          tapY / Math.max(1, height),
          matchedNode
        );
      }
      return {
        success: ok,
        logLine: `Tapped ${label}`,
        targetLabel: label,
      };
    }

    if (decision.action === 'inject_text' && decision.text) {
      if (decision.targetTag !== undefined) {
        const targetNode = snap.nodes.find((n) => n.tag === decision.targetTag);
        if (targetNode) {
          await VortexBridge?.performGhostTap?.(targetNode.centerX, targetNode.centerY);
          await delayMs(260);
        }
      }
      const ok = Boolean(
        await VortexBridge?.injectTextToFocusedNode?.(
          decision.text,
          Boolean(decision.humanCadence)
        )
      );
      if (ok && store.isRecordingWorkflow) {
        this.captureRecordedStep(
          'inject_text',
          snap.packageName,
          0.5,
          0.5,
          undefined,
          decision.text
        );
      }
      return {
        success: ok,
        logLine: `Injected "${decision.text.slice(0, 42)}"`,
      };
    }

    if (decision.action === 'swipe') {
      const dir = decision.swipeDirection || 'up';
      let sx = width * 0.5;
      let sy = height * 0.72;
      let ex = width * 0.5;
      let ey = height * 0.28;

      if (dir === 'down') {
        sy = height * 0.3;
        ey = height * 0.75;
      } else if (dir === 'left') {
        sx = width * 0.82;
        ex = width * 0.18;
        sy = height * 0.5;
        ey = height * 0.5;
      } else if (dir === 'right') {
        sx = width * 0.18;
        ex = width * 0.82;
        sy = height * 0.5;
        ey = height * 0.5;
      }

      const ok = Boolean(await VortexBridge?.performGhostSwipe?.(sx, sy, ex, ey, 360));
      if (ok && store.isRecordingWorkflow) {
        this.captureRecordedStep('swipe', snap.packageName, 0.5, 0.5);
      }
      return {
        success: ok,
        logLine: `Swiped ${dir}`,
      };
    }

    if (decision.action === 'back') {
      const ok = Boolean(
        await VortexBridge?.performGhostSwipe?.(6, height * 0.55, width * 0.42, height * 0.55, 220)
      );
      return {
        success: ok,
        logLine: 'Triggered system Back gesture',
      };
    }

    await delayMs(900);
    return {
      success: true,
      logLine: 'Waited for screen transition',
    };
  }

  private captureRecordedStep(
    action: WorkflowRecordedStep['action'],
    packageName: string,
    normX: number,
    normY: number,
    node?: CapturedDomNode,
    inputValue?: string
  ): void {
    const store = useVortexStore.getState();
    const step: WorkflowRecordedStep = {
      id: `rec_${Date.now()}_${store.recordedDraftSteps.length + 1}`,
      order: store.recordedDraftSteps.length + 1,
      action,
      packageName,
      viewId: node?.viewId || undefined,
      textAnchor: node?.text || undefined,
      descAnchor: node?.desc || undefined,
      normX,
      normY,
      inputValue,
      delayMs: 850,
    };
    store.addRecordedStep(step);
  }
}

export const vortexGhostAgent = new VortexGhostAgent();
            
