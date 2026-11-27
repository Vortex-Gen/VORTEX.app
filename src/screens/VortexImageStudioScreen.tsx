import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { VortexNavigationShell } from '../components/VortexNavigationShell';
import {
  GeneratedImageResult,
  ImageAspectRatio,
  PollinationsModel,
  vortexWebAndPcBridge,
} from '../engines/vortexWebAndPcBridge';
import { useVortexStore } from '../store/useVortexStore';
import {
  VORTEX_ACCENTS,
  VORTEX_FONTS,
  VORTEX_LAYOUT,
  VORTEX_PALETTE,
} from '../theme/vortexTheme';

const MODEL_OPTIONS: Array<{ id: PollinationsModel; label: string; sub: string }> = [
  { id: 'flux', label: 'Flux Pro', sub: 'High Detail' },
  { id: 'flux-realism', label: 'Realism', sub: 'Photoreal' },
  { id: 'turbo', label: 'Turbo', sub: 'Instant' },
];

const ASPECT_OPTIONS: Array<{ id: ImageAspectRatio; label: string; dims: string }> = [
  { id: '1:1', label: '1:1', dims: '1024×1024' },
  { id: '16:9', label: '16:9', dims: '1280×720' },
  { id: '9:16', label: '9:16', dims: '720×1280' },
];

const STYLE_CHIPS = [
  'Cyberpunk Neon Glass',
  '3D Isometric Hardware',
  'Anime Mecha Reactor',
  'Studio Macro Photography',
  'Minimal OLED Wallpaper',
];

export const VortexImageStudioScreen: React.FC = () => {
  const activeSessionId = useVortexStore((s) => s.activeSessionId);
  const appendMessage = useVortexStore((s) => s.appendMessage);
  const addPendingAttachment = useVortexStore((s) => s.addPendingAttachment);
  const setPromptMode = useVortexStore((s) => s.setPromptMode);
  const setActiveScreen = useVortexStore((s) => s.setActiveScreen);

  const accentKey = useVortexStore((s) => s.orbAccentKey);
  const fontPreset = useVortexStore((s) => s.fontPreset);
  const accent = VORTEX_ACCENTS[accentKey] || VORTEX_ACCENTS.sky;
  const fonts = VORTEX_FONTS[fontPreset] || VORTEX_FONTS.aero;

  const [promptDraft, setPromptDraft] = useState('');
  const [selectedModel, setSelectedModel] = useState<PollinationsModel>('flux');
  const [selectedAspect, setSelectedAspect] = useState<ImageAspectRatio>('1:1');
  const [enhancePrompt, setEnhancePrompt] = useState(true);
  const [customSeed, setCustomSeed] = useState('');
  const [isRendering, setIsRendering] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [activeRender, setActiveRender] = useState<GeneratedImageResult | null>(null);
  const [renderHistory, setRenderHistory] = useState<GeneratedImageResult[]>([]);
  const [actionToast, setActionToast] = useState('');

  const showToast = (msg: string) => {
    setActionToast(msg);
    setTimeout(() => setActionToast(''), 2200);
  };

  const handleGenerate = async (overrideSeed?: number) => {
    const cleanPrompt = promptDraft.trim();
    if (!cleanPrompt || isRendering) return;

    setIsRendering(true);
    setErrorMsg('');

    const parsedSeed =
      overrideSeed !== undefined
        ? overrideSeed
        : customSeed.trim()
        ? parseInt(customSeed.replace(/[^0-9]/g, ''), 10)
        : undefined;

    try {
      const result = await vortexWebAndPcBridge.generatePollinationsImage({
        prompt: cleanPrompt,
        model: selectedModel,
        aspectRatio: selectedAspect,
        enhancePrompt,
        seed: parsedSeed,
      });

      setActiveRender(result);
      setRenderHistory((prev) => [result, ...prev.slice(0, 11)]);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Image generation failed. Check network connectivity.');
    } finally {
      setIsRendering(false);
    }
  };

  const handleSaveToDevice = async () => {
    if (!activeRender) return;
    try {
      const targetPath = `${FileSystem.documentDirectory}VORTEX_Studio_${activeRender.seed}.jpg`;
      await FileSystem.copyAsync({
        from: activeRender.localUri,
        to: targetPath,
      });
      showToast('Saved HD render to device storage.');
    } catch (_e) {
      showToast('Cached locally.');
    }
  };

  const handleSendToChat = () => {
    if (!activeRender || !activeSessionId) return;
    appendMessage(activeSessionId, {
      id: `img_msg_${Date.now()}`,
      role: 'assistant',
      content: activeRender.enhancedPrompt,
      timestamp: Date.now(),
      mode: 'vision',
      generatedImageUrl: activeRender.localUri || activeRender.imageUrl,
      providerTag: `Pollinations ${activeRender.model.toUpperCase()} • Seed ${activeRender.seed}`,
    });
    setActiveScreen('chat');
  };

  const handleAttachForVision = async () => {
    if (!activeRender) return;
    let base64Data: string | undefined;
    try {
      base64Data = await FileSystem.readAsStringAsync(activeRender.localUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } catch (_e) {
    }

    addPendingAttachment({
      id: `att_gen_${Date.now()}`,
      type: 'image',
      name: `Render_${activeRender.seed}.jpg`,
      uri: activeRender.localUri,
      base64: base64Data,
    });
    setPromptMode('vision');
    setActiveScreen('chat');
  };

  return (
    <VortexNavigationShell
      headerTitle="IMAGE STUDIO"
      headerSubtitle="Pollinations HD • Flux & Realism"
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.viewportCard, { borderColor: accent.border }]}>
          {activeRender ? (
            <>
              <Image
                source={{ uri: activeRender.localUri || activeRender.imageUrl }}
                style={[
                  styles.previewImage,
                  selectedAspect === '16:9'
                    ? { height: 205 }
                    : selectedAspect === '9:16'
                    ? { height: 340 }
                    : { height: 290 },
                ]}
                resizeMode="cover"
              />
              <View style={styles.renderMetaBar}>
                <Text style={[styles.renderBadge, { color: accent.primary }]}>
                  {activeRender.model.toUpperCase()} • {activeRender.width}×{activeRender.height} •
                  SEED {activeRender.seed}
                </Text>
                <TouchableOpacity
                  onPress={async () => {
                    await Clipboard.setStringAsync(activeRender.enhancedPrompt);
                    showToast('Enhanced prompt copied.');
                  }}
                >
                  <Text style={styles.copyPromptLink}>COPY PROMPT</Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.enhancedPromptText, { fontFamily: fonts.regular }]}>
                {activeRender.enhancedPrompt}
              </Text>

              <View style={styles.renderActionsGrid}>
                <TouchableOpacity
                  onPress={() => void handleSaveToDevice()}
                  style={[styles.renderActionBtn, { backgroundColor: accent.soft, borderColor: accent.border }]}
                >
                  <Text style={[styles.renderActionText, { color: accent.primary }]}>SAVE HD</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleSendToChat}
                  style={[styles.renderActionBtn, { borderColor: VORTEX_PALETTE.borderStrong }]}
                >
                  <Text style={styles.renderActionText}>POST TO CHAT</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => void handleAttachForVision()}
                  style={[styles.renderActionBtn, { borderColor: VORTEX_PALETTE.borderStrong }]}
                >
                  <Text style={styles.renderActionText}>VISION EDIT</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => void handleGenerate(Math.floor(Math.random() * 899999) + 100000)}
                  style={[styles.renderActionBtn, { borderColor: VORTEX_PALETTE.borderStrong }]}
                >
                  <Text style={styles.renderActionText}>RE-ROLL</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <View style={styles.emptyViewport}>
              <Text style={[styles.emptyViewportGlyph, { color: accent.primary, fontFamily: fonts.display }]}>
                ẞ
              </Text>
              <Text style={[styles.emptyViewportTitle, { fontFamily: fonts.bold }]}>
                NEURAL VISUAL CANVAS READY
              </Text>
              <Text style={styles.emptyViewportSub}>
                Describe any concept, 3D hardware prototype, UI mockup, or artwork below.
              </Text>
            </View>
          )}
        </View>

        {actionToast ? (
          <View style={[styles.toastBar, { backgroundColor: VORTEX_PALETTE.successSoft }]}>
            <Text style={styles.toastText}>{actionToast}</Text>
          </View>
        ) : null}

        {errorMsg ? (
          <View style={[styles.toastBar, { backgroundColor: VORTEX_PALETTE.dangerSoft }]}>
            <Text style={[styles.toastText, { color: VORTEX_PALETTE.danger }]}>{errorMsg}</Text>
          </View>
        ) : null}

        <View style={styles.controlsCard}>
          <TextInput
            value={promptDraft}
            onChangeText={setPromptDraft}
            placeholder="Describe image to synthesize..."
            placeholderTextColor={VORTEX_PALETTE.textMuted}
            multiline
            style={[styles.promptInput, { fontFamily: fonts.regular }]}
          />

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.styleChipsRow}
          >
            {STYLE_CHIPS.map((st) => (
              <TouchableOpacity
                key={st}
                onPress={() =>
                  setPromptDraft((prev) =>
                    prev.trim() ? `${prev.trim()}, ${st}` : st
                  )
                }
                style={styles.styleChip}
              >
                <Text style={styles.styleChipText}>+ {st}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.fieldLabel}>RENDER MODEL</Text>
          <View style={styles.threeColRow}>
            {MODEL_OPTIONS.map((m) => {
              const active = selectedModel === m.id;
              return (
                <TouchableOpacity
                  key={m.id}
                  onPress={() => setSelectedModel(m.id)}
                  style={[
                    styles.optionTile,
                    active && { backgroundColor: accent.soft, borderColor: accent.primary },
                  ]}
                >
                  <Text
                    style={[
                      styles.optionTitle,
                      { color: active ? accent.primary : VORTEX_PALETTE.textPrimary },
                    ]}
                  >
                    {m.label}
                  </Text>
                  <Text style={styles.optionSub}>{m.sub}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.fieldLabel}>ASPECT RATIO</Text>
          <View style={styles.threeColRow}>
            {ASPECT_OPTIONS.map((a) => {
              const active = selectedAspect === a.id;
              return (
                <TouchableOpacity
                  key={a.id}
                  onPress={() => setSelectedAspect(a.id)}
                  style={[
                    styles.optionTile,
                    active && { backgroundColor: accent.soft, borderColor: accent.primary },
                  ]}
                >
                  <Text
                    style={[
                      styles.optionTitle,
                      { color: active ? accent.primary : VORTEX_PALETTE.textPrimary },
                    ]}
                  >
                    {a.label}
                  </Text>
                  <Text style={styles.optionSub}>{a.dims}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.seedAndEnhanceRow}>
            <TouchableOpacity
              onPress={() => setEnhancePrompt((v) => !v)}
              style={[
                styles.enhanceToggleBtn,
                enhancePrompt
                  ? { backgroundColor: accent.soft, borderColor: accent.primary }
                  : {
                      backgroundColor: VORTEX_PALETTE.surfaceBase,
                      borderColor: VORTEX_PALETTE.borderHairline,
                    },
              ]}
            >
              <Text
                style={{
                  color: enhancePrompt ? accent.primary : VORTEX_PALETTE.textMuted,
                  fontSize: 10.5,
                  fontWeight: '800',
                }}
              >
                {enhancePrompt ? '✦ AI ENHANCE: ON' : 'AI ENHANCE: OFF'}
              </Text>
            </TouchableOpacity>

            <TextInput
              value={customSeed}
              onChangeText={setCustomSeed}
              placeholder="Seed (Optional)"
              placeholderTextColor={VORTEX_PALETTE.textMuted}
              keyboardType="number-pad"
              style={styles.seedInput}
            />
          </View>

          <TouchableOpacity
            onPress={() => void handleGenerate()}
            disabled={!promptDraft.trim() || isRendering}
            style={[
              styles.generateBtn,
              {
                backgroundColor:
                  promptDraft.trim() && !isRendering
                    ? accent.primary
                    : VORTEX_PALETTE.surfacePill,
              },
            ]}
          >
            {isRendering ? (
              <ActivityIndicator size="small" color={VORTEX_PALETTE.oledBlack} />
            ) : (
              <Text
                style={[
                  styles.generateBtnText,
                  {
                    color: promptDraft.trim()
                      ? VORTEX_PALETTE.oledBlack
                      : VORTEX_PALETTE.textMuted,
                  },
                ]}
              >
                SYNTHESIZE HD RENDER
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {renderHistory.length > 1 ? (
          <>
            <Text style={styles.fieldLabel}>SESSION RENDER ARCHIVE ({renderHistory.length})</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.historyRow}
            >
              {renderHistory.map((item, idx) => (
                <TouchableOpacity
                  key={`hist_${item.seed}_${idx}`}
                  onPress={() => setActiveRender(item)}
                  style={[
                    styles.historyThumbCard,
                    activeRender?.seed === item.seed && { borderColor: accent.primary },
                  ]}
                >
                  <Image
                    source={{ uri: item.localUri || item.imageUrl }}
                    style={styles.historyThumbImg}
                  />
                  <Text style={styles.historySeedText}>#{item.seed}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        ) : null}
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
  viewportCard: {
    backgroundColor: VORTEX_PALETTE.surfaceCard,
    borderRadius: VORTEX_LAYOUT.radiusLg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    backgroundColor: VORTEX_PALETTE.surfaceBase,
  },
  renderMetaBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  renderBadge: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  copyPromptLink: {
    color: VORTEX_PALETTE.textSecondary,
    fontSize: 9.5,
    fontWeight: '800',
  },
  enhancedPromptText: {
    color: VORTEX_PALETTE.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: 12,
    paddingTop: 6,
  },
  renderActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    padding: 12,
  },
  renderActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: 1,
    backgroundColor: VORTEX_PALETTE.surfaceElevated,
  },
  renderActionText: {
    color: VORTEX_PALETTE.textPrimary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  emptyViewport: {
    height: 190,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 6,
  },
  emptyViewportGlyph: {
    fontSize: 32,
  },
  emptyViewportTitle: {
    color: VORTEX_PALETTE.textPrimary,
    fontSize: 13,
    letterSpacing: 0.8,
  },
  emptyViewportSub: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 11.5,
    textAlign: 'center',
    lineHeight: 16,
  },
  toastBar: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  toastText: {
    color: VORTEX_PALETTE.success,
    fontSize: 11.5,
    fontWeight: '700',
  },
  controlsCard: {
    backgroundColor: VORTEX_PALETTE.surfaceCard,
    borderRadius: VORTEX_LAYOUT.radiusLg,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderStrong,
    padding: 14,
    gap: 10,
  },
  promptInput: {
    color: VORTEX_PALETTE.textPrimary,
    fontSize: 13.5,
    minHeight: 62,
    textAlignVertical: 'top',
  },
  styleChipsRow: {
    gap: 6,
  },
  styleChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: VORTEX_LAYOUT.radiusPill,
    backgroundColor: VORTEX_PALETTE.surfaceElevated,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderHairline,
  },
  styleChipText: {
    color: VORTEX_PALETTE.textSecondary,
    fontSize: 10.5,
    fontWeight: '600',
  },
  fieldLabel: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginTop: 2,
  },
  threeColRow: {
    flexDirection: 'row',
    gap: 7,
  },
  optionTile: {
    flex: 1,
    backgroundColor: VORTEX_PALETTE.surfaceBase,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderHairline,
    paddingVertical: 9,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 2,
  },
  optionTitle: {
    fontSize: 12,
    fontWeight: '800',
  },
  optionSub: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 9.5,
  },
  seedAndEnhanceRow: {
    flexDirection: 'row',
    gap: 8,
  },
  enhanceToggleBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seedInput: {
    width: 130,
    height: 40,
    backgroundColor: VORTEX_PALETTE.surfaceInput,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderStrong,
    paddingHorizontal: 10,
    color: VORTEX_PALETTE.textPrimary,
    fontSize: 12,
  },
  generateBtn: {
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  generateBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  historyRow: {
    gap: 8,
  },
  historyThumbCard: {
    width: 84,
    backgroundColor: VORTEX_PALETTE.surfaceCard,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: VORTEX_PALETTE.borderHairline,
    overflow: 'hidden',
  },
  historyThumbImg: {
    width: 84,
    height: 76,
  },
  historySeedText: {
    color: VORTEX_PALETTE.textSecondary,
    fontSize: 9.5,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 4,
  },
});
