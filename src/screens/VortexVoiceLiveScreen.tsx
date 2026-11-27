import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { VortexNavigationShell } from '../components/VortexNavigationShell';
import { vortexGhostAgent } from '../engines/vortexGhostAgent';
import { vortexLlmRouter } from '../engines/vortexLlmRouter';
import {
  VoiceTelemetrySnapshot,
  vortexVoiceWakeword,
} from '../engines/vortexVoiceWakeword';
import { useVortexStore } from '../store/useVortexStore';
import {
  VORTEX_ACCENTS,
  VORTEX_FONTS,
  VORTEX_LAYOUT,
  VORTEX_PALETTE,
} from '../theme/vortexTheme';

const VOICE_PRESETS = [
  { id: 'N2lEZeeBudC5cNxqDtxf', name: 'Callum', tag: 'Grounded Neural' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', tag: 'Warm British' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', tag: 'Deep Narrator' },
  { id: 'TX3LPaxmHMxFJQ7zw6ip', name: 'Liam', tag: 'Crisp Tactical' },
  { id: 'iP95p4xoKVk53GoZ742B', name: 'Chris', tag: 'Casual Clear' },
];

const QUICK_VOICE_COMMANDS = [
  'Check RAM and battery status',
  'Scan and solve what is on my screen',
  'Latest OTP kya hai?',
  'Turbo sweep clean RAM',
];

export const VortexVoiceLiveScreen: React.FC = () => {
  const accentKey = useVortexStore((s) => s.orbAccentKey);
  const fontPreset = useVortexStore((s) => s.fontPreset);
  const elevenLabsVoiceId = useVortexStore((s) => s.elevenLabsVoiceId);
  const setElevenLabsVoiceId = useVortexStore((s) => s.setElevenLabsVoiceId);
  const voiceLanguage = useVortexStore((s) => s.voiceLanguage);
  const setVoiceLanguage = useVortexStore((s) => s.setVoiceLanguage);
  const zeroBeepMute = useVortexStore((s) => s.zeroBeepMute);
  const wakewordPhrase = useVortexStore((s) => s.wakewordPhrase);
  const setWakewordConfig = useVortexStore((s) => s.setWakewordConfig);
  const orbStealthMode = useVortexStore((s) => s.orbStealthMode);
  const updateOrbSettings = useVortexStore((s) => s.updateOrbSettings);
  const activeSessionId = useVortexStore((s) => s.activeSessionId);
  const appendMessage = useVortexStore((s) => s.appendMessage);

  const accent = VORTEX_ACCENTS[accentKey] || VORTEX_ACCENTS.sky;
  const fonts = VORTEX_FONTS[fontPreset] || VORTEX_FONTS.aero;

  const [telemetry, setTelemetry] = useState<VoiceTelemetrySnapshot>(
    vortexVoiceWakeword.getSnapshot()
  );
  const [lastAssistantReply, setLastAssistantReply] = useState('');
  const [customVoiceDraft, setCustomVoiceDraft] = useState(elevenLabsVoiceId);

  const outerPulse = useRef(new Animated.Value(1)).current;
  const innerPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const unsub = vortexVoiceWakeword.subscribe((snap) => {
      setTelemetry(snap);
    });
    return unsub;
  }, []);

  useEffect(() => {
    vortexVoiceWakeword.setCommandHandler(async (spokenCommand: string) => {
      const clean = spokenCommand.trim();
      if (!clean) return;

      if (activeSessionId) {
        appendMessage(activeSessionId, {
          id: `v_usr_${Date.now()}`,
          role: 'user',
          content: clean,
          timestamp: Date.now(),
          mode: 'auto',
        });
      }

      try {
        const agentRes = await vortexGhostAgent.executeCommand(clean);
        if (agentRes.handled) {
          setLastAssistantReply(agentRes.replyText);
          if (activeSessionId) {
            appendMessage(activeSessionId, {
              id: `v_ast_${Date.now() + 1}`,
              role: 'assistant',
              content: agentRes.replyText,
              timestamp: Date.now(),
              mode: 'ghost',
              providerTag: 'Voice Autonomous OS',
            });
          }
          await vortexVoiceWakeword.speakResponse(agentRes.spokenText || agentRes.replyText);
          return;
        }

        const llmRes = await vortexLlmRouter.generate({
          prompt: `${clean}\n\n(Respond in concise natural spoken sentences suitable for voice output.)`,
          mode: 'auto',
          useRag: true,
        });

        setLastAssistantReply(llmRes.text);
        if (activeSessionId) {
          appendMessage(activeSessionId, {
            id: `v_ast_${Date.now() + 1}`,
            role: 'assistant',
            content: llmRes.text,
            timestamp: Date.now(),
            mode: llmRes.resolvedMode,
            providerTag: `${llmRes.providerTag} • Voice`,
            latencyMs: llmRes.latencyMs,
          });
        }
        await vortexVoiceWakeword.speakResponse(llmRes.text);
      } catch (err: any) {
        const errMsg = err?.message || 'Voice command failed.';
        setLastAssistantReply(errMsg);
        await vortexVoiceWakeword.speakResponse(errMsg);
      }
    });
  }, [activeSessionId, appendMessage]);

  useEffect(() => {
    const isActive = telemetry.phase !== 'idle';
    const duration =
      telemetry.phase === 'capturing_command'
        ? 550
        : telemetry.phase === 'speaking'
        ? 680
        : telemetry.phase === 'thinking'
        ? 450
        : 1500;

    if (!isActive) {
      outerPulse.setValue(1);
      innerPulse.setValue(1);
      return;
    }

    const anim = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(outerPulse, {
            toValue: 1.18,
            duration,
            useNativeDriver: true,
          }),
          Animated.timing(outerPulse, {
            toValue: 1.0,
            duration,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(innerPulse, {
            toValue: 1.08,
            duration: Math.round(duration * 0.8),
            useNativeDriver: true,
          }),
          Animated.timing(innerPulse, {
            toValue: 0.96,
            duration: Math.round(duration * 0.8),
            useNativeDriver: true,
          }),
        ]),
      ])
    );

    anim.start();
    return () => anim.stop();
  }, [telemetry.phase, outerPulse, innerPulse]);

  const phaseMeta = (() => {
    switch (telemetry.phase) {
      case 'wakeword_standby':
        return {
          label: `STANDBY • SAY "${wakewordPhrase.toUpperCase()}"`,
          color: accent.primary,
          soft: accent.soft,
        };
      case 'capturing_command':
        return {
          label: 'LISTENING TO COMMAND...',
          color: VORTEX_PALETTE.success,
          soft: VORTEX_PALETTE.successSoft,
        };
      case 'thinking':
        return {
          label: 'EXECUTING & REASONING...',
          color: VORTEX_PALETTE.warning,
          soft: VORTEX_PALETTE.warningSoft,
        };
      case 'speaking':
        return {
          label: 'SPEAKING • SAY "STOP" OR TAP CORE TO INTERRUPT',
          color: '#818CF8',
          soft: 'rgba(129, 140, 248, 0.16)',
        };
      default:
        return {
          label: 'VOICE ENGINE IDLE',
          color: VORTEX_PALETTE.textMuted,
          soft: VORTEX_PALETTE.surfacePill,
        };
    }
  })();

  const handleCoreTap = async () => {
    if (telemetry.phase === 'speaking' || telemetry.phase === 'wakeword_standby') {
      await vortexVoiceWakeword.interruptAndListen();
    } else if (telemetry.phase === 'idle') {
      await vortexVoiceWakeword.startDirectVoiceCapture();
    } else {
      await vortexVoiceWakeword.shutdown();
    }
  };

  return (
    <VortexNavigationShell
      headerTitle="VORTEX LIVE"
      headerSubtitle={`TTS: ${telemetry.lastProvider}`}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.phasePill, { backgroundColor: phaseMeta.soft, borderColor: phaseMeta.color }]}>
          <View style={[styles.phaseDot, { backgroundColor: phaseMeta.color }]} />
          <Text style={[styles.phaseText, { color: phaseMeta.color }]}>{phaseMeta.label}</Text>
        </View>

        <View style={styles.reactorStage}>
          <Animated.View
            style={[
              styles.outerRing,
              {
                borderColor: phaseMeta.color,
                backgroundColor: phaseMeta.soft,
                transform: [{ scale: outerPulse }],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.middleRing,
              {
                borderColor: phaseMeta.color,
                transform: [{ scale: innerPulse }],
              },
            ]}
          />
          <TouchableOpacity
            onPress={() => void handleCoreTap()}
            activeOpacity={0.85}
            style={[
              styles.coreButton,
              {
                borderColor: phaseMeta.color,
                backgroundColor: VORTEX_PALETTE.surfaceCard,
              },
            ]}
          >
            <Text style={[styles.coreGlyph, { color: phaseMeta.color, fontFamily: fonts.display }]}>
              ẞ
            </Text>
            <Text style={styles.coreHint}>
              {telemetry.phase === 'idle' ? 'TAP TO SPEAK' : 'TAP TO INTERRUPT'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.transcriptCard}>
          <Text style={styles.cardEyebrow}>LIVE ACOUSTIC TRANSCRIPT</Text>
          <Text style={[styles.transcriptText, { fontFamily: fonts.regular }]}>
            {telemetry.liveTranscript ||
              `Waiting for "${wakewordPhrase}" or tap the core button above...`}
          </Text>

          {lastAssistantReply ? (
            <View style={styles.replyDivider}>
              <Text style={[styles.cardEyebrow, { color: accent.primary }]}>LAST VORTEX RESPONSE</Text>
              <Text style={[styles.replyText, { fontFamily: fonts.regular }]}>
                {lastAssistantReply}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.primaryControlsRow}>
          <TouchableOpacity
            onPress={() => void vortexVoiceWakeword.startContinuousWakeword()}
            style={[styles.controlBtn, { backgroundColor: accent.soft, borderColor: accent.border }]}
          >
            <Text style={[styles.controlBtnText, { color: accent.primary }]}>
              START "{wakewordPhrase.toUpperCase()}"
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => void vortexVoiceWakeword.shutdown()}
            style={[
              styles.controlBtn,
              {
                backgroundColor: VORTEX_PALETTE.surfaceElevated,
                borderColor: VORTEX_PALETTE.borderStrong,
              },
            ]}
          >
            <Text style={[styles.controlBtnText, { color: VORTEX_PALETTE.textSecondary }]}>
              STOP ENGINE
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>INSTANT VOICE TRIGGERS</Text>
        <View style={styles.quickCmdWrap}>
          {QUICK_VOICE_COMMANDS.map((cmd, idx) => (
            <TouchableOpacity
              key={`qvc_${idx}`}
              onPress={() => {
                setLastAssistantReply('');
                void (async () => {
                  const res = await vortexGhostAgent.executeCommand(cmd);
                  setLastAssistantReply(res.replyText);
                  await vortexVoiceWakeword.speakResponse(res.spokenText || res.replyText);
                })();
              }}
              style={styles.quickCmdChip}
            >
              <Text style={styles.quickCmdText}>{cmd}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionLabel}>ACOUSTIC & STEALTH SETTINGS</Text>
        <View style={styles.toggleCard}>
          <TouchableOpacity
            onPress={() => setWakewordConfig({ zeroBeepMute: !zeroBeepMute })}
            style={styles.toggleRow}
          >
            <View style={styles.toggleInfo}>
              <Text style={[styles.toggleTitle, { fontFamily: fonts.bold }]}>
                Zero-Beep Silent Mic Ducking
              </Text>
              <Text style={styles.toggleSub}>
                Suppresses Android recognizer start/stop chime during wakeword loop
              </Text>
            </View>
            <View
              style={[
                styles.statusTag,
                {
                  backgroundColor: zeroBeepMute
                    ? VORTEX_PALETTE.successSoft
                    : VORTEX_PALETTE.surfacePill,
                },
              ]}
            >
              <Text
                style={{
                  color: zeroBeepMute ? VORTEX_PALETTE.success : VORTEX_PALETTE.textMuted,
                  fontSize: 10,
                  fontWeight: '800',
                }}
              >
                {zeroBeepMute ? 'MUTED' : 'DEFAULT'}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => void updateOrbSettings({ stealthMode: !orbStealthMode })}
            style={[styles.toggleRow, styles.rowBorderTop]}
          >
            <View style={styles.toggleInfo}>
              <Text style={[styles.toggleTitle, { fontFamily: fonts.bold }]}>
                Whisper Earpiece Stealth Audio
              </Text>
              <Text style={styles.toggleSub}>
                Routes TTS through earpiece at low volume in quiet environments
              </Text>
            </View>
            <View
              style={[
                styles.statusTag,
                {
                  backgroundColor: orbStealthMode ? accent.soft : VORTEX_PALETTE.surfacePill,
                },
              ]}
            >
              <Text
                style={{
                  color: orbStealthMode ? accent.primary : VORTEX_PALETTE.textMuted,
                  fontSize: 10,
                  fontWeight: '800',
                }}
              >
                {orbStealthMode ? 'STEALTH' : 'SPEAKER'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>RECOGNITION LOCALE</Text>
        <View style={styles.langRow}>
          {[
            { code: 'hi-IN' as const, label: 'Hindi + Hinglish' },
            { code: 'en-IN' as const, label: 'English (India)' },
            { code: 'ur-IN' as const, label: 'Urdu (India)' },
          ].map((lang) => {
            const active = voiceLanguage === lang.code;
            return (
              <TouchableOpacity
                key={lang.code}
                onPress={() => setVoiceLanguage(lang.code)}
                style={[
                  styles.langChip,
                  active && { backgroundColor: accent.soft, borderColor: accent.primary },
                ]}
              >
                <Text
                  style={[
                    styles.langChipText,
                    { color: active ? accent.primary : VORTEX_PALETTE.textSecondary },
                  ]}
                >
                  {lang.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.sectionLabel}>ELEVENLABS MULTILINGUAL V2 VOICE</Text>
        <View style={styles.voiceGrid}>
          {VOICE_PRESETS.map((v) => {
            const active = elevenLabsVoiceId === v.id;
            return (
              <TouchableOpacity
                key={v.id}
                onPress={() => {
                  setElevenLabsVoiceId(v.id);
                  setCustomVoiceDraft(v.id);
                }}
                style={[
                  styles.voiceTile,
                  active && { backgroundColor: accent.soft, borderColor: accent.primary },
                ]}
              >
                <Text
                  style={[
                    styles.voiceName,
                    {
                      fontFamily: fonts.bold,
                      color: active ? accent.primary : VORTEX_PALETTE.textPrimary,
                    },
                  ]}
                >
                  {v.name}
                </Text>
                <Text style={styles.voiceTag}>{v.tag}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.customVoiceRow}>
          <TextInput
            value={customVoiceDraft}
            onChangeText={setCustomVoiceDraft}
            placeholder="Custom ElevenLabs Voice ID..."
            placeholderTextColor={VORTEX_PALETTE.textMuted}
            style={styles.customVoiceInput}
          />
          <TouchableOpacity
            onPress={() => setElevenLabsVoiceId(customVoiceDraft)}
            style={[styles.applyVoiceBtn, { backgroundColor: accent.primary }]}
          >
            <Text style={styles.applyVoiceText}>APPLY</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </VortexNavigationShell>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 34,
    gap: 12,
  },
  phasePill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: VORTEX_LAYOUT.radiusPill,
    borderWidth: 1,
  },
  phaseDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  phaseText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  reactorStage: {
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outerRing: {
    position: 'absolute',
    width: 174,
    height: 174,
    borderRadius: 87,
    borderWidth: 1,
    opacity: 0.45,
  },
  middleRing: {
    position: 'absolute',
    width: 144,
    height: 144,
    borderRadius: 72,
    borderWidth: 1.2,
    opacity: 0.7,
  },
  coreButton: {
    width: 116,
    height: 116,
    borderRadius: 58,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  coreGlyph: {
    fontSize: 38,
  },
  coreHint: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  transcriptCard: {
    backgroundColor: VORTEX_PALETTE.surfaceCard,
    borderRadius: VORTEX_LAYOUT.radiusLg,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderStrong,
    padding: 14,
    gap: 6,
  },
  cardEyebrow: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  transcriptText: {
    color: VORTEX_PALETTE.textPrimary,
    fontSize: 14,
    lineHeight: 20,
  },
  replyDivider: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: VORTEX_PALETTE.borderHairline,
    gap: 4,
  },
  replyText: {
    color: VORTEX_PALETTE.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  primaryControlsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  controlBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlBtnText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  sectionLabel: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.9,
    marginTop: 4,
  },
  quickCmdWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  quickCmdChip: {
    backgroundColor: VORTEX_PALETTE.surfaceCard,
    borderRadius: VORTEX_LAYOUT.radiusPill,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderHairline,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  quickCmdText: {
    color: VORTEX_PALETTE.textSecondary,
    fontSize: 11.5,
  },
  toggleCard: {
    backgroundColor: VORTEX_PALETTE.surfaceCard,
    borderRadius: VORTEX_LAYOUT.radiusMd,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderHairline,
    overflow: 'hidden',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    gap: 10,
  },
  rowBorderTop: {
    borderTopWidth: 1,
    borderTopColor: VORTEX_PALETTE.borderHairline,
  },
  toggleInfo: {
    flex: 1,
    gap: 2,
  },
  toggleTitle: {
    color: VORTEX_PALETTE.textPrimary,
    fontSize: 12.5,
  },
  toggleSub: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 10.5,
    lineHeight: 15,
  },
  statusTag: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },
  langRow: {
    flexDirection: 'row',
    gap: 7,
  },
  langChip: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderHairline,
    backgroundColor: VORTEX_PALETTE.surfaceCard,
    alignItems: 'center',
  },
  langChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  voiceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  voiceTile: {
    width: '31.5%',
    backgroundColor: VORTEX_PALETTE.surfaceCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderHairline,
    padding: 10,
    gap: 2,
  },
  voiceName: {
    fontSize: 12.5,
  },
  voiceTag: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 10,
  },
  customVoiceRow: {
    flexDirection: 'row',
    gap: 8,
  },
  customVoiceInput: {
    flex: 1,
    height: 40,
    backgroundColor: VORTEX_PALETTE.surfaceInput,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderStrong,
    paddingHorizontal: 10,
    color: VORTEX_PALETTE.textPrimary,
    fontSize: 12,
  },
  applyVoiceBtn: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyVoiceText: {
    color: VORTEX_PALETTE.oledBlack,
    fontSize: 11,
    fontWeight: '800',
  },
});
