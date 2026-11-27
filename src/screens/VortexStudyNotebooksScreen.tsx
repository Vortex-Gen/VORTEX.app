import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { VortexNavigationShell } from '../components/VortexNavigationShell';
import {
  deleteRagMemory,
  getRagStats,
  ingestRagMemory,
  listRecentRagMemories,
  RagMemoryRecord,
  RagProjectScope,
  retrieveRagContext,
} from '../db/vortexSqliteRag';
import { vortexLlmRouter } from '../engines/vortexLlmRouter';
import { vortexVoiceWakeword } from '../engines/vortexVoiceWakeword';
import { useVortexStore } from '../store/useVortexStore';
import {
  getScaledFontSize,
  VORTEX_ACCENTS,
  VORTEX_FONTS,
  VORTEX_LAYOUT,
  VORTEX_PALETTE,
} from '../theme/vortexTheme';

const SCOPE_FILTERS: Array<{ id: 'all' | RagProjectScope; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'cse_diploma', label: 'CSE Diploma' },
  { id: 'vortex', label: 'VORTEX' },
  { id: 'usb_recovery', label: 'USB Tool' },
  { id: 'general', label: 'General' },
];

export const VortexStudyNotebooksScreen: React.FC = () => {
  const notebooks = useVortexStore((s) => s.notebooks);
  const activeNotebookId = useVortexStore((s) => s.activeNotebookId);
  const setActiveNotebook = useVortexStore((s) => s.setActiveNotebook);
  const updateNotebookNotes = useVortexStore((s) => s.updateNotebookNotes);
  const addNotebook = useVortexStore((s) => s.addNotebook);

  const activeSessionId = useVortexStore((s) => s.activeSessionId);
  const appendMessage = useVortexStore((s) => s.appendMessage);
  const setActiveScreen = useVortexStore((s) => s.setActiveScreen);
  const setPromptMode = useVortexStore((s) => s.setPromptMode);

  const accentKey = useVortexStore((s) => s.orbAccentKey);
  const fontPreset = useVortexStore((s) => s.fontPreset);
  const fontScale = useVortexStore((s) => s.fontScale);

  const accent = VORTEX_ACCENTS[accentKey] || VORTEX_ACCENTS.sky;
  const fonts = VORTEX_FONTS[fontPreset] || VORTEX_FONTS.aero;

  const [activeTab, setActiveTab] = useState<'notebooks' | 'viva' | 'rag'>('notebooks');
  const [selectedNbId, setSelectedNbId] = useState<string>(
    activeNotebookId || notebooks[0]?.id || ''
  );
  const [notesDraft, setNotesDraft] = useState('');
  const [showNewSubjectForm, setShowNewSubjectForm] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectCode, setNewSubjectCode] = useState('');
  const [statusToast, setStatusToast] = useState('');
  const [busyAction, setBusyAction] = useState(false);

  const [vivaTopicInput, setVivaTopicInput] = useState('');
  const [vivaTranscript, setVivaTranscript] = useState('');
  const [vivaHistory, setVivaHistory] = useState<string[]>([]);
  const [isSpeakingViva, setIsSpeakingViva] = useState(false);

  const [ragStats, setRagStats] = useState({ totalMemories: 0, pendingPcSync: 0 });
  const [ragScopeFilter, setRagScopeFilter] = useState<'all' | RagProjectScope>('all');
  const [ragRecords, setRagRecords] = useState<RagMemoryRecord[]>([]);
  const [ragSearchQuery, setRagSearchQuery] = useState('');
  const [newMemTitle, setNewMemTitle] = useState('');
  const [newMemContent, setNewMemContent] = useState('');

  const currentNotebook = useMemo(
    () => notebooks.find((n) => n.id === selectedNbId) || notebooks[0],
    [notebooks, selectedNbId]
  );

  useEffect(() => {
    if (currentNotebook) {
      setNotesDraft(currentNotebook.notes);
    }
  }, [currentNotebook]);

  const showBanner = (msg: string) => {
    setStatusToast(msg);
    setTimeout(() => setStatusToast(''), 2400);
  };

  const refreshRagVault = useCallback(async () => {
    const stats = await getRagStats();
    setRagStats(stats);

    if (ragSearchQuery.trim()) {
      const searchRes = await retrieveRagContext(ragSearchQuery.trim(), {
        preferredScope: ragScopeFilter === 'all' ? undefined : ragScopeFilter,
        topK: 15,
        maxTotalChars: 8000,
      });
      setRagRecords(searchRes.matches.map((m) => m.record));
    } else {
      const recent = await listRecentRagMemories(
        ragScopeFilter === 'all' ? undefined : ragScopeFilter,
        20
      );
      setRagRecords(recent);
    }
  }, [ragScopeFilter, ragSearchQuery]);

  useEffect(() => {
    if (activeTab === 'rag') {
      void refreshRagVault();
    }
  }, [activeTab, refreshRagVault]);

  const handleSaveNotesToRag = async () => {
    if (!currentNotebook) return;
    updateNotebookNotes(currentNotebook.id, notesDraft);
    await ingestRagMemory({
      scope: 'cse_diploma',
      title: `${currentNotebook.subject} (${currentNotebook.code}) Revision Notes`,
      content: notesDraft,
      tags: [currentNotebook.code.toLowerCase(), 'sbtet', 'syllabus', 'notes'],
      importance: 4,
    });
    showBanner(`Saved & indexed ${currentNotebook.code} notes into SQLite RAG.`);
  };

  const handleCreateNotebook = () => {
    const subject = newSubjectName.trim();
    const code = newSubjectCode.trim().toUpperCase() || 'CSE-401';
    if (!subject) return;

    const id = `nb_${Date.now()}`;
    addNotebook({
      id,
      subject,
      code,
      semester: 'SBTET Diploma',
      notes: `Key concepts, algorithms, and exam points for ${subject}.`,
      updatedAt: Date.now(),
    });
    setSelectedNbId(id);
    setNewSubjectName('');
    setNewSubjectCode('');
    setShowNewSubjectForm(false);
    showBanner(`Created notebook: ${subject} (${code})`);
  };

  const handleLaunchExamSynthesis = (promptBuilder: (subject: string, code: string, notes: string) => string) => {
    if (!currentNotebook || !activeSessionId) return;
    updateNotebookNotes(currentNotebook.id, notesDraft);
    setActiveNotebook(currentNotebook.id);
    setPromptMode('study');

    const prompt = promptBuilder(currentNotebook.subject, currentNotebook.code, notesDraft);
    appendMessage(activeSessionId, {
      id: `std_usr_${Date.now()}`,
      role: 'user',
      content: prompt,
      timestamp: Date.now(),
      mode: 'study',
    });
    setActiveScreen('chat');
  };

  const handleGenerateNextViva = async () => {
    if (!currentNotebook || busyAction) return;
    setBusyAction(true);
    try {
      const focusArea = vivaTopicInput.trim() || currentNotebook.notes.slice(0, 300);
      const avoidList =
        vivaHistory.length > 0
          ? `Avoid repeating these previously asked questions:\n${vivaHistory.slice(-4).join('\n')}`
          : '';

      const res = await vortexLlmRouter.generate({
        prompt: `You are an SBTET Computer Science Diploma External Viva Examiner for ${currentNotebook.subject} (${currentNotebook.code}).
Focus Notes: ${focusArea}
${avoidList}

Ask ONE sharp, high-yield viva question followed immediately by a clear, spoken-friendly 3-sentence model answer. Keep formatting clean without code blocks or symbols so TTS reads it naturally.`,
        mode: 'study',
        ragScope: 'cse_diploma',
        stripCodeComments: true,
      });

      setVivaTranscript(res.text);
      setVivaHistory((prev) => [...prev, res.text.slice(0, 120)]);
      setIsSpeakingViva(true);
      await vortexVoiceWakeword.speakResponse(res.text);
    } catch (err: any) {
      setVivaTranscript(err?.message || 'Unable to generate viva session.');
    } finally {
      setIsSpeakingViva(false);
      setBusyAction(false);
    }
  };

  const handleIngestManualMemory = async () => {
    if (!newMemTitle.trim() || !newMemContent.trim()) return;
    await ingestRagMemory({
      scope: ragScopeFilter === 'all' ? 'cse_diploma' : ragScopeFilter,
      title: newMemTitle.trim(),
      content: newMemContent.trim(),
      tags: ['manual-entry', 'knowledge'],
      importance: 4,
    });
    setNewMemTitle('');
    setNewMemContent('');
    await refreshRagVault();
    showBanner('Memory node stored in SQLite RAG.');
  };

  return (
    <VortexNavigationShell
      headerTitle="CSE STUDY"
      headerSubtitle={
        currentNotebook
          ? `${currentNotebook.code} • ${currentNotebook.subject}`
          : 'SBTET Diploma Knowledge Hub'
      }
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.tabBar}>
          {[
            { id: 'notebooks' as const, label: 'NOTEBOOKS' },
            { id: 'viva' as const, label: 'AUDIO VIVA' },
            { id: 'rag' as const, label: 'SQLITE RAG' },
          ].map((tab) => {
            const active = activeTab === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                onPress={() => setActiveTab(tab.id)}
                style={[
                  styles.tabBtn,
                  active && { backgroundColor: accent.soft, borderColor: accent.primary },
                ]}
              >
                <Text
                  style={[
                    styles.tabText,
                    {
                      fontFamily: fonts.bold,
                      color: active ? accent.primary : VORTEX_PALETTE.textSecondary,
                    },
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {statusToast ? (
          <View style={[styles.toastBox, { backgroundColor: accent.soft, borderColor: accent.border }]}>
            <Text style={[styles.toastText, { color: accent.primary }]}>{statusToast}</Text>
          </View>
        ) : null}

        {activeTab !== 'rag' ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.subjectStrip}
          >
            {notebooks.map((nb) => {
              const selected = currentNotebook?.id === nb.id;
              return (
                <TouchableOpacity
                  key={nb.id}
                  onPress={() => setSelectedNbId(nb.id)}
                  style={[
                    styles.subjectChip,
                    selected && { backgroundColor: accent.soft, borderColor: accent.primary },
                  ]}
                >
                  <Text
                    style={[
                      styles.subjectCode,
                      { color: selected ? accent.primary : VORTEX_PALETTE.textMuted },
                    ]}
                  >
                    {nb.code}
                  </Text>
                  <Text
                    style={[
                      styles.subjectName,
                      {
                        fontFamily: fonts.bold,
                        color: selected
                          ? VORTEX_PALETTE.textPrimary
                          : VORTEX_PALETTE.textSecondary,
                      },
                    ]}
                  >
                    {nb.subject}
                  </Text>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              onPress={() => setShowNewSubjectForm((v) => !v)}
              style={[styles.addSubjectChip, { borderColor: VORTEX_PALETTE.borderStrong }]}
            >
              <Text style={[styles.addSubjectText, { color: accent.primary }]}>+ SUBJECT</Text>
            </TouchableOpacity>
          </ScrollView>
        ) : null}

        {showNewSubjectForm && activeTab !== 'rag' ? (
          <View style={styles.newSubCard}>
            <TextInput
              value={newSubjectName}
              onChangeText={setNewSubjectName}
              placeholder="Subject Name (e.g., Operating Systems)..."
              placeholderTextColor={VORTEX_PALETTE.textMuted}
              style={styles.inputField}
            />
            <View style={styles.newSubRow}>
              <TextInput
                value={newSubjectCode}
                onChangeText={setNewSubjectCode}
                placeholder="Code (e.g., CS-402)"
                placeholderTextColor={VORTEX_PALETTE.textMuted}
                style={[styles.inputField, { flex: 1 }]}
              />
              <TouchableOpacity
                onPress={handleCreateNotebook}
                style={[styles.createSubBtn, { backgroundColor: accent.primary }]}
              >
                <Text style={styles.createSubBtnText}>CREATE</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {activeTab === 'notebooks' && currentNotebook ? (
          <>
            <View style={[styles.notebookCard, { borderColor: accent.border }]}>
              <View style={styles.nbHeaderRow}>
                <View style={styles.nbTitleCol}>
                  <Text style={[styles.nbEyebrow, { color: accent.primary }]}>
                    {currentNotebook.code} • {currentNotebook.semester}
                  </Text>
                  <Text style={[styles.nbHeading, { fontFamily: fonts.bold }]}>
                    {currentNotebook.subject}
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() => {
                    updateNotebookNotes(currentNotebook.id, notesDraft);
                    setActiveNotebook(currentNotebook.id);
                    setPromptMode('study');
                    setActiveScreen('chat');
                  }}
                  style={[styles.groundChatBtn, { backgroundColor: accent.soft, borderColor: accent.primary }]}
                >
                  <Text style={[styles.groundChatText, { color: accent.primary }]}>
                    GROUND CHAT
                  </Text>
                </TouchableOpacity>
              </View>

              <TextInput
                value={notesDraft}
                onChangeText={setNotesDraft}
                multiline
                placeholder="Write syllabus units, important definitions, formulas, and exam topics..."
                placeholderTextColor={VORTEX_PALETTE.textMuted}
                style={[
                  styles.notesEditor,
                  {
                    fontFamily: fonts.regular,
                    fontSize: getScaledFontSize(13.5, fontScale),
                  },
                ]}
              />

              <TouchableOpacity
                onPress={() => void handleSaveNotesToRag()}
                style={[styles.saveRagBtn, { backgroundColor: accent.primary }]}
              >
                <Text style={styles.saveRagBtnText}>SAVE & INDEX IN SQLITE RAG</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionLabel}>EXAM & ARCHITECTURE SYNTHESIZERS</Text>
            <View style={styles.synthGrid}>
              <TouchableOpacity
                onPress={() =>
                  handleLaunchExamSynthesis(
                    (subj, code, notes) =>
                      `For SBTET ${subj} (${code}), write a complete 5-mark exam answer with key points and an interactive architecture/flowchart diagram covering: ${notes.slice(
                        0,
                        280
                      )}`
                  )
                }
                style={styles.synthTile}
              >
                <Text style={[styles.synthTitle, { color: accent.primary, fontFamily: fonts.bold }]}>
                  5-Mark Exam + SVG Diagram
                </Text>
                <Text style={styles.synthSub}>Structured answer with visual tree/flow</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() =>
                  handleLaunchExamSynthesis(
                    (subj, code, notes) =>
                      `Write clean, comment-free C++/Python lab implementation programs for ${subj} (${code}) based on: ${notes.slice(
                        0,
                        280
                      )}`
                  )
                }
                style={styles.synthTile}
              >
                <Text style={[styles.synthTitle, { color: VORTEX_PALETTE.success, fontFamily: fonts.bold }]}>
                  Lab Code (Zero-Comment)
                </Text>
                <Text style={styles.synthSub}>Ready to inject into compiler</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() =>
                  handleLaunchExamSynthesis(
                    (subj, code, notes) =>
                      `Provide step-by-step solved numerical examples, truth tables, or dry-run trace tables for ${subj} (${code}) topics: ${notes.slice(
                        0,
                        280
                      )}`
                  )
                }
                style={styles.synthTile}
              >
                <Text style={[styles.synthTitle, { color: VORTEX_PALETTE.warning, fontFamily: fonts.bold }]}>
                  Dry-Run & Truth Tables
                </Text>
                <Text style={styles.synthSub}>Step-by-step trace & derivations</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() =>
                  handleLaunchExamSynthesis(
                    (subj, code, notes) =>
                      `List the top 8 external practical viva-voce questions with crisp 2-line answers for ${subj} (${code}) covering: ${notes.slice(
                        0,
                        280
                      )}`
                  )
                }
                style={styles.synthTile}
              >
                <Text style={[styles.synthTitle, { color: '#818CF8', fontFamily: fonts.bold }]}>
                  External Viva Drill
                </Text>
                <Text style={styles.synthSub}>High-probability examiner Q&A</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : null}

        {activeTab === 'viva' && currentNotebook ? (
          <View style={[styles.vivaCard, { borderColor: accent.border }]}>
            <Text style={[styles.vivaHeading, { fontFamily: fonts.display }]}>
              HANDS-FREE COMMUTE AUDIO VIVA
            </Text>
            <Text style={styles.vivaDesc}>
              VORTEX acts as your oral examiner for {currentNotebook.subject}, asking crisp viva questions and speaking model answers aloud via ElevenLabs / Neural TTS.
            </Text>

            <TextInput
              value={vivaTopicInput}
              onChangeText={setVivaTopicInput}
              placeholder="Optional focus chapter (e.g., AVL Trees, TCP Handshake, Flip-Flops)..."
              placeholderTextColor={VORTEX_PALETTE.textMuted}
              style={styles.inputField}
            />

            <View style={styles.vivaControlsRow}>
              <TouchableOpacity
                onPress={() => void handleGenerateNextViva()}
                disabled={busyAction}
                style={[styles.vivaPrimaryBtn, { backgroundColor: accent.primary }]}
              >
                {busyAction ? (
                  <ActivityIndicator size="small" color={VORTEX_PALETTE.oledBlack} />
                ) : (
                  <Text style={styles.vivaPrimaryBtnText}>
                    {vivaTranscript ? 'NEXT VIVA QUESTION' : 'START AUDIO VIVA'}
                  </Text>
                )}
              </TouchableOpacity>

              {isSpeakingViva ? (
                <TouchableOpacity
                  onPress={() => {
                    setIsSpeakingViva(false);
                    void vortexVoiceWakeword.shutdown();
                  }}
                  style={[styles.vivaStopBtn, { borderColor: VORTEX_PALETTE.danger }]}
                >
                  <Text style={{ color: VORTEX_PALETTE.danger, fontSize: 10.5, fontWeight: '800' }}>
                    STOP
                  </Text>
                </TouchableOpacity>
              ) : vivaTranscript ? (
                <TouchableOpacity
                  onPress={() => {
                    setIsSpeakingViva(true);
                    void vortexVoiceWakeword
                      .speakResponse(vivaTranscript)
                      .finally(() => setIsSpeakingViva(false));
                  }}
                  style={[styles.vivaStopBtn, { borderColor: accent.border }]}
                >
                  <Text style={{ color: accent.primary, fontSize: 10.5, fontWeight: '800' }}>
                    REPLAY
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {vivaTranscript ? (
              <View style={styles.vivaTranscriptBox}>
                <Text style={[styles.vivaTranscriptText, { fontFamily: fonts.regular }]}>
                  {vivaTranscript}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {activeTab === 'rag' ? (
          <>
            <View style={styles.ragStatsRow}>
              <View style={[styles.statBox, { borderColor: accent.border }]}>
                <Text style={[styles.statNumber, { color: accent.primary, fontFamily: fonts.display }]}>
                  {ragStats.totalMemories}
                </Text>
                <Text style={styles.statLabel}>INDEXED MEMORIES</Text>
              </View>

              <View style={styles.statBox}>
                <Text style={[styles.statNumber, { color: VORTEX_PALETTE.warning, fontFamily: fonts.display }]}>
                  {ragStats.pendingPcSync}
                </Text>
                <Text style={styles.statLabel}>PC SYNC QUEUED</Text>
              </View>
            </View>

            <View style={styles.ragSearchRow}>
              <TextInput
                value={ragSearchQuery}
                onChangeText={setRagSearchQuery}
                placeholder="Query SQLite RAG semantic index..."
                placeholderTextColor={VORTEX_PALETTE.textMuted}
                style={[styles.inputField, { flex: 1 }]}
              />
              <TouchableOpacity
                onPress={() => void refreshRagVault()}
                style={[styles.createSubBtn, { backgroundColor: accent.primary }]}
              >
                <Text style={styles.createSubBtnText}>SEARCH</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.scopeRow}
            >
              {SCOPE_FILTERS.map((sc) => {
                const active = ragScopeFilter === sc.id;
                return (
                  <TouchableOpacity
                    key={sc.id}
                    onPress={() => setRagScopeFilter(sc.id)}
                    style={[
                      styles.scopeChip,
                      active && { backgroundColor: accent.soft, borderColor: accent.primary },
                    ]}
                  >
                    <Text
                      style={[
                        styles.scopeChipText,
                        { color: active ? accent.primary : VORTEX_PALETTE.textSecondary },
                      ]}
                    >
                      {sc.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.newSubCard}>
              <Text style={styles.sectionLabel}>INJECT NEW RAG KNOWLEDGE NODE</Text>
              <TextInput
                value={newMemTitle}
                onChangeText={setNewMemTitle}
                placeholder="Memory Title (e.g., USB Boot Recovery Partition Spec)..."
                placeholderTextColor={VORTEX_PALETTE.textMuted}
                style={styles.inputField}
              />
              <TextInput
                value={newMemContent}
                onChangeText={setNewMemContent}
                placeholder="Fact, formula, code snippet, or project specification..."
                placeholderTextColor={VORTEX_PALETTE.textMuted}
                multiline
                style={[styles.inputField, { height: 68, textAlignVertical: 'top', paddingTop: 8 }]}
              />
              <TouchableOpacity
                onPress={() => void handleIngestManualMemory()}
                style={[styles.saveRagBtn, { backgroundColor: accent.primary }]}
              >
                <Text style={styles.saveRagBtnText}>STORE IN LOCAL SQLITE DB</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionLabel}>STORED KNOWLEDGE NODES ({ragRecords.length})</Text>
            <View style={styles.ragList}>
              {ragRecords.map((rec) => (
                <View key={rec.id} style={styles.ragRecordCard}>
                  <View style={styles.ragRecordHeader}>
                    <Text style={[styles.ragScopeBadge, { color: accent.primary }]}>
                      {rec.scope.toUpperCase()} • IMP {rec.importance}/5
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        void deleteRagMemory(rec.id).then(() => refreshRagVault());
                      }}
                    >
                      <Text style={{ color: VORTEX_PALETTE.danger, fontSize: 10.5, fontWeight: '800' }}>
                        DELETE
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.ragRecTitle, { fontFamily: fonts.bold }]}>{rec.title}</Text>
                  <Text numberOfLines={4} style={styles.ragRecBody}>
                    {rec.content}
                  </Text>
                </View>
              ))}
            </View>
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
  tabBar: {
    flexDirection: 'row',
    gap: 7,
  },
  tabBtn: {
    flex: 1,
    height: 38,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderHairline,
    backgroundColor: VORTEX_PALETTE.surfaceCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: {
    fontSize: 10,
    letterSpacing: 0.6,
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
  subjectStrip: {
    gap: 8,
  },
  subjectChip: {
    backgroundColor: VORTEX_PALETTE.surfaceCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderHairline,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 118,
  },
  subjectCode: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  subjectName: {
    fontSize: 12,
    marginTop: 2,
  },
  addSubjectChip: {
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addSubjectText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  newSubCard: {
    backgroundColor: VORTEX_PALETTE.surfaceCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderStrong,
    padding: 12,
    gap: 8,
  },
  newSubRow: {
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
  createSubBtn: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createSubBtnText: {
    color: VORTEX_PALETTE.oledBlack,
    fontSize: 10.5,
    fontWeight: '800',
  },
  notebookCard: {
    backgroundColor: VORTEX_PALETTE.surfaceCard,
    borderRadius: VORTEX_LAYOUT.radiusLg,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  nbHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  nbTitleCol: {
    flex: 1,
  },
  nbEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  nbHeading: {
    color: VORTEX_PALETTE.textPrimary,
    fontSize: 15,
    marginTop: 2,
  },
  groundChatBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
    borderWidth: 1,
  },
  groundChatText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  notesEditor: {
    minHeight: 135,
    backgroundColor: VORTEX_PALETTE.surfaceBase,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderHairline,
    padding: 12,
    color: VORTEX_PALETTE.textPrimary,
    textAlignVertical: 'top',
    lineHeight: 20,
  },
  saveRagBtn: {
    height: 42,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveRagBtnText: {
    color: VORTEX_PALETTE.oledBlack,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  sectionLabel: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.9,
  },
  synthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  synthTile: {
    width: '48.6%',
    backgroundColor: VORTEX_PALETTE.surfaceCard,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderHairline,
    padding: 11,
    gap: 4,
  },
  synthTitle: {
    fontSize: 12,
  },
  synthSub: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 10.5,
    lineHeight: 14,
  },
  vivaCard: {
    backgroundColor: VORTEX_PALETTE.surfaceCard,
    borderRadius: VORTEX_LAYOUT.radiusLg,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  vivaHeading: {
    color: VORTEX_PALETTE.textPrimary,
    fontSize: 14,
    letterSpacing: 0.8,
  },
  vivaDesc: {
    color: VORTEX_PALETTE.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  vivaControlsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  vivaPrimaryBtn: {
    flex: 1,
    height: 42,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vivaPrimaryBtnText: {
    color: VORTEX_PALETTE.oledBlack,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  vivaStopBtn: {
    paddingHorizontal: 14,
    height: 42,
    borderRadius: 11,
    borderWidth: 1,
    backgroundColor: VORTEX_PALETTE.surfaceBase,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vivaTranscriptBox: {
    backgroundColor: VORTEX_PALETTE.surfaceBase,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderHairline,
    padding: 12,
  },
  vivaTranscriptText: {
    color: VORTEX_PALETTE.textPrimary,
    fontSize: 13.5,
    lineHeight: 20,
  },
  ragStatsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statBox: {
    flex: 1,
    backgroundColor: VORTEX_PALETTE.surfaceCard,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderHairline,
    padding: 12,
    alignItems: 'center',
    gap: 3,
  },
  statNumber: {
    fontSize: 22,
  },
  statLabel: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  ragSearchRow: {
    flexDirection: 'row',
    gap: 8,
  },
  scopeRow: {
    gap: 7,
  },
  scopeChip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: VORTEX_LAYOUT.radiusPill,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderHairline,
    backgroundColor: VORTEX_PALETTE.surfaceCard,
  },
  scopeChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  ragList: {
    gap: 8,
  },
  ragRecordCard: {
    backgroundColor: VORTEX_PALETTE.surfaceCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderHairline,
    padding: 11,
    gap: 4,
  },
  ragRecordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ragScopeBadge: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  ragRecTitle: {
    color: VORTEX_PALETTE.textPrimary,
    fontSize: 12.5,
  },
  ragRecBody: {
    color: VORTEX_PALETTE.textSecondary,
    fontSize: 11.5,
    lineHeight: 16,
  },
});
