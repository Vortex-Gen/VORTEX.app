import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { vortexGhostAgent } from '../engines/vortexGhostAgent';
import { vortexWebAndPcBridge } from '../engines/vortexWebAndPcBridge';
import { useVortexStore, VortexPromptMode } from '../store/useVortexStore';
import {
  VORTEX_ACCENTS,
  VORTEX_FONTS,
  VORTEX_LAYOUT,
  VORTEX_PALETTE,
} from '../theme/vortexTheme';

interface ModeOption {
  id: VortexPromptMode;
  label: string;
  hint: string;
}

const PROMPT_MODES: ModeOption[] = [
  { id: 'auto', label: 'Auto', hint: 'Smart Intent' },
  { id: 'code', label: 'Code', hint: 'Clean No-Comment' },
  { id: 'ghost', label: 'Ghost', hint: 'OS UI Loop' },
  { id: 'study', label: 'Study', hint: 'CSE + Diagrams' },
  { id: 'vision', label: 'Vision', hint: 'Screen & Photo' },
];

export const VortexPlusActionSheet: React.FC = () => {
  const isOpen = useVortexStore((s) => s.isPlusSheetOpen);
  const setPlusSheetOpen = useVortexStore((s) => s.setPlusSheetOpen);
  const activePromptMode = useVortexStore((s) => s.activePromptMode);
  const setPromptMode = useVortexStore((s) => s.setPromptMode);
  const addPendingAttachment = useVortexStore((s) => s.addPendingAttachment);
  const setActiveScreen = useVortexStore((s) => s.setActiveScreen);

  const accentKey = useVortexStore((s) => s.orbAccentKey);
  const fontPreset = useVortexStore((s) => s.fontPreset);
  const accent = VORTEX_ACCENTS[accentKey] || VORTEX_ACCENTS.sky;
  const fonts = VORTEX_FONTS[fontPreset] || VORTEX_FONTS.aero;

  const [urlInput, setUrlInput] = useState('');
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [statusFeedback, setStatusFeedback] = useState('');

  const closeSheet = () => {
    setStatusFeedback('');
    setLoadingAction(null);
    setPlusSheetOpen(false);
  };

  const handlePickCamera = async () => {
    setLoadingAction('camera');
    try {
      const att = await vortexWebAndPcBridge.pickImageAttachment(true);
      if (att) {
        addPendingAttachment(att);
        setPromptMode('vision');
        closeSheet();
      } else {
        setStatusFeedback('Camera capture cancelled or permission denied.');
      }
    } finally {
      setLoadingAction(null);
    }
  };

  const handlePickGallery = async () => {
    setLoadingAction('gallery');
    try {
      const att = await vortexWebAndPcBridge.pickImageAttachment(false);
      if (att) {
        addPendingAttachment(att);
        setPromptMode('vision');
        closeSheet();
      } else {
        setStatusFeedback('No image selected.');
      }
    } finally {
      setLoadingAction(null);
    }
  };

  const handlePickDocument = async () => {
    setLoadingAction('file');
    try {
      const att = await vortexWebAndPcBridge.pickDocumentAttachment();
      if (att) {
        addPendingAttachment(att);
        closeSheet();
      } else {
        setStatusFeedback('No file selected.');
      }
    } finally {
      setLoadingAction(null);
    }
  };

  const handleAttachClipboard = async () => {
    setLoadingAction('clipboard');
    try {
      const att = await vortexWebAndPcBridge.readClipboardAttachment();
      if (att) {
        addPendingAttachment(att);
        closeSheet();
      } else {
        setStatusFeedback('Clipboard is currently empty.');
      }
    } finally {
      setLoadingAction(null);
    }
  };

  const handleAttachLiveScreen = async () => {
    setLoadingAction('screen');
    try {
      const snap = await vortexGhostAgent.captureLiveScreen();
      if (!snap) {
        setStatusFeedback('Enable VORTEX Accessibility Service to capture live screen.');
        return;
      }
      const domDigest = snap.nodes
        .slice(0, 60)
        .map((n) => `[${n.tag}] ${n.text || n.desc}`)
        .join('\n');

      addPendingAttachment({
        id: `att_scr_${Date.now()}`,
        type: 'screen_capture',
        name: `Screen (${snap.packageName.split('.').pop() || 'OS'})`,
        base64: snap.screenshotBase64 || undefined,
        textContent: `Foreground Package: ${snap.packageName}\nVisible Nodes:\n${domDigest}`,
      });
      setPromptMode('vision');
      closeSheet();
    } finally {
      setLoadingAction(null);
    }
  };

  const handleScrapeWebUrl = async () => {
    const clean = urlInput.trim();
    if (!clean) return;
    setLoadingAction('url');
    setStatusFeedback('');
    try {
      const inspected = await vortexWebAndPcBridge.fetchAndInspectWebUrl(clean);
      addPendingAttachment({
        id: `att_web_${Date.now()}`,
        type: 'file',
        name: `Web: ${inspected.title.slice(0, 28)}`,
        textContent: `URL: ${inspected.url}\nTitle: ${inspected.title}\n\n${inspected.cleanText}`,
      });
      setUrlInput('');
      closeSheet();
    } catch (_e) {
      setStatusFeedback('Failed to fetch URL. Check link or internet connection.');
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={closeSheet}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={closeSheet} />

        <View style={[styles.sheetContainer, { borderTopColor: accent.border }]}>
          <View style={styles.dragHandle} />

          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { fontFamily: fonts.display }]}>
              MULTIMODAL & MODE MATRIX
            </Text>
            <TouchableOpacity onPress={closeSheet} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionLabel}>INTELLIGENCE ROUTING MODE</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.modeRow}
          >
            {PROMPT_MODES.map((m) => {
              const active = activePromptMode === m.id;
              return (
                <TouchableOpacity
                  key={m.id}
                  onPress={() => setPromptMode(m.id)}
                  style={[
                    styles.modeChip,
                    active && {
                      backgroundColor: accent.soft,
                      borderColor: accent.primary,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.modeLabel,
                      {
                        fontFamily: fonts.bold,
                        color: active ? accent.primary : VORTEX_PALETTE.textPrimary,
                      },
                    ]}
                  >
                    {m.label}
                  </Text>
                  <Text style={styles.modeHint}>{m.hint}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text style={styles.sectionLabel}>CONTEXT & SENSOR INTAKE</Text>
          <View style={styles.actionGrid}>
            <TouchableOpacity onPress={handlePickCamera} style={styles.actionTile}>
              {loadingAction === 'camera' ? (
                <ActivityIndicator size="small" color={accent.primary} />
              ) : (
                <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                  <Path
                    d="M4 8h3l2-3h6l2 3h3v11H4V8z"
                    stroke={accent.primary}
                    strokeWidth={1.8}
                    strokeLinejoin="round"
                  />
                  <Circle cx={12} cy={13.5} r={3.2} stroke={accent.primary} strokeWidth={1.8} />
                </Svg>
              )}
              <Text style={[styles.tileTitle, { fontFamily: fonts.bold }]}>Camera</Text>
              <Text style={styles.tileSub}>Snap & Solve</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={handlePickGallery} style={styles.actionTile}>
              {loadingAction === 'gallery' ? (
                <ActivityIndicator size="small" color={accent.primary} />
              ) : (
                <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                  <Rect
                    x={3}
                    y={4}
                    width={18}
                    height={16}
                    rx={3}
                    stroke={VORTEX_PALETTE.success}
                    strokeWidth={1.8}
                  />
                  <Circle cx={8.5} cy={9.5} r={1.5} fill={VORTEX_PALETTE.success} />
                  <Path
                    d="M21 16l-5-5-4 4-3-3-6 6"
                    stroke={VORTEX_PALETTE.success}
                    strokeWidth={1.8}
                    strokeLinecap="round"
                  />
                </Svg>
              )}
              <Text style={[styles.tileTitle, { fontFamily: fonts.bold }]}>Gallery</Text>
              <Text style={styles.tileSub}>Attach Photo</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={handlePickDocument} style={styles.actionTile}>
              {loadingAction === 'file' ? (
                <ActivityIndicator size="small" color={accent.primary} />
              ) : (
                <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                  <Path
                    d="M6 3h8l4 4v14H6V3z"
                    stroke={VORTEX_PALETTE.warning}
                    strokeWidth={1.8}
                    strokeLinejoin="round"
                  />
                  <Path
                    d="M9 13h6M9 17h4"
                    stroke={VORTEX_PALETTE.warning}
                    strokeWidth={1.8}
                    strokeLinecap="round"
                  />
                </Svg>
              )}
              <Text style={[styles.tileTitle, { fontFamily: fonts.bold }]}>Code / File</Text>
              <Text style={styles.tileSub}>Read Source</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleAttachClipboard} style={styles.actionTile}>
              {loadingAction === 'clipboard' ? (
                <ActivityIndicator size="small" color={accent.primary} />
              ) : (
                <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                  <Rect
                    x={6}
                    y={5}
                    width={12}
                    height={16}
                    rx={2}
                    stroke="#818CF8"
                    strokeWidth={1.8}
                  />
                  <Path
                    d="M9 3h6v4H9V3z"
                    stroke="#818CF8"
                    strokeWidth={1.8}
                    strokeLinejoin="round"
                  />
                </Svg>
              )}
              <Text style={[styles.tileTitle, { fontFamily: fonts.bold }]}>Clipboard</Text>
              <Text style={styles.tileSub}>Paste Snippet</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleAttachLiveScreen} style={styles.actionTile}>
              {loadingAction === 'screen' ? (
                <ActivityIndicator size="small" color={accent.primary} />
              ) : (
                <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                  <Rect
                    x={4}
                    y={3}
                    width={16}
                    height={18}
                    rx={3}
                    stroke={accent.primary}
                    strokeWidth={1.8}
                  />
                  <Path
                    d="M8 9h8M8 13h5"
                    stroke={accent.primary}
                    strokeWidth={1.8}
                    strokeLinecap="round"
                  />
                </Svg>
              )}
              <Text style={[styles.tileTitle, { fontFamily: fonts.bold }]}>Screen DOM</Text>
              <Text style={styles.tileSub}>Capture UI</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                closeSheet();
                setActiveScreen('image_studio');
              }}
              style={styles.actionTile}
            >
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2L12 3z"
                  stroke={VORTEX_PALETTE.danger}
                  strokeWidth={1.8}
                  strokeLinejoin="round"
                />
              </Svg>
              <Text style={[styles.tileTitle, { fontFamily: fonts.bold }]}>Art Studio</Text>
              <Text style={styles.tileSub}>Pollinations AI</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionLabel}>LIVE WEB URL INSPECTOR</Text>
          <View style={styles.urlRow}>
            <TextInput
              value={urlInput}
              onChangeText={setUrlInput}
              placeholder="https://example.com/docs"
              placeholderTextColor={VORTEX_PALETTE.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={styles.urlInput}
            />
            <TouchableOpacity
              onPress={handleScrapeWebUrl}
              disabled={loadingAction === 'url' || !urlInput.trim()}
              style={[
                styles.urlBtn,
                {
                  backgroundColor: urlInput.trim() ? accent.primary : VORTEX_PALETTE.surfacePill,
                },
              ]}
            >
              {loadingAction === 'url' ? (
                <ActivityIndicator size="small" color={VORTEX_PALETTE.oledBlack} />
              ) : (
                <Text
                  style={[
                    styles.urlBtnText,
                    {
                      color: urlInput.trim()
                        ? VORTEX_PALETTE.oledBlack
                        : VORTEX_PALETTE.textMuted,
                    },
                  ]}
                >
                  SCRAPE
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {statusFeedback ? <Text style={styles.feedbackText}>{statusFeedback}</Text> : null}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: VORTEX_PALETTE.scrim,
  },
  sheetContainer: {
    backgroundColor: VORTEX_PALETTE.glassSheet,
    borderTopLeftRadius: VORTEX_LAYOUT.radiusXl,
    borderTopRightRadius: VORTEX_LAYOUT.radiusXl,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 28,
    gap: 12,
  },
  dragHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: VORTEX_PALETTE.borderStrong,
    alignSelf: 'center',
    marginBottom: 2,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    color: VORTEX_PALETTE.textPrimary,
    fontSize: 13,
    letterSpacing: 1,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: VORTEX_PALETTE.surfacePill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: VORTEX_PALETTE.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  sectionLabel: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.9,
  },
  modeRow: {
    gap: 8,
  },
  modeChip: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: VORTEX_PALETTE.surfaceCard,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderHairline,
    minWidth: 88,
  },
  modeLabel: {
    fontSize: 12.5,
  },
  modeHint: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 10,
    marginTop: 2,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionTile: {
    width: '31.5%',
    backgroundColor: VORTEX_PALETTE.surfaceCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderHairline,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'flex-start',
    gap: 4,
  },
  tileTitle: {
    color: VORTEX_PALETTE.textPrimary,
    fontSize: 12,
    marginTop: 4,
  },
  tileSub: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 10,
  },
  urlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  urlInput: {
    flex: 1,
    height: 42,
    backgroundColor: VORTEX_PALETTE.surfaceInput,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderStrong,
    paddingHorizontal: 12,
    color: VORTEX_PALETTE.textPrimary,
    fontSize: 12.5,
  },
  urlBtn: {
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  urlBtnText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  feedbackText: {
    color: VORTEX_PALETTE.warning,
    fontSize: 11,
  },
});  
