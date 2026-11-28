import React, { useState } from 'react';
import {
  ActivityIndicator,
  NativeModules,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { VortexNavigationShell } from '../components/VortexNavigationShell';
import { vortexVoiceWakeword } from '../engines/vortexVoiceWakeword';
import { vortexWebAndPcBridge } from '../engines/vortexWebAndPcBridge';
import { useVortexStore } from '../store/useVortexStore';
import {
  VORTEX_ACCENTS,
  VORTEX_FONTS,
  VORTEX_LAYOUT,
  VORTEX_PALETTE,
  VortexAccentKey,
  VortexFontPreset,
} from '../theme/vortexTheme';

const { VortexBridge } = NativeModules;

const FONT_OPTIONS: Array<{ id: VortexFontPreset; title: string; sample: string }> = [
  { id: 'aero', title: 'Aero Futura', sample: 'VORTEX ẞ • Clean Geometric' },
  { id: 'orbitron', title: 'Orbitron HUD', sample: 'VORTEX ẞ • Cyber Command' },
  { id: 'good_times', title: 'Good Times', sample: 'VORTEX ẞ • Wide Sci-Fi' },
  { id: 'tech_mono', title: 'Tech Mono', sample: 'VORTEX ẞ • Terminal Matrix' },
];

const ELEVENLABS_VOICE_PRESETS = [
  { id: 'N2lEZeeBudC5cNxqDtxf', name: 'Callum', tag: 'Crisp Multilingual' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', tag: 'Warm Deep Baritone' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', tag: 'Calm Narrator' },
  { id: 'TX3LPaxmHMxFJQ7zw6ip', name: 'Liam', tag: 'Energetic Clear' },
  { id: 'iP95p4xoKVk53GoZ742B', name: 'Chris', tag: 'Natural Conversational' },
];

const SCALE_STEPS = [0.85, 0.95, 1.0, 1.1, 1.2];

export const VortexSettingsVaultScreen: React.FC = () => {
  const geminiApiKeys = useVortexStore((s) => s.geminiApiKeys);
  const addGeminiApiKey = useVortexStore((s) => s.addGeminiApiKey);
  const removeGeminiApiKey = useVortexStore((s) => s.removeGeminiApiKey);
  const resetGeminiKeyCooldowns = useVortexStore((s) => s.resetGeminiKeyCooldowns);

  const hasElevenLabsKey = useVortexStore((s) => s.hasElevenLabsKey);
  const elevenLabsVoiceId = useVortexStore((s) => s.elevenLabsVoiceId);
  const autoSpeakReplies = useVortexStore((s) => s.autoSpeakReplies);
  const setElevenLabsConfig = useVortexStore((s) => s.setElevenLabsConfig);

  const fontPreset = useVortexStore((s) => s.fontPreset);
  const setFontPreset = useVortexStore((s) => s.setFontPreset);
  const fontScale = useVortexStore((s) => s.fontScale);
  const setFontScale = useVortexStore((s) => s.setFontScale);

  const orbAccentKey = useVortexStore((s) => s.orbAccentKey);
  const updateOrbSettings = useVortexStore((s) => s.updateOrbSettings);

  const pcBridgeConfig = useVortexStore((s) => s.pcBridgeConfig);
  const setPcBridgeConfig = useVortexStore((s) => s.setPcBridgeConfig);

  const accent = VORTEX_ACCENTS[orbAccentKey] || VORTEX_ACCENTS.sky;
  const fonts = VORTEX_FONTS[fontPreset] || VORTEX_FONTS.aero;

  const [geminiKeyDraft, setGeminiKeyDraft] = useState('');
  const [geminiLabelDraft, setGeminiLabelDraft] = useState('');
  const [elevenKeyDraft, setElevenKeyDraft] = useState('');
  const [customVoiceIdDraft, setCustomVoiceIdDraft] = useState(elevenLabsVoiceId || '');

  const [pcHostDraft, setPcHostDraft] = useState(pcBridgeConfig.host || 'vortex.local');
  const [pcPortDraft, setPcPortDraft] = useState(String(pcBridgeConfig.port || 8765));
  const [pcTokenDraft, setPcTokenDraft] = useState(pcBridgeConfig.token || '');

  const [busyPc, setBusyPc] = useState(false);
  const [testingVoice, setTestingVoice] = useState(false);
  const [vaultBanner, setVaultBanner] = useState('');

  const showNotice = (msg: string) => {
    setVaultBanner(msg);
    setTimeout(() => setVaultBanner(''), 2600);
  };

  const handleAddGeminiKey = async () => {
    const raw = geminiKeyDraft.trim();
    if (raw.length < 16) {
      showNotice('Enter a valid Google Gemini API key.');
      return;
    }
    const label = geminiLabelDraft.trim() || `Node #${geminiApiKeys.length + 1}`;
    await addGeminiApiKey(raw, label);
    setGeminiKeyDraft('');
    setGeminiLabelDraft('');
    showNotice(`Encrypted & added "${label}" to Gemini rotation pool.`);
  };

  const handleSaveElevenLabsKey = async () => {
    const raw = elevenKeyDraft.trim();
    if (raw.length < 12) {
      showNotice('Enter a valid ElevenLabs API key.');
      return;
    }
    if (VortexBridge?.saveSecureVaultItem) {
      await VortexBridge.saveSecureVaultItem('elevenlabs_api_key', raw);
    }
    await setElevenLabsConfig({
      apiKey: raw,
      voiceId: customVoiceIdDraft.trim() || elevenLabsVoiceId,
    });
    setElevenKeyDraft('');
    showNotice('ElevenLabs API key encrypted in Android Keystore.');
  };

  const handleSaveVoiceId = async () => {
    const cleanVoice = customVoiceIdDraft.trim();
    if (!cleanVoice) return;
    await setElevenLabsConfig({ voiceId: cleanVoice });
    showNotice(`Active voice ID set to ${cleanVoice}.`);
  };

  const handleTestTtsVoice = async () => {
    if (testingVoice) return;
    setTestingVoice(true);
    try {
      await vortexVoiceWakeword.speakResponse(
        'Vortex neural voice matrix online. Ready for autonomous execution.'
      );
    } finally {
      setTestingVoice(false);
    }
  };

  const handleSavePcConfig = async () => {
    const parsedPort = parseInt(pcPortDraft.replace(/[^0-9]/g, ''), 10) || 8765;
    await setPcBridgeConfig({
      host: pcHostDraft.trim() || 'vortex.local',
      port: parsedPort,
      token: pcTokenDraft.trim(),
    });
    showNotice('Saved vortex.local PC bridge parameters.');
  };

  const handleTestPcHandshake = async () => {
    setBusyPc(true);
    try {
      await handleSavePcConfig();
      const online = await vortexWebAndPcBridge.pingPcBridge();
      showNotice(
        online
          ? 'PC Bridge handshake verified: Desktop agent reachable.'
          : 'PC Bridge unreachable (currently dormant or offline on LAN).'
      );
    } finally {
      setBusyPc(false);
    }
  };

  const handleFlushPcQueue = async () => {
    setBusyPc(true);
    try {
      const synced = await vortexWebAndPcBridge.flushPcSyncQueue();
      showNotice(
        synced > 0
          ? `Synced ${synced} queued items to PC workspace.`
          : 'No items synced (queue empty or PC bridge dormant).'
      );
    } finally {
      setBusyPc(false);
    }
  };

  return (
    <VortexNavigationShell
      headerTitle="VAULT & CONFIG"
      headerSubtitle="Keystore Pool • Typography • PC Bridge"
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {vaultBanner ? (
          <View style={[styles.bannerBox, { backgroundColor: accent.soft, borderColor: accent.border }]}>
            <Text style={[styles.bannerText, { color: accent.primary }]}>{vaultBanner}</Text>
          </View>
        ) : null}

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>GEMINI MULTI-KEY ROTATION POOL ({geminiApiKeys.length})</Text>
          {geminiApiKeys.length > 0 ? (
            <TouchableOpacity onPress={() => resetGeminiKeyCooldowns()}>
              <Text style={[styles.actionLink, { color: accent.primary }]}>RESET COOLDOWNS</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={[styles.card, { borderColor: accent.border }]}>
          <Text style={styles.cardHint}>
            Keys are stored in hardware-backed Android Keystore and rotated automatically on HTTP 429 rate limits.
          </Text>

          <TextInput
            value={geminiLabelDraft}
            onChangeText={setGeminiLabelDraft}
            placeholder="Key Label (e.g., Primary Studio Key)..."
            placeholderTextColor={VORTEX_PALETTE.textMuted}
            style={styles.inputField}
          />

          <View style={styles.inlineRow}>
            <TextInput
              value={geminiKeyDraft}
              onChangeText={setGeminiKeyDraft}
              placeholder="Paste AIzaSy... Gemini API Key"
              placeholderTextColor={VORTEX_PALETTE.textMuted}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.inputField, { flex: 1 }]}
            />
            <TouchableOpacity
              onPress={() => void handleAddGeminiKey()}
              style={[styles.primaryMiniBtn, { backgroundColor: accent.primary }]}
            >
              <Text style={styles.primaryMiniBtnText}>ADD KEY</Text>
            </TouchableOpacity>
          </View>

          {geminiApiKeys.length === 0 ? (
            <View style={styles.emptyNotice}>
              <Text style={styles.emptyNoticeText}>
                No cloud keys added yet. Offline GGUF mode works without keys; add 1+ Gemini keys for cloud vision & web reasoning.
              </Text>
            </View>
          ) : (
            <View style={styles.keyList}>
              {geminiApiKeys.map((item) => {
                const inCooldown = item.cooldownUntil && item.cooldownUntil > Date.now();
                const statusColor = inCooldown
                  ? VORTEX_PALETTE.warning
                  : item.status === 'exhausted'
                  ? VORTEX_PALETTE.danger
                  : VORTEX_PALETTE.success;

                return (
                  <View key={item.id} style={styles.keyRow}>
                    <View style={styles.keyMeta}>
                      <Text style={[styles.keyLabel, { fontFamily: fonts.bold }]}>
                        {item.label}
                      </Text>
                      <Text style={styles.keyMask}>{item.maskedKey}</Text>
                    </View>

                    <View
                      style={[
                        styles.statusChip,
                        { backgroundColor: VORTEX_PALETTE.surfaceBase, borderColor: statusColor },
                      ]}
                    >
                      <Text style={[styles.statusChipText, { color: statusColor }]}>
                        {inCooldown ? 'COOLDOWN' : item.status.toUpperCase()}
                      </Text>
                    </View>

                    <TouchableOpacity
                      onPress={() => void removeGeminiApiKey(item.id)}
                      style={styles.deleteKeyBtn}
                    >
                      <Text style={{ color: VORTEX_PALETTE.danger, fontSize: 11, fontWeight: '800' }}>
                        ✕
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <Text style={styles.sectionLabel}>ELEVENLABS MULTILINGUAL V2 VOICE ENGINE</Text>
        <View style={[styles.card, { borderColor: accent.border }]}>
          <TouchableOpacity
            onPress={() => void setElevenLabsConfig({ autoSpeak: !autoSpeakReplies })}
            style={styles.toggleRow}
          >
            <View style={styles.toggleInfo}>
              <Text style={[styles.cardTitle, { fontFamily: fonts.bold }]}>
                Auto-Speak Assistant Replies
              </Text>
              <Text style={styles.cardSub}>
                {hasElevenLabsKey
                  ? 'ElevenLabs Neural Voice armed (with offline Android TTS fallback)'
                  : 'Using offline Android Neural TTS until ElevenLabs key is added'}
              </Text>
            </View>
            <View
              style={[
                styles.stateBadge,
                {
                  backgroundColor: autoSpeakReplies
                    ? accent.soft
                    : VORTEX_PALETTE.surfacePill,
                },
              ]}
            >
              <Text
                style={{
                  color: autoSpeakReplies ? accent.primary : VORTEX_PALETTE.textMuted,
                  fontSize: 10,
                  fontWeight: '800',
                }}
              >
                {autoSpeakReplies ? 'ON' : 'OFF'}
              </Text>
            </View>
          </TouchableOpacity>

          <View style={styles.inlineRow}>
            <TextInput
              value={elevenKeyDraft}
              onChangeText={setElevenKeyDraft}
              placeholder={
                hasElevenLabsKey
                  ? '•••••••••••••••• (Key Stored — Paste to Rotate)'
                  : 'Paste sk_... ElevenLabs API Key'
              }
              placeholderTextColor={VORTEX_PALETTE.textMuted}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.inputField, { flex: 1 }]}
            />
            <TouchableOpacity
              onPress={() => void handleSaveElevenLabsKey()}
              style={[styles.primaryMiniBtn, { backgroundColor: accent.primary }]}
            >
              <Text style={styles.primaryMiniBtnText}>SAVE</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.miniLabel}>RECOMMENDED HINDI / URDU / ENGLISH MALE VOICES</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.voicePresetRow}
          >
            {ELEVENLABS_VOICE_PRESETS.map((vp) => {
              const selected = elevenLabsVoiceId === vp.id;
              return (
                <TouchableOpacity
                  key={vp.id}
                  onPress={() => {
                    setCustomVoiceIdDraft(vp.id);
                    void setElevenLabsConfig({ voiceId: vp.id });
                    showNotice(`Selected voice: ${vp.name}`);
                  }}
                  style={[
                    styles.voicePresetChip,
                    selected && { backgroundColor: accent.soft, borderColor: accent.primary },
                  ]}
                >
                  <Text
                    style={[
                      styles.voicePresetName,
                      { color: selected ? accent.primary : VORTEX_PALETTE.textPrimary },
                    ]}
                  >
                    {vp.name}
                  </Text>
                  <Text style={styles.voicePresetTag}>{vp.tag}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.inlineRow}>
            <TextInput
              value={customVoiceIdDraft}
              onChangeText={setCustomVoiceIdDraft}
              placeholder="Custom ElevenLabs Voice ID..."
              placeholderTextColor={VORTEX_PALETTE.textMuted}
              autoCapitalize="none"
              style={[styles.inputField, { flex: 1 }]}
            />
            <TouchableOpacity
              onPress={() => void handleSaveVoiceId()}
              style={[styles.secondaryMiniBtn, { borderColor: VORTEX_PALETTE.borderStrong }]}
            >
              <Text style={styles.secondaryMiniBtnText}>SET ID</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => void handleTestTtsVoice()}
              disabled={testingVoice}
              style={[styles.secondaryMiniBtn, { borderColor: accent.border }]}
            >
              <Text style={[styles.secondaryMiniBtnText, { color: accent.primary }]}>
                {testingVoice ? '...' : 'TEST'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.sectionLabel}>CUSTOM TYPOGRAPHY & OLED ACCENT</Text>
        <View style={styles.card}>
          <View style={styles.fontGrid}>
            {FONT_OPTIONS.map((f) => {
              const active = fontPreset === f.id;
              const fontObj = VORTEX_FONTS[f.id];
              return (
                <TouchableOpacity
                  key={f.id}
                  onPress={() => setFontPreset(f.id)}
                  style={[
                    styles.fontTile,
                    active && { backgroundColor: accent.soft, borderColor: accent.primary },
                  ]}
                >
                  <Text
                    style={[
                      styles.fontTileTitle,
                      {
                        fontFamily: fontObj.bold,
                        color: active ? accent.primary : VORTEX_PALETTE.textPrimary,
                      },
                    ]}
                  >
                    {f.title}
                  </Text>
                  <Text style={[styles.fontTileSample, { fontFamily: fontObj.regular }]}>
                    {f.sample}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.miniLabel}>GLOBAL TEXT SCALE</Text>
          <View style={styles.scaleRow}>
            {SCALE_STEPS.map((sc) => {
              const active = Math.abs(fontScale - sc) < 0.02;
              return (
                <TouchableOpacity
                  key={sc}
                  onPress={() => setFontScale(sc)}
                  style={[
                    styles.scaleChip,
                    active && { backgroundColor: accent.soft, borderColor: accent.primary },
                  ]}
                >
                  <Text
                    style={{
                      color: active ? accent.primary : VORTEX_PALETTE.textSecondary,
                      fontSize: 11,
                      fontWeight: '800',
                    }}
                  >
                    {Math.round(sc * 100)}%
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.miniLabel}>HUD & ORB ACCENT SPECTRUM</Text>
          <View style={styles.accentGrid}>
            {(Object.keys(VORTEX_ACCENTS) as VortexAccentKey[]).map((key) => {
              const item = VORTEX_ACCENTS[key];
              const active = orbAccentKey === key;
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => void updateOrbSettings({ accentKey: key })}
                  style={[
                    styles.accentChip,
                    active && { borderColor: item.primary, backgroundColor: item.soft },
                  ]}
                >
                  <View style={[styles.accentDot, { backgroundColor: item.primary }]} />
                  <Text
                    style={{
                      color: active ? item.primary : VORTEX_PALETTE.textSecondary,
                      fontSize: 11,
                      fontWeight: '700',
                    }}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <Text style={styles.sectionLabel}>DORMANT PC SYNC BRIDGE (VORTEX.LOCAL)</Text>
        <View style={styles.card}>
          <TouchableOpacity
            onPress={() => void setPcBridgeConfig({ enabled: !pcBridgeConfig.enabled })}
            style={styles.toggleRow}
          >
            <View style={styles.toggleInfo}>
              <Text style={[styles.cardTitle, { fontFamily: fonts.bold }]}>
                Desktop Companion Sync Engine
              </Text>
              <Text style={styles.cardSub}>
                {pcBridgeConfig.enabled
                  ? 'Active — Syncs RAG deltas & queued code files over LAN'
                  : 'Dormant — Queues deltas locally in SQLite until PC hardware is paired'}
              </Text>
            </View>
            <View
              style={[
                styles.stateBadge,
                {
                  backgroundColor: pcBridgeConfig.enabled
                    ? VORTEX_PALETTE.successSoft
                    : VORTEX_PALETTE.surfacePill,
                },
              ]}
            >
              <Text
                style={{
                  color: pcBridgeConfig.enabled
                    ? VORTEX_PALETTE.success
                    : VORTEX_PALETTE.textMuted,
                  fontSize: 10,
                  fontWeight: '800',
                }}
              >
                {pcBridgeConfig.enabled ? 'ACTIVE' : 'DORMANT'}
              </Text>
            </View>
          </TouchableOpacity>

          <View style={styles.inlineRow}>
            <TextInput
              value={pcHostDraft}
              onChangeText={setPcHostDraft}
              placeholder="vortex.local or 192.168.1.x"
              placeholderTextColor={VORTEX_PALETTE.textMuted}
              autoCapitalize="none"
              style={[styles.inputField, { flex: 2 }]}
            />
            <TextInput
              value={pcPortDraft}
              onChangeText={setPcPortDraft}
              placeholder="8765"
              placeholderTextColor={VORTEX_PALETTE.textMuted}
              keyboardType="number-pad"
              style={[styles.inputField, { flex: 1 }]}
            />
          </View>

          <TextInput
            value={pcTokenDraft}
            onChangeText={setPcTokenDraft}
            placeholder="PC Pairing Bearer Token (Optional)..."
            placeholderTextColor={VORTEX_PALETTE.textMuted}
            secureTextEntry
            autoCapitalize="none"
            style={styles.inputField}
          />

          <View style={styles.pcBtnRow}>
            <TouchableOpacity
              onPress={() => void handleSavePcConfig()}
              style={[styles.pcBtn, { backgroundColor: accent.primary }]}
            >
              <Text style={styles.pcPrimaryText}>SAVE CONFIG</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => void handleTestPcHandshake()}
              disabled={busyPc}
              style={[styles.pcBtn, { borderWidth: 1, borderColor: accent.border }]}
            >
              {busyPc ? (
                <ActivityIndicator size="small" color={accent.primary} />
              ) : (
                <Text style={[styles.pcSecondaryText, { color: accent.primary }]}>PING PC</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => void handleFlushPcQueue()}
              disabled={busyPc}
              style={[
                styles.pcBtn,
                { borderWidth: 1, borderColor: VORTEX_PALETTE.borderStrong },
              ]}
            >
              <Text style={styles.pcSecondaryText}>FLUSH SYNC</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </VortexNavigationShell>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 36,
    gap: 12,
  },
  bannerBox: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bannerText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  sectionLabel: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.9,
  },
  actionLink: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: VORTEX_PALETTE.surfaceCard,
    borderRadius: VORTEX_LAYOUT.radiusLg,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderHairline,
    padding: 14,
    gap: 10,
  },
  cardHint: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputField: {
    height: 40,
    backgroundColor: VORTEX_PALETTE.surfaceInput,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderStrong,
    paddingHorizontal: 11,
    color: VORTEX_PALETTE.textPrimary,
    fontSize: 12.5,
  },
  primaryMiniBtn: {
    height: 40,
    paddingHorizontal: 13,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryMiniBtnText: {
    color: VORTEX_PALETTE.oledBlack,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  secondaryMiniBtn: {
    height: 40,
    paddingHorizontal: 11,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: VORTEX_PALETTE.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryMiniBtnText: {
    color: VORTEX_PALETTE.textPrimary,
    fontSize: 10,
    fontWeight: '800',
  },
  emptyNotice: {
    backgroundColor: VORTEX_PALETTE.surfaceBase,
    borderRadius: 10,
    padding: 10,
  },
  emptyNoticeText: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  keyList: {
    gap: 7,
  },
  keyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: VORTEX_PALETTE.surfaceBase,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderHairline,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  keyMeta: {
    flex: 1,
  },
  keyLabel: {
    color: VORTEX_PALETTE.textPrimary,
    fontSize: 12,
  },
  keyMask: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 10.5,
  },
  statusChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
    borderWidth: 1,
  },
  statusChipText: {
    fontSize: 9,
    fontWeight: '800',
  },
  deleteKeyBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  toggleInfo: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    color: VORTEX_PALETTE.textPrimary,
    fontSize: 13.5,
  },
  cardSub: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  stateBadge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },
  miniLabel: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.7,
    marginTop: 2,
  },
  voicePresetRow: {
    gap: 7,
  },
  voicePresetChip: {
    backgroundColor: VORTEX_PALETTE.surfaceBase,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderHairline,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  voicePresetName: {
    fontSize: 12,
    fontWeight: '800',
  },
  voicePresetTag: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 9.5,
    marginTop: 2,
  },
  fontGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  fontTile: {
    width: '48.6%',
    backgroundColor: VORTEX_PALETTE.surfaceBase,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderHairline,
    padding: 10,
    gap: 3,
  },
  fontTileTitle: {
    fontSize: 12.5,
  },
  fontTileSample: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 10,
  },
  scaleRow: {
    flexDirection: 'row',
    gap: 6,
  },
  scaleChip: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderHairline,
    backgroundColor: VORTEX_PALETTE.surfaceBase,
    alignItems: 'center',
  },
  accentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  accentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: VORTEX_LAYOUT.radiusPill,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderHairline,
    backgroundColor: VORTEX_PALETTE.surfaceBase,
  },
  accentDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  pcBtnRow: {
    flexDirection: 'row',
    gap: 7,
  },
  pcBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: VORTEX_PALETTE.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pcPrimaryText: {
    color: VORTEX_PALETTE.oledBlack,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  pcSecondaryText: {
    color: VORTEX_PALETTE.textPrimary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
