import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  DeviceEventEmitter,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  NativeModules,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import {
  PROMPT_INJECTION_MODES,
  PromptInjectionModeId,
  VORTEX_BOX_STYLES,
  VORTEX_COLORS,
  VORTEX_COMPLETE_FEATURES,
  VORTEX_FONTS,
  VORTEX_TYPOGRAPHY,
} from './theme/vortexTheme';
import {
  GeneratedAiImage,
  VerifiedWebLink,
  VortexRichMessageRenderer,
  WebImageResult,
} from './components/VortexRichBlocks';
import {
  ghostBrowserController,
  VortexGhostBrowserHost,
} from './components/VortexGhostBrowser';
import {
  callVortexLlmCore,
  processVortexCommand,
  runSilentScreenVision,
  VortexAttachment,
} from './vortexProRouter';
import {
  vortexVoiceEngine,
  VortexMicPrivacyMode,
} from './vortexVoiceEngine';
import {
  CseSubject,
  evaluateVivaAnswer,
  generateVivaQuestion,
  ingestNotesToRag,
  startCommuteAudioRevision,
  VivaQuestionState,
} from './vortexStudyTutor';
import { PcBridgeStatus, vortexPcBridge } from './vortexPcBridge';
import {
  addApiKeyToPool,
  ApiProviderName,
  completeHabitToday,
  deleteMemoryNode,
  getStudyVaultStats,
  HabitEntry,
  listAllMemories,
  listApiKeys,
  listHabits,
  MemoryNodeItem,
  removeApiKeyById,
  saveAppLockRule,
  saveMemoryNode,
  StoredApiKey,
} from './vortexMemoryEngine';

const { VortexBridge } = NativeModules;

export interface ChatTurnMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  modeUsed?: PromptInjectionModeId;
  attachments?: VortexAttachment[];
  webImages?: WebImageResult[];
  verifiedLinks?: VerifiedWebLink[];
  generatedImage?: GeneratedAiImage;
  systemActionBadge?: string;
}

type DrawerTab = 'STUDIO' | 'MEMORY_RAG' | 'KEYS_VOICE' | 'SYSTEM_PC';

const CSE_SUBJECTS: CseSubject[] = [
  'DSA',
  'OOPS_CPP',
  'COA',
  'DIGITAL_ELECTRONICS',
  'COMPUTER_NETWORKS',
  'APPLIED_MATHS',
];

export const VortexGlassCockpit: React.FC = () => {
  const flatListRef = useRef<FlatList<ChatTurnMessage>>(null);

  // Core Chat & Mode State
  const [messages, setMessages] = useState<ChatTurnMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [attachments, setAttachments] = useState<VortexAttachment[]>([]);
  const [activeMode, setActiveMode] = useState<PromptInjectionModeId>('AUTONOMOUS_DEFAULT');
  const [modePickerOpen, setModePickerOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Voice & Orb State
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceTtsEnabled, setVoiceTtsEnabled] = useState(true);
  const [micMode, setMicMode] = useState<VortexMicPrivacyMode>('porcupine');
  const [orbEnabled, setOrbEnabled] = useState(true);
  const [accEnabled, setAccEnabled] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(false);

  // Telemetry State
  const [telemetry, setTelemetry] = useState({
    freeRamMb: 0,
    totalRamMb: 0,
    freeStorageGb: 0,
    batteryPct: 0,
  });

  // Modals & Drawers
  const [attachSheetOpen, setAttachSheetOpen] = useState(false);
  const [moreDrawerOpen, setMoreDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('STUDIO');

  // AI Studio State
  const [studioPrompt, setStudioPrompt] = useState('');
  const [studioModel, setStudioModel] = useState<'flux' | 'zimage' | 'klein'>('flux');

  // Memory & CSE Study RAG State
  const [memories, setMemories] = useState<MemoryNodeItem[]>([]);
  const [newMemoryText, setNewMemoryText] = useState('');
  const [ragSubject, setRagSubject] = useState<CseSubject>('DSA');
  const [ragNoteTitle, setRagNoteTitle] = useState('');
  const [ragNoteContent, setRagNoteContent] = useState('');
  const [vaultStats, setVaultStats] = useState({ totalChunks: 0, subjects: [] as string[] });
  const [activeViva, setActiveViva] = useState<VivaQuestionState | null>(null);
  const [vivaAnswerInput, setVivaAnswerInput] = useState('');

  // API Keys & Voice Config State
  const [apiKeys, setApiKeys] = useState<StoredApiKey[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<ApiProviderName>('gemini');
  const [newKeyInput, setNewKeyInput] = useState('');
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [voiceIdInput, setVoiceIdInput] = useState('pNInz6obpgDQGcFmaJgB');

  // System, App-Lock, Habits & Standby PC Sync State
  const [habits, setHabits] = useState<HabitEntry[]>([]);
  const [lockPkgInput, setLockPkgInput] = useState('');
  const [lockPinInput, setLockPinInput] = useState('');
  const [pcStatus, setPcStatus] = useState<PcBridgeStatus>({
    enabled: false,
    hostUrl: 'http://vortex.local:8000',
    reachable: false,
    queuedCount: 0,
    lastSyncAt: null,
    modeLabel: 'STANDBY (DORMANT)',
  });
  const [pcHostInput, setPcHostInput] = useState('http://vortex.local:8000');

  const refreshSystemAndData = useCallback(async () => {
    try {
      const [overlayOk, accOk, notifOk, rawTel] = await Promise.all([
        VortexBridge?.canDrawOverlays?.() ?? Promise.resolve(false),
        VortexBridge?.isAccessibilityEnabled?.() ?? Promise.resolve(false),
        VortexBridge?.isNotificationListenerEnabled?.() ?? Promise.resolve(false),
        VortexBridge?.getSystemTelemetry?.() ?? Promise.resolve('{}'),
      ]);
      setOrbEnabled(Boolean(overlayOk));
      setAccEnabled(Boolean(accOk));
      setNotifEnabled(Boolean(notifOk));
      const parsedTel = JSON.parse(rawTel || '{}');
      setTelemetry({
        freeRamMb: parsedTel.freeRamMb ?? 0,
        totalRamMb: parsedTel.totalRamMb ?? 0,
        freeStorageGb: parsedTel.freeStorageGb ?? 0,
        batteryPct: parsedTel.batteryPct ?? 0,
      });
    } catch {}

    const vStatus = vortexVoiceEngine.getStatus();
    setMicMode(vStatus.micMode);
    setVoiceTtsEnabled(vortexVoiceEngine.isVoiceOutputEnabled());
    setVoiceIdInput(vStatus.activeVoiceId);

    const [keys, memList, vStats, hList, pcSt] = await Promise.all([
      listApiKeys(),
      listAllMemories(40),
      getStudyVaultStats(),
      listHabits(),
      vortexPcBridge.getStatus(),
    ]);
    setApiKeys(keys);
    setMemories(memList);
    setVaultStats(vStats);
    setHabits(hList);
    setPcStatus(pcSt);
    setPcHostInput(pcSt.hostUrl);
  }, []);

  useEffect(() => {
    refreshSystemAndData();
    const unsubSpeak = vortexVoiceEngine.onSpeakingStateChange((speaking) => {
      setIsSpeaking(speaking);
    });

    const voiceSub = DeviceEventEmitter.addListener(
      'VortexVoiceTranscript',
      (transcript: string) => {
        if (transcript && transcript.trim().length > 0) {
          handleSendPrompt(transcript.trim());
        }
      }
    );

    const orbActionSub = DeviceEventEmitter.addListener(
      'VortexOrbAction',
      async (action: string) => {
        if (action === 'LONG_PRESS_SCAN' || action === 'CAPSULE_SCAN') {
          const res = await runSilentScreenVision(undefined, false);
          appendAssistantTurn(res);
        } else if (action === 'CAPSULE_INJECT') {
          const res = await runSilentScreenVision(undefined, true);
          appendAssistantTurn(res);
        }
      }
    );

    return () => {
      unsubSpeak();
      voiceSub.remove();
      orbActionSub.remove();
    };
  }, [refreshSystemAndData]);

  const appendAssistantTurn = (res: {
    replyText: string;
    modeUsed: PromptInjectionModeId;
    webImages?: WebImageResult[];
    verifiedLinks?: VerifiedWebLink[];
    generatedImage?: GeneratedAiImage;
    systemActionBadge?: string;
  }) => {
    const aiMsg: ChatTurnMessage = {
      id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: 'assistant',
      text: res.replyText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      modeUsed: res.modeUsed,
      webImages: res.webImages,
      verifiedLinks: res.verifiedLinks,
      generatedImage: res.generatedImage,
      systemActionBadge: res.systemActionBadge,
    };
    setMessages((prev) => [...prev, aiMsg]);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 140);
  };

  const handleSendPrompt = async (overrideText?: string, overrideMode?: PromptInjectionModeId) => {
    const query = (overrideText ?? inputText).trim();
    const currentAtts = [...attachments];
    if (!query && currentAtts.length === 0) return;
    if (isGenerating) return;

    const effectivePrompt =
      query ||
      (currentAtts[0]?.kind === 'file'
        ? `Analyze attached file "${currentAtts[0].name}" and summarize key points.`
        : 'Analyze attached image/screen in detail.');

    const userMsg: ChatTurnMessage = {
      id: `usr-${Date.now()}`,
      role: 'user',
      text: effectivePrompt,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      attachments: currentAtts.length > 0 ? currentAtts : undefined,
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!overrideText) setInputText('');
    setAttachments([]);
    setIsGenerating(true);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const response = await processVortexCommand({
        userText: effectivePrompt,
        mode: overrideMode || activeMode,
        attachments: currentAtts,
      });
      appendAssistantTurn(response);
    } catch (e: any) {
      appendAssistantTurn({
        replyText: `## Execution Notice\n${e?.message || 'Unexpected error occurred.'}`,
        modeUsed: activeMode,
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // ==========================================================================
  // REAL ATTACHMENT HANDLERS (+ BUTTON)
  // ==========================================================================

  const handlePickGalleryImage = async () => {
    setAttachSheetOpen(false);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Needed', 'Gallery permission allow karo.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        base64: true,
        quality: 0.78,
      });
      if (!res.canceled && res.assets?.[0]) {
        const asset = res.assets[0];
        setAttachments((prev) => [
          ...prev,
          {
            id: `img-${Date.now()}`,
            kind: 'image',
            name: asset.fileName || 'GalleryImage.jpg',
            mimeType: asset.mimeType || 'image/jpeg',
            base64Data: asset.base64 || undefined,
            uri: asset.uri,
          },
        ]);
      }
    } catch (e: any) {
      Alert.alert('Image Error', e?.message || 'Could not pick image.');
    }
  };

  const handleCaptureCameraPhoto = async () => {
    setAttachSheetOpen(false);
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Needed', 'Camera permission allow karo.');
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        base64: true,
        quality: 0.78,
      });
      if (!res.canceled && res.assets?.[0]) {
        const asset = res.assets[0];
        setAttachments((prev) => [
          ...prev,
          {
            id: `cam-${Date.now()}`,
            kind: 'image',
            name: 'CameraSnap.jpg',
            mimeType: asset.mimeType || 'image/jpeg',
            base64Data: asset.base64 || undefined,
            uri: asset.uri,
          },
        ]);
      }
    } catch (e: any) {
      Alert.alert('Camera Error', e?.message || 'Camera capture failed.');
    }
  };

  const handlePickDocumentFile = async () => {
    setAttachSheetOpen(false);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
      });
      if (!res.canceled && res.assets?.[0]) {
        const file = res.assets[0];
        let extractedText = '';
        try {
          extractedText = await FileSystem.readAsStringAsync(file.uri);
        } catch {
          extractedText = `[Binary/Document Attached: ${file.name}, Size: ${file.size || 0} bytes]`;
        }
        setAttachments((prev) => [
          ...prev,
          {
            id: `doc-${Date.now()}`,
            kind: 'file',
            name: file.name,
            mimeType: file.mimeType || 'text/plain',
            textContent: extractedText.slice(0, 14000),
            uri: file.uri,
          },
        ]);
      }
    } catch (e: any) {
      Alert.alert('File Error', e?.message || 'Could not attach document.');
    }
  };

  const handleAttachSilentScreen = async () => {
    setAttachSheetOpen(false);
    const b64 = await VortexBridge?.captureScreenBase64?.();
    const dom = (await VortexBridge?.dumpScreenDom?.()) || '[]';
    if (!b64 && dom === '[]') {
      Alert.alert('Accessibility Needed', 'More (`=`) -> System tab mein Accessibility ON karo.');
      return;
    }
    setAttachments((prev) => [
      ...prev,
      {
        id: `scr-${Date.now()}`,
        kind: 'screen',
        name: 'ScreenVisionCapture.jpg',
        mimeType: 'image/jpeg',
        base64Data: b64 || undefined,
        textContent: String(dom).slice(0, 3500),
      },
    ]);
  };

  // ==========================================================================
  // MORE DRAWER ACTIONS (STUDIO, RAG, KEYS, SYSTEM, PC SYNC)
  // ==========================================================================

  const handleGenerateFromStudio = async () => {
    if (!studioPrompt.trim()) return;
    const p = studioPrompt.trim();
    setStudioPrompt('');
    setMoreDrawerOpen(false);
    await handleSendPrompt(`/imagine ${p}`);
  };

  const handleSaveRagNote = async () => {
    if (!ragNoteContent.trim()) return;
    const title = ragNoteTitle.trim() || `${ragSubject} Study Note`;
    const chunks = await ingestNotesToRag(ragSubject, title, ragNoteContent);
    setRagNoteTitle('');
    setRagNoteContent('');
    await refreshSystemAndData();
    Alert.alert('CSE RAG Indexed', `Saved ${chunks} searchable chunks under ${ragSubject}.`);
  };

  const handleStartViva = async () => {
    setIsGenerating(true);
    try {
      const q = await generateVivaQuestion(ragSubject, (p) => callVortexLlmCore(p));
      setActiveViva(q);
      setVivaAnswerInput('');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmitVivaAnswer = async () => {
    if (!activeViva || !vivaAnswerInput.trim()) return;
    setIsGenerating(true);
    try {
      const evalRes = await evaluateVivaAnswer(activeViva, vivaAnswerInput.trim(), (p) =>
        callVortexLlmCore(p)
      );
      Alert.alert(
        `Viva Score: ${evalRes.scoreOutOf10}/10`,
        `${evalRes.feedback}\n\nIdeal Answer: ${evalRes.idealShortAnswer}`
      );
      setActiveViva(null);
      setVivaAnswerInput('');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAddKey = async () => {
    if (!newKeyInput.trim()) return;
    await addApiKeyToPool(selectedProvider, newKeyInput.trim(), newKeyLabel);
    setNewKeyInput('');
    setNewKeyLabel('');
    await refreshSystemAndData();
    if (selectedProvider === 'picovoice') {
      await vortexVoiceEngine.applyMicPrivacyMode('porcupine');
    }
    Alert.alert('Key Added', `${selectedProvider.toUpperCase()} key added to SQLite rotator pool.`);
  };

  const currentModeMeta = PROMPT_INJECTION_MODES[activeMode];

  const renderMessageItem = ({ item }: { item: ChatTurnMessage }) => {
    if (item.role === 'user') {
      return (
        <View style={VORTEX_BOX_STYLES.userBubbleBox}>
          {item.attachments && item.attachments.length > 0 && (
            <View style={styles.attTagRow}>
              {item.attachments.map((a) => (
                <View key={a.id} style={styles.attChip}>
                  <Text style={styles.attChipText}>📎 {a.name}</Text>
                </View>
              ))}
            </View>
          )}
          <Text style={VORTEX_TYPOGRAPHY.userPromptText}>{item.text}</Text>
          <View style={styles.userFooterRow}>
            <Text style={styles.timestampText}>{item.timestamp}</Text>
            <TouchableOpacity onPress={() => handleSendPrompt(item.text)}>
              <Text style={styles.rerunLink}>↻ Re-run</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.aiTurnWrapper}>
        <View style={styles.aiHeaderBadgeRow}>
          <View style={styles.vortexBadge}>
            <Text style={styles.vortexBadgeText}>ẞ VORTEX</Text>
          </View>
          {item.systemActionBadge && (
            <View style={styles.actionPillBadge}>
              <Text style={styles.actionPillText}>{item.systemActionBadge}</Text>
            </View>
          )}
          <Text style={styles.timestampText}>{item.timestamp}</Text>
        </View>

        <VortexRichMessageRenderer
          content={item.text}
          webImages={item.webImages}
          verifiedLinks={item.verifiedLinks}
          generatedImage={item.generatedImage}
          onExecutePrompt={(cmd) => handleSendPrompt(cmd)}
          onOpenGhostUrl={(url) => ghostBrowserController.showModal(url)}
          onRemixImage={(prompt) => handleSendPrompt(`/imagine ${prompt}`)}
        />

        <View style={styles.aiActionFooter}>
          <TouchableOpacity
            style={styles.miniActionBtn}
            onPress={() =>
              isSpeaking
                ? vortexVoiceEngine.stopSpeaking()
                : vortexVoiceEngine.speak(item.text, true)
            }
          >
            <Text style={styles.miniActionText}>{isSpeaking ? '⏹ STOP' : '🔊 SPEAK'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.miniActionBtn}
            onPress={() => Clipboard.setStringAsync(item.text)}
          >
            <Text style={styles.miniActionText}>📋 COPY</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.miniActionBtn}
            onPress={async () => {
              await saveMemoryNode(item.text.slice(0, 320), 'SAVED_INSIGHT', 'pinned', 4);
              await refreshSystemAndData();
              Alert.alert('Saved', 'Response pinned to SQLite RAG memory.');
            }}
          >
            <Text style={styles.miniActionText}>🧠 PIN RAG</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderHomeBentoGrid = () => (
    <ScrollView contentContainerStyle={styles.bentoContainer} showsVerticalScrollIndicator={false}>
      <Text style={VORTEX_TYPOGRAPHY.heroBrand}>VORTEX ẞ v4.0</Text>
      <Text style={styles.heroSubtitle}>
        Autonomous Android OS • CSE Super-Tutor • Human Ghost Engine
      </Text>

      {/* Bento Row 1: Telemetry & Unified 40% Orb */}
      <View style={styles.bentoRow}>
        <View style={[VORTEX_BOX_STYLES.bentoCard, { flex: 1, marginRight: 8 }]}>
          <Text style={styles.bentoLabel}>SYSTEM TELEMETRY</Text>
          <Text style={VORTEX_TYPOGRAPHY.bentoValue}>
            {telemetry.freeRamMb > 0 ? `${(telemetry.freeRamMb / 1024).toFixed(1)} GB` : 'READY'}
          </Text>
          <Text style={styles.bentoSubText}>
            Free RAM • {telemetry.batteryPct > 0 ? `${telemetry.batteryPct}% Bat` : 'Active'}
          </Text>
          <TouchableOpacity
            style={styles.bentoActionBtn}
            onPress={() => handleSendPrompt('turbo clean')}
          >
            <Text style={styles.bentoActionText}>⚡ TURBO SWEEP</Text>
          </TouchableOpacity>
        </View>

        <View style={[VORTEX_BOX_STYLES.bentoCard, { flex: 1, marginLeft: 8 }]}>
          <Text style={styles.bentoLabel}>UNIFIED ẞ ORB (40%)</Text>
          <Text style={[VORTEX_TYPOGRAPHY.bentoValue, { color: orbEnabled ? '#34D399' : '#FBBF24' }]}>
            {orbEnabled ? 'ONLINE' : 'OFF'}
          </Text>
          <Text style={styles.bentoSubText}>
            Wakeword: "{vortexVoiceEngine.getStatus().wakewordLabel}"
          </Text>
          <TouchableOpacity
            style={[styles.bentoActionBtn, { borderColor: '#34D399' }]}
            onPress={async () => {
              const ok = await VortexBridge?.canDrawOverlays?.();
              if (!ok) {
                await VortexBridge?.openOverlaySettings?.();
              } else {
                await VortexBridge?.startFloatingOrb?.();
                await VortexBridge?.setOrbOpacity?.(0.4);
                await refreshSystemAndData();
              }
            }}
          >
            <Text style={[styles.bentoActionText, { color: '#34D399' }]}>
              {orbEnabled ? '● ORB 40% ACTIVE' : 'ENABLE ORB'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Bento Row 2: Quick Autonomous Triggers */}
      <View style={[VORTEX_BOX_STYLES.bentoCard, { marginTop: 12 }]}>
        <Text style={styles.bentoLabel}>INSTANT AUTONOMOUS ACTIONS</Text>
        <View style={styles.quickGrid}>
          <TouchableOpacity
            style={styles.quickChip}
            onPress={() => {
              setActiveMode('CSE_SUPER_TUTOR');
              setInputText('Explain Binary Search Tree with diagram and comment-free C++ code');
            }}
          >
            <Text style={styles.quickChipText}>📐 Diagram + C++ Tutor</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickChip}
            onPress={() => {
              setDrawerTab('STUDIO');
              setMoreDrawerOpen(true);
            }}
          >
            <Text style={styles.quickChipText}>🎨 AI Image Studio</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickChip}
            onPress={() => ghostBrowserController.showModal('https://duckduckgo.com')}
          >
            <Text style={styles.quickChipText}>👻 Ghost Web Browser</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickChip}
            onPress={() => {
              setDrawerTab('MEMORY_RAG');
              setMoreDrawerOpen(true);
            }}
          >
            <Text style={styles.quickChipText}>🎙️ CSE Audio Viva</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      <VortexGhostBrowserHost />

      {/* TOP BAR (Exact Screenshot Layout: Left = Drawer, Center Mode Pill, Right Actions) */}
      <View style={styles.topHeader}>
        <TouchableOpacity
          style={styles.hamburgerBtn}
          onPress={() => {
            refreshSystemAndData();
            setMoreDrawerOpen(true);
          }}
        >
          <View style={styles.hamLineTop} />
          <View style={styles.hamLineBottom} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.modeSelectorPill,
            {
              backgroundColor: currentModeMeta.bgTint,
              borderColor: currentModeMeta.borderTint,
            },
          ]}
          onPress={() => setModePickerOpen(true)}
        >
          <Text style={[styles.modePillText, { color: currentModeMeta.accent }]}>
            {currentModeMeta.label} ⌄
          </Text>
        </TouchableOpacity>

        <View style={styles.topRightRow}>
          <TouchableOpacity
            style={styles.topIconBtn}
            onPress={async () => {
              const res = await runSilentScreenVision(undefined, false);
              appendAssistantTurn(res);
            }}
          >
            <Text style={styles.topIconText}>👁</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.topIconBtn}
            onPress={() => {
              setMessages([]);
              setAttachments([]);
            }}
          >
            <Text style={styles.topIconText}>✎</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* MAIN CHAT OR BENTO CANVAS */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {messages.length === 0 ? (
          renderHomeBentoGrid()
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessageItem}
            contentContainerStyle={styles.chatListContent}
            showsVerticalScrollIndicator={false}
          />
        )}

        {isGenerating && (
          <View style={styles.thinkingBar}>
            <ActivityIndicator size="small" color={VORTEX_COLORS.aiHeadingCyan} />
            <Text style={styles.thinkingText}>
              VORTEX ẞ processing ({currentModeMeta.shortTag})...
            </Text>
          </View>
        )}

        {/* PENDING ATTACHMENTS STRIP */}
        {attachments.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.pendingAttBar}
            contentContainerStyle={{ paddingHorizontal: 14, gap: 8 }}
          >
            {attachments.map((att) => (
              <View key={att.id} style={styles.pendingAttPill}>
                <Text style={styles.pendingAttName}>📎 {att.name}</Text>
                <TouchableOpacity
                  onPress={() => setAttachments((prev) => prev.filter((x) => x.id !== att.id))}
                >
                  <Text style={styles.pendingAttRemove}> ✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}

        {/* BOTTOM GEMINI-STYLE PILL COMMAND DOCK (+ Attach, Input, Mic, Waveform/Send) */}
        <View style={styles.dockOuter}>
          <View style={[VORTEX_BOX_STYLES.commandDockCapsule, styles.dockInnerRow]}>
            <TouchableOpacity
              style={styles.plusBtn}
              onPress={() => setAttachSheetOpen(true)}
            >
              <Text style={styles.plusBtnText}>+</Text>
            </TouchableOpacity>

            <TextInput
              value={inputText}
              onChangeText={setInputText}
              placeholder="Ask VORTEX ẞ..."
              placeholderTextColor="#64748B"
              multiline
              style={styles.dockInput}
            />

            <TouchableOpacity
              style={styles.micIconBtn}
              onPress={() => vortexVoiceEngine.triggerManualZeroBeepMic()}
            >
              <Text style={styles.micIconText}>🎙</Text>
            </TouchableOpacity>

            {inputText.trim().length > 0 || attachments.length > 0 ? (
              <TouchableOpacity
                style={styles.sendCircleBtn}
                onPress={() => handleSendPrompt()}
                disabled={isGenerating}
              >
                <Text style={styles.sendArrowText}>↑</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[
                  styles.waveformCircleBtn,
                  isSpeaking && { backgroundColor: '#EF4444' },
                ]}
                onPress={() => {
                  if (isSpeaking) {
                    vortexVoiceEngine.stopSpeaking();
                  } else {
                    vortexVoiceEngine.triggerManualZeroBeepMic();
                  }
                }}
              >
                <Text style={styles.waveformText}>{isSpeaking ? '■' : '|ı|'}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* PROMPT INJECTION MODE PICKER MODAL */}
      <Modal
        visible={modePickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setModePickerOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModePickerOpen(false)}
        >
          <View style={styles.modeModalCard}>
            <Text style={[VORTEX_TYPOGRAPHY.subHeading, { color: '#38BDF8', marginBottom: 10 }]}>
              SELECT PROMPT INJECTION PROFILE
            </Text>
            {(Object.keys(PROMPT_INJECTION_MODES) as PromptInjectionModeId[]).map((mKey) => {
              const m = PROMPT_INJECTION_MODES[mKey];
              const selected = activeMode === mKey;
              return (
                <TouchableOpacity
                  key={mKey}
                  style={[
                    styles.modeOptionItem,
                    selected && { borderColor: m.accent, backgroundColor: m.bgTint },
                  ]}
                  onPress={() => {
                    setActiveMode(mKey);
                    setModePickerOpen(false);
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={[styles.modeOptionTitle, { color: m.accent }]}>{m.label}</Text>
                    <Text style={[styles.modeOptionTag, { color: m.accent }]}>{m.shortTag}</Text>
                  </View>
                  <Text style={styles.modeOptionDesc}>{m.description}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* + REAL ATTACHMENT SHEET MODAL */}
      <Modal
        visible={attachSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setAttachSheetOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setAttachSheetOpen(false)}
        >
          <View style={styles.attachSheetCard}>
            <Text style={[VORTEX_TYPOGRAPHY.subHeading, { color: '#F8FAFC', marginBottom: 12 }]}>
              ATTACH REAL CONTEXT TO VORTEX ẞ
            </Text>

            <TouchableOpacity style={styles.attachRowBtn} onPress={handlePickGalleryImage}>
              <Text style={styles.attachRowTitle}>🖼️ Gallery Image / Notes Photo</Text>
              <Text style={styles.attachRowSub}>Vision analysis, math solver, diagram extraction</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.attachRowBtn} onPress={handleCaptureCameraPhoto}>
              <Text style={styles.attachRowTitle}>📷 Camera Live Snap</Text>
              <Text style={styles.attachRowSub}>Capture textbook page, circuit, or problem directly</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.attachRowBtn} onPress={handlePickDocumentFile}>
              <Text style={styles.attachRowTitle}>📄 Code / Text / Notes File</Text>
              <Text style={styles.attachRowSub}>Attach .c, .cpp, .py, .txt, .md, or syllabus docs</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.attachRowBtn} onPress={handleAttachSilentScreen}>
              <Text style={styles.attachRowTitle}>👁 Silent Active Screen Capture</Text>
              <Text style={styles.attachRowSub}>Grabs screenshot + UI DOM tree without popup</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* TOP-LEFT (=) MORE FEATURE HUB DRAWER */}
      <Modal
        visible={moreDrawerOpen}
        animationType="slide"
        onRequestClose={() => setMoreDrawerOpen(false)}
      >
        <SafeAreaView style={styles.drawerRoot}>
          <View style={styles.drawerTopBar}>
            <Text style={VORTEX_TYPOGRAPHY.heroBrand}>VORTEX ẞ HUB</Text>
            <TouchableOpacity
              style={styles.drawerCloseBtn}
              onPress={() => setMoreDrawerOpen(false)}
            >
              <Text style={styles.drawerCloseText}>✕ CLOSE</Text>
            </TouchableOpacity>
          </View>

          {/* Drawer Navigation Tabs */}
          <View style={styles.drawerTabBar}>
            {(
              [
                { id: 'STUDIO', label: 'AI STUDIO' },
                { id: 'MEMORY_RAG', label: 'MEMORY & RAG' },
                { id: 'KEYS_VOICE', label: 'KEYS & VOICE' },
                { id: 'SYSTEM_PC', label: 'OS & PC SYNC' },
              ] as Array<{ id: DrawerTab; label: string }>
            ).map((t) => (
              <TouchableOpacity
                key={t.id}
                style={[styles.drawerTabBtn, drawerTab === t.id && styles.drawerTabBtnActive]}
                onPress={() => setDrawerTab(t.id)}
              >
                <Text
                  style={[
                    styles.drawerTabText,
                    drawerTab === t.id && { color: VORTEX_COLORS.aiHeadingCyan },
                  ]}
                >
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView contentContainerStyle={styles.drawerScrollBody}>
            {/* TAB 1: AI STUDIO (POLLINATIONS.AI) & COMPLETE FEATURE MATRIX */}
            {drawerTab === 'STUDIO' && (
              <View>
                <View style={VORTEX_BOX_STYLES.bentoCard}>
                  <Text style={VORTEX_TYPOGRAPHY.subHeading}>
                    🎨 AI Image Studio (Pollinations.ai Free HD)
                  </Text>
                  <TextInput
                    value={studioPrompt}
                    onChangeText={setStudioPrompt}
                    placeholder="Describe image (e.g. Cyberpunk futuristic AI core 8k)..."
                    placeholderTextColor="#64748B"
                    multiline
                    style={styles.drawerTextArea}
                  />
                  <View style={styles.pillRow}>
                    {(['flux', 'zimage', 'klein'] as const).map((m) => (
                      <TouchableOpacity
                        key={m}
                        style={[
                          styles.selectPill,
                          studioModel === m && styles.selectPillActive,
                        ]}
                        onPress={() => setStudioModel(m)}
                      >
                        <Text style={styles.selectPillText}>{m.toUpperCase()}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TouchableOpacity
                    style={styles.primaryActionBtn}
                    onPress={handleGenerateFromStudio}
                  >
                    <Text style={styles.primaryActionText}>GENERATE HD IMAGE</Text>
                  </TouchableOpacity>
                </View>

                <Text style={[VORTEX_TYPOGRAPHY.sectionTitle, { marginTop: 18 }]}>
                  ACTIVE VORTEX ẞ CAPABILITIES
                </Text>
                {VORTEX_COMPLETE_FEATURES.map((feat) => (
                  <View key={feat.id} style={[VORTEX_BOX_STYLES.bentoCard, { marginBottom: 10 }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={VORTEX_TYPOGRAPHY.bentoTitle}>{feat.title}</Text>
                      <Text
                        style={{
                          color: feat.status === 'ACTIVE' ? '#34D399' : '#FBBF24',
                          fontWeight: '800',
                          fontSize: 12,
                        }}
                      >
                        {feat.status}
                      </Text>
                    </View>
                    <Text style={styles.bentoSubText}>{feat.summary}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* TAB 2: LONG-TERM RAG MEMORY & CSE STUDY VAULT */}
            {drawerTab === 'MEMORY_RAG' && (
              <View>
                <View style={VORTEX_BOX_STYLES.bentoCard}>
                  <Text style={VORTEX_TYPOGRAPHY.subHeading}>
                    📚 CSE Syllabus & Notes RAG ({vaultStats.totalChunks} Chunks)
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 8 }}>
                    {CSE_SUBJECTS.map((subj) => (
                      <TouchableOpacity
                        key={subj}
                        style={[
                          styles.selectPill,
                          { marginRight: 8 },
                          ragSubject === subj && styles.selectPillActive,
                        ]}
                        onPress={() => setRagSubject(subj)}
                      >
                        <Text style={styles.selectPillText}>{subj}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <TextInput
                    value={ragNoteTitle}
                    onChangeText={setRagNoteTitle}
                    placeholder="Chapter / Topic Title (e.g. Unit 5 Trees & BST)"
                    placeholderTextColor="#64748B"
                    style={styles.drawerInput}
                  />
                  <TextInput
                    value={ragNoteContent}
                    onChangeText={setRagNoteContent}
                    placeholder="Paste syllabus notes, formulas, or exam definitions here..."
                    placeholderTextColor="#64748B"
                    multiline
                    style={styles.drawerTextArea}
                  />
                  <TouchableOpacity style={styles.primaryActionBtn} onPress={handleSaveRagNote}>
                    <Text style={styles.primaryActionText}>INDEX INTO SQLITE RAG</Text>
                  </TouchableOpacity>

                  <View style={[styles.pillRow, { marginTop: 12 }]}>
                    <TouchableOpacity
                      style={[styles.secondaryBtn, { flex: 1, marginRight: 6 }]}
                      onPress={handleStartViva}
                    >
                      <Text style={styles.secondaryBtnText}>🎙️ AUDIO VIVA DRILL</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.secondaryBtn, { flex: 1, marginLeft: 6 }]}
                      onPress={() => {
                        startCommuteAudioRevision(ragSubject, ragNoteTitle || ragSubject, (p) =>
                          callVortexLlmCore(p)
                        );
                        Alert.alert('Commute Capsule', `Playing spoken ${ragSubject} revision.`);
                      }}
                    >
                      <Text style={styles.secondaryBtnText}>🎧 COMMUTE AUDIO</Text>
                    </TouchableOpacity>
                  </View>

                  {activeViva && (
                    <View style={styles.vivaBox}>
                      <Text style={{ color: '#FBBF24', fontWeight: '800', fontSize: 13 }}>
                        VIVA QUESTION ({activeViva.subject}):
                      </Text>
                      <Text style={{ color: '#F8FAFC', fontSize: 16, marginVertical: 6 }}>
                        {activeViva.question}
                      </Text>
                      <TextInput
                        value={vivaAnswerInput}
                        onChangeText={setVivaAnswerInput}
                        placeholder="Type or speak your answer..."
                        placeholderTextColor="#64748B"
                        style={styles.drawerInput}
                      />
                      <TouchableOpacity
                        style={styles.primaryActionBtn}
                        onPress={handleSubmitVivaAnswer}
                      >
                        <Text style={styles.primaryActionText}>SUBMIT & GRADE ANSWER</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                <View style={[VORTEX_BOX_STYLES.bentoCard, { marginTop: 14 }]}>
                  <Text style={VORTEX_TYPOGRAPHY.subHeading}>
                    🧠 Permanent RAG Memory Graph ({memories.length})
                  </Text>
                  <TextInput
                    value={newMemoryText}
                    onChangeText={setNewMemoryText}
                    placeholder="Add permanent fact or preference..."
                    placeholderTextColor="#64748B"
                    style={styles.drawerInput}
                  />
                  <TouchableOpacity
                    style={styles.primaryActionBtn}
                    onPress={async () => {
                      if (!newMemoryText.trim()) return;
                      await saveMemoryNode(newMemoryText.trim(), 'USER_PINNED', 'drawer', 5);
                      setNewMemoryText('');
                      await refreshSystemAndData();
                    }}
                  >
                    <Text style={styles.primaryActionText}>SAVE TO PERMANENT MEMORY</Text>
                  </TouchableOpacity>

                  {memories.map((m) => (
                    <View key={m.id} style={styles.memoryRow}>
                      <Text style={{ color: '#E2E8F0', flex: 1, fontSize: 14.5 }}>{m.content}</Text>
                      <TouchableOpacity
                        onPress={async () => {
                          await deleteMemoryNode(m.id);
                          await refreshSystemAndData();
                        }}
                      >
                        <Text style={{ color: '#FB7185', fontWeight: '800', marginLeft: 10 }}>
                          DEL
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* TAB 3: MULTI-KEY POOL & ZERO-BEEP "HEY VORTEX" / ELEVENLABS VOICE */}
            {drawerTab === 'KEYS_VOICE' && (
              <View>
                <View style={VORTEX_BOX_STYLES.bentoCard}>
                  <Text style={VORTEX_TYPOGRAPHY.subHeading}>
                    🎙️ Mic Privacy & Wakeword ("Hey Vortex")
                  </Text>
                  <View style={styles.pillRow}>
                    {(
                      [
                        { id: 'porcupine', label: 'PORCUPINE (HEY VORTEX)' },
                        { id: 'native_silent', label: 'SILENT DUCKING' },
                        { id: 'stealth', label: 'STEALTH (NO ICON)' },
                      ] as Array<{ id: VortexMicPrivacyMode; label: string }>
                    ).map((m) => (
                      <TouchableOpacity
                        key={m.id}
                        style={[
                          styles.selectPill,
                          micMode === m.id && styles.selectPillActive,
                        ]}
                        onPress={async () => {
                          const st = await vortexVoiceEngine.applyMicPrivacyMode(m.id);
                          setMicMode(st.micMode);
                        }}
                      >
                        <Text style={styles.selectPillText}>{m.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={styles.switchRow}>
                    <Text style={styles.switchLabel}>ElevenLabs Neural Voice Replies</Text>
                    <Switch
                      value={voiceTtsEnabled}
                      onValueChange={async (val) => {
                        setVoiceTtsEnabled(val);
                        await vortexVoiceEngine.setVoiceOutputEnabled(val);
                      }}
                    />
                  </View>

                  <TextInput
                    value={voiceIdInput}
                    onChangeText={setVoiceIdInput}
                    placeholder="ElevenLabs Voice ID"
                    placeholderTextColor="#64748B"
                    style={styles.drawerInput}
                  />
                  <TouchableOpacity
                    style={styles.secondaryBtn}
                    onPress={async () => {
                      await vortexVoiceEngine.setElevenLabsVoiceId(voiceIdInput);
                      Alert.alert('Voice Updated', 'ElevenLabs Voice ID saved.');
                    }}
                  >
                    <Text style={styles.secondaryBtnText}>SAVE VOICE ID</Text>
                  </TouchableOpacity>
                </View>

                <View style={[VORTEX_BOX_STYLES.bentoCard, { marginTop: 14 }]}>
                  <Text style={VORTEX_TYPOGRAPHY.subHeading}>
                    🔑 Multi-Key Pool & Auto-Rotator ({apiKeys.length})
                  </Text>
                  <View style={styles.pillRow}>
                    {(['gemini', 'elevenlabs', 'picovoice', 'pollinations'] as ApiProviderName[]).map(
                      (prov) => (
                        <TouchableOpacity
                          key={prov}
                          style={[
                            styles.selectPill,
                            selectedProvider === prov && styles.selectPillActive,
                          ]}
                          onPress={() => setSelectedProvider(prov)}
                        >
                          <Text style={styles.selectPillText}>{prov.toUpperCase()}</Text>
                        </TouchableOpacity>
                      )
                    )}
                  </View>
                  <TextInput
                    value={newKeyLabel}
                    onChangeText={setNewKeyLabel}
                    placeholder="Optional Label (e.g. Primary Key 1)"
                    placeholderTextColor="#64748B"
                    style={styles.drawerInput}
                  />
                  <TextInput
                    value={newKeyInput}
                    onChangeText={setNewKeyInput}
                    placeholder={`Paste ${selectedProvider.toUpperCase()} API Key...`}
                    placeholderTextColor="#64748B"
                    secureTextEntry
                    style={styles.drawerInput}
                  />
                  <TouchableOpacity style={styles.primaryActionBtn} onPress={handleAddKey}>
                    <Text style={styles.primaryActionText}>ADD KEY TO ROTATOR POOL</Text>
                  </TouchableOpacity>

                  {apiKeys.map((k) => (
                    <View key={k.id} style={styles.memoryRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: '#38BDF8', fontWeight: '800', fontSize: 13 }}>
                          {k.provider.toUpperCase()} • {k.label} ({k.status})
                        </Text>
                        <Text style={{ color: '#94A3B8', fontSize: 12 }}>
                          ••••{k.apiKey.slice(-6)} • Used {k.usageCount}x
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={async () => {
                          await removeApiKeyById(k.id);
                          await refreshSystemAndData();
                        }}
                      >
                        <Text style={{ color: '#FB7185', fontWeight: '800' }}>REMOVE</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* TAB 4: OS AUTOPILOT, APP-LOCK VAULT, HABITS & STANDBY PC SYNC */}
            {drawerTab === 'SYSTEM_PC' && (
              <View>
                <View style={VORTEX_BOX_STYLES.bentoCard}>
                  <Text style={VORTEX_TYPOGRAPHY.subHeading}>⚙️ Android Native Permissions</Text>
                  <TouchableOpacity
                    style={styles.permRow}
                    onPress={() => VortexBridge?.openOverlaySettings?.()}
                  >
                    <Text style={styles.switchLabel}>Floating ẞ Orb Overlay (40% Dim)</Text>
                    <Text style={{ color: orbEnabled ? '#34D399' : '#FBBF24', fontWeight: '800' }}>
                      {orbEnabled ? 'GRANTED' : 'ENABLE →'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.permRow}
                    onPress={() => VortexBridge?.openAccessibilitySettings?.()}
                  >
                    <Text style={styles.switchLabel}>Autonomous Accessibility & Ghost Touch</Text>
                    <Text style={{ color: accEnabled ? '#34D399' : '#FBBF24', fontWeight: '800' }}>
                      {accEnabled ? 'CONNECTED' : 'ENABLE →'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.permRow}
                    onPress={() => VortexBridge?.openNotificationListenerSettings?.()}
                  >
                    <Text style={styles.switchLabel}>WhatsApp / Notification Direct Reply</Text>
                    <Text
                      style={{ color: notifEnabled ? '#34D399' : '#FBBF24', fontWeight: '800' }}
                    >
                      {notifEnabled ? 'ACTIVE' : 'ENABLE →'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={[VORTEX_BOX_STYLES.bentoCard, { marginTop: 14 }]}>
                  <Text style={VORTEX_TYPOGRAPHY.subHeading}>
                    💻 PC Sync Bridge ({pcStatus.modeLabel})
                  </Text>
                  <Text style={styles.bentoSubText}>
                    Queued local deltas: {pcStatus.queuedCount} items (Zero network ping while OFF)
                  </Text>
                  <View style={styles.switchRow}>
                    <Text style={styles.switchLabel}>Enable Wi-Fi Sync (vortex.local)</Text>
                    <Switch
                      value={pcStatus.enabled}
                      onValueChange={async (val) => {
                        const updated = await vortexPcBridge.setEnabled(val);
                        setPcStatus(updated);
                      }}
                    />
                  </View>
                  <TextInput
                    value={pcHostInput}
                    onChangeText={setPcHostInput}
                    placeholder="http://vortex.local:8000"
                    placeholderTextColor="#64748B"
                    style={styles.drawerInput}
                  />
                  <TouchableOpacity
                    style={styles.secondaryBtn}
                    onPress={async () => {
                      await vortexPcBridge.setHostUrl(pcHostInput);
                      const st = await vortexPcBridge.getStatus();
                      setPcStatus(st);
                      Alert.alert('PC Bridge', `Host saved: ${st.hostUrl}`);
                    }}
                  >
                    <Text style={styles.secondaryBtnText}>SAVE PC HOST & TEST</Text>
                  </TouchableOpacity>
                </View>

                <View style={[VORTEX_BOX_STYLES.bentoCard, { marginTop: 14 }]}>
                  <Text style={VORTEX_TYPOGRAPHY.subHeading}>🔐 App-Lock Vault PIN Rule</Text>
                  <TextInput
                    value={lockPkgInput}
                    onChangeText={setLockPkgInput}
                    placeholder="Package name (e.g. com.whatsapp)"
                    placeholderTextColor="#64748B"
                    style={styles.drawerInput}
                  />
                  <TextInput
                    value={lockPinInput}
                    onChangeText={setLockPinInput}
                    placeholder="Comma-separated PIN digits (e.g. 1,2,3,4)"
                    placeholderTextColor="#64748B"
                    style={styles.drawerInput}
                  />
                  <TouchableOpacity
                    style={styles.secondaryBtn}
                    onPress={async () => {
                      if (!lockPkgInput.trim() || !lockPinInput.trim()) return;
                      await saveAppLockRule(lockPkgInput.trim(), 'PIN', lockPinInput.trim());
                      setLockPkgInput('');
                      setLockPinInput('');
                      Alert.alert('Saved', 'App-Lock auto-unlock rule saved.');
                    }}
                  >
                    <Text style={styles.secondaryBtnText}>SAVE UNLOCK RULE</Text>
                  </TouchableOpacity>
                </View>

                <View style={[VORTEX_BOX_STYLES.bentoCard, { marginTop: 14 }]}>
                  <Text style={VORTEX_TYPOGRAPHY.subHeading}>🔥 Daily Habit Streaks</Text>
                  {habits.map((h) => (
                    <View key={h.id} style={styles.memoryRow}>
                      <Text style={{ color: '#F8FAFC', flex: 1, fontSize: 15 }}>
                        {h.title} ({h.streak}d)
                      </Text>
                      <TouchableOpacity
                        style={styles.bentoActionBtn}
                        onPress={async () => {
                          await completeHabitToday(h.id);
                          await refreshSystemAndData();
                        }}
                      >
                        <Text style={styles.bentoActionText}>✓ DONE</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: VORTEX_COLORS.canvas,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: VORTEX_COLORS.canvas,
    borderBottomWidth: 1,
    borderBottomColor: '#111827',
  },
  hamburgerBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  hamLineTop: {
    width: 24,
    height: 2.5,
    backgroundColor: '#E2E8F0',
    borderRadius: 2,
    marginBottom: 6,
  },
  hamLineBottom: {
    width: 18,
    height: 2.5,
    backgroundColor: '#94A3B8',
    borderRadius: 2,
  },
  modeSelectorPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1.2,
  },
  modePillText: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  topRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  topIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  topIconText: {
    color: '#E2E8F0',
    fontSize: 16,
  },
  bentoContainer: {
    padding: 18,
    paddingBottom: 32,
  },
  heroSubtitle: {
    color: '#94A3B8',
    fontSize: 15,
    marginTop: 4,
    marginBottom: 18,
  },
  bentoRow: {
    flexDirection: 'row',
  },
  bentoLabel: {
    color: '#94A3B8',
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.7,
    marginBottom: 6,
  },
  bentoSubText: {
    color: '#CBD5E1',
    fontSize: 13.5,
    marginTop: 4,
  },
  bentoActionBtn: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: '#0B1324',
    borderWidth: 1,
    borderColor: '#38BDF8',
    alignItems: 'center',
  },
  bentoActionText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '800',
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  quickChip: {
    backgroundColor: '#131C2E',
    borderColor: '#263449',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  quickChipText: {
    color: '#F1F5F9',
    fontSize: 14,
    fontWeight: '600',
  },
  chatListContent: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 24,
  },
  attTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  attChip: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  attChipText: {
    color: '#93C5FD',
    fontSize: 12,
    fontWeight: '700',
  },
  userFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  timestampText: {
    color: '#64748B',
    fontSize: 11.5,
  },
  rerunLink: {
    color: '#60A5FA',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 12,
  },
  aiTurnWrapper: {
    marginVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#0F172A',
    paddingBottom: 12,
  },
  aiHeaderBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  vortexBadge: {
    backgroundColor: '#091E2C',
    borderColor: '#0284C7',
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 8,
  },
  vortexBadgeText: {
    color: '#38BDF8',
    fontSize: 11.5,
    fontWeight: '800',
  },
  actionPillBadge: {
    backgroundColor: '#06261C',
    borderColor: '#059669',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  actionPillText: {
    color: '#34D399',
    fontSize: 11,
    fontWeight: '800',
  },
  aiActionFooter: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  miniActionBtn: {
    backgroundColor: '#0B111E',
    borderColor: '#1E293B',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  miniActionText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
  },
  thinkingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 8,
    gap: 10,
  },
  thinkingText: {
    color: '#38BDF8',
    fontSize: 14,
    fontWeight: '600',
  },
  pendingAttBar: {
    maxHeight: 42,
    marginBottom: 6,
  },
  pendingAttPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#172033',
    borderColor: '#3B82F6',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pendingAttName: {
    color: '#E2E8F0',
    fontSize: 12.5,
    fontWeight: '600',
  },
  pendingAttRemove: {
    color: '#FB7185',
    fontWeight: '800',
    fontSize: 14,
  },
  dockOuter: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 4,
    backgroundColor: VORTEX_COLORS.canvas,
  },
  dockInnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  plusBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  plusBtnText: {
    color: '#E2E8F0',
    fontSize: 28,
    fontWeight: '400',
    lineHeight: 30,
  },
  dockInput: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 17,
    fontFamily: VORTEX_FONTS.sansBody,
    maxHeight: 110,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  micIconBtn: {
    width: 38,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
  },
  micIconText: {
    fontSize: 19,
  },
  sendCircleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  sendArrowText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  waveformCircleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1D4ED8',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  waveformText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    justifyContent: 'flex-end',
    padding: 14,
  },
  modeModalCard: {
    backgroundColor: '#0A0F1C',
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: '#1E293B',
    padding: 18,
    marginBottom: 14,
  },
  modeOptionItem: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.2,
    borderColor: '#1E293B',
    backgroundColor: '#0E1422',
    marginBottom: 10,
  },
  modeOptionTitle: {
    fontSize: 16.5,
    fontWeight: '800',
  },
  modeOptionTag: {
    fontSize: 12,
    fontWeight: '800',
  },
  modeOptionDesc: {
    color: '#CBD5E1',
    fontSize: 13.5,
    marginTop: 4,
  },
  attachSheetCard: {
    backgroundColor: '#0B101D',
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: '#263449',
    padding: 18,
    marginBottom: 10,
  },
  attachRowBtn: {
    backgroundColor: '#111827',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 14,
    marginBottom: 10,
  },
  attachRowTitle: {
    color: '#F8FAFC',
    fontSize: 16.5,
    fontWeight: '700',
  },
  attachRowSub: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 3,
  },
  drawerRoot: {
    flex: 1,
    backgroundColor: '#000000',
  },
  drawerTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  drawerCloseBtn: {
    backgroundColor: '#111827',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  drawerCloseText: {
    color: '#F8FAFC',
    fontWeight: '800',
    fontSize: 12.5,
  },
  drawerTabBar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#111827',
  },
  drawerTabBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: '#0B101B',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  drawerTabBtnActive: {
    borderColor: '#38BDF8',
    backgroundColor: '#0A1929',
  },
  drawerTabText: {
    color: '#94A3B8',
    fontSize: 11.5,
    fontWeight: '800',
  },
  drawerScrollBody: {
    padding: 16,
    paddingBottom: 40,
  },
  drawerInput: {
    backgroundColor: '#090D16',
    borderColor: '#263449',
    borderWidth: 1.2,
    borderRadius: 14,
    color: '#F8FAFC',
    fontSize: 15.5,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginTop: 10,
  },
  drawerTextArea: {
    backgroundColor: '#090D16',
    borderColor: '#263449',
    borderWidth: 1.2,
    borderRadius: 14,
    color: '#F8FAFC',
    fontSize: 15.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 88,
    marginTop: 10,
    textAlignVertical: 'top',
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  selectPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#0B111E',
    borderWidth: 1,
    borderColor: '#263449',
  },
  selectPillActive: {
    borderColor: '#38BDF8',
    backgroundColor: '#0A1929',
  },
  selectPillText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '800',
  },
  primaryActionBtn: {
    marginTop: 12,
    backgroundColor: '#2563EB',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  secondaryBtn: {
    marginTop: 10,
    backgroundColor: '#0F172A',
    borderColor: '#38BDF8',
    borderWidth: 1.2,
    borderRadius: 14,
    paddingVertical: 11,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '800',
  },
  vivaBox: {
    marginTop: 14,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#191306',
    borderWidth: 1.2,
    borderColor: '#D97706',
  },
  memoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  switchLabel: {
    color: '#F1F5F9',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
});
