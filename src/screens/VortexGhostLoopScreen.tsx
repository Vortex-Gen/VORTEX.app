import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { VortexNavigationShell } from '../components/VortexNavigationShell';
import { ScreenSnapshot, vortexGhostAgent } from '../engines/vortexGhostAgent';
import { useVortexStore } from '../store/useVortexStore';
import {
  VORTEX_ACCENTS,
  VORTEX_FONTS,
  VORTEX_LAYOUT,
  VORTEX_PALETTE,
} from '../theme/vortexTheme';

const PIPELINE_STAGES = [
  { key: 'observing', label: '1. OBSERVE' },
  { key: 'planning', label: '2. PLAN' },
  { key: 'acting', label: '3. ACT' },
  { key: 'verifying', label: '4. VERIFY' },
];

const SAMPLE_GOALS = [
  'Open Chrome and search SBTET C21 CSE syllabus',
  'Open Settings and check Wi-Fi connection',
  'Open YouTube and search Data Structures playlist',
  'Scan current screen and solve visible code error',
];

export const VortexGhostLoopScreen: React.FC = () => {
  const ghostLoop = useVortexStore((s) => s.ghostLoop);
  const accentKey = useVortexStore((s) => s.orbAccentKey);
  const fontPreset = useVortexStore((s) => s.fontPreset);

  const accent = VORTEX_ACCENTS[accentKey] || VORTEX_ACCENTS.sky;
  const fonts = VORTEX_FONTS[fontPreset] || VORTEX_FONTS.aero;

  const [goalDraft, setGoalDraft] = useState('');
  const [maxStepsBudget, setMaxStepsBudget] = useState(12);
  const [pausedLocal, setPausedLocal] = useState(false);
  const [domSnapshot, setDomSnapshot] = useState<ScreenSnapshot | null>(null);
  const [capturingDom, setCapturingDom] = useState(false);

  const isLoopBusy =
    ghostLoop.status === 'observing' ||
    ghostLoop.status === 'planning' ||
    ghostLoop.status === 'acting' ||
    ghostLoop.status === 'verifying' ||
    ghostLoop.status === 'awaiting_approval';

  const handleLaunchGoal = (customGoal?: string) => {
    const targetGoal = (customGoal !== undefined ? customGoal : goalDraft).trim();
    if (!targetGoal) return;
    if (customGoal === undefined) {
      setGoalDraft('');
    }
    setPausedLocal(false);
    void vortexGhostAgent.runClosedLoopGoal(targetGoal, maxStepsBudget);
  };

  const handleTogglePause = () => {
    if (pausedLocal) {
      vortexGhostAgent.resumeLoop();
      setPausedLocal(false);
    } else {
      vortexGhostAgent.pauseLoop();
      setPausedLocal(true);
    }
  };

  const handleInspectDom = async () => {
    setCapturingDom(true);
    try {
      const snap = await vortexGhostAgent.captureLiveScreen();
      setDomSnapshot(snap);
    } finally {
      setCapturingDom(false);
    }
  };

  const statusBadgeColor = (() => {
    switch (ghostLoop.status) {
      case 'completed':
        return VORTEX_PALETTE.success;
      case 'halted':
        return VORTEX_PALETTE.danger;
      case 'awaiting_approval':
        return VORTEX_PALETTE.warning;
      case 'idle':
        return VORTEX_PALETTE.textMuted;
      default:
        return accent.primary;
    }
  })();

  return (
    <VortexNavigationShell
      headerTitle="GHOST LOOP"
      headerSubtitle={`Status: ${ghostLoop.status.toUpperCase()} • Step ${ghostLoop.currentStep}/${ghostLoop.maxSteps}`}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.monitorCard, { borderColor: accent.border }]}>
          <View style={styles.monitorHeader}>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: statusBadgeColor }]} />
              <Text style={[styles.statusLabel, { color: statusBadgeColor }]}>
                {ghostLoop.status.replace('_', ' ').toUpperCase()}
              </Text>
            </View>
            <Text style={styles.stepCounterText}>
              STEP {ghostLoop.currentStep} / {ghostLoop.maxSteps}
            </Text>
          </View>

          <Text style={[styles.activeGoalText, { fontFamily: fonts.bold }]}>
            {ghostLoop.goal || 'No active autonomous goal running'}
          </Text>

          <View style={styles.pipelineRow}>
            {PIPELINE_STAGES.map((stage) => {
              const active = ghostLoop.status === stage.key;
              return (
                <View
                  key={stage.key}
                  style={[
                    styles.pipelineStep,
                    active && {
                      backgroundColor: accent.soft,
                      borderColor: accent.primary,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.pipelineStepText,
                      {
                        color: active ? accent.primary : VORTEX_PALETTE.textMuted,
                      },
                    ]}
                  >
                    {stage.label}
                  </Text>
                </View>
              );
            })}
          </View>

          {isLoopBusy ? (
            <View style={styles.loopControlsRow}>
              <TouchableOpacity
                onPress={handleTogglePause}
                style={[
                  styles.loopCtrlBtn,
                  {
                    backgroundColor: VORTEX_PALETTE.warningSoft,
                    borderColor: VORTEX_PALETTE.warning,
                  },
                ]}
              >
                <Text style={[styles.loopCtrlText, { color: VORTEX_PALETTE.warning }]}>
                  {pausedLocal ? 'RESUME LOOP' : 'PAUSE LOOP'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => vortexGhostAgent.stopLoop('Emergency halt triggered by user')}
                style={[
                  styles.loopCtrlBtn,
                  {
                    backgroundColor: VORTEX_PALETTE.dangerSoft,
                    borderColor: VORTEX_PALETTE.danger,
                  },
                ]}
              >
                <Text style={[styles.loopCtrlText, { color: VORTEX_PALETTE.danger }]}>
                  EMERGENCY HALT
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        {ghostLoop.pendingSafety ? (
          <View style={styles.safetyCard}>
            <Text style={styles.safetyEyebrow}>
              SAFETY CHECKPOINT • {ghostLoop.pendingSafety.actionType.toUpperCase()}
            </Text>
            <Text style={[styles.safetyTarget, { fontFamily: fonts.bold }]}>
              Target App: {ghostLoop.pendingSafety.targetApp}
            </Text>
            <Text style={styles.safetyPreview}>{ghostLoop.pendingSafety.previewText}</Text>

            <View style={styles.safetyBtnRow}>
              <TouchableOpacity
                onPress={() => vortexGhostAgent.submitSafetyDecision(true)}
                style={[styles.safetyBtn, { backgroundColor: VORTEX_PALETTE.success }]}
              >
                <Text style={styles.safetyApproveText}>APPROVE & EXECUTE</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => vortexGhostAgent.submitSafetyDecision(false)}
                style={[
                  styles.safetyBtn,
                  {
                    backgroundColor: VORTEX_PALETTE.dangerSoft,
                    borderWidth: 1,
                    borderColor: VORTEX_PALETTE.danger,
                  },
                ]}
              >
                <Text style={[styles.safetyRejectText, { color: VORTEX_PALETTE.danger }]}>
                  REJECT
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <Text style={styles.sectionLabel}>LAUNCH AUTONOMOUS UI GOAL</Text>
        <View style={styles.launcherCard}>
          <TextInput
            value={goalDraft}
            onChangeText={setGoalDraft}
            placeholder="e.g., Open Chrome, search Binary Search Tree C++, and open first result..."
            placeholderTextColor={VORTEX_PALETTE.textMuted}
            multiline
            style={[styles.goalInput, { fontFamily: fonts.regular }]}
          />

          <View style={styles.launcherFooter}>
            <View style={styles.budgetRow}>
              <Text style={styles.budgetLabel}>MAX STEPS:</Text>
              {[6, 12, 20].map((num) => (
                <TouchableOpacity
                  key={num}
                  onPress={() => setMaxStepsBudget(num)}
                  style={[
                    styles.budgetChip,
                    maxStepsBudget === num && {
                      backgroundColor: accent.soft,
                      borderColor: accent.primary,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.budgetChipText,
                      {
                        color:
                          maxStepsBudget === num
                            ? accent.primary
                            : VORTEX_PALETTE.textSecondary,
                      },
                    ]}
                  >
                    {num}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              onPress={() => handleLaunchGoal()}
              disabled={!goalDraft.trim()}
              style={[
                styles.launchGoalBtn,
                {
                  backgroundColor: goalDraft.trim()
                    ? accent.primary
                    : VORTEX_PALETTE.surfacePill,
                },
              ]}
            >
              <Text
                style={[
                  styles.launchGoalText,
                  {
                    color: goalDraft.trim()
                      ? VORTEX_PALETTE.oledBlack
                      : VORTEX_PALETTE.textMuted,
                  },
                ]}
              >
                RUN LOOP
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.sampleWrap}>
          {SAMPLE_GOALS.map((g, idx) => (
            <TouchableOpacity
              key={`sg_${idx}`}
              onPress={() => handleLaunchGoal(g)}
              style={styles.sampleChip}
            >
              <Text style={styles.sampleText}>{g}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.domHeaderRow}>
          <Text style={styles.sectionLabel}>SET-OF-MARK SCREEN DOM RADAR</Text>
          <TouchableOpacity
            onPress={() => void handleInspectDom()}
            style={[styles.scanDomBtn, { backgroundColor: accent.soft, borderColor: accent.border }]}
          >
            <Text style={[styles.scanDomText, { color: accent.primary }]}>
              {capturingDom ? 'SCANNING...' : 'CAPTURE DOM'}
            </Text>
          </TouchableOpacity>
        </View>

        {domSnapshot ? (
          <View style={styles.domCard}>
            <Text style={styles.domMeta}>
              PKG: {domSnapshot.packageName} • NODES: {domSnapshot.nodes.length} • HASH:{' '}
              {domSnapshot.domHash.slice(0, 10)}
            </Text>
            {domSnapshot.nodes.slice(0, 14).map((n) => (
              <Text key={`dn_${n.tag}`} numberOfLines={1} style={styles.domNodeLine}>
                [{n.tag}] {n.text || n.desc || n.viewId || n.className} ({n.centerX},{n.centerY})
              </Text>
            ))}
          </View>
        ) : null}

        <Text style={styles.sectionLabel}>EXECUTION TELEMETRY LOGS ({ghostLoop.logs.length})</Text>
        <View style={styles.logsContainer}>
          {ghostLoop.logs.length === 0 ? (
            <View style={styles.emptyLogBox}>
              <Text style={styles.emptyLogText}>
                Step-by-step Observe, Plan, Act & Verify logs will stream here during execution.
              </Text>
            </View>
          ) : (
            [...ghostLoop.logs].reverse().map((log) => (
              <View
                key={log.id}
                style={[
                  styles.logItem,
                  !log.success && { borderColor: VORTEX_PALETTE.danger },
                ]}
              >
                <View style={styles.logTopRow}>
                  <Text style={[styles.logPhaseTag, { color: accent.primary }]}>
                    STEP {log.step} • {log.phase.toUpperCase()}
                  </Text>
                  <Text style={styles.logTime}>
                    {new Date(log.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </Text>
                </View>
                <Text style={styles.logSummary}>{log.summary}</Text>
              </View>
            ))
          )}
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
  monitorCard: {
    backgroundColor: VORTEX_PALETTE.surfaceCard,
    borderRadius: VORTEX_LAYOUT.radiusLg,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  monitorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  stepCounterText: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 10.5,
    fontWeight: '800',
  },
  activeGoalText: {
    color: VORTEX_PALETTE.textPrimary,
    fontSize: 13.5,
    lineHeight: 19,
  },
  pipelineRow: {
    flexDirection: 'row',
    gap: 6,
  },
  pipelineStep: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderHairline,
    backgroundColor: VORTEX_PALETTE.surfaceBase,
    alignItems: 'center',
  },
  pipelineStepText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  loopControlsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  loopCtrlBtn: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loopCtrlText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  safetyCard: {
    backgroundColor: VORTEX_PALETTE.warningSoft,
    borderRadius: VORTEX_LAYOUT.radiusMd,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.warning,
    padding: 14,
    gap: 8,
  },
  safetyEyebrow: {
    color: VORTEX_PALETTE.warning,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  safetyTarget: {
    color: VORTEX_PALETTE.textPrimary,
    fontSize: 13,
  },
  safetyPreview: {
    color: VORTEX_PALETTE.textPrimary,
    fontSize: 12,
    lineHeight: 17,
  },
  safetyBtnRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  safetyBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  safetyApproveText: {
    color: VORTEX_PALETTE.oledBlack,
    fontSize: 11,
    fontWeight: '800',
  },
  safetyRejectText: {
    fontSize: 11,
    fontWeight: '800',
  },
  sectionLabel: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.9,
    marginTop: 2,
  },
  launcherCard: {
    backgroundColor: VORTEX_PALETTE.surfaceCard,
    borderRadius: VORTEX_LAYOUT.radiusMd,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderStrong,
    padding: 12,
    gap: 10,
  },
  goalInput: {
    color: VORTEX_PALETTE.textPrimary,
    fontSize: 13,
    minHeight: 54,
    textAlignVertical: 'top',
  },
  launcherFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: VORTEX_PALETTE.borderHairline,
  },
  budgetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  budgetLabel: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 9.5,
    fontWeight: '800',
  },
  budgetChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderHairline,
    backgroundColor: VORTEX_PALETTE.surfaceBase,
  },
  budgetChipText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  launchGoalBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  launchGoalText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  sampleWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  sampleChip: {
    backgroundColor: VORTEX_PALETTE.surfaceCard,
    borderRadius: VORTEX_LAYOUT.radiusPill,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderHairline,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  sampleText: {
    color: VORTEX_PALETTE.textSecondary,
    fontSize: 11,
  },
  domHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  scanDomBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  scanDomText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  domCard: {
    backgroundColor: VORTEX_PALETTE.surfaceCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderHairline,
    padding: 10,
    gap: 4,
  },
  domMeta: {
    color: VORTEX_PALETTE.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 4,
  },
  domNodeLine: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 10.5,
  },
  logsContainer: {
    gap: 7,
  },
  emptyLogBox: {
    backgroundColor: VORTEX_PALETTE.surfaceCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderHairline,
    padding: 14,
  },
  emptyLogText: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 11.5,
    lineHeight: 17,
  },
  logItem: {
    backgroundColor: VORTEX_PALETTE.surfaceCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderHairline,
    padding: 10,
    gap: 4,
  },
  logTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logPhaseTag: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  logTime: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 9.5,
  },
  logSummary: {
    color: VORTEX_PALETTE.textPrimary,
    fontSize: 12,
    lineHeight: 17,
  },
});
