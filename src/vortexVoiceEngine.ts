import {
  DeviceEventEmitter,
  NativeModules,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import {
  getAppSetting,
  getNextApiKey,
  markApiKeyStatus,
  setAppSetting,
} from './vortexMemoryEngine';

const { VortexBridge } = NativeModules;

export type VortexMicPrivacyMode = 'porcupine' | 'native_silent' | 'stealth';

export interface VoiceEngineStatus {
  micMode: VortexMicPrivacyMode;
  porcupineActive: boolean;
  isSpeaking: boolean;
  activeVoiceId: string;
  wakewordLabel: string;
}

const DEFAULT_ELEVENLABS_VOICE_ID = 'pNInz6obpgDQGcFmaJgB'; // Adam (Deep Neural Male)
const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let result = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const a = bytes[i];
    const b = i + 1 < len ? bytes[i + 1] : 0;
    const c = i + 2 < len ? bytes[i + 2] : 0;
    const triplet = (a << 16) | (b << 8) | c;
    result += BASE64_CHARS[(triplet >> 18) & 0x3f];
    result += BASE64_CHARS[(triplet >> 12) & 0x3f];
    result += i + 1 < len ? BASE64_CHARS[(triplet >> 6) & 0x3f] : '=';
    result += i + 2 < len ? BASE64_CHARS[triplet & 0x3f] : '=';
  }
  return result;
}

function sanitizeTextForSpeech(raw: string): string {
  let cleaned = raw
    .replace(/```diagram[\s\S]*?```/gi, ' Visual diagram screen par bana diya hai. ')
    .replace(/```mermaid[\s\S]*?```/gi, ' Flowchart diagram screen par ready hai. ')
    .replace(/```[\s\S]*?```/g, ' Pure runnable code box mein taiyar hai, aap seedha copy ya screen par inject kar sakte hain. ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/https?:\/\/[^\s)]+/g, ' verified source link ')
    .replace(/[#*_~>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length > 680) {
    cleaned = cleaned.slice(0, 680) + '... Baaki details screen card par hain.';
  }
  return cleaned;
}

class VortexVoiceController {
  private currentSound: Audio.Sound | null = null;
  private porcupineManager: any = null;
  private isSpeakingFlag = false;
  private porcupineRunning = false;
  private currentMode: VortexMicPrivacyMode = 'porcupine';
  private activeVoiceId = DEFAULT_ELEVENLABS_VOICE_ID;
  private voiceOutputEnabled = true;
  private wakewordDetectedCallback: (() => void) | null = null;
  private speakingListeners = new Set<(speaking: boolean) => void>();

  async initialize(onWakewordTriggered?: () => void): Promise<VoiceEngineStatus> {
    if (onWakewordTriggered) {
      this.wakewordDetectedCallback = onWakewordTriggered;
    }

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
    } catch {}

    const savedMode = (await getAppSetting('mic_privacy_mode')) as VortexMicPrivacyMode | null;
    const savedVoiceId = await getAppSetting('elevenlabs_voice_id');
    const savedTtsToggle = await getAppSetting('voice_output_enabled');

    if (savedMode && ['porcupine', 'native_silent', 'stealth'].includes(savedMode)) {
      this.currentMode = savedMode;
    }
    if (savedVoiceId && savedVoiceId.trim().length > 4) {
      this.activeVoiceId = savedVoiceId.trim();
    }
    if (savedTtsToggle === 'false') {
      this.voiceOutputEnabled = false;
    }

    await this.applyMicPrivacyMode(this.currentMode);
    return this.getStatus();
  }

  onSpeakingStateChange(listener: (speaking: boolean) => void): () => void {
    this.speakingListeners.add(listener);
    return () => this.speakingListeners.delete(listener);
  }

  private notifySpeaking(val: boolean) {
    this.isSpeakingFlag = val;
    this.speakingListeners.forEach((fn) => fn(val));
  }

  getStatus(): VoiceEngineStatus {
    return {
      micMode: this.currentMode,
      porcupineActive: this.porcupineRunning,
      isSpeaking: this.isSpeakingFlag,
      activeVoiceId: this.activeVoiceId,
      wakewordLabel: 'Hey Vortex',
    };
  }

  async setVoiceOutputEnabled(enabled: boolean): Promise<void> {
    this.voiceOutputEnabled = enabled;
    await setAppSetting('voice_output_enabled', enabled ? 'true' : 'false');
    if (!enabled) {
      await this.stopSpeaking();
    }
  }

  isVoiceOutputEnabled(): boolean {
    return this.voiceOutputEnabled;
  }

  async setElevenLabsVoiceId(voiceId: string): Promise<void> {
    const clean = voiceId.trim() || DEFAULT_ELEVENLABS_VOICE_ID;
    this.activeVoiceId = clean;
    await setAppSetting('elevenlabs_voice_id', clean);
  }

  async ensureMicPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch {
      return false;
    }
  }

  async applyMicPrivacyMode(mode: VortexMicPrivacyMode): Promise<VoiceEngineStatus> {
    this.currentMode = mode;
    await setAppSetting('mic_privacy_mode', mode);
    await this.stopPorcupineEngine();

    if (mode === 'stealth') {
      // Zero background mic usage -> zero taskbar mic icon until user taps Orb/Mic
      await VortexBridge?.setMicMode?.('stealth');
      return this.getStatus();
    }

    const hasMic = await this.ensureMicPermission();
    if (!hasMic) {
      await VortexBridge?.setMicMode?.('stealth');
      return this.getStatus();
    }

    if (mode === 'porcupine') {
      const started = await this.startPorcupineEngine();
      if (started) {
        await VortexBridge?.setMicMode?.('porcupine');
      } else {
        // Automatic fallback to zero-beep native silent wake listener if Picovoice key not added yet
        await VortexBridge?.setMicMode?.('native_silent');
      }
      return this.getStatus();
    }

    await VortexBridge?.setMicMode?.('native_silent');
    return this.getStatus();
  }

  private async startPorcupineEngine(): Promise<boolean> {
    try {
      const picovoiceKeyObj = await getNextApiKey('picovoice');
      const accessKey = picovoiceKeyObj?.apiKey?.trim() || '';
      if (!accessKey) {
        return false;
      }

      // Dynamic require so bundle stays safe even in non-native previews
      const PorcupinePkg = require('@picovoice/porcupine-react-native');
      const PorcupineManager = PorcupinePkg.PorcupineManager;
      const BuiltInKeywords = PorcupinePkg.BuiltInKeywords;
      if (!PorcupineManager) return false;

      const customPpnPath = await getAppSetting('porcupine_hey_vortex_ppn');
      const detectionCallback = async () => {
        // Barge-in: immediately stop any ongoing speech when "Hey Vortex" is heard
        await this.stopSpeaking();
        await VortexBridge?.muteSystemBeepsTemporarily?.(480);
        await VortexBridge?.updateFloatingHud?.(
          'VORTEX LISTENING',
          'Hey Vortex detected — bol bhai...',
          true
        );
        this.wakewordDetectedCallback?.();
        DeviceEventEmitter.emit('VortexWakewordDetected', 'Hey Vortex');
        await VortexBridge?.triggerZeroBeepListen?.();
      };

      const errorCallback = async (err: any) => {
        if (picovoiceKeyObj?.id) {
          await markApiKeyStatus(picovoiceKeyObj.id, 'ERROR', String(err?.message || err));
        }
        this.porcupineRunning = false;
      };

      if (customPpnPath && customPpnPath.trim().length > 3) {
        this.porcupineManager = await PorcupineManager.fromKeywordPaths(
          accessKey,
          [customPpnPath.trim()],
          detectionCallback,
          errorCallback,
          undefined,
          [0.65]
        );
      } else {
        this.porcupineManager = await PorcupineManager.fromBuiltInKeywords(
          accessKey,
          [BuiltInKeywords.JARVIS],
          detectionCallback,
          errorCallback,
          undefined,
          [0.65]
        );
      }

      await this.porcupineManager.start();
      this.porcupineRunning = true;
      return true;
    } catch {
      this.porcupineRunning = false;
      return false;
    }
  }

  async stopPorcupineEngine(): Promise<void> {
    try {
      if (this.porcupineManager) {
        await this.porcupineManager.stop();
        await this.porcupineManager.delete();
        this.porcupineManager = null;
      }
    } catch {}
    this.porcupineRunning = false;
  }

  async triggerManualZeroBeepMic(): Promise<boolean> {
    await this.stopSpeaking();
    const ok = await this.ensureMicPermission();
    if (!ok) return false;
    await VortexBridge?.muteSystemBeepsTemporarily?.(450);
    return (await VortexBridge?.triggerZeroBeepListen?.()) ?? false;
  }

  async stopSpeaking(): Promise<void> {
    try {
      if (this.currentSound) {
        const snd = this.currentSound;
        this.currentSound = null;
        await snd.stopAsync();
        await snd.unloadAsync();
      }
    } catch {}
    this.notifySpeaking(false);
  }

  async speak(rawText: string, forceSpeak = false): Promise<boolean> {
    if (!forceSpeak && !this.voiceOutputEnabled) return false;
    const spokenText = sanitizeTextForSpeech(rawText);
    if (!spokenText) return false;

    await this.stopSpeaking();

    // Try up to 3 ElevenLabs keys from SQLite pool before giving up
    for (let attempt = 0; attempt < 3; attempt++) {
      const keyEntry = await getNextApiKey('elevenlabs');
      if (!keyEntry || !keyEntry.apiKey) {
        return false;
      }

      try {
        this.notifySpeaking(true);
        const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(
          this.activeVoiceId
        )}/stream?optimize_streaming_latency=3`;

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'xi-api-key': keyEntry.apiKey.trim(),
            'Content-Type': 'application/json',
            Accept: 'audio/mpeg',
          },
          body: JSON.stringify({
            text: spokenText,
            model_id: 'eleven_multilingual_v2',
            voice_settings: {
              stability: 0.48,
              similarity_boost: 0.78,
              style: 0.25,
              use_speaker_boost: true,
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
          this.notifySpeaking(false);
          continue;
        }

        const audioBuffer = await response.arrayBuffer();
        const base64Audio = arrayBufferToBase64(audioBuffer);
        const cacheDir =
          (FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory || '';
        const tempFile = `${cacheDir}vortex_tts_${Date.now()}.mp3`;

        await FileSystem.writeAsStringAsync(tempFile, base64Audio, {
          encoding: 'base64',
        });

        await markApiKeyStatus(keyEntry.id, 'ACTIVE', 'OK');

        const { sound } = await Audio.Sound.createAsync(
          { uri: tempFile },
          { shouldPlay: true, volume: 1.0 }
        );
        this.currentSound = sound;

        sound.setOnPlaybackStatusUpdate((st: any) => {
          if (st?.didJustFinish) {
            this.notifySpeaking(false);
            sound.unloadAsync().catch(() => {});
            if (this.currentSound === sound) {
              this.currentSound = null;
            }
            FileSystem.deleteAsync(tempFile, { idempotent: true }).catch(() => {});
          }
        });

        return true;
      } catch (err: any) {
        await markApiKeyStatus(keyEntry.id, 'ERROR', String(err?.message || 'TTS_FAIL'));
        this.notifySpeaking(false);
      }
    }

    this.notifySpeaking(false);
    return false;
  }

  async playCommuteCapsule(segments: string[]): Promise<void> {
    for (const seg of segments) {
      const clean = seg.trim();
      if (!clean) continue;
      await this.speak(clean, true);
      // Wait while current sound finishes before starting next revision card
      while (this.isSpeakingFlag) {
        await new Promise((r) => setTimeout(r, 400));
      }
      await new Promise((r) => setTimeout(r, 450));
    }
  }
}

export const vortexVoiceEngine = new VortexVoiceController();

export async function speakWithElevenLabs(text: string, force = false): Promise<boolean> {
  return vortexVoiceEngine.speak(text, force);
}
