import Voice, { SpeechErrorEvent, SpeechResultsEvent } from '@react-native-voice/voice';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as Speech from 'expo-speech';
import { NativeModules } from 'react-native';
import { useVortexStore } from '../store/useVortexStore';

const { VortexBridge } = NativeModules;

export type VortexVoicePhase =
  | 'idle'
  | 'wakeword_standby'
  | 'capturing_command'
  | 'thinking'
  | 'speaking';

export interface VoiceTelemetrySnapshot {
  phase: VortexVoicePhase;
  liveTranscript: string;
  activeEngine: 'offline_vad_kws' | 'picovoice_ppn';
  lastProvider: string;
}

type VoiceStateSubscriber = (snapshot: VoiceTelemetrySnapshot) => void;
type VoiceCommandHandler = (commandText: string) => Promise<void> | void;

const WAKE_PHRASE_VARIANTS = [
  'hey vortex',
  'hey vertex',
  'hey wartex',
  'a vortex',
  'hi vortex',
  'ok vortex',
  'vortex',
  'हे वोर्टेक्स',
  'वोर्टेक्स',
];

const BARGE_IN_STOP_WORDS = ['stop', 'ruko', 'chup', 'cancel', 'quiet', 'bas'];

function maskKeyForStore(raw: string): string {
  const clean = raw.trim();
  if (clean.length <= 8) return '****';
  return `${clean.slice(0, 6)}...${clean.slice(-4)}`;
}

function splitSpeechSentences(text: string): string[] {
  const cleaned = text
    .replace(/```[\s\S]*?```/g, ' Code block ready on screen. ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[*#_~>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return [];
  const rawParts = cleaned.match(/[^.!?।]+[.!?।]*/g) || [cleaned];
  const merged: string[] = [];

  for (const part of rawParts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (merged.length > 0 && merged[merged.length - 1].length < 45) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${trimmed}`;
    } else {
      merged.push(trimmed);
    }
  }
  return merged.slice(0, 12);
}

class VortexVoiceWakewordEngine {
  private phase: VortexVoicePhase = 'idle';
  private liveTranscript = '';
  private lastProvider = 'Standby';
  private subscribers: Set<VoiceStateSubscriber> = new Set();
  private commandHandler: VoiceCommandHandler | null = null;
  private activeSound: Audio.Sound | null = null;
  private elevenKeyCursor = 0;
  private loopActive = false;
  private stopRequested = false;
  private speakingStartedAt = 0;
  private recoveryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    Voice.onSpeechPartialResults = this.onPartialSpeech.bind(this);
    Voice.onSpeechResults = this.onFinalSpeech.bind(this);
    Voice.onSpeechError = this.onSpeechError.bind(this);
    Voice.onSpeechEnd = this.onSpeechEnd.bind(this);
  }

  public setCommandHandler(handler: VoiceCommandHandler): void {
    this.commandHandler = handler;
  }

  public subscribe(listener: VoiceStateSubscriber): () => void {
    this.subscribers.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.subscribers.delete(listener);
    };
  }

  public getSnapshot(): VoiceTelemetrySnapshot {
    const store = useVortexStore.getState();
    return {
      phase: this.phase,
      liveTranscript: this.liveTranscript,
      activeEngine: store.wakewordEngine,
      lastProvider: this.lastProvider,
    };
  }

  private publish(nextPhase: VortexVoicePhase, transcript?: string): void {
    this.phase = nextPhase;
    if (transcript !== undefined) {
      this.liveTranscript = transcript;
    }
    const snap = this.getSnapshot();
    this.subscribers.forEach((fn) => fn(snap));
  }

  private async applyZeroBeepDucking(mute: boolean): Promise<void> {
    const store = useVortexStore.getState();
    if (!store.zeroBeepMute && mute) return;
    try {
      if (VortexBridge?.setZeroBeepMute) {
        await VortexBridge.setZeroBeepMute(mute);
      }
    } catch (_e) {
    }
  }

  public async stageCustomPpnFile(rawPath: string): Promise<string | null> {
    try {
      if (VortexBridge?.validateAndStageAsset) {
        const res = await VortexBridge.validateAndStageAsset(rawPath, 'ppn');
        if (res?.verified && res?.stagedPath) {
          useVortexStore.getState().setWakewordConfig({
            engine: 'picovoice_ppn',
            ppnPath: res.stagedPath,
            enabled: true,
          });
          return res.stagedPath;
        }
      }
    } catch (_e) {
    }
    return null;
  }

  public async startContinuousWakeword(): Promise<void> {
    this.stopRequested = false;
    this.loopActive = true;
    await this.haltCurrentAudio();
    await this.applyZeroBeepDucking(true);
    this.publish('wakeword_standby', '');
    await this.startRecognizerSession();
  }

  public async startDirectVoiceCapture(): Promise<void> {
    this.stopRequested = false;
    await this.interruptAndListen();
  }

  public async interruptAndListen(): Promise<void> {
    await this.haltCurrentAudio();
    try {
      Speech.stop();
    } catch (_e) {
    }
    await this.applyZeroBeepDucking(true);
    this.publish('capturing_command', '');
    await this.startRecognizerSession();
  }

  public async shutdown(): Promise<void> {
    this.stopRequested = true;
    this.loopActive = false;
    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer);
      this.recoveryTimer = null;
    }
    await this.haltCurrentAudio();
    try {
      Speech.stop();
      await Voice.stop();
      await Voice.destroy();
    } catch (_e) {
    }
    await this.applyZeroBeepDucking(false);
    this.publish('idle', '');
  }

  private async startRecognizerSession(): Promise<void> {
    if (this.stopRequested) return;
    const store = useVortexStore.getState();
    const locale = store.voiceLanguage || 'hi-IN';

    try {
      await Voice.cancel();
    } catch (_e) {
    }

    try {
      await Voice.start(locale, {
        EXTRA_PARTIAL_RESULTS: true,
        EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS: 1500,
        EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 1100,
      });
    } catch (_e) {
      this.scheduleRecovery(550);
    }
  }

  private scheduleRecovery(delayMs: number): void {
    if (this.stopRequested) return;
    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer);
    }
    this.recoveryTimer = setTimeout(() => {
      if (
        !this.stopRequested &&
        (this.phase === 'wakeword_standby' || this.phase === 'capturing_command')
      ) {
        void this.startRecognizerSession();
      }
    }, delayMs);
  }

  private parseWakeMatch(raw: string): { detected: boolean; trailingCommand: string } {
    const store = useVortexStore.getState();
    const customPhrase = store.wakewordPhrase?.trim().toLowerCase();
    const phrases = customPhrase
      ? Array.from(new Set([customPhrase, ...WAKE_PHRASE_VARIANTS]))
      : WAKE_PHRASE_VARIANTS;

    const lower = raw.toLowerCase().trim();
    for (const phrase of phrases) {
      const idx = lower.indexOf(phrase);
      if (idx !== -1) {
        const after = raw
          .slice(idx + phrase.length)
          .replace(/^[,.\s!?:;-]+/, '')
          .trim();
        return { detected: true, trailingCommand: after };
      }
    }
    return { detected: false, trailingCommand: '' };
  }

  private onPartialSpeech(event: SpeechResultsEvent): void {
    const partial = event.value?.[0]?.trim() || '';
    if (!partial) return;

    if (this.phase === 'speaking') {
      if (Date.now() - this.speakingStartedAt < 480) return;
      const lower = partial.toLowerCase();
      const wake = this.parseWakeMatch(partial);
      const isStop = BARGE_IN_STOP_WORDS.some((w) => lower === w || lower.startsWith(`${w} `));
      if (wake.detected || isStop) {
        void this.interruptAndListen();
      }
      return;
    }

    if (this.phase === 'wakeword_standby') {
      const wake = this.parseWakeMatch(partial);
      if (wake.detected) {
        this.publish('capturing_command', wake.trailingCommand);
      }
      return;
    }

    if (this.phase === 'capturing_command') {
      this.publish('capturing_command', partial);
    }
  }

  private async onFinalSpeech(event: SpeechResultsEvent): Promise<void> {
    const finalSpoken = event.value?.[0]?.trim() || '';
    if (!finalSpoken) {
      this.scheduleRecovery(220);
      return;
    }

    if (this.phase === 'wakeword_standby') {
      const wake = this.parseWakeMatch(finalSpoken);
      if (!wake.detected) {
        this.scheduleRecovery(180);
        return;
      }

      if (wake.trailingCommand.length >= 2) {
        await this.executeCapturedCommand(wake.trailingCommand);
      } else {
        this.publish('capturing_command', '');
        this.scheduleRecovery(140);
      }
      return;
    }

    if (this.phase === 'capturing_command') {
      const wake = this.parseWakeMatch(finalSpoken);
      const cleanCmd =
        wake.detected && wake.trailingCommand.length >= 2 ? wake.trailingCommand : finalSpoken;
      await this.executeCapturedCommand(cleanCmd);
    }
  }

  private async executeCapturedCommand(command: string): Promise<void> {
    this.publish('thinking', command);
    await this.applyZeroBeepDucking(false);

    try {
      await Voice.stop();
    } catch (_e) {
    }

    if (this.commandHandler) {
      await this.commandHandler(command);
    }

    if (this.phase === 'thinking' && !this.stopRequested) {
      if (this.loopActive && useVortexStore.getState().wakewordEnabled) {
        await this.startContinuousWakeword();
      } else {
        this.publish('idle', '');
      }
    }
  }

  private onSpeechError(_event: SpeechErrorEvent): void {
    if (this.stopRequested) return;
    if (this.phase === 'wakeword_standby' || this.phase === 'capturing_command') {
      this.scheduleRecovery(320);
    }
  }

  private onSpeechEnd(): void {
    if (this.stopRequested) return;
    if (this.phase === 'wakeword_standby' || this.phase === 'capturing_command') {
      this.scheduleRecovery(220);
    }
  }

  public async speakResponse(rawResponse: string): Promise<void> {
    const sentences = splitSpeechSentences(rawResponse);
    if (sentences.length === 0) {
      if (this.loopActive && useVortexStore.getState().wakewordEnabled && !this.stopRequested) {
        await this.startContinuousWakeword();
      } else {
        this.publish('idle', '');
      }
      return;
    }

    await this.haltCurrentAudio();
    await this.applyZeroBeepDucking(false);
    this.speakingStartedAt = Date.now();
    this.publish('speaking', sentences.join(' '));

    for (const sentence of sentences) {
      if (this.stopRequested || this.phase !== 'speaking') {
        break;
      }

      const elevenPlayed = await this.synthesizeAndPlayElevenLabs(sentence);
      if (!elevenPlayed && this.phase === 'speaking' && !this.stopRequested) {
        await this.speakWithSystemTts(sentence);
      }
    }

    if (this.phase === 'speaking' && !this.stopRequested) {
      if (this.loopActive && useVortexStore.getState().wakewordEnabled) {
        await this.startContinuousWakeword();
      } else {
        this.publish('idle', '');
      }
    }
  }

  private async synthesizeAndPlayElevenLabs(sentence: string): Promise<boolean> {
    const store = useVortexStore.getState();
    const rawKeys = await store.getRawElevenLabsKeys();
    if (rawKeys.length === 0) return false;

    const now = Date.now();
    const activeKeys = rawKeys.filter((raw) => {
      const masked = maskKeyForStore(raw);
      const entry = store.elevenLabsKeyPool.find((k) => k.maskedKey === masked);
      if (!entry) return true;
      if (entry.status === 'invalid') return false;
      if (entry.status === 'rate_limited' && entry.cooldownUntil > now) return false;
      return true;
    });

    const pool = activeKeys.length > 0 ? activeKeys : rawKeys;
    const voiceId = store.elevenLabsVoiceId || 'N2lEZeeBudC5cNxqDtxf';

    for (let attempt = 0; attempt < pool.length; attempt += 1) {
      if (this.stopRequested || this.phase !== 'speaking') return true;
      const idx = (this.elevenKeyCursor + attempt) % pool.length;
      const apiKey = pool[idx];
      const masked = maskKeyForStore(apiKey);

      try {
        const endpoint = `[https://api.elevenlabs.io/v1/text-to-speech/$](https://api.elevenlabs.io/v1/text-to-speech/$){encodeURIComponent(
          voiceId
        )}`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
            Accept: 'audio/mpeg',
          },
          body: JSON.stringify({
            text: sentence,
            model_id: 'eleven_multilingual_v2',
            voice_settings: {
              stability: 0.46,
              similarity_boost: 0.8,
              style: 0.25,
              use_speaker_boost: true,
            },
          }),
        });

        if (!response.ok) {
          if (response.status === 429) {
            store.markElevenLabsKeyStatus(masked, 'rate_limited', 90_000);
          } else if (response.status === 401 || response.status === 403) {
            store.markElevenLabsKeyStatus(masked, 'invalid');
          }
          continue;
        }

        const buffer = await response.arrayBuffer();
        const base64Mp3 = this.encodeArrayBufferBase64(buffer);
        const tempUri = `${FileSystem.cacheDirectory}vortex_voice_${Date.now()}_${attempt}.mp3`;

        await FileSystem.writeAsStringAsync(tempUri, base64Mp3, {
          encoding: FileSystem.EncodingType.Base64,
        });

        this.elevenKeyCursor = (idx + 1) % pool.length;
        this.lastProvider = `ElevenLabs Node #${idx + 1}`;
        store.markElevenLabsKeyStatus(masked, 'active');

        await this.playLocalAudioUri(tempUri);
        return true;
      } catch (_e) {
      }
    }

    return false;
  }

  private async playLocalAudioUri(uri: string): Promise<void> {
    if (this.stopRequested || this.phase !== 'speaking') {
      try {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      } catch (_e) {
      }
      return;
    }

    const stealth = useVortexStore.getState().orbStealthMode;
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: stealth,
    });

    const { sound } = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: true, volume: stealth ? 0.45 : 1.0 }
    );
    this.activeSound = sound;

    await new Promise<void>((resolve) => {
      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded || status.didJustFinish) {
          resolve();
        }
      });
    });

    await this.haltCurrentAudio();
    try {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    } catch (_e) {
    }
  }

  private async speakWithSystemTts(sentence: string): Promise<void> {
    const store = useVortexStore.getState();
    this.lastProvider = 'Android Neural TTS';
    await new Promise<void>((resolve) => {
      Speech.speak(sentence, {
        language: store.voiceLanguage || 'hi-IN',
        rate: store.orbStealthMode ? 0.94 : 1.03,
        volume: store.orbStealthMode ? 0.45 : 1.0,
        onDone: () => resolve(),
        onError: () => resolve(),
        onStopped: () => resolve(),
      });
    });
  }

  private async haltCurrentAudio(): Promise<void> {
    if (this.activeSound) {
      try {
        await this.activeSound.stopAsync();
        await this.activeSound.unloadAsync();
      } catch (_e) {
      }
      this.activeSound = null;
    }
  }

  private encodeArrayBufferBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const a = bytes[i];
      const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
      const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
      const combined = (a << 16) | (b << 8) | c;
      out += alphabet[(combined >> 18) & 0x3f];
      out += alphabet[(combined >> 12) & 0x3f];
      out += i + 1 < bytes.length ? alphabet[(combined >> 6) & 0x3f] : '=';
      out += i + 2 < bytes.length ? alphabet[combined & 0x3f] : '=';
    }
    return out;
  }
}

export const vortexVoiceWakeword = new VortexVoiceWakewordEngine();
