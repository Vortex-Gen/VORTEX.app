import React, { Component, ErrorInfo, ReactNode, useEffect } from 'react';
import {
  DeviceEventEmitter,
  NativeModules,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { VortexGlassCockpit } from './src/VortexGlassCockpit';
import { getAppLockRule, initVortexDatabase } from './src/vortexMemoryEngine';
import { vortexVoiceEngine } from './src/vortexVoiceEngine';
import { vortexPcBridge } from './src/vortexPcBridge';

const { VortexBridge } = NativeModules;

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class VortexBootBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Unexpected runtime exception',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('VORTEX Boundary Caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.fallbackRoot}>
          <Text style={styles.fallbackTitle}>VORTEX ẞ SAFE RECOVERY</Text>
          <Text style={styles.fallbackBody}>{this.state.errorMessage}</Text>
          <TouchableOpacity
            style={styles.fallbackBtn}
            onPress={() => this.setState({ hasError: false, errorMessage: '' })}
          >
            <Text style={styles.fallbackBtnText}>RELOAD CORE</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  useEffect(() => {
    let mounted = true;
    let lastUnlockedPkg = '';
    let lastUnlockTs = 0;

    const bootVortexCore = async () => {
      try {
        // 1. Initialize SQLite RAG, Multi-Key Pool, Study Vault & Standby PC Queue
        await initVortexDatabase();

        // 2. Initialize Zero-Beep "Hey Vortex" Wakeword + ElevenLabs Voice Engine
        await vortexVoiceEngine.initialize();

        // 3. Start Unified ẞ Floating Orb at 40% Idle Opacity if Overlay Permission Granted
        const canOverlay = (await VortexBridge?.canDrawOverlays?.()) ?? false;
        if (canOverlay && mounted) {
          await VortexBridge?.startFloatingOrb?.();
          await VortexBridge?.setOrbOpacity?.(0.4);
        }

        // 4. Flush PC Sync Queue ONLY if user explicitly enabled PC Sync (Standby by default)
        await vortexPcBridge.flushQueueIfOnline();
      } catch (e) {
        console.warn('VORTEX Boot Warning:', e);
      }
    };

    bootVortexCore();

    // A. Self-Learning App-Lock Vault Auto-Unlocker
    const pkgSub = DeviceEventEmitter.addListener(
      'VortexPackageChanged',
      async (pkgName: string) => {
        if (!pkgName) return;
        const now = Date.now();
        if (pkgName === lastUnlockedPkg && now - lastUnlockTs < 4500) return;

        try {
          const rule = await getAppLockRule(pkgName);
          if (rule && rule.autoUnlockEnabled && rule.secretData) {
            lastUnlockedPkg = pkgName;
            lastUnlockTs = now;
            setTimeout(() => {
              if (rule.lockType === 'PIN') {
                VortexBridge?.replayPinNodes?.(rule.secretData);
              } else if (rule.lockType === 'PATTERN') {
                VortexBridge?.drawPatternGesture?.(rule.secretData);
              }
            }, 380);
          }
        } catch {}
      }
    );

    // B. Smart Clipboard Error & Code Interceptor
    const clipSub = DeviceEventEmitter.addListener(
      'VortexClipboardChanged',
      async (clipText: string) => {
        if (!clipText) return;
        const looksLikeErrorOrCode =
          /(error|exception|failed|syntax|undefined|nullpointer|traceback|segfault|#include|def |class |public static)/i.test(
            clipText
          );
        if (looksLikeErrorOrCode) {
          await VortexBridge?.updateFloatingHud?.(
            'VORTEX CLIPBOARD RADAR',
            `Code/Error copied (${clipText.slice(0, 75)}...). Tap SCAN to solve or fix.`,
            false
          );
        }
      }
    );

    // C. Incoming WhatsApp / Replyable Message HUD Summary
    const msgSub = DeviceEventEmitter.addListener(
      'VortexIncomingMessage',
      async (rawJson: string) => {
        try {
          const msg = JSON.parse(rawJson);
          if (msg?.title && msg?.text) {
            await VortexBridge?.updateFloatingHud?.(
              `MSG • ${String(msg.title).slice(0, 26)}`,
              `${String(msg.text).slice(0, 110)}\n(Say: "Reply to ${msg.title} saying ...")`,
              false
            );
          }
        } catch {}
      }
    );

    // D. Hardware Event Macros (Auto Turbo RAM Sweep on Charger Connect)
    const hwSub = DeviceEventEmitter.addListener(
      'VortexHardwareEvent',
      async (eventCode: string) => {
        if (eventCode === 'CHARGER_CONNECTED') {
          const freedMb = (await VortexBridge?.sweepJunkCache?.()) ?? 0;
          await VortexBridge?.updateFloatingHud?.(
            'CHARGER MACRO • TURBO BOOST',
            `Power connected — cleaned cache & reclaimed ${freedMb} MB RAM.`,
            false
          );
        }
      }
    );

    return () => {
      mounted = false;
      pkgSub.remove();
      clipSub.remove();
      msgSub.remove();
      hwSub.remove();
    };
  }, []);

  return (
    <VortexBootBoundary>
      <View style={styles.appRoot}>
        <VortexGlassCockpit />
      </View>
    </VortexBootBoundary>
  );
}

const styles = StyleSheet.create({
  appRoot: {
    flex: 1,
    backgroundColor: '#000000',
  },
  fallbackRoot: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  fallbackTitle: {
    color: '#38BDF8',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 10,
  },
  fallbackBody: {
    color: '#CBD5E1',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 20,
  },
  fallbackBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 14,
  },
  fallbackBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
});
