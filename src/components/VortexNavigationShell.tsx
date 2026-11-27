import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  NativeModules,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { vortexWebAndPcBridge } from '../engines/vortexWebAndPcBridge';
import {
  useVortexStore,
  VortexChatSession,
  VortexScreenId,
} from '../store/useVortexStore';
import {
  getScaledFontSize,
  VORTEX_ACCENTS,
  VORTEX_FONTS,
  VORTEX_LAYOUT,
  VORTEX_PALETTE,
} from '../theme/vortexTheme';

const { VortexBridge } = NativeModules;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(340, Math.round(SCREEN_WIDTH * VORTEX_LAYOUT.drawerWidthRatio));

interface NavModuleItem {
  id: VortexScreenId;
  label: string;
  sub: string;
  iconPath: string;
}

const NAV_MODULES: NavModuleItem[] = [
  {
    id: 'chat',
    label: 'Core Chat',
    sub: 'Autonomous AI',
    iconPath: 'M4 5h16v11H7l-3 3V5z',
  },
  {
    id: 'voice_live',
    label: 'Voice HUD',
    sub: 'Hey Vortex Live',
    iconPath: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zm-6 9a6 6 0 0 0 12 0M12 18v3',
  },
  {
    id: 'orb_studio',
    label: 'Orb Studio',
    sub: '40% Overlay & Perms',
    iconPath: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm0 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8z',
  },
  {
    id: 'ghost_loop',
    label: 'Ghost Loop',
    sub: 'Observe-Act-Verify',
    iconPath: 'M12 2L4 7v10l8 5 8-5V7l-8-5zm0 5v10m-4-5h8',
  },
  {
    id: 'macros_alarms',
    label: 'Macros & Alarm',
    sub: 'Scheduled Routines',
    iconPath: 'M12 6v6l4 2m6-2a10 10 0 1 1-20 0 10 10 0 0 1 20 0z',
  },
  {
    id: 'skills_workflows',
    label: 'Workflows',
    sub: 'Self-Healing Replay',
    iconPath: 'M4 6h6v6H4V6zm10 0h6v6h-6V6zM9 15h6v5H9v-5zM7 12v3h10v-3',
  },
  {
    id: 'image_studio',
    label: 'Image Studio',
    sub: 'Pollinations HD',
    iconPath: 'M4 5h16v14H4V5zm4 5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm12 7l-5-5-4 4-3-3-4 4',
  },
  {
    id: 'study_notebooks',
    label: 'CSE Notebooks',
    sub: 'SBTET Diploma RAG',
    iconPath: 'M5 4h11a3 3 0 0 1 3 3v13H7a2 2 0 0 1-2-2V4zm4 4h6m-6 4h6',
  },
  {
    id: 'local_ai_wakeword',
    label: 'Offline Brain',
    sub: 'GGUF & Wakeword',
    iconPath: 'M9 3v2m6-2v2M9 19v2m6-2v2M3 9h2m-2 6h2m14-6h2m-2 6h2M7 7h10v10H7V7z',
  },
  {
    id: 'code_canvas',
    label: 'Code Canvas',
    sub: 'Editor & SVG Tree',
    iconPath: 'M8 8l-4 4 4 4m8-8l4 4-4 4m-3-9l-2 10',
  },
  {
    id: 'settings',
    label: 'Vault & UI',
    sub: 'API Keys & Fonts',
    iconPath: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0-5v2m0 14v2M4.9 4.9l1.4 1.4m11.4 11.4l1.4 1.4M3 12h2m14 0h2',
  },
];

interface VortexNavigationShellProps {
  children: React.ReactNode;
  headerTitle?: string;
  headerSubtitle?: string;
}

export const VortexNavigationShell: React.FC<VortexNavigationShellProps> = ({
  children,
  headerTitle,
  headerSubtitle,
}) => {
  const activeScreen = useVortexStore((s) => s.activeScreen);
  const isDrawerOpen = useVortexStore((s) => s.isDrawerOpen);
  const setDrawerOpen = useVortexStore((s) => s.setDrawerOpen);
  const setActiveScreen = useVortexStore((s) => s.setActiveScreen);

  const sessions = useVortexStore((s) => s.sessions);
  const activeSessionId = useVortexStore((s) => s.activeSessionId);
  const createNewSession = useVortexStore((s) => s.createNewSession);
  const switchSession = useVortexStore((s) => s.switchSession);
  const deleteSession = useVortexStore((s) => s.deleteSession);
  const togglePinSession = useVortexStore((s) => s.togglePinSession);
  const renameSession = useVortexStore((s) => s.renameSession);

  const orbEnabled = useVortexStore((s) => s.orbEnabled);
  const updateOrbSettings = useVortexStore((s) => s.updateOrbSettings);
  const accentKey = useVortexStore((s) => s.orbAccentKey);
  const fontPreset = useVortexStore((s) => s.fontPreset);
  const fontScale = useVortexStore((s) => s.fontScale);

  const preferOfflineBrain = useVortexStore((s) => s.preferOfflineBrain);
  const localModelLoaded = useVortexStore((s) => s.localModelLoaded);
  const telemetry = useVortexStore((s) => s.telemetry);
  const pcSync = useVortexStore((s) => s.pcSync);
  const ghostLoop = useVortexStore((s) => s.ghostLoop);
  const refreshNativeDiagnostics = useVortexStore((s) => s.refreshNativeDiagnostics);

  const accent = VORTEX_ACCENTS[accentKey] || VORTEX_ACCENTS.sky;
  const fonts = VORTEX_FONTS[fontPreset] || VORTEX_FONTS.aero;

  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const [modalVisible, setModalVisible] = useState(false);

  const [sessionQuery, setSessionQuery] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [sweepingRam, setSweepingRam] = useState(false);
  const [syncingPc, setSyncingPc] = useState(false);

  useEffect(() => {
    if (isDrawerOpen) {
      setModalVisible(true);
      void refreshNativeDiagnostics();
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          damping: 26,
          stiffness: 240,
          mass: 0.9,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -DRAWER_WIDTH,
          duration: 190,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setModalVisible(false);
        setRenamingId(null);
      });
    }
  }, [isDrawerOpen, slideAnim, backdropAnim, refreshNativeDiagnostics]);

  const sortedSessions = useMemo(() => {
    const q = sessionQuery.trim().toLowerCase();
    const filtered = q
      ? sessions.filter(
          (s) =>
            s.title.toLowerCase().includes(q) ||
            s.messages.some((m) => m.content.toLowerCase().includes(q))
        )
      : sessions;

    return [...filtered].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    });
  }, [sessions, sessionQuery]);

  const activeModuleMeta = useMemo(
    () => NAV_MODULES.find((m) => m.id === activeScreen) || NAV_MODULES[0],
    [activeScreen]
  );

  const ramUsedPercent = useMemo(() => {
    if (!telemetry.totalRamMb || telemetry.totalRamMb <= 0) return 45;
    const used = Math.max(0, telemetry.totalRamMb - telemetry.freeRamMb);
    return Math.min(100, Math.round((used / telemetry.totalRamMb) * 100));
  }, [telemetry]);

  const handleQuickTurboSweep = async () => {
    if (sweepingRam) return;
    setSweepingRam(true);
    try {
      if (VortexBridge?.runTurboSweep) {
        await VortexBridge.runTurboSweep();
      }
      await refreshNativeDiagnostics();
    } catch (_e) {
    } finally {
      setSweepingRam(false);
    }
  };

  const handlePcProbeAndSync = async () => {
    if (syncingPc) return;
    setSyncingPc(true);
    try {
      const online = await vortexWebAndPcBridge.probePcCompanion();
      if (online) {
        await vortexWebAndPcBridge.syncOutboxToPc();
      }
    } finally {
      setSyncingPc(false);
    }
  };

  const commitRename = (session: VortexChatSession) => {
    if (renameDraft.trim()) {
      renameSession(session.id, renameDraft.trim());
    }
    setRenamingId(null);
  };

  const isGhostActive =
    ghostLoop.status !== 'idle' &&
    ghostLoop.status !== 'completed' &&
    ghostLoop.status !== 'halted';

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <View style={styles.topLeft}>
          <TouchableOpacity
            onPress={() => setDrawerOpen(true)}
            style={[styles.menuBtn, { borderColor: VORTEX_PALETTE.borderStrong }]}
          >
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <Path
                d="M4 7h16M4 12h11M4 17h16"
                stroke={VORTEX_PALETTE.textPrimary}
                strokeWidth={2}
                strokeLinecap="round"
              />
            </Svg>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setActiveScreen('chat')}
            activeOpacity={0.85}
            style={styles.brandBlock}
          >
            <View style={styles.brandRow}>
              <Text
                style={[
                  styles.brandTitle,
                  {
                    fontFamily: fonts.display,
                    fontSize: getScaledFontSize(14, fontScale),
                  },
                ]}
              >
                {headerTitle || 'VORTEX'}
              </Text>
              <View style={[styles.betaBadge, { backgroundColor: accent.soft, borderColor: accent.border }]}>
                <Text style={[styles.betaGlyph, { color: accent.primary }]}>ẞ</Text>
              </View>
            </View>
            <Text
              numberOfLines={1}
              style={[
                styles.brandSub,
                { fontFamily: fonts.regular, fontSize: getScaledFontSize(11, fontScale) },
              ]}
            >
              {headerSubtitle ||
                `${activeModuleMeta.label} • ${
                  preferOfflineBrain || localModelLoaded ? 'Hybrid Local+Cloud' : 'Cloud Multi-Node'
                }`}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.topRight}>
          {isGhostActive ? (
            <TouchableOpacity
              onPress={() => setActiveScreen('ghost_loop')}
              style={[
                styles.ghostLivePill,
                { backgroundColor: VORTEX_PALETTE.warningSoft, borderColor: VORTEX_PALETTE.warning },
              ]}
            >
              <View style={[styles.liveDot, { backgroundColor: VORTEX_PALETTE.warning }]} />
              <Text style={[styles.pillLabel, { color: VORTEX_PALETTE.warning }]}>
                LOOP {ghostLoop.currentStep}/{ghostLoop.maxSteps}
              </Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            onPress={() => void updateOrbSettings({ enabled: !orbEnabled })}
            style={[
              styles.orbTogglePill,
              orbEnabled
                ? { backgroundColor: accent.soft, borderColor: accent.border }
                : {
                    backgroundColor: VORTEX_PALETTE.surfacePill,
                    borderColor: VORTEX_PALETTE.borderHairline,
                  },
            ]}
          >
            <View
              style={[
                styles.liveDot,
                {
                  backgroundColor: orbEnabled ? accent.primary : VORTEX_PALETTE.textMuted,
                },
              ]}
            />
            <Text
              style={[
                styles.pillLabel,
                { color: orbEnabled ? accent.primary : VORTEX_PALETTE.textSecondary },
              ]}
            >
              ORB
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => createNewSession()}
            style={[styles.newChatBtn, { borderColor: VORTEX_PALETTE.borderStrong }]}
          >
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
              <Path
                d="M12 5v14M5 12h14"
                stroke={VORTEX_PALETTE.textPrimary}
                strokeWidth={2.2}
                strokeLinecap="round"
              />
            </Svg>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.bodyContainer}>{children}</View>

      <Modal
        visible={modalVisible}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => setDrawerOpen(false)}
      >
        <View style={styles.drawerOverlay}>
          <Animated.View style={[styles.scrim, { opacity: backdropAnim }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setDrawerOpen(false)} />
          </Animated.View>

          <Animated.View
            style={[
              styles.drawerPanel,
              {
                width: DRAWER_WIDTH,
                borderRightColor: accent.border,
                transform: [{ translateX: slideAnim }],
              },
            ]}
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.drawerScrollContent}
            >
              <View style={styles.drawerHeader}>
                <View style={styles.drawerBrandRow}>
                  <View style={[styles.orbEmblem, { borderColor: accent.primary, backgroundColor: accent.soft }]}>
                    <Text style={[styles.orbEmblemText, { color: accent.primary, fontFamily: fonts.display }]}>
                      ẞ
                    </Text>
                  </View>
                  <View>
                    <Text style={[styles.drawerTitle, { fontFamily: fonts.display }]}>VORTEX</Text>
                    <Text style={styles.drawerSub}>AUTONOMOUS OS ENGINE</Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={() => createNewSession()}
                  style={[styles.drawerNewBtn, { backgroundColor: accent.soft, borderColor: accent.border }]}
                >
                  <Text style={[styles.drawerNewBtnText, { color: accent.primary }]}>+ NEW</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.telemetryCard}>
                <View style={styles.telemetryTopRow}>
                  <Text style={styles.telemetryStat}>
                    RAM {Math.round(telemetry.freeRamMb)}MB FREE ({ramUsedPercent}% USED)
                  </Text>
                  <TouchableOpacity
                    onPress={handleQuickTurboSweep}
                    style={[styles.sweepChip, { backgroundColor: accent.soft, borderColor: accent.border }]}
                  >
                    <Text style={[styles.sweepChipText, { color: accent.primary }]}>
                      {sweepingRam ? 'SWEEPING...' : 'TURBO SWEEP'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.ramTrack}>
                  <View
                    style={[
                      styles.ramFill,
                      {
                        width: `${ramUsedPercent}%`,
                        backgroundColor:
                          ramUsedPercent > 82 ? VORTEX_PALETTE.danger : accent.primary,
                      },
                    ]}
                  />
                </View>

                <View style={styles.telemetryBottomRow}>
                  <Text style={styles.telemetryMeta}>
                    BAT {telemetry.batteryPercent}%{telemetry.isCharging ? ' ⚡' : ''}
                  </Text>
                  <Text style={styles.telemetryMeta}>
                    DISK {Number(telemetry.freeStorageGb || 0).toFixed(1)} GB FREE
                  </Text>
                </View>
              </View>

              <View style={styles.pcSyncCard}>
                <View style={styles.pcSyncLeft}>
                  <View
                    style={[
                      styles.liveDot,
                      {
                        backgroundColor:
                          pcSync.status === 'connected'
                            ? VORTEX_PALETTE.success
                            : pcSync.status === 'probing'
                            ? VORTEX_PALETTE.warning
                            : VORTEX_PALETTE.textMuted,
                      },
                    ]}
                  />
                  <View>
                    <Text style={styles.pcSyncTitle}>
                      {pcSync.host}:{pcSync.port}
                    </Text>
                    <Text style={styles.pcSyncSub}>
                      {pcSync.status === 'connected'
                        ? 'PC Companion Linked'
                        : `Standby Offline • ${pcSync.pendingQueueCount} queued`}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={handlePcProbeAndSync}
                  style={[styles.sweepChip, { borderColor: VORTEX_PALETTE.borderStrong }]}
                >
                  <Text style={styles.pcSyncBtnText}>{syncingPc ? 'PROBING' : 'SYNC'}</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.sectionLabel}>AUTONOMOUS WORKSPACES</Text>
              <View style={styles.moduleGrid}>
                {NAV_MODULES.map((mod) => {
                  const selected = activeScreen === mod.id;
                  return (
                    <TouchableOpacity
                      key={mod.id}
                      onPress={() => setActiveScreen(mod.id)}
                      style={[
                        styles.moduleTile,
                        selected && {
                          backgroundColor: accent.soft,
                          borderColor: accent.border,
                        },
                      ]}
                    >
                      <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
                        <Path
                          d={mod.iconPath}
                          stroke={selected ? accent.primary : VORTEX_PALETTE.textSecondary}
                          strokeWidth={1.8}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </Svg>
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.moduleLabel,
                          {
                            fontFamily: fonts.bold,
                            color: selected ? accent.primary : VORTEX_PALETTE.textPrimary,
                          },
                        ]}
                      >
                        {mod.label}
                      </Text>
                      <Text numberOfLines={1} style={styles.moduleSub}>
                        {mod.sub}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.sectionLabel}>CONVERSATIONS & BRANCHES ({sessions.length})</Text>
              <View style={styles.searchBox}>
                <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                  <Circle
                    cx={11}
                    cy={11}
                    r={7}
                    stroke={VORTEX_PALETTE.textMuted}
                    strokeWidth={2}
                  />
                  <Path
                    d="M20 20l-3.5-3.5"
                    stroke={VORTEX_PALETTE.textMuted}
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                </Svg>
                <TextInput
                  value={sessionQuery}
                  onChangeText={setSessionQuery}
                  placeholder="Search chats or code..."
                  placeholderTextColor={VORTEX_PALETTE.textMuted}
                  style={styles.searchInput}
                />
              </View>

              <View style={styles.sessionList}>
                {sortedSessions.map((sess) => {
                  const isCurrent = sess.id === activeSessionId && activeScreen === 'chat';
                  const isRenaming = renamingId === sess.id;

                  return (
                    <View
                      key={sess.id}
                      style={[
                        styles.sessionRow,
                        isCurrent && {
                          backgroundColor: accent.soft,
                          borderColor: accent.border,
                        },
                      ]}
                    >
                      {isRenaming ? (
                        <View style={styles.renameRow}>
                          <TextInput
                            value={renameDraft}
                            onChangeText={setRenameDraft}
                            autoFocus
                            onSubmitEditing={() => commitRename(sess)}
                            style={styles.renameInput}
                          />
                          <TouchableOpacity
                            onPress={() => commitRename(sess)}
                            style={styles.sessionIconBtn}
                          >
                            <Text style={{ color: VORTEX_PALETTE.success, fontSize: 11, fontWeight: '700' }}>
                              OK
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <>
                          <TouchableOpacity
                            onPress={() => switchSession(sess.id)}
                            style={styles.sessionMainTap}
                          >
                            <View style={styles.sessionTitleRow}>
                              {sess.branchParentId ? (
                                <Text style={[styles.branchTag, { color: accent.primary }]}>⎇</Text>
                              ) : null}
                              <Text
                                numberOfLines={1}
                                style={[
                                  styles.sessionTitle,
                                  {
                                    fontFamily: fonts.regular,
                                    color: isCurrent
                                      ? VORTEX_PALETTE.textPrimary
                                      : VORTEX_PALETTE.textSecondary,
                                  },
                                ]}
                              >
                                {sess.title}
                              </Text>
                            </View>
                            <Text style={styles.sessionMeta}>
                              {sess.messages.length} msgs{sess.pinned ? ' • Pinned' : ''}
                            </Text>
                          </TouchableOpacity>

                          <View style={styles.sessionActions}>
                            <TouchableOpacity
                              onPress={() => togglePinSession(sess.id)}
                              style={styles.sessionIconBtn}
                            >
                              <Text
                                style={{
                                  color: sess.pinned ? accent.primary : VORTEX_PALETTE.textMuted,
                                  fontSize: 11,
                                }}
                              >
                                ★
                              </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              onPress={() => {
                                setRenamingId(sess.id);
                                setRenameDraft(sess.title);
                              }}
                              style={styles.sessionIconBtn}
                            >
                              <Text style={{ color: VORTEX_PALETTE.textMuted, fontSize: 11 }}>✎</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              onPress={() => deleteSession(sess.id)}
                              style={styles.sessionIconBtn}
                            >
                              <Text style={{ color: VORTEX_PALETTE.danger, fontSize: 11 }}>✕</Text>
                            </TouchableOpacity>
                          </View>
                        </>
                      )}
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: VORTEX_PALETTE.oledBlack,
  },
  topBar: {
    height: VORTEX_LAYOUT.headerHeight,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: VORTEX_PALETTE.surfaceBase,
    borderBottomWidth: 1,
    borderBottomColor: VORTEX_PALETTE.borderHairline,
  },
  topLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  menuBtn: {
    width: 36,
    height: 36,
    borderRadius: 11,
    borderWidth: 1,
    backgroundColor: VORTEX_PALETTE.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandBlock: {
    flex: 1,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  brandTitle: {
    color: VORTEX_PALETTE.textPrimary,
    letterSpacing: 1.1,
  },
  betaBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    borderWidth: 1,
  },
  betaGlyph: {
    fontSize: 11,
    fontWeight: '800',
  },
  brandSub: {
    color: VORTEX_PALETTE.textSecondary,
    marginTop: 1,
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  ghostLivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: VORTEX_LAYOUT.radiusPill,
    borderWidth: 1,
  },
  orbTogglePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: VORTEX_LAYOUT.radiusPill,
    borderWidth: 1,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pillLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  newChatBtn: {
    width: 34,
    height: 34,
    borderRadius: 11,
    borderWidth: 1,
    backgroundColor: VORTEX_PALETTE.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bodyContainer: {
    flex: 1,
  },
  drawerOverlay: {
    flex: 1,
    flexDirection: 'row',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: VORTEX_PALETTE.scrim,
  },
  drawerPanel: {
    height: '100%',
    backgroundColor: VORTEX_PALETTE.glassSheet,
    borderRightWidth: 1,
    paddingTop: 42,
  },
  drawerScrollContent: {
    paddingHorizontal: 14,
    paddingBottom: 34,
    gap: 12,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  drawerBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  orbEmblem: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbEmblemText: {
    fontSize: 16,
  },
  drawerTitle: {
    color: VORTEX_PALETTE.textPrimary,
    fontSize: 15,
    letterSpacing: 1.2,
  },
  drawerSub: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  drawerNewBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  drawerNewBtnText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  telemetryCard: {
    backgroundColor: VORTEX_PALETTE.surfaceCard,
    borderRadius: VORTEX_LAYOUT.radiusMd,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderHairline,
    padding: 10,
    gap: 7,
  },
  telemetryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  telemetryStat: {
    color: VORTEX_PALETTE.textPrimary,
    fontSize: 10,
    fontWeight: '700',
  },
  sweepChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  sweepChipText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  ramTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: VORTEX_PALETTE.surfacePill,
    overflow: 'hidden',
  },
  ramFill: {
    height: '100%',
    borderRadius: 3,
  },
  telemetryBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  telemetryMeta: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  pcSyncCard: {
    backgroundColor: VORTEX_PALETTE.surfaceCard,
    borderRadius: VORTEX_LAYOUT.radiusMd,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderHairline,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pcSyncLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pcSyncTitle: {
    color: VORTEX_PALETTE.textPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
  pcSyncSub: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 10,
  },
  pcSyncBtnText: {
    color: VORTEX_PALETTE.textSecondary,
    fontSize: 9,
    fontWeight: '800',
  },
  sectionLabel: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.9,
    marginTop: 2,
  },
  moduleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  moduleTile: {
    width: '48.5%',
    backgroundColor: VORTEX_PALETTE.surfaceCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderHairline,
    padding: 9,
    gap: 3,
  },
  moduleLabel: {
    fontSize: 12,
    marginTop: 2,
  },
  moduleSub: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 10,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: VORTEX_PALETTE.surfaceInput,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderHairline,
    paddingHorizontal: 10,
    height: 36,
  },
  searchInput: {
    flex: 1,
    color: VORTEX_PALETTE.textPrimary,
    fontSize: 12,
    paddingVertical: 0,
  },
  sessionList: {
    gap: 6,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: VORTEX_PALETTE.surfaceCard,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderHairline,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  sessionMainTap: {
    flex: 1,
    paddingRight: 6,
  },
  sessionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  branchTag: {
    fontSize: 12,
    fontWeight: '800',
  },
  sessionTitle: {
    fontSize: 12.5,
    flexShrink: 1,
  },
  sessionMeta: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 10,
    marginTop: 2,
  },
  sessionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sessionIconBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  renameRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  renameInput: {
    flex: 1,
    color: VORTEX_PALETTE.textPrimary,
    fontSize: 12,
    backgroundColor: VORTEX_PALETTE.surfaceInput,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
});
               
