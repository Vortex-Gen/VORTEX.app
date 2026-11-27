import React, { useState } from 'react';
import {
  NativeModules,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { VortexNavigationShell } from '../components/VortexNavigationShell';
import { vortexGhostAgent } from '../engines/vortexGhostAgent';
import {
  DAY_BITS,
  formatDaysMaskLabel,
  formatTime12Hour,
} from '../engines/vortexMacroScheduler';
import {
  useVortexStore,
  VortexMacroItem,
  VortexWorkflow,
} from '../store/useVortexStore';
import {
  VORTEX_ACCENTS,
  VORTEX_FONTS,
  VORTEX_LAYOUT,
  VORTEX_PALETTE,
} from '../theme/vortexTheme';

const { VortexBridge } = NativeModules;

const DAY_PILLS = [
  { label: 'S', bit: DAY_BITS.SUN },
  { label: 'M', bit: DAY_BITS.MON },
  { label: 'T', bit: DAY_BITS.TUE },
  { label: 'W', bit: DAY_BITS.WED },
  { label: 'T', bit: DAY_BITS.THU },
  { label: 'F', bit: DAY_BITS.FRI },
  { label: 'S', bit: DAY_BITS.SAT },
];

const CHAIN_TOKENS = [
  { label: '+ RAM Sweep', token: 'TURBO_SWEEP' },
  { label: '+ Launch Orb', token: 'START_ORB' },
  { label: '+ CSE Viva', token: 'AUDIO_VIVA' },
  { label: '+ PC Sync', token: 'PC_SYNC' },
];

const PRESET_ROUTINES = [
  {
    title: 'College Commute Viva & Sweep',
    hour: 7,
    minute: 30,
    daysMask: DAY_BITS.WEEKDAYS,
    command: 'TURBO_SWEEP + AUDIO_VIVA',
    ringAlarm: true,
  },
  {
    title: 'Night System & Cache Purge',
    hour: 23,
    minute: 0,
    daysMask: DAY_BITS.ALL_DAYS,
    command: 'TURBO_SWEEP',
    ringAlarm: false,
  },
  {
    title: 'Afternoon Study Orb HUD',
    hour: 16,
    minute: 15,
    daysMask: DAY_BITS.WEEKDAYS,
    command: 'START_ORB',
    ringAlarm: false,
  },
];

export const VortexMacrosAndWorkflowsScreen: React.FC = () => {
  const macros = useVortexStore((s) => s.macros);
  const upsertMacro = useVortexStore((s) => s.upsertMacro);
  const toggleMacro = useVortexStore((s) => s.toggleMacro);
  const deleteMacro = useVortexStore((s) => s.deleteMacro);

  const workflows = useVortexStore((s) => s.workflows);
  const isRecordingWorkflow = useVortexStore((s) => s.isRecordingWorkflow);
  const recordedDraftSteps = useVortexStore((s) => s.recordedDraftSteps);
  const setWorkflowRecording = useVortexStore((s) => s.setWorkflowRecording);
  const saveDraftWorkflow = useVortexStore((s) => s.saveDraftWorkflow);
  const deleteWorkflow = useVortexStore((s) => s.deleteWorkflow);

  const updateOrbSettings = useVortexStore((s) => s.updateOrbSettings);
  const setActiveScreen = useVortexStore((s) => s.setActiveScreen);
  const refreshNativeDiagnostics = useVortexStore((s) => s.refreshNativeDiagnostics);

  const accentKey = useVortexStore((s) => s.orbAccentKey);
  const fontPreset = useVortexStore((s) => s.fontPreset);
  const accent = VORTEX_ACCENTS[accentKey] || VORTEX_ACCENTS.sky;
  const fonts = VORTEX_FONTS[fontPreset] || VORTEX_FONTS.aero;

  const [activeTab, setActiveTab] = useState<'macros' | 'workflows'>('macros');

  const [titleDraft, setTitleDraft] = useState('');
  const [commandDraft, setCommandDraft] = useState('TURBO_SWEEP');
  const [hourDraft, setHourDraft] = useState(7);
  const [minuteDraft, setMinuteDraft] = useState(30);
  const [daysMaskDraft, setDaysMaskDraft] = useState<number>(DAY_BITS.WEEKDAYS);
  const [ringAlarmDraft, setRingAlarmDraft] = useState(true);
  const [statusBanner, setStatusBanner] = useState('');

  const [wfNameDraft, setWfNameDraft] = useState('');
  const [wfTriggerDraft, setWfTriggerDraft] = useState('');

  const toggleDayBit = (bit: number) => {
    setDaysMaskDraft((prev) => ((prev & bit) !== 0 ? prev & ~bit : prev | bit));
  };

  const appendChainToken = (token: string) => {
    setCommandDraft((prev) => {
      const clean = prev.trim();
      if (!clean) return token;
      if (clean.toUpperCase().includes(token)) return clean;
      return `${clean} + ${token}`;
    });
  };

  const handleSaveMacro = async () => {
    const cleanCmd = commandDraft.trim() || 'ALARM_RING';
    const cleanTitle =
      titleDraft.trim() ||
      (ringAlarmDraft
        ? `Alarm • ${formatTime12Hour(hourDraft, minuteDraft)}`
        : `Routine • ${formatTime12Hour(hourDraft, minuteDraft)}`);

    const newMacro: VortexMacroItem = {
      id: `macro_${Date.now()}`,
      title: cleanTitle,
      command: cleanCmd,
      hour: hourDraft,
      minute: minuteDraft,
      daysMask: daysMaskDraft,
      enabled: true,
      ringAlarm: ringAlarmDraft,
    };

    await upsertMacro(newMacro);
    setTitleDraft('');
    setStatusBanner(`Armed "${cleanTitle}" for ${formatTime12Hour(hourDraft, minuteDraft)}.`);
  };

  const handleApplyPreset = async (preset: (typeof PRESET_ROUTINES)[number]) => {
    const item: VortexMacroItem = {
      id: `macro_${Date.now()}`,
      title: preset.title,
      command: preset.command,
      hour: preset.hour,
      minute: preset.minute,
      daysMask: preset.daysMask,
      enabled: true,
      ringAlarm: preset.ringAlarm,
    };
    await upsertMacro(item);
    setStatusBanner(`Scheduled "${preset.title}".`);
  };

  const handleRunMacroNow = async (macro: VortexMacroItem) => {
    const upper = macro.command.toUpperCase();
    const notes: string[] = [];

    if (upper.includes('TURBO_SWEEP') && VortexBridge?.runTurboSweep) {
      const sweep = await VortexBridge.runTurboSweep();
      notes.push(`Freed ${Math.round(sweep?.freedMb || 0)} MB RAM`);
    }
    if (upper.includes('START_ORB')) {
      await updateOrbSettings({ enabled: true });
      notes.push('Orb launched');
    }
    if (upper.includes('AUDIO_VIVA')) {
      setActiveScreen('study_notebooks');
      return;
    }

    const residual = macro.command
      .replace(/\b(TURBO_SWEEP|START_ORB|AUDIO_VIVA|ALARM_RING|PC_SYNC)\b/gi, '')
      .replace(/\+/g, '')
      .trim();

    if (residual.length >= 3) {
      await vortexGhostAgent.executeCommand(residual);
      notes.push(`Executed "${residual}"`);
    }

    await refreshNativeDiagnostics();
    setStatusBanner(
      notes.length > 0 ? `${macro.title}: ${notes.join(' • ')}` : `Triggered ${macro.title}`
    );
  };

  const handleSaveWorkflow = () => {
    if (recordedDraftSteps.length === 0) return;
    const name = wfNameDraft.trim() || `Ghost Flow #${workflows.length + 1}`;
    const trigger = wfTriggerDraft.trim() || name.toLowerCase();
    saveDraftWorkflow(name, trigger);
    setWfNameDraft('');
    setWfTriggerDraft('');
    setStatusBanner(`Saved self-healing workflow "${name}" (${recordedDraftSteps.length} steps).`);
  };

  const handleReplayWorkflow = (wf: VortexWorkflow) => {
    void vortexGhostAgent.replaySavedWorkflow(wf);
  };

  return (
    <VortexNavigationShell
      headerTitle="AUTOMATION"
      headerSubtitle={`${macros.filter((m) => m.enabled).length} Armed Alarms • ${workflows.length} Workflows`}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.tabBar}>
          <TouchableOpacity
            onPress={() => setActiveTab('macros')}
            style={[
              styles.tabBtn,
              activeTab === 'macros' && {
                backgroundColor: accent.soft,
                borderColor: accent.primary,
              },
            ]}
          >
            <Text
              style={[
                styles.tabText,
                {
                  fontFamily: fonts.bold,
                  color: activeTab === 'macros' ? accent.primary : VORTEX_PALETTE.textSecondary,
                },
              ]}
            >
              MACROS & ALARMS ({macros.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setActiveTab('workflows')}
            style={[
              styles.tabBtn,
              activeTab === 'workflows' && {
                backgroundColor: accent.soft,
                borderColor: accent.primary,
              },
            ]}
          >
            <Text
              style={[
                styles.tabText,
                {
                  fontFamily: fonts.bold,
                  color: activeTab === 'workflows' ? accent.primary : VORTEX_PALETTE.textSecondary,
                },
              ]}
            >
              WORKFLOWS ({workflows.length})
            </Text>
          </TouchableOpacity>
        </View>

        {statusBanner ? (
          <View style={[styles.bannerBox, { borderColor: accent.border, backgroundColor: accent.soft }]}>
            <Text style={[styles.bannerText, { color: accent.primary }]}>{statusBanner}</Text>
          </View>
        ) : null}

        {activeTab === 'macros' ? (
          <>
            <Text style={styles.sectionLabel}>SCHEDULED ROUTINE & ALARM BUILDER</Text>
            <View style={[styles.card, { borderColor: accent.border }]}>
              <View style={styles.clockAdjustRow}>
                <View style={styles.clockUnitBox}>
                  <TouchableOpacity
                    onPress={() => setHourDraft((h) => (h + 1) % 24)}
                    style={styles.clockStepBtn}
                  >
                    <Text style={styles.clockStepText}>▲</Text>
                  </TouchableOpacity>
                  <Text style={[styles.clockDigits, { color: accent.primary, fontFamily: fonts.display }]}>
                    {String(hourDraft).padStart(2, '0')}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setHourDraft((h) => (h + 23) % 24)}
                    style={styles.clockStepBtn}
                  >
                    <Text style={styles.clockStepText}>▼</Text>
                  </TouchableOpacity>
                </View>

                <Text style={[styles.clockColon, { color: accent.primary }]}>:</Text>

                <View style={styles.clockUnitBox}>
                  <TouchableOpacity
                    onPress={() => setMinuteDraft((m) => (m + 5) % 60)}
                    style={styles.clockStepBtn}
                  >
                    <Text style={styles.clockStepText}>▲</Text>
                  </TouchableOpacity>
                  <Text style={[styles.clockDigits, { color: accent.primary, fontFamily: fonts.display }]}>
                    {String(minuteDraft).padStart(2, '0')}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setMinuteDraft((m) => (m + 55) % 60)}
                    style={styles.clockStepBtn}
                  >
                    <Text style={styles.clockStepText}>▼</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.clockSummaryCol}>
                  <Text style={[styles.clock12hLabel, { fontFamily: fonts.bold }]}>
                    {formatTime12Hour(hourDraft, minuteDraft)}
                  </Text>
                  <Text style={styles.clockRepeatLabel}>
                    {formatDaysMaskLabel(daysMaskDraft)}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setRingAlarmDraft((v) => !v)}
                    style={[
                      styles.alarmModeChip,
                      ringAlarmDraft
                        ? {
                            backgroundColor: VORTEX_PALETTE.warningSoft,
                            borderColor: VORTEX_PALETTE.warning,
                          }
                        : {
                            backgroundColor: VORTEX_PALETTE.surfacePill,
                            borderColor: VORTEX_PALETTE.borderHairline,
                          },
                    ]}
                  >
                    <Text
                      style={{
                        color: ringAlarmDraft
                          ? VORTEX_PALETTE.warning
                          : VORTEX_PALETTE.textMuted,
                        fontSize: 9.5,
                        fontWeight: '800',
                      }}
                    >
                      {ringAlarmDraft ? 'AUDIO ALARM: ON' : 'SILENT MACRO'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.daysRow}>
                {DAY_PILLS.map((d, idx) => {
                  const active = (daysMaskDraft & d.bit) !== 0;
                  return (
                    <TouchableOpacity
                      key={`day_${idx}`}
                      onPress={() => toggleDayBit(d.bit)}
                      style={[
                        styles.dayCircle,
                        active && {
                          backgroundColor: accent.primary,
                          borderColor: accent.primary,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayCircleText,
                          {
                            color: active
                              ? VORTEX_PALETTE.oledBlack
                              : VORTEX_PALETTE.textSecondary,
                          },
                        ]}
                      >
                        {d.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.quickMaskRow}>
                <TouchableOpacity
                  onPress={() => setDaysMaskDraft(0)}
                  style={styles.maskPresetChip}
                >
                  <Text style={styles.maskPresetText}>Once</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setDaysMaskDraft(DAY_BITS.WEEKDAYS)}
                  style={styles.maskPresetChip}
                >
                  <Text style={styles.maskPresetText}>Mon–Fri</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setDaysMaskDraft(DAY_BITS.ALL_DAYS)}
                  style={styles.maskPresetChip}
                >
                  <Text style={styles.maskPresetText}>Every Day</Text>
                </TouchableOpacity>
              </View>

              <TextInput
                value={titleDraft}
                onChangeText={setTitleDraft}
                placeholder="Routine label (e.g., Morning College Briefing)..."
                placeholderTextColor={VORTEX_PALETTE.textMuted}
                style={styles.textField}
              />

              <TextInput
                value={commandDraft}
                onChangeText={setCommandDraft}
                placeholder="Action chain or natural command (e.g., TURBO_SWEEP + Open Chrome)..."
                placeholderTextColor={VORTEX_PALETTE.textMuted}
                style={styles.textField}
              />

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chainChipsRow}
              >
                {CHAIN_TOKENS.map((ct) => (
                  <TouchableOpacity
                    key={ct.token}
                    onPress={() => appendChainToken(ct.token)}
                    style={[styles.chainChip, { borderColor: VORTEX_PALETTE.borderStrong }]}
                  >
                    <Text style={[styles.chainChipText, { color: accent.primary }]}>
                      {ct.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity
                onPress={() => void handleSaveMacro()}
                style={[styles.primaryActionBtn, { backgroundColor: accent.primary }]}
              >
                <Text style={styles.primaryActionText}>SCHEDULE & ARM EXACT ALARM</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionLabel}>1-TAP AUTONOMOUS TEMPLATES</Text>
            <View style={styles.presetList}>
              {PRESET_ROUTINES.map((pr, idx) => (
                <TouchableOpacity
                  key={`pr_${idx}`}
                  onPress={() => void handleApplyPreset(pr)}
                  style={styles.presetCard}
                >
                  <View style={styles.presetInfo}>
                    <Text style={[styles.presetTitle, { fontFamily: fonts.bold }]}>
                      {pr.title}
                    </Text>
                    <Text style={styles.presetMeta}>
                      {formatTime12Hour(pr.hour, pr.minute)} • {formatDaysMaskLabel(pr.daysMask)} •{' '}
                      {pr.command}
                    </Text>
                  </View>
                  <Text style={[styles.presetAddGlyph, { color: accent.primary }]}>+ ARM</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionLabel}>ARMED SCHEDULES ({macros.length})</Text>
            <View style={styles.listStack}>
              {macros.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>
                    No scheduled macros yet. Arm one above or say "Roz subah 7:30 baje alarm aur RAM sweep laga do" in chat.
                  </Text>
                </View>
              ) : (
                macros.map((m) => (
                  <View
                    key={m.id}
                    style={[
                      styles.macroItemCard,
                      m.enabled && { borderColor: accent.border },
                    ]}
                  >
                    <View style={styles.macroTopRow}>
                      <View>
                        <Text
                          style={[
                            styles.macroClock,
                            {
                              fontFamily: fonts.display,
                              color: m.enabled ? accent.primary : VORTEX_PALETTE.textMuted,
                            },
                          ]}
                        >
                          {formatTime12Hour(m.hour, m.minute)}
                        </Text>
                        <Text style={styles.macroRepeat}>
                          {formatDaysMaskLabel(m.daysMask)}
                          {m.ringAlarm ? ' • Audio Alarm' : ' • Silent Routine'}
                        </Text>
                      </View>

                      <TouchableOpacity
                        onPress={() => void toggleMacro(m.id)}
                        style={[
                          styles.togglePill,
                          m.enabled
                            ? { backgroundColor: accent.soft, borderColor: accent.primary }
                            : {
                                backgroundColor: VORTEX_PALETTE.surfacePill,
                                borderColor: VORTEX_PALETTE.borderHairline,
                              },
                        ]}
                      >
                        <Text
                          style={{
                            color: m.enabled ? accent.primary : VORTEX_PALETTE.textMuted,
                            fontSize: 10,
                            fontWeight: '800',
                          }}
                        >
                          {m.enabled ? 'ARMED' : 'OFF'}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    <Text style={[styles.macroTitle, { fontFamily: fonts.bold }]}>
                      {m.title}
                    </Text>
                    <Text style={styles.macroCmdText}>{m.command}</Text>

                    <View style={styles.macroFooterActions}>
                      <TouchableOpacity
                        onPress={() => void handleRunMacroNow(m)}
                        style={[styles.smallBtn, { backgroundColor: accent.soft }]}
                      >
                        <Text style={[styles.smallBtnText, { color: accent.primary }]}>
                          RUN NOW
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => void deleteMacro(m.id)}
                        style={[
                          styles.smallBtn,
                          { backgroundColor: VORTEX_PALETTE.dangerSoft },
                        ]}
                      >
                        <Text style={[styles.smallBtnText, { color: VORTEX_PALETTE.danger }]}>
                          DELETE
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </View>
          </>
        ) : (
          <>
            <Text style={styles.sectionLabel}>SEMANTIC WORKFLOW RECORDER</Text>
            <View style={[styles.card, { borderColor: accent.border }]}>
              <Text style={[styles.wfExplainTitle, { fontFamily: fonts.bold }]}>
                Self-Healing UI Macro Engine
              </Text>
              <Text style={styles.wfExplainSub}>
                Enable recording, run any multi-step Ghost Loop task, and VORTEX captures semantic viewIds, text anchors, and normalized coordinates so replay adapts even if buttons shift.
              </Text>

              <View style={styles.recControlRow}>
                <TouchableOpacity
                  onPress={() => setWorkflowRecording(!isRecordingWorkflow)}
                  style={[
                    styles.recBtn,
                    isRecordingWorkflow
                      ? {
                          backgroundColor: VORTEX_PALETTE.dangerSoft,
                          borderColor: VORTEX_PALETTE.danger,
                        }
                      : {
                          backgroundColor: accent.soft,
                          borderColor: accent.primary,
                        },
                  ]}
                >
                  <Text
                    style={[
                      styles.recBtnText,
                      {
                        color: isRecordingWorkflow
                          ? VORTEX_PALETTE.danger
                          : accent.primary,
                      },
                    ]}
                  >
                    {isRecordingWorkflow
                      ? `● RECORDING (${recordedDraftSteps.length} STEPS) — STOP`
                      : '● ARM WORKFLOW RECORDER'}
                  </Text>
                </TouchableOpacity>
              </View>

              {recordedDraftSteps.length > 0 ? (
                <View style={styles.draftStepsBox}>
                  {recordedDraftSteps.map((st) => (
                    <Text key={st.id} numberOfLines={1} style={styles.draftStepLine}>
                      {st.order}. [{st.action.toUpperCase()}]{' '}
                      {st.textAnchor || st.viewId || st.packageName}
                    </Text>
                  ))}

                  <TextInput
                    value={wfNameDraft}
                    onChangeText={setWfNameDraft}
                    placeholder="Workflow Name (e.g., Check College Portal)..."
                    placeholderTextColor={VORTEX_PALETTE.textMuted}
                    style={styles.textField}
                  />
                  <TextInput
                    value={wfTriggerDraft}
                    onChangeText={setWfTriggerDraft}
                    placeholder="Voice Trigger Phrase (e.g., open college portal)..."
                    placeholderTextColor={VORTEX_PALETTE.textMuted}
                    style={styles.textField}
                  />
                  <TouchableOpacity
                    onPress={handleSaveWorkflow}
                    style={[styles.primaryActionBtn, { backgroundColor: VORTEX_PALETTE.success }]}
                  >
                    <Text style={styles.primaryActionText}>SAVE SELF-HEALING WORKFLOW</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>

            <Text style={styles.sectionLabel}>SAVED WORKFLOWS ({workflows.length})</Text>
            <View style={styles.listStack}>
              {workflows.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>
                    No recorded workflows yet. Arm the recorder above and run a Ghost Loop goal to capture reusable steps.
                  </Text>
                </View>
              ) : (
                workflows.map((wf) => (
                  <View key={wf.id} style={styles.macroItemCard}>
                    <View style={styles.macroTopRow}>
                      <Text style={[styles.macroTitle, { fontFamily: fonts.bold }]}>
                        {wf.name}
                      </Text>
                      <Text style={[styles.stepBadge, { color: accent.primary }]}>
                        {wf.steps.length} STEPS
                      </Text>
                    </View>
                    <Text style={styles.macroCmdText}>
                      Voice Trigger: "{wf.triggerPhrase}"
                    </Text>

                    <View style={styles.macroFooterActions}>
                      <TouchableOpacity
                        onPress={() => handleReplayWorkflow(wf)}
                        style={[styles.smallBtn, { backgroundColor: accent.soft }]}
                      >
                        <Text style={[styles.smallBtnText, { color: accent.primary }]}>
                          REPLAY FLOW
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => deleteWorkflow(wf.id)}
                        style={[
                          styles.smallBtn,
                          { backgroundColor: VORTEX_PALETTE.dangerSoft },
                        ]}
                      >
                        <Text style={[styles.smallBtnText, { color: VORTEX_PALETTE.danger }]}>
                          DELETE
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </View>
          </>
        )}
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
    gap: 8,
  },
  tabBtn: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderHairline,
    backgroundColor: VORTEX_PALETTE.surfaceCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: {
    fontSize: 10.5,
    letterSpacing: 0.6,
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
    gap: 10,
  },
  clockAdjustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clockUnitBox: {
    alignItems: 'center',
    backgroundColor: VORTEX_PALETTE.surfaceBase,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderStrong,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  clockStepBtn: {
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  clockStepText: {
    color: VORTEX_PALETTE.textSecondary,
    fontSize: 11,
  },
  clockDigits: {
    fontSize: 22,
  },
  clockColon: {
    fontSize: 22,
    fontWeight: '800',
  },
  clockSummaryCol: {
    flex: 1,
    paddingLeft: 8,
    gap: 4,
  },
  clock12hLabel: {
    color: VORTEX_PALETTE.textPrimary,
    fontSize: 16,
  },
  clockRepeatLabel: {
    color: VORTEX_PALETTE.textSecondary,
    fontSize: 11,
  },
  alarmModeChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
    borderWidth: 1,
    marginTop: 2,
  },
  daysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  dayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderStrong,
    backgroundColor: VORTEX_PALETTE.surfaceBase,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleText: {
    fontSize: 11,
    fontWeight: '800',
  },
  quickMaskRow: {
    flexDirection: 'row',
    gap: 7,
  },
  maskPresetChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: VORTEX_PALETTE.surfaceElevated,
  },
  maskPresetText: {
    color: VORTEX_PALETTE.textSecondary,
    fontSize: 10.5,
    fontWeight: '700',
  },
  textField: {
    height: 40,
    backgroundColor: VORTEX_PALETTE.surfaceInput,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderStrong,
    paddingHorizontal: 11,
    color: VORTEX_PALETTE.textPrimary,
    fontSize: 12.5,
  },
  chainChipsRow: {
    gap: 7,
  },
  chainChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: VORTEX_LAYOUT.radiusPill,
    borderWidth: 1,
    backgroundColor: VORTEX_PALETTE.surfaceBase,
  },
  chainChipText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  primaryActionBtn: {
    height: 42,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionText: {
    color: VORTEX_PALETTE.oledBlack,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  presetList: {
    gap: 7,
  },
  presetCard: {
    backgroundColor: VORTEX_PALETTE.surfaceCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderHairline,
    padding: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  presetInfo: {
    flex: 1,
    gap: 2,
  },
  presetTitle: {
    color: VORTEX_PALETTE.textPrimary,
    fontSize: 12.5,
  },
  presetMeta: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 10.5,
  },
  presetAddGlyph: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  listStack: {
    gap: 8,
  },
  emptyBox: {
    backgroundColor: VORTEX_PALETTE.surfaceCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderHairline,
    padding: 14,
  },
  emptyText: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 11.5,
    lineHeight: 17,
  },
  macroItemCard: {
    backgroundColor: VORTEX_PALETTE.surfaceCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderHairline,
    padding: 12,
    gap: 6,
  },
  macroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  macroClock: {
    fontSize: 16,
  },
  macroRepeat: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 10.5,
  },
  togglePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  macroTitle: {
    color: VORTEX_PALETTE.textPrimary,
    fontSize: 13,
  },
  macroCmdText: {
    color: VORTEX_PALETTE.textSecondary,
    fontSize: 11.5,
  },
  macroFooterActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  smallBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  smallBtnText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  wfExplainTitle: {
    color: VORTEX_PALETTE.textPrimary,
    fontSize: 13.5,
  },
  wfExplainSub: {
    color: VORTEX_PALETTE.textSecondary,
    fontSize: 11.5,
    lineHeight: 17,
  },
  recControlRow: {
    marginTop: 2,
  },
  recBtn: {
    height: 42,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recBtnText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  draftStepsBox: {
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: VORTEX_PALETTE.borderHairline,
  },
  draftStepLine: {
    color: VORTEX_PALETTE.textSecondary,
    fontSize: 11,
  },
  stepBadge: {
    fontSize: 10.5,
    fontWeight: '800',
  },
});
