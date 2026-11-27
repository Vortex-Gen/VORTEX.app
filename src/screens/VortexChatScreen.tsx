import * as Clipboard from 'expo-clipboard';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { VortexNavigationShell } from '../components/VortexNavigationShell';
import { VortexPlusActionSheet } from '../components/VortexPlusActionSheet';
import { VortexRichBlocks } from '../components/VortexRichBlocks';
import { ingestRagMemory } from '../db/vortexSqliteRag';
import { vortexGhostAgent } from '../engines/vortexGhostAgent';
import { LlmTurnMessage, vortexLlmRouter } from '../engines/vortexLlmRouter';
import { vortexMacroScheduler } from '../engines/vortexMacroScheduler';
import { vortexVoiceWakeword } from '../engines/vortexVoiceWakeword';
import { vortexWebAndPcBridge } from '../engines/vortexWebAndPcBridge';
import {
  useVortexStore,
  VortexAttachment,
  VortexMessage,
} from '../store/useVortexStore';
import {
  getScaledFontSize,
  VORTEX_ACCENTS,
  VORTEX_FONTS,
  VORTEX_LAYOUT,
  VORTEX_PALETTE,
} from '../theme/vortexTheme';

const QUICK_STARTERS = [
  {
    title: 'Turbo RAM & Device Stats',
    sub: 'Clean memory & inspect hardware',
    prompt: 'Turbo sweep and show battery and RAM status',
  },
  {
    title: 'BST Insertion in C++',
    sub: 'Clean code + SVG tree diagram',
    prompt:
      'Write a clean C++ program for Binary Search Tree insertion and inorder traversal with an architecture diagram',
  },
  {
    title: 'Autonomous App Loop',
    sub: 'Closed-loop screen navigation',
    prompt: 'Open YouTube and search lofi coding beats',
  },
  {
    title: 'Cyberpunk PCB Render',
    sub: 'Pollinations HD visual studio',
    prompt: 'Generate image of futuristic neon cyberpunk circuit board processor in dark obsidian glass',
  },
];

export const VortexChatScreen: React.FC = () => {
  const sessions = useVortexStore((s) => s.sessions);
  const activeSessionId = useVortexStore((s) => s.activeSessionId);
  const activePromptMode = useVortexStore((s) => s.activePromptMode);
  const setPromptMode = useVortexStore((s) => s.setPromptMode);
  const pendingAttachments = useVortexStore((s) => s.pendingAttachments);
  const removePendingAttachment = useVortexStore((s) => s.removePendingAttachment);
  const clearPendingAttachments = useVortexStore((s) => s.clearPendingAttachments);
  const isGenerating = useVortexStore((s) => s.isGenerating);
  const setIsGenerating = useVortexStore((s) => s.setIsGenerating);
  const appendMessage = useVortexStore((s) => s.appendMessage);
  const updateMessageContent = useVortexStore((s) => s.updateMessageContent);
  const branchFromMessage = useVortexStore((s) => s.branchFromMessage);
  const setPlusSheetOpen = useVortexStore((s) => s.setPlusSheetOpen);
  const setActiveScreen = useVortexStore((s) => s.setActiveScreen);

  const notebooks = useVortexStore((s) => s.notebooks);
  const activeNotebookId = useVortexStore((s) => s.activeNotebookId);
  const setActiveNotebook = useVortexStore((s) => s.setActiveNotebook);

  const accentKey = useVortexStore((s) => s.orbAccentKey);
  const fontPreset = useVortexStore((s) => s.fontPreset);
  const fontScale = useVortexStore((s) => s.fontScale);

  const accent = VORTEX_ACCENTS[accentKey] || VORTEX_ACCENTS.sky;
  const fonts = VORTEX_FONTS[fontPreset] || VORTEX_FONTS.aero;

  const [inputText, setInputText] = useState('');
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);

  const flatListRef = useRef<FlatList<VortexMessage>>(null);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) || sessions[0],
    [sessions, activeSessionId]
  );

  const activeNotebook = useMemo(
    () => notebooks.find((n) => n.id === activeNotebookId) || null,
    [notebooks, activeNotebookId]
  );

  const messages = activeSession?.messages || [];

  useEffect(() => {
    if (messages.length > 0) {
      const timer = setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 120);
      return () => clearTimeout(timer);
    }
  }, [messages.length]);

  const handleSpeakMessage = async (msg: VortexMessage) => {
    if (speakingMsgId === msg.id) {
      setSpeakingMsgId(null);
      await vortexVoiceWakeword.shutdown();
      return;
    }
    setSpeakingMsgId(msg.id);
    try {
      await vortexVoiceWakeword.speakResponse(msg.content);
    } finally {
      setSpeakingMsgId(null);
    }
  };

  const handleCopyMessage = async (msg: VortexMessage) => {
    await Clipboard.setStringAsync(msg.content);
    setCopiedMsgId(msg.id);
    setTimeout(() => setCopiedMsgId(null), 1600);
  };

  const handleSendPrompt = useCallback(
    async (overridePrompt?: string) => {
      const textToSend = (overridePrompt !== undefined ? overridePrompt : inputText).trim();
      const currentAttachments = [...pendingAttachments];

      if ((!textToSend && currentAttachments.length === 0) || isGenerating || !activeSession) {
        return;
      }

      const sessionId = activeSession.id;
      const effectivePrompt =
        textToSend || 'Analyze the attached context and provide a complete technical answer.';

      if (overridePrompt === undefined) {
        setInputText('');
      }
      clearPendingAttachments();
      setIsGenerating(true);

      const userMsg: VortexMessage = {
        id: `usr_${Date.now()}`,
        role: 'user',
        content: effectivePrompt,
        timestamp: Date.now(),
        mode: activePromptMode,
        attachments: currentAttachments.length > 0 ? currentAttachments : undefined,
      };
      appendMessage(sessionId, userMsg);

      const assistantMsgId = `ast_${Date.now() + 1}`;
      appendMessage(sessionId, {
        id: assistantMsgId,
        role: 'assistant',
        content: 'Analyzing intent & context...',
        timestamp: Date.now(),
        mode: activePromptMode,
        providerTag: 'VORTEX Core',
      });

      const startedAt = Date.now();

      try {
        const isScheduleIntent =
          /\b(alarm|schedule|routine|har roz|mon-fri|every day|daily)\b/i.test(effectivePrompt) &&
          /\b\d{1,2}(?::\d{2})?\s*(?:am|pm|baje)?\b/i.test(effectivePrompt);

        if (isScheduleIntent) {
          const createdMacro = await vortexMacroScheduler.createMacroFromNaturalPrompt(
            effectivePrompt
          );
          if (createdMacro) {
            updateMessageContent(
              sessionId,
              assistantMsgId,
              `Scheduled **${createdMacro.title}**\n• Action: \`${createdMacro.command}\`\n• Native exact alarm armed and active.`,
              {
                providerTag: 'Macro Scheduler',
                latencyMs: Date.now() - startedAt,
              }
            );
            return;
          }
        }

        const imageGenMatch = effectivePrompt.match(
          /^(?:generate\s+(?:an?\s+)?image\s+(?:of\s+)?|draw\s+|create\s+(?:an?\s+)?(?:art|image)\s+(?:of\s+)?|render\s+(?:an?\s+)?image\s+(?:of\s+)?|tasveer\s+banao\s+|image\s+banao\s+)(.+)$/i
        );
        if (imageGenMatch && currentAttachments.length === 0) {
          const artPrompt = imageGenMatch[1].trim();
          updateMessageContent(sessionId, assistantMsgId, 'Rendering HD artwork via Pollinations Flux...');
          const imgRes = await vortexWebAndPcBridge.generatePollinationsImage({
            prompt: artPrompt,
            model: 'flux',
            aspectRatio: '1:1',
            enhancePrompt: true,
          });
          updateMessageContent(sessionId, assistantMsgId, imgRes.enhancedPrompt, {
            generatedImageUrl: imgRes.localUri || imgRes.imageUrl,
            providerTag: 'Pollinations Flux',
            latencyMs: Date.now() - startedAt,
          });
          return;
        }

        if (currentAttachments.length === 0 && !webSearchEnabled) {
          const agentExec = await vortexGhostAgent.executeCommand(effectivePrompt);
          if (agentExec.handled) {
            const stepTag =
              agentExec.stepsExecuted && agentExec.stepsExecuted > 0
                ? `Closed-Loop (${agentExec.stepsExecuted} steps)`
                : 'Autonomous OS';
            updateMessageContent(sessionId, assistantMsgId, agentExec.replyText, {
              mode: 'ghost',
              providerTag: stepTag,
              latencyMs: Date.now() - startedAt,
            });
            return;
          }
        }

        let liveWebDigest = '';
        const autoNeedsWeb =
          webSearchEnabled ||
          /\b(latest|today|news|current price|weather|score|2026|search web|google)\b/i.test(
            effectivePrompt
          );

        if (autoNeedsWeb) {
          updateMessageContent(sessionId, assistantMsgId, 'Querying live web intelligence...');
          liveWebDigest = await vortexWebAndPcBridge.searchLiveWeb(effectivePrompt);
        }

        const attachmentTexts: string[] = [];
        let primaryImageBase64: string | undefined;

        for (const att of currentAttachments) {
          if (att.base64 && !primaryImageBase64) {
            primaryImageBase64 = att.base64;
          }
          if (att.textContent) {
            attachmentTexts.push(`[Attachment: ${att.name}]\n${att.textContent}`);
          }
        }

        const assembledPromptParts = [effectivePrompt];
        if (attachmentTexts.length > 0) {
          assembledPromptParts.push(`Attached Context:\n${attachmentTexts.join('\n\n')}`);
        }
        if (liveWebDigest) {
          assembledPromptParts.push(`Live Web Search Results:\n${liveWebDigest}`);
        }

        const priorHistory: LlmTurnMessage[] = activeSession.messages
          .filter((m) => m.id !== userMsg.id && m.id !== assistantMsgId && !m.isError)
          .slice(-8)
          .map((m) => ({
            role: m.role,
            content: m.content,
          }));

        const llmResponse = await vortexLlmRouter.generate({
          prompt: assembledPromptParts.join('\n\n'),
          history: priorHistory,
          mode: activePromptMode,
          imageBase64: primaryImageBase64,
          mimeType: 'image/jpeg',
          useRag: true,
          onToken: (partial) => {
            updateMessageContent(sessionId, assistantMsgId, partial);
          },
        });

        updateMessageContent(sessionId, assistantMsgId, llmResponse.text, {
          mode: llmResponse.resolvedMode,
          diagramSpec: llmResponse.diagramSpec,
          providerTag: `${llmResponse.providerTag} • ${llmResponse.model}`,
          latencyMs: llmResponse.latencyMs,
        });

        if (
          llmResponse.resolvedMode === 'code' ||
          llmResponse.resolvedMode === 'study'
        ) {
          void ingestRagMemory({
            scope: llmResponse.resolvedMode === 'study' ? 'cse_diploma' : 'vortex',
            title: effectivePrompt.slice(0, 80),
            content: `Q: ${effectivePrompt}\nA: ${llmResponse.text.slice(0, 1800)}`,
            tags: [llmResponse.resolvedMode, 'session-knowledge'],
            importance: 3,
          });
        }
      } catch (err: any) {
        updateMessageContent(
          sessionId,
          assistantMsgId,
          `Execution interrupted: ${
            err?.message || 'Add a Gemini API key in Vault & UI or load local GGUF model.'
          }`,
          {
            isError: true,
            providerTag: 'Engine Fault',
            latencyMs: Date.now() - startedAt,
          }
        );
      } finally {
        setIsGenerating(false);
        await useVortexStore.getState().persistStore();
      }
    },
    [
      inputText,
      pendingAttachments,
      isGenerating,
      activeSession,
      activePromptMode,
      webSearchEnabled,
      clearPendingAttachments,
      setIsGenerating,
      appendMessage,
      updateMessageContent,
    ]
  );

  const handleRegenerateImageFromMessage = async (promptText: string) => {
    if (isGenerating || !activeSession) return;
    await handleSendPrompt(`Generate image of ${promptText}`);
  };

  const handleRerollAssistantMessage = async (assistantIndex: number) => {
    if (isGenerating) return;
    for (let i = assistantIndex - 1; i >= 0; i -= 1) {
      if (messages[i].role === 'user') {
        await handleSendPrompt(messages[i].content);
        break;
      }
    }
  };

  const renderAttachmentChip = (att: VortexAttachment, removable: boolean) => (
    <View
      key={att.id}
      style={[
        styles.attachmentChip,
        { borderColor: accent.border, backgroundColor: VORTEX_PALETTE.surfaceElevated },
      ]}
    >
      {att.uri && att.type === 'image' ? (
        <Image source={{ uri: att.uri }} style={styles.attThumb} />
      ) : null}
      <Text numberOfLines={1} style={styles.attName}>
        {att.name}
      </Text>
      {removable ? (
        <TouchableOpacity
          onPress={() => removePendingAttachment(att.id)}
          style={styles.attRemoveBtn}
        >
          <Text style={styles.attRemoveText}>✕</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const renderMessageItem = ({ item, index }: { item: VortexMessage; index: number }) => {
    const isUser = item.role === 'user';

    if (isUser) {
      return (
        <View style={styles.userRow}>
          <View
            style={[
              styles.userBubble,
              {
                backgroundColor: accent.soft,
                borderColor: accent.border,
              },
            ]}
          >
            {item.attachments && item.attachments.length > 0 ? (
              <View style={styles.msgAttachmentsRow}>
                {item.attachments.map((a) => renderAttachmentChip(a, false))}
              </View>
            ) : null}
            <Text
              style={[
                styles.userText,
                {
                  fontFamily: fonts.regular,
                  fontSize: getScaledFontSize(14.5, fontScale),
                  lineHeight: Math.round(getScaledFontSize(14.5, fontScale) * 1.45),
                },
              ]}
            >
              {item.content}
            </Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.assistantRow}>
        <View
          style={[
            styles.assistantCard,
            item.isError && {
              borderColor: VORTEX_PALETTE.danger,
              backgroundColor: VORTEX_PALETTE.dangerSoft,
            },
          ]}
        >
          <View style={styles.assistantHeader}>
            <View style={styles.providerRow}>
              <View style={[styles.coreBadge, { backgroundColor: accent.soft, borderColor: accent.border }]}>
                <Text style={[styles.coreBadgeGlyph, { color: accent.primary }]}>ẞ</Text>
              </View>
              <Text style={[styles.providerText, { color: accent.primary }]}>
                {item.providerTag || 'VORTEX Core'}
              </Text>
            </View>
            {item.latencyMs ? (
              <Text style={styles.latencyText}>{(item.latencyMs / 1000).toFixed(1)}s</Text>
            ) : null}
          </View>

          <VortexRichBlocks
            content={item.content}
            diagramSpec={item.diagramSpec}
            generatedImageUrl={item.generatedImageUrl}
            onRegenerateImage={handleRegenerateImageFromMessage}
          />

          <View style={styles.msgActionBar}>
            <TouchableOpacity
              onPress={() => void handleCopyMessage(item)}
              style={styles.msgActionBtn}
            >
              <Text style={styles.msgActionText}>
                {copiedMsgId === item.id ? 'COPIED' : 'COPY'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => void handleSpeakMessage(item)}
              style={[
                styles.msgActionBtn,
                speakingMsgId === item.id && { backgroundColor: accent.soft },
              ]}
            >
              <Text
                style={[
                  styles.msgActionText,
                  speakingMsgId === item.id && { color: accent.primary },
                ]}
              >
                {speakingMsgId === item.id ? 'STOP VOICE' : 'SPEAK'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => branchFromMessage(item.id)}
              style={styles.msgActionBtn}
            >
              <Text style={styles.msgActionText}>⎇ BRANCH</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => void handleRerollAssistantMessage(index)}
              style={styles.msgActionBtn}
            >
              <Text style={styles.msgActionText}>↻ RE-ROLL</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <VortexNavigationShell
      headerTitle="VORTEX"
      headerSubtitle={
        activeNotebook
          ? `Notebook: ${activeNotebook.code} • ${activePromptMode.toUpperCase()}`
          : undefined
      }
    >
      <KeyboardAvoidingView
        style={styles.flexOne}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {activeNotebook ? (
          <View style={[styles.notebookBanner, { borderBottomColor: accent.border }]}>
            <Text numberOfLines={1} style={[styles.notebookBannerText, { color: accent.primary }]}>
              RAG Grounded: {activeNotebook.subject} ({activeNotebook.code})
            </Text>
            <TouchableOpacity onPress={() => setActiveNotebook(null)}>
              <Text style={styles.notebookClearText}>DETACH</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {messages.length === 0 ? (
          <ScrollView
            contentContainerStyle={styles.emptyHeroContainer}
            showsVerticalScrollIndicator={false}
          >
            <View
              style={[
                styles.heroCoreOrb,
                {
                  borderColor: accent.primary,
                  backgroundColor: accent.soft,
                  shadowColor: accent.primary,
                },
              ]}
            >
              <Text style={[styles.heroCoreGlyph, { color: accent.primary, fontFamily: fonts.display }]}>
                ẞ
              </Text>
            </View>

            <Text style={[styles.heroHeadline, { fontFamily: fonts.display }]}>
              VORTEX AUTONOMOUS CORE
            </Text>
            <Text style={[styles.heroSubline, { fontFamily: fonts.regular }]}>
              Closed-loop UI execution, zero-comment code engine, live screen DOM vision, and offline RAG memory.
            </Text>

            <View style={styles.starterGrid}>
              {QUICK_STARTERS.map((item, idx) => (
                <TouchableOpacity
                  key={`st_${idx}`}
                  onPress={() => void handleSendPrompt(item.prompt)}
                  style={[styles.starterCard, { borderColor: VORTEX_PALETTE.borderStrong }]}
                >
                  <Text style={[styles.starterTitle, { fontFamily: fonts.bold, color: accent.primary }]}>
                    {item.title}
                  </Text>
                  <Text style={styles.starterSub}>{item.sub}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessageItem}
            contentContainerStyle={styles.messagesListContent}
            showsVerticalScrollIndicator={false}
          />
        )}

        <View style={styles.dockContainer}>
          {pendingAttachments.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pendingAttBar}
            >
              {pendingAttachments.map((att) => renderAttachmentChip(att, true))}
            </ScrollView>
          ) : null}

          <View style={styles.dockTopChips}>
            <TouchableOpacity
              onPress={() => setPlusSheetOpen(true)}
              style={[styles.modePill, { backgroundColor: accent.soft, borderColor: accent.border }]}
            >
              <Text style={[styles.modePillText, { color: accent.primary }]}>
                MODE: {activePromptMode.toUpperCase()}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setWebSearchEnabled((v) => !v)}
              style={[
                styles.modePill,
                webSearchEnabled
                  ? {
                      backgroundColor: VORTEX_PALETTE.successSoft,
                      borderColor: VORTEX_PALETTE.success,
                    }
                  : {
                      backgroundColor: VORTEX_PALETTE.surfacePill,
                      borderColor: VORTEX_PALETTE.borderHairline,
                    },
              ]}
            >
              <Text
                style={[
                  styles.modePillText,
                  {
                    color: webSearchEnabled
                      ? VORTEX_PALETTE.success
                      : VORTEX_PALETTE.textSecondary,
                  },
                ]}
              >
                {webSearchEnabled ? 'WEB SEARCH: ON' : 'WEB SEARCH'}
              </Text>
            </TouchableOpacity>

            {activePromptMode !== 'auto' ? (
              <TouchableOpacity onPress={() => setPromptMode('auto')} style={styles.resetModeBtn}>
                <Text style={styles.resetModeText}>RESET</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={[styles.inputBar, { borderColor: VORTEX_PALETTE.borderStrong }]}>
            <TouchableOpacity
              onPress={() => setPlusSheetOpen(true)}
              style={styles.plusBtn}
            >
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M12 5v14M5 12h14"
                  stroke={VORTEX_PALETTE.textPrimary}
                  strokeWidth={2.2}
                  strokeLinecap="round"
                />
              </Svg>
            </TouchableOpacity>

            <TextInput
              value={inputText}
              onChangeText={setInputText}
              placeholder="Ask VORTEX, give OS command, or write code..."
              placeholderTextColor={VORTEX_PALETTE.textMuted}
              multiline
              maxLength={4000}
              style={[
                styles.textInput,
                {
                  fontFamily: fonts.regular,
                  fontSize: getScaledFontSize(14, fontScale),
                },
              ]}
            />

            <TouchableOpacity
              onPress={() => {
                setActiveScreen('voice_live');
                void vortexVoiceWakeword.startDirectVoiceCapture();
              }}
              style={styles.micBtn}
            >
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z"
                  stroke={accent.primary}
                  strokeWidth={1.9}
                />
                <Path
                  d="M19 11a7 7 0 0 1-14 0M12 18v3"
                  stroke={accent.primary}
                  strokeWidth={1.9}
                  strokeLinecap="round"
                />
              </Svg>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                if (isGenerating) {
                  vortexGhostAgent.stopLoop('Stopped by user');
                  setIsGenerating(false);
                } else {
                  void handleSendPrompt();
                }
              }}
              disabled={!isGenerating && !inputText.trim() && pendingAttachments.length === 0}
              style={[
                styles.sendBtn,
                {
                  backgroundColor: isGenerating
                    ? VORTEX_PALETTE.danger
                    : inputText.trim() || pendingAttachments.length > 0
                    ? accent.primary
                    : VORTEX_PALETTE.surfacePill,
                },
              ]}
            >
              {isGenerating ? (
                <ActivityIndicator size="small" color={VORTEX_PALETTE.textPrimary} />
              ) : (
                <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
                  <Path
                    d="M5 12h14M13 6l6 6-6 6"
                    stroke={
                      inputText.trim() || pendingAttachments.length > 0
                        ? VORTEX_PALETTE.oledBlack
                        : VORTEX_PALETTE.textMuted
                    }
                    strokeWidth={2.2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      <VortexPlusActionSheet />
    </VortexNavigationShell>
  );
};

const styles = StyleSheet.create({
  flexOne: {
    flex: 1,
  },
  notebookBanner: {
    backgroundColor: VORTEX_PALETTE.surfaceElevated,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  notebookBannerText: {
    fontSize: 11,
    fontWeight: '700',
    flex: 1,
  },
  notebookClearText: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 10,
    fontWeight: '800',
  },
  emptyHeroContainer: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 24,
    gap: 12,
  },
  heroCoreOrb: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 1.8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 8,
  },
  heroCoreGlyph: {
    fontSize: 32,
  },
  heroHeadline: {
    color: VORTEX_PALETTE.textPrimary,
    fontSize: 16,
    letterSpacing: 1.3,
    textAlign: 'center',
    marginTop: 4,
  },
  heroSubline: {
    color: VORTEX_PALETTE.textSecondary,
    fontSize: 12.5,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 320,
  },
  starterGrid: {
    width: '100%',
    gap: 8,
    marginTop: 10,
  },
  starterCard: {
    backgroundColor: VORTEX_PALETTE.surfaceCard,
    borderRadius: VORTEX_LAYOUT.radiusMd,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 2,
  },
  starterTitle: {
    fontSize: 13,
  },
  starterSub: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 11,
  },
  messagesListContent: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 12,
  },
  userRow: {
    alignItems: 'flex-end',
  },
  userBubble: {
    maxWidth: '84%',
    borderRadius: VORTEX_LAYOUT.radiusLg,
    borderBottomRightRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  userText: {
    color: VORTEX_PALETTE.textPrimary,
  },
  msgAttachmentsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  assistantRow: {
    alignItems: 'stretch',
  },
  assistantCard: {
    backgroundColor: VORTEX_PALETTE.surfaceCard,
    borderRadius: VORTEX_LAYOUT.radiusLg,
    borderTopLeftRadius: 6,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderHairline,
    padding: 12,
    gap: 10,
  },
  assistantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  coreBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coreBadgeGlyph: {
    fontSize: 10,
    fontWeight: '800',
  },
  providerText: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  latencyText: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  msgActionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: VORTEX_PALETTE.borderHairline,
  },
  msgActionBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  msgActionText: {
    color: VORTEX_PALETTE.textSecondary,
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  dockContainer: {
    backgroundColor: VORTEX_PALETTE.surfaceBase,
    borderTopWidth: 1,
    borderTopColor: VORTEX_PALETTE.borderHairline,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 8,
  },
  pendingAttBar: {
    gap: 8,
  },
  attachmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    maxWidth: 180,
  },
  attThumb: {
    width: 22,
    height: 22,
    borderRadius: 5,
  },
  attName: {
    color: VORTEX_PALETTE.textPrimary,
    fontSize: 11,
    flexShrink: 1,
  },
  attRemoveBtn: {
    paddingLeft: 4,
  },
  attRemoveText: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  dockTopChips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  modePill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: VORTEX_LAYOUT.radiusPill,
    borderWidth: 1,
  },
  modePillText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  resetModeBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  resetModeText: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 9.5,
    fontWeight: '700',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: VORTEX_PALETTE.surfaceInput,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 6,
  },
  plusBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: VORTEX_PALETTE.surfacePill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textInput: {
    flex: 1,
    color: VORTEX_PALETTE.textPrimary,
    maxHeight: 110,
    minHeight: 36,
    paddingHorizontal: 6,
    paddingTop: 8,
    paddingBottom: 8,
  },
  micBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

     
