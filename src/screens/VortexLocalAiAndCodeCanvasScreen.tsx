import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
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
import { VortexRichBlocks } from '../components/VortexRichBlocks';
import { vortexLlmRouter } from '../engines/vortexLlmRouter';
import { vortexVoiceWakeword } from '../engines/vortexVoiceWakeword';
import { vortexWebAndPcBridge } from '../engines/vortexWebAndPcBridge';
import { useVortexStore } from '../store/useVortexStore';
import {
  getScaledFontSize,
  VORTEX_ACCENTS,
  VORTEX_FONTS,
  VORTEX_LAYOUT,
  VORTEX_PALETTE,
  VORTEX_SYNTAX,
} from '../theme/vortexTheme';

const { VortexBridge } = NativeModules;

const CANVAS_LANGUAGES = ['CPP', 'PYTHON', 'KOTLIN', 'TYPESCRIPT', 'SQL', 'C'];

export const VortexLocalAiWakewordScreen: React.FC = () => {
  const preferOfflineBrain = useVortexStore((s) => s.preferOfflineBrain);
  const setPreferOfflineBrain = useVortexStore((s) => s.setPreferOfflineBrain);
  const localModelPath = useVortexStore((s) => s.localModelPath);
  const localModelName = useVortexStore((s) => s.localModelName);
  const localModelLoaded = useVortexStore((s) => s.localModelLoaded);
  const localModelSizeMb = useVortexStore((s) => s.localModelSizeMb);
  const localContextSize = useVortexStore((s) => s.localContextSize);
  const localThreads = useVortexStore((s) => s.localThreads);
  const setLocalModelConfig = useVortexStore((s) => s.setLocalModelConfig);

  const wakewordEnabled = useVortexStore((s) => s.wakewordEnabled);
  const wakewordPhrase = useVortexStore((s) => s.wakewordPhrase);
  const wakewordEngine = useVortexStore((s) => s.wakewordEngine);
  const customPpnPath = useVortexStore((s) => s.customPpnPath);
  const setWakewordConfig = useVortexStore((s) => s.setWakewordConfig);

  const accentKey = useVortexStore((s) => s.orbAccentKey);
  const fontPreset = useVortexStore((s) => s.fontPreset);
  const accent = VORTEX_ACCENTS[accentKey] || VORTEX_ACCENTS.sky;
  const fonts = VORTEX_FONTS[fontPreset] || VORTEX_FONTS.aero;

  const [phraseDraft, setPhraseDraft] = useState(wakewordPhrase);
  const [busyModel, setBusyModel] = useState(false);
  const [feedback, setFeedback] = useState('');

  const handleScanDefaultFolder = async () => {
    setBusyModel(true);
    setFeedback('');
    try {
      const found = await vortexLlmRouter.resolveLocalGgufPath();
      if (found) {
        setFeedback(`Verified GGUF model staged: ${found}`);
      } else {
        setFeedback('No valid .gguf model found in /storage/emulated/0/Vortex/model/.');
      }
    } finally {
      setBusyModel(false);
    }
  };

  const handlePickGgufFile = async () => {
    setBusyModel(true);
    setFeedback('');
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: false,
        multiple: false,
      });
      if (picked.canceled || !picked.assets?.[0]) return;
      const asset = picked.assets[0];
      const ready = await vortexLlmRouter.ensureLocalEngineReady(asset.uri);
      if (ready) {
        setFeedback(`Loaded ${asset.name} into native llama.rn RAM.`);
      } else {
        setFeedback('Selected file failed GGUF header verification.');
      }
    } finally {
      setBusyModel(false);
    }
  };

  const handleToggleLoadEngine = async () => {
    setBusyModel(true);
    setFeedback('');
    try {
      if (localModelLoaded) {
        await vortexLlmRouter.unloadLocalEngine();
        setFeedback('Unloaded local GGUF engine from RAM.');
      } else {
        const ok = await vortexLlmRouter.ensureLocalEngineReady();
        setFeedback(
          ok
            ? 'Local GGUF neural engine active in RAM.'
            : 'Model file missing. Place Qwen2.5-Coder GGUF in /Vortex/model/ or pick file.'
        );
      }
    } finally {
      setBusyModel(false);
    }
  };

  const handlePickPpnKeyword = async () => {
    const picked = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: false,
      multiple: false,
    });
    if (picked.canceled || !picked.assets?.[0]) return;
    const staged = await vortexVoiceWakeword.stageCustomPpnFile(picked.assets[0].uri);
    if (staged) {
      setFeedback(`Staged Picovoice keyword file: ${picked.assets[0].name}`);
    } else {
      setFeedback('Invalid .ppn keyword file.');
    }
  };

  const handleToggleWakeword = async () => {
    const next = !wakewordEnabled;
    setWakewordConfig({ enabled: next });
    if (next) {
      await vortexVoiceWakeword.startContinuousWakeword();
      setFeedback(`Continuous "${wakewordPhrase}" listener armed.`);
    } else {
      await vortexVoiceWakeword.shutdown();
      setFeedback('Wakeword listener paused.');
    }
  };

  return (
    <VortexNavigationShell
      headerTitle="OFFLINE BRAIN"
      headerSubtitle={localModelLoaded ? 'GGUF Loaded in RAM' : 'Hybrid GGUF + Cloud'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {feedback ? (
          <View style={[styles.toastBox, { backgroundColor: accent.soft, borderColor: accent.border }]}>
            <Text style={[styles.toastText, { color: accent.primary }]}>{feedback}</Text>
          </View>
        ) : null}

        <Text style={styles.sectionLabel}>EXECUTION ROUTING PRIORITY</Text>
        <View style={[styles.card, { borderColor: accent.border }]}>
          <TouchableOpacity
            onPress={() => setPreferOfflineBrain(!preferOfflineBrain)}
            style={styles.toggleRow}
          >
            <View style={styles.toggleInfo}>
              <Text style={[styles.cardTitle, { fontFamily: fonts.bold }]}>
                Offline Local GGUF First Mode
              </Text>
              <Text style={styles.cardSub}>
                {preferOfflineBrain
                  ? 'All text & coding queries run 100% on-device without internet'
                  : 'Uses multi-key Gemini Cloud first, with automatic GGUF offline fallback'}
              </Text>
            </View>
            <View
              style={[
                styles.badgePill,
                {
                  backgroundColor: preferOfflineBrain
                    ? VORTEX_PALETTE.successSoft
                    : accent.soft,
                },
              ]}
            >
              <Text
                style={{
                  color: preferOfflineBrain ? VORTEX_PALETTE.success : accent.primary,
                  fontSize: 10,
                  fontWeight: '800',
                }}
              >
                {preferOfflineBrain ? 'OFFLINE 1ST' : 'HYBRID'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>LOCAL GGUF NEURAL ENGINE (LLAMA.RN)</Text>
        <View style={[styles.card, { borderColor: accent.border }]}>
          <View style={styles.modelHeaderRow}>
            <View style={styles.toggleInfo}>
              <Text style={[styles.cardTitle, { fontFamily: fonts.bold }]}>
                {localModelName}
              </Text>
              <Text numberOfLines={1} style={styles.cardSub}>
                {localModelPath || 'Expected directory: /storage/emulated/0/Vortex/model/'}
              </Text>
            </View>
            <View
              style={[
                styles.badgePill,
                {
                  backgroundColor: localModelLoaded
                    ? VORTEX_PALETTE.successSoft
                    : VORTEX_PALETTE.surfacePill,
                },
              ]}
            >
              <Text
                style={{
                  color: localModelLoaded
                    ? VORTEX_PALETTE.success
                    : VORTEX_PALETTE.textMuted,
                  fontSize: 9.5,
                  fontWeight: '800',
                }}
              >
                {localModelLoaded
                  ? `RAM READY${localModelSizeMb ? ` • ${localModelSizeMb}MB` : ''}`
                  : 'UNLOADED'}
              </Text>
            </View>
          </View>

          <View style={styles.twoColBtns}>
            <TouchableOpacity
              onPress={() => void handleScanDefaultFolder()}
              disabled={busyModel}
              style={[styles.secondaryBtn, { borderColor: accent.border }]}
            >
              <Text style={[styles.secondaryBtnText, { color: accent.primary }]}>
                SCAN /VORTEX/MODEL
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => void handlePickGgufFile()}
              disabled={busyModel}
              style={[styles.secondaryBtn, { borderColor: VORTEX_PALETTE.borderStrong }]}
            >
              <Text style={styles.secondaryBtnText}>IMPORT .GGUF</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.miniLabel}>CONTEXT WINDOW (N_CTX)</Text>
          <View style={styles.chipRow}>
            {[1024, 2048, 4096].map((ctx) => {
              const active = localContextSize === ctx;
              return (
                <TouchableOpacity
                  key={ctx}
                  onPress={() => setLocalModelConfig({ contextSize: ctx })}
                  style={[
                    styles.tuningChip,
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
                    {ctx} TOKENS
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.miniLabel}>CPU INFERENCE THREADS</Text>
          <View style={styles.chipRow}>
            {[2, 4, 6, 8].map((th) => {
              const active = localThreads === th;
              return (
                <TouchableOpacity
                  key={th}
                  onPress={() => setLocalModelConfig({ threads: th })}
                  style={[
                    styles.tuningChip,
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
                    {th} CORES
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            onPress={() => void handleToggleLoadEngine()}
            disabled={busyModel}
            style={[
              styles.primaryBtn,
              {
                backgroundColor: localModelLoaded
                  ? VORTEX_PALETTE.dangerSoft
                  : accent.primary,
                borderWidth: localModelLoaded ? 1 : 0,
                borderColor: VORTEX_PALETTE.danger,
              },
            ]}
          >
            {busyModel ? (
              <ActivityIndicator size="small" color={VORTEX_PALETTE.oledBlack} />
            ) : (
              <Text
                style={[
                  styles.primaryBtnText,
                  {
                    color: localModelLoaded
                      ? VORTEX_PALETTE.danger
                      : VORTEX_PALETTE.oledBlack,
                  },
                ]}
              >
                {localModelLoaded ? 'UNLOAD GGUF FROM RAM' : 'INITIALIZE & LOAD GGUF ENGINE'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>OFFLINE WAKEWORD ENGINE ("HEY VORTEX")</Text>
        <View style={[styles.card, { borderColor: accent.border }]}>
          <TouchableOpacity onPress={() => void handleToggleWakeword()} style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={[styles.cardTitle, { fontFamily: fonts.bold }]}>
                Continuous Hands-Free Wakeword
              </Text>
              <Text style={styles.cardSub}>
                Engine: {wakewordEngine === 'picovoice_ppn' ? 'Picovoice .ppn' : 'Offline Acoustic KWS'}
              </Text>
            </View>
            <View
              style={[
                styles.badgePill,
                {
                  backgroundColor: wakewordEnabled
                    ? VORTEX_PALETTE.successSoft
                    : VORTEX_PALETTE.surfacePill,
                },
              ]}
            >
              <Text
                style={{
                  color: wakewordEnabled ? VORTEX_PALETTE.success : VORTEX_PALETTE.textMuted,
                  fontSize: 10,
                  fontWeight: '800',
                }}
              >
                {wakewordEnabled ? 'ARMED' : 'OFF'}
              </Text>
            </View>
          </TouchableOpacity>

          <View style={styles.phraseRow}>
            <TextInput
              value={phraseDraft}
              onChangeText={setPhraseDraft}
              placeholder="Wake phrase (e.g., Hey Vortex)"
              placeholderTextColor={VORTEX_PALETTE.textMuted}
              style={[styles.inputField, { flex: 1 }]}
            />
            <TouchableOpacity
              onPress={() => {
                if (phraseDraft.trim()) {
                  setWakewordConfig({ phrase: phraseDraft.trim() });
                  setFeedback(`Wake phrase updated to "${phraseDraft.trim()}".`);
                }
              }}
              style={[styles.applyBtn, { backgroundColor: accent.primary }]}
            >
              <Text style={styles.applyBtnText}>SET</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={() => void handlePickPpnKeyword()}
            style={[styles.secondaryBtn, { borderColor: VORTEX_PALETTE.borderStrong }]}
          >
            <Text style={styles.secondaryBtnText}>
              {customPpnPath
                ? `STAGED .PPN: ${customPpnPath.split('/').pop()}`
                : 'IMPORT OPTIONAL PORCUPINE .PPN FILE'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </VortexNavigationShell>
  );
};

export const VortexCodeCanvasScreen: React.FC = () => {
  const codeCanvas = useVortexStore((s) => s.codeCanvas);
  const updateCodeCanvas = useVortexStore((s) => s.updateCodeCanvas);

  const accentKey = useVortexStore((s) => s.orbAccentKey);
  const fontPreset = useVortexStore((s) => s.fontPreset);
  const fontScale = useVortexStore((s) => s.fontScale);

  const accent = VORTEX_ACCENTS[accentKey] || VORTEX_ACCENTS.sky;
  const fonts = VORTEX_FONTS[fontPreset] || VORTEX_FONTS.aero;

  const [viewMode, setViewMode] = useState<'editor' | 'preview'>(
    codeCanvas.diagramSpec ? 'preview' : 'editor'
  );
  const [aiWorking, setAiWorking] = useState(false);
  const [canvasToast, setCanvasToast] = useState('');

  const notifyCanvas = (msg: string) => {
    setCanvasToast(msg);
    setTimeout(() => setCanvasToast(''), 2200);
  };

  const handleStripCommentsLocally = () => {
    const cleaned = codeCanvas.code
      .split('\n')
      .map((line) => {
        if (/^\s*(\/\/|#)/.test(line)) return '';
        return line.replace(/\s+\/\/.*$/, '');
      })
      .filter((line, idx, arr) => line.trim() !== '' || (idx > 0 && arr[idx - 1].trim() !== ''))
      .join('\n')
      .trim();

    updateCodeCanvas({ code: cleaned });
    notifyCanvas('Stripped all inline comments.');
  };

  const handleAiTransform = async (instruction: string) => {
    if (aiWorking || !codeCanvas.code.trim()) return;
    setAiWorking(true);
    try {
      const res = await vortexLlmRouter.generate({
        prompt: `${instruction}\nLanguage: ${codeCanvas.language}\nReturn ONLY the complete raw code without markdown fences or inline comments:\n\n${codeCanvas.code}`,
        mode: 'code',
        useRag: false,
        stripCodeComments: true,
      });

      const pureCode = res.text
        .replace(/^```[a-zA-Z0-9_+-]*\n?/g, '')
        .replace(/```$/g, '')
        .trim();

      if (pureCode) {
        updateCodeCanvas({ code: pureCode });
        setViewMode('editor');
        notifyCanvas('Canvas code updated by VORTEX Code Engine.');
      }
    } catch (err: any) {
      notifyCanvas(err?.message || 'AI code transform failed.');
    } finally {
      setAiWorking(false);
    }
  };

  const handleInjectCanvasCode = async (humanCadence: boolean) => {
    try {
      if (VortexBridge?.injectTextToFocusedNode) {
        const ok = await VortexBridge.injectTextToFocusedNode(codeCanvas.code, humanCadence);
        if (ok) {
          notifyCanvas(
            humanCadence ? 'Ghost-typed code into active window.' : 'Injected code into active app.'
          );
          return;
        }
      }
      await Clipboard.setStringAsync(codeCanvas.code);
      notifyCanvas('Copied to clipboard (focus an editor input first to inject).');
    } catch (_e) {
    }
  };

  const handleQueuePcSync = async () => {
    const extMap: Record<string, string> = {
      CPP: 'cpp',
      PYTHON: 'py',
      KOTLIN: 'kt',
      TYPESCRIPT: 'ts',
      SQL: 'sql',
      C: 'c',
    };
    const ext = extMap[codeCanvas.language.toUpperCase()] || 'txt';
    const filename = `${codeCanvas.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.${ext}`;
    const pending = await vortexWebAndPcBridge.queueCodeFileForPc(
      filename,
      codeCanvas.language,
      codeCanvas.code
    );
    notifyCanvas(`Queued ${filename} for PC sync (${pending} pending).`);
  };

  const previewMarkdown = `\`\`\`${codeCanvas.language.toLowerCase()}\n${codeCanvas.code}\n\`\`\``;

  return (
    <VortexNavigationShell
      headerTitle="CODE CANVAS"
      headerSubtitle={`${codeCanvas.language} • ${codeCanvas.code.split('\n').length} Lines`}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.canvasTopBar}>
          <TextInput
            value={codeCanvas.title}
            onChangeText={(t) => updateCodeCanvas({ title: t })}
            style={[styles.canvasTitleInput, { fontFamily: fonts.bold }]}
          />

          <View style={styles.modeSwitchRow}>
            <TouchableOpacity
              onPress={() => setViewMode('editor')}
              style={[
                styles.viewTabBtn,
                viewMode === 'editor' && { backgroundColor: accent.soft, borderColor: accent.primary },
              ]}
            >
              <Text
                style={[
                  styles.viewTabText,
                  { color: viewMode === 'editor' ? accent.primary : VORTEX_PALETTE.textMuted },
                ]}
              >
                EDIT
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setViewMode('preview')}
              style={[
                styles.viewTabBtn,
                viewMode === 'preview' && {
                  backgroundColor: accent.soft,
                  borderColor: accent.primary,
                },
              ]}
            >
              <Text
                style={[
                  styles.viewTabText,
                  { color: viewMode === 'preview' ? accent.primary : VORTEX_PALETTE.textMuted },
                ]}
              >
                RENDER
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.langBar}
        >
          {CANVAS_LANGUAGES.map((lang) => {
            const active = codeCanvas.language.toUpperCase() === lang;
            return (
              <TouchableOpacity
                key={lang}
                onPress={() => updateCodeCanvas({ language: lang })}
                style={[
                  styles.langPill,
                  active && { backgroundColor: accent.soft, borderColor: accent.primary },
                ]}
              >
                <Text
                  style={[
                    styles.langPillText,
                    {
                      fontFamily: fonts.code,
                      color: active ? accent.primary : VORTEX_PALETTE.textSecondary,
                    },
                  ]}
                >
                  {lang}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {canvasToast ? (
          <View style={[styles.toastBox, { backgroundColor: accent.soft, borderColor: accent.border }]}>
            <Text style={[styles.toastText, { color: accent.primary }]}>{canvasToast}</Text>
          </View>
        ) : null}

        {viewMode === 'editor' ? (
          <View style={[styles.editorContainer, { borderColor: accent.border }]}>
            <TextInput
              value={codeCanvas.code}
              onChangeText={(c) => updateCodeCanvas({ code: c })}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              style={[
                styles.codeEditorArea,
                {
                  fontFamily: fonts.code,
                  fontSize: getScaledFontSize(13, fontScale),
                },
              ]}
            />
          </View>
        ) : (
          <VortexRichBlocks
            content={previewMarkdown}
            diagramSpec={codeCanvas.diagramSpec}
          />
        )}

        <Text style={styles.sectionLabel}>AI CODE ENGINE TRANSFORMS</Text>
        <View style={styles.aiToolsRow}>
          <TouchableOpacity
            onPress={() =>
              void handleAiTransform(
                'Fix all syntax errors, logic bugs, and edge cases in this code.'
              )
            }
            disabled={aiWorking}
            style={[styles.aiToolBtn, { borderColor: accent.border }]}
          >
            <Text style={[styles.aiToolText, { color: accent.primary }]}>
              {aiWorking ? 'WORKING...' : 'FIX BUGS'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() =>
              void handleAiTransform(
                'Optimize this code for best time and space complexity while keeping it clean.'
              )
            }
            disabled={aiWorking}
            style={[styles.aiToolBtn, { borderColor: VORTEX_PALETTE.borderStrong }]}
          >
            <Text style={styles.aiToolText}>OPTIMIZE</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleStripCommentsLocally}
            style={[styles.aiToolBtn, { borderColor: VORTEX_PALETTE.borderStrong }]}
          >
            <Text style={styles.aiToolText}>NO COMMENTS</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>EXECUTION & SYNC PIPELINE</Text>
        <View style={styles.exportGrid}>
          <TouchableOpacity
            onPress={async () => {
              await Clipboard.setStringAsync(codeCanvas.code);
              notifyCanvas('Copied canvas code to clipboard.');
            }}
            style={styles.exportTile}
          >
            <Text style={styles.exportTileText}>COPY CODE</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => void handleInjectCanvasCode(false)}
            style={[styles.exportTile, { borderColor: accent.border, backgroundColor: accent.soft }]}
          >
            <Text style={[styles.exportTileText, { color: accent.primary }]}>INJECT TO APP</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => void handleInjectCanvasCode(true)}
            style={styles.exportTile}
          >
            <Text style={[styles.exportTileText, { color: VORTEX_PALETTE.warning }]}>
              GHOST TYPE
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => void handleQueuePcSync()} style={styles.exportTile}>
            <Text style={[styles.exportTileText, { color: VORTEX_PALETTE.success }]}>
              QUEUE PC SYNC
            </Text>
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
  toastBox: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  toastText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  sectionLabel: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.9,
    marginTop: 2,
  },
  card: {
    backgroundColor: VORTEX_PALETTE.surfaceCard,
    borderRadius: VORTEX_LAYOUT.radiusLg,
    borderWidth: 1,
    padding: 14,
    gap: 11,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  modelHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  toggleInfo: {
    flex: 1,
    gap: 3,
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
  badgePill: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },
  twoColBtns: {
    flexDirection: 'row',
    gap: 8,
  },
  secondaryBtn: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: VORTEX_PALETTE.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  secondaryBtnText: {
    color: VORTEX_PALETTE.textPrimary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  miniLabel: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 7,
  },
  tuningChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderHairline,
    backgroundColor: VORTEX_PALETTE.surfaceBase,
    alignItems: 'center',
  },
  primaryBtn: {
    height: 43,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  primaryBtnText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  phraseRow: {
    flexDirection: 'row',
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
  applyBtn: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyBtnText: {
    color: VORTEX_PALETTE.oledBlack,
    fontSize: 11,
    fontWeight: '800',
  },
  canvasTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  canvasTitleInput: {
    flex: 1,
    height: 40,
    backgroundColor: VORTEX_PALETTE.surfaceCard,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderStrong,
    paddingHorizontal: 11,
    color: VORTEX_PALETTE.textPrimary,
    fontSize: 13,
  },
  modeSwitchRow: {
    flexDirection: 'row',
    gap: 5,
  },
  viewTabBtn: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderHairline,
    backgroundColor: VORTEX_PALETTE.surfaceCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewTabText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  langBar: {
    gap: 7,
  },
  langPill: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: VORTEX_LAYOUT.radiusPill,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderHairline,
    backgroundColor: VORTEX_PALETTE.surfaceCard,
  },
  langPillText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  editorContainer: {
    backgroundColor: VORTEX_SYNTAX.background,
    borderRadius: VORTEX_LAYOUT.radiusMd,
    borderWidth: 1,
    padding: 10,
  },
  codeEditorArea: {
    minHeight: 280,
    color: VORTEX_SYNTAX.plain,
    textAlignVertical: 'top',
    lineHeight: 20,
  },
  aiToolsRow: {
    flexDirection: 'row',
    gap: 7,
  },
  aiToolBtn: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: VORTEX_PALETTE.surfaceCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiToolText: {
    color: VORTEX_PALETTE.textPrimary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  exportGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  exportTile: {
    width: '48.6%',
    height: 42,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderStrong,
    backgroundColor: VORTEX_PALETTE.surfaceCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportTileText: {
    color: VORTEX_PALETTE.textPrimary,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
