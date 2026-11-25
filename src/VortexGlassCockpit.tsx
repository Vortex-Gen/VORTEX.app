import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  NativeModules,
  PermissionsAndroid,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  ApiKeySlot,
  ApiProvider,
  deleteMemoryById,
  getProactiveHabitInsight,
  getRecentMemories,
  importBulkApiKeys,
  listApiKeyPool,
  MemoryItem,
  rememberFact,
} from './vortexMemoryEngine';
import {
  activateTurboBoost,
  cleanTargetAppCache,
  getLiveSystemTelemetry,
  runAutonomousDeepCleaner,
  SystemTelemetry,
} from './vortexSystemOptimizer';
import {
  AppLockRecord,
  autoFillCredentialOnScreen,
  controlTorch,
  CredentialRecord,
  executeDevicePowerAction,
  hasMasterVaultPin,
  isPrivacyShieldActive,
  listSavedAppLocks,
  listVaultCredentials,
  openAndAutoUnlockApp,
  saveAppLockProfile,
  saveCredential,
  setMasterVaultPin,
  setPrivacyShield,
  startOneTimeAppLockLearning,
  verifyMasterVaultPin,
} from './vortexProModules';
import { bootVortexProCore, dispatchVortexProCommand } from './vortexProRouter';

const { VortexBridge } = NativeModules;

// Golden Ratio (phi = 1.6180339887) Mathematical Constants
const PHI = 1.6180339887;
const CORE_OUTER = 132;
const CORE_MID = Math.round(CORE_OUTER / PHI); // ~82
const CORE_INNER = Math.round(CORE_MID / PHI); // ~51

// Flagship Dark Mode Brand Palette (Google Material Dark x Fluent Obsidian)
const C = {
  bg: '#080A0F',
  surface: '#0F131C',
  surfaceElevated: '#151B27',
  surfacePressed: '#1C2434',
  border: 'rgba(255, 255, 255, 0.08)',
  borderStrong: 'rgba(255, 255, 255, 0.14)',
  accent: '#38BDF8', // Precision Cyan-Blue
  accentSoft: 'rgba(56, 189, 248, 0.12)',
  indigo: '#818CF8',
  emerald: '#34D399',
  emeraldSoft: 'rgba(52, 211, 153, 0.12)',
  amber: '#FBBF24',
  danger: '#F87171',
  textPrimary: '#F1F5F9',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
};

type NavTab = 'CORE' | 'SYSTEM' | 'VAULT' | 'MEMORY';

interface ConsoleEntry {
  id: string;
  role: 'USER' | 'VORTEX';
  tag: string;
  text: string;
  code?: string;
  ts: string;
}

// ============================================================================
// PURE GEOMETRIC VECTOR PRIMITIVES (Zero Emojis)
// ============================================================================

const GeoIconCode: React.FC<{ color?: string }> = ({ color = C.accent }) => (
  <View style={geoStyles.iconBox}>
    <View style={[geoStyles.bracketLeft, { borderColor: color }]} />
    <View style={[geoStyles.slashLine, { backgroundColor: color }]} />
    <View style={[geoStyles.bracketRight, { borderColor: color }]} />
  </View>
);

const GeoIconVision: React.FC<{ color?: string }> = ({ color = C.indigo }) => (
  <View style={geoStyles.iconBox}>
    <View style={[geoStyles.visionFrame, { borderColor: color }]}>
      <View style={[geoStyles.visionPupil, { backgroundColor: color }]} />
    </View>
  </View>
);

const GeoIconClean: React.FC<{ color?: string }> = ({ color = C.emerald }) => (
  <View style={geoStyles.iconBox}>
    <View style={[geoStyles.diamondOuter, { borderColor: color }]}>
      <View style={[geoStyles.diamondCore, { backgroundColor: color }]} />
    </View>
  </View>
);

const GeoIconSearch: React.FC<{ color?: string }> = ({ color = C.accent }) => (
  <View style={geoStyles.iconBox}>
    <View style={[geoStyles.searchLens, { borderColor: color }]} />
    <View style={[geoStyles.searchStem, { backgroundColor: color }]} />
  </View>
);

const GeoIconPower: React.FC<{ color?: string }> = ({ color = C.danger }) => (
  <View style={geoStyles.iconBox}>
    <View style={[geoStyles.powerRing, { borderColor: color }]} />
    <View style={[geoStyles.powerAxis, { backgroundColor: color }]} />
  </View>
);

const GeoIconVault: React.FC<{ color?: string }> = ({ color = C.amber }) => (
  <View style={geoStyles.iconBox}>
    <View style={[geoStyles.vaultBody, { borderColor: color }]}>
      <View style={[geoStyles.vaultHole, { backgroundColor: color }]} />
    </View>
  </View>
);

// ============================================================================
// BRAND-GRADE TACTILE ACTION BUTTON
// ============================================================================

interface BrandActionProps {
  title: string;
  subtitle: string;
  badge: string;
  icon: React.ReactNode;
  onPress: () => void;
  fullWidth?: boolean;
}

const BrandActionButton: React.FC<BrandActionProps> = ({
  title,
  subtitle,
  badge,
  icon,
  onPress,
  fullWidth = false,
}) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [
      styles.actionBtn,
      fullWidth ? styles.actionBtnFull : styles.actionBtnHalf,
      pressed && styles.actionBtnPressed,
    ]}
  >
    <View style={styles.actionTopRow}>
      <View style={styles.actionIconWrap}>{icon}</View>
      <Text style={styles.actionBadge}>{badge}</Text>
    </View>
    <Text style={styles.actionTitle} numberOfLines={1}>
      {title}
    </Text>
    <Text style={styles.actionSub} numberOfLines={1}>
      {subtitle}
    </Text>
  </Pressable>
);

// ============================================================================
// MAIN FLAGSHIP COCKPIT
// ============================================================================

export const VortexGlassCockpit: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavTab>('CORE');
  const [commandInput, setCommandInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [habitBanner, setHabitBanner] = useState('≡ Initializing neural telemetry...');

  const [telemetry, setTelemetry] = useState<SystemTelemetry>({
    freeRamMb: 0,
    totalRamMb: 0,
    ramUsedPercent: 0,
    freeStorageGb: 0,
    totalStorageGb: 0,
    storageUsedPercent: 0,
    efficiencyIndex: 0,
  });

  const [consoleFeed, setConsoleFeed] = useState<ConsoleEntry[]>([
    {
      id: 'boot-1',
      role: 'VORTEX',
      tag: 'SYSTEM_READY',
      text: 'Vortex ẞ Neural OS online. Say "Vortex" anywhere or select a module below.',
      ts: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  // System Cleaner Page State
  const [targetCleanApp, setTargetCleanApp] = useState('Instagram');
  const [cleanerLog, setCleanerLog] = useState('≡ Ready for 3-layer storage sweep or targeted app cache purge.');

  // Vault Page State
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  const [hasPinConfigured, setHasPinConfigured] = useState(false);
  const [pinEntry, setPinEntry] = useState('');
  const [privacyShield, setPrivacyShieldState] = useState(isPrivacyShieldActive());
  const [appLocks, setAppLocks] = useState<AppLockRecord[]>([]);
  const [credentials, setCredentials] = useState<CredentialRecord[]>([]);
  const [lockAppInput, setLockAppInput] = useState('Instagram');
  const [lockType, setLockType] = useState<'pin' | 'pattern'>('pin');
  const [lockSecretInput, setLockSecretInput] = useState('');
  const [credService, setCredService] = useState('');
  const [credUser, setCredUser] = useState('');
  const [credPass, setCredPass] = useState('');
  const [vaultStatus, setVaultStatus] = useState('≡ Encrypted local vault ready.');

  // Memory & API Pool Page State
  const [keyProvider, setKeyProvider] = useState<ApiProvider>('gemini');
  const [bulkKeyInput, setBulkKeyInput] = useState('');
  const [keyPool, setKeyPool] = useState<ApiKeySlot[]>([]);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [newFactInput, setNewFactInput] = useState('');

  // Harmonic Sine Animation for Neural Core
  const phaseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(phaseAnim, {
        toValue: 1,
        duration: isProcessing ? 1400 : 3600,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [isProcessing, phaseAnim]);

  const outerScale = phaseAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, isProcessing ? 1.09 : 1.04, 1],
  });

  const innerOpacity = phaseAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.55, 1, 0.55],
  });

  const appendConsole = useCallback(
    (role: 'USER' | 'VORTEX', tag: string, text: string, code?: string) => {
      setConsoleFeed((prev) => [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          role,
          tag,
          text,
          code,
          ts: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
        ...prev.slice(0, 29),
      ]);
    },
    []
  );

  const refreshAllData = useCallback(async () => {
    const [tel, insight, pinExists, locks, creds, keys, mems] = await Promise.all([
      getLiveSystemTelemetry(),
      getProactiveHabitInsight(),
      hasMasterVaultPin(),
      listSavedAppLocks(),
      listVaultCredentials(),
      listApiKeyPool(),
      getRecentMemories(30),
    ]);
    setTelemetry(tel);
    setHabitBanner(insight);
    setHasPinConfigured(pinExists);
    if (!pinExists) setVaultUnlocked(true);
    setAppLocks(locks);
    setCredentials(creds);
    setKeyPool(keys);
    setMemories(mems);
  }, []);

  useEffect(() => {
    const setup = async () => {
      if (Platform.OS === 'android') {
        try {
          await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
            PermissionsAndroid.PERMISSIONS.CAMERA,
          ]);
        } catch {}
      }
      await bootVortexProCore((cmd, res) => {
        appendConsole('USER', 'WAKEWORD', cmd);
        appendConsole('VORTEX', res.moduleTag, res.response, res.generatedCode);
      });
      await refreshAllData();
    };
    setup();
  }, [appendConsole, refreshAllData]);

  const handleExecuteCommand = async (overrideCmd?: string) => {
    const query = (overrideCmd ?? commandInput).trim();
    if (!query || isProcessing) return;

    if (!overrideCmd) setCommandInput('');
    setIsProcessing(true);
    appendConsole('USER', 'COMMAND', query);

    try {
      const res = await dispatchVortexProCommand(query);
      appendConsole('VORTEX', res.moduleTag, res.response, res.generatedCode);
      await refreshAllData();
    } catch (err: any) {
      appendConsole('VORTEX', 'FAULT', `⊗ ${err?.message || 'Execution interrupted'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // ==========================================================================
  // PAGE 1: CORE COMMAND CONSOLE
  // ==========================================================================
  const renderCorePage = () => (
    <ScrollView
      style={styles.pageScroll}
      contentContainerStyle={styles.pageContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Harmonic Golden Ratio Neural Core */}
      <View style={styles.coreStage}>
        <Animated.View
          style={[
            styles.coreRingOuter,
            {
              transform: [{ scale: outerScale }],
              borderColor: isProcessing ? C.accent : C.borderStrong,
            },
          ]}
        >
          <View style={styles.coreRingMid}>
            <Animated.View style={[styles.coreRingInner, { opacity: innerOpacity }]}>
              <Text style={styles.coreGlyph}>ẞ</Text>
            </Animated.View>
          </View>
        </Animated.View>

        <View style={styles.coreMetaBlock}>
          <View style={styles.statusPillRow}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: isProcessing ? C.accent : C.emerald },
              ]}
            />
            <Text style={styles.statusPillText}>
              {isProcessing ? 'NEURAL ENGINE EXECUTING' : '24/7 WAKEWORD & OVERLAY ACTIVE'}
            </Text>
          </View>
          <Text style={styles.habitText} numberOfLines={2}>
            {habitBanner}
          </Text>
        </View>
      </View>

      {/* Precision Telemetry Bar (Tabular Numerals) */}
      <View style={styles.telemetryBar}>
        <View style={styles.telemetryCell}>
          <Text style={styles.telemetryLabel}>FREE RAM</Text>
          <Text style={styles.telemetryValue}>{telemetry.freeRamMb} MB</Text>
        </View>
        <View style={styles.telemetryDivider} />
        <View style={styles.telemetryCell}>
          <Text style={styles.telemetryLabel}>STORAGE</Text>
          <Text style={styles.telemetryValue}>{telemetry.freeStorageGb} GB</Text>
        </View>
        <View style={styles.telemetryDivider} />
        <View style={styles.telemetryCell}>
          <Text style={styles.telemetryLabel}>PHI INDEX</Text>
          <Text style={[styles.telemetryValue, { color: C.accent }]}>
            {telemetry.efficiencyIndex}%
          </Text>
        </View>
        <View style={styles.telemetryDivider} />
        <View style={styles.telemetryCell}>
          <Text style={styles.telemetryLabel}>API POOL</Text>
          <Text style={[styles.telemetryValue, { color: C.emerald }]}>{keyPool.length}</Text>
        </View>
      </View>

      {/* Brand-Grade 2-Column Command Grid (No Flashcards) */}
      <Text style={styles.sectionHeader}>AUTONOMOUS MODULES</Text>
      <View style={styles.actionGrid}>
        <BrandActionButton
          title="Screen Code Solver"
          subtitle="Read Q & inject code"
          badge="< / >"
          icon={<GeoIconCode color={C.accent} />}
          onPress={() => handleExecuteCommand('Solve the coding question on screen and inject code')}
        />
        <BrandActionButton
          title="Live Screen Vision"
          subtitle="Silent screen & image read"
          badge="SCAN"
          icon={<GeoIconVision color={C.indigo} />}
          onPress={() => handleExecuteCommand('Analyze what is currently on my screen')}
        />
        <BrandActionButton
          title="Deep Cache Clean"
          subtitle="3-layer junk & RAM purge"
          badge="SWEEP"
          icon={<GeoIconClean color={C.emerald} />}
          onPress={() => handleExecuteCommand('Clean phone cache and optimize storage')}
        />
        <BrandActionButton
          title="Live Web Search"
          subtitle="Real-time grounded query"
          badge="LIVE"
          icon={<GeoIconSearch color={C.accent} />}
          onPress={() => handleExecuteCommand('Search latest AI and tech headlines today')}
        />
        <BrandActionButton
          title="Auto-Unlock Vault"
          subtitle="App locks & passwords"
          badge={`${appLocks.length} LOCKS`}
          icon={<GeoIconVault color={C.amber} />}
          onPress={() => setActiveTab('VAULT')}
        />
        <BrandActionButton
          title="Lock Device"
          subtitle="Instant hardware lock"
          badge="LOCK"
          icon={<GeoIconPower color={C.danger} />}
          onPress={() => handleExecuteCommand('Lock phone now')}
        />
      </View>

      {/* Execution Stream */}
      <Text style={styles.sectionHeader}>EXECUTION STREAM</Text>
      <View style={styles.streamContainer}>
        {consoleFeed.map((item) => (
          <View
            key={item.id}
            style={[
              styles.streamRow,
              item.role === 'USER' ? styles.streamRowUser : styles.streamRowVortex,
            ]}
          >
            <View style={styles.streamMeta}>
              <Text style={styles.streamTag}>
                {item.role}  ·  {item.tag}
              </Text>
              <Text style={styles.streamTime}>{item.ts}</Text>
            </View>
            <Text style={styles.streamText}>{item.text}</Text>
            {item.code ? (
              <View style={styles.codeBlock}>
                <Text style={styles.codeText}>{item.code}</Text>
              </View>
            ) : null}
          </View>
        ))}
      </View>
    </ScrollView>
  );

  // ==========================================================================
  // PAGE 2: SYSTEM OPTIMIZER & HARDWARE CONTROL
  // ==========================================================================
  const renderSystemPage = () => (
    <ScrollView
      style={styles.pageScroll}
      contentContainerStyle={styles.pageContent}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.pageTitle}>System Optimizer</Text>
      <Text style={styles.pageSubtitle}>
        3-layer storage sweep, targeted app cache purge, and hardware state control.
      </Text>

      {/* Precision Metric Panel */}
      <View style={styles.panel}>
        <View style={styles.metricSplit}>
          <View style={styles.metricBlock}>
            <Text style={styles.telemetryLabel}>MEMORY AVAILABLE</Text>
            <Text style={styles.metricBig}>
              {telemetry.freeRamMb} <Text style={styles.metricUnit}>/ {telemetry.totalRamMb} MB</Text>
            </Text>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${100 - telemetry.ramUsedPercent}%`, backgroundColor: C.accent },
                ]}
              />
            </View>
          </View>

          <View style={styles.metricBlock}>
            <Text style={styles.telemetryLabel}>STORAGE AVAILABLE</Text>
            <Text style={styles.metricBig}>
              {telemetry.freeStorageGb}{' '}
              <Text style={styles.metricUnit}>/ {telemetry.totalStorageGb} GB</Text>
            </Text>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${100 - telemetry.storageUsedPercent}%`, backgroundColor: C.emerald },
                ]}
              />
            </View>
          </View>
        </View>

        <View style={styles.dualBtnRow}>
          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed]}
            onPress={async () => {
              setCleanerLog('◈ Running 3-layer deep clean...');
              const rep = await runAutonomousDeepCleaner();
              setCleanerLog(rep.summary);
              await refreshAllData();
            }}
          >
            <Text style={styles.primaryBtnText}>RUN DEEP CLEAN</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.btnPressed]}
            onPress={async () => {
              const msg = await activateTurboBoost();
              setCleanerLog(msg);
              await refreshAllData();
            }}
          >
            <Text style={styles.secondaryBtnText}>TURBO RAM BOOST</Text>
          </Pressable>
        </View>

        <Text style={styles.statusNote}>{cleanerLog}</Text>
      </View>

      {/* Targeted App Cache Sweeper */}
      <Text style={styles.sectionHeader}>TARGETED APP CACHE PURGE (PRESERVES LOGIN)</Text>
      <View style={styles.panel}>
        <View style={styles.chipRow}>
          {['Instagram', 'WhatsApp', 'Chrome', 'YouTube'].map((app) => (
            <Pressable
              key={app}
              onPress={() => setTargetCleanApp(app)}
              style={[styles.chip, targetCleanApp === app && styles.chipActive]}
            >
              <Text style={[styles.chipText, targetCleanApp === app && styles.chipTextActive]}>
                {app}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.inlineInputRow}>
          <TextInput
            value={targetCleanApp}
            onChangeText={setTargetCleanApp}
            placeholder="App name (e.g. Instagram)"
            placeholderTextColor={C.textMuted}
            style={styles.inputFlex}
          />
          <Pressable
            style={({ pressed }) => [styles.primaryBtnCompact, pressed && styles.btnPressed]}
            onPress={async () => {
              const msg = await cleanTargetAppCache(targetCleanApp);
              setCleanerLog(msg);
            }}
          >
            <Text style={styles.primaryBtnText}>PURGE CACHE</Text>
          </Pressable>
        </View>
      </View>

      {/* Device Power & Hardware Matrix */}
      <Text style={styles.sectionHeader}>HARDWARE & POWER MATRIX</Text>
      <View style={styles.actionGrid}>
        <BrandActionButton
          title="Lock Screen"
          subtitle="GLOBAL_ACTION_LOCK"
          badge="LOCK"
          icon={<GeoIconPower color={C.danger} />}
          onPress={async () => setCleanerLog(await executeDevicePowerAction('lock'))}
        />
        <BrandActionButton
          title="Power Menu"
          subtitle="Shutdown / Restart UI"
          badge="POWER"
          icon={<GeoIconPower color={C.amber} />}
          onPress={async () => setCleanerLog(await executeDevicePowerAction('power_menu'))}
        />
        <BrandActionButton
          title="Auto Restart"
          subtitle="Open menu & tap Restart"
          badge="REBOOT"
          icon={<GeoIconClean color={C.accent} />}
          onPress={async () => setCleanerLog(await executeDevicePowerAction('restart'))}
        />
        <BrandActionButton
          title={torchOn ? 'Torch: ON' : 'Torch: OFF'}
          subtitle="Hardware LED control"
          badge="LED"
          icon={<GeoIconVision color={torchOn ? C.amber : C.textSecondary} />}
          onPress={async () => {
            const next = !torchOn;
            setTorchOn(next);
            setCleanerLog(await controlTorch(next));
          }}
        />
        <BrandActionButton
          title="Split Screen"
          subtitle="Dual window mode"
          badge="SPLIT"
          icon={<GeoIconCode color={C.indigo} />}
          onPress={async () => setCleanerLog(await executeDevicePowerAction('split_screen'))}
        />
        <BrandActionButton
          title="Wake Display"
          subtitle="Acquire screen wake lock"
          badge="WAKE"
          icon={<GeoIconSearch color={C.emerald} />}
          onPress={async () => setCleanerLog(await executeDevicePowerAction('wake'))}
        />
      </View>
    </ScrollView>
  );

  // ==========================================================================
  // PAGE 3: VAULT (SELF-LEARNING APP LOCK & CREDENTIALS)
  // ==========================================================================
  const renderVaultPage = () => {
    if (!vaultUnlocked) {
      return (
        <View style={styles.vaultGateWrap}>
          <View style={styles.panel}>
            <Text style={styles.pageTitle}>Encrypted Vault Locked</Text>
            <Text style={styles.pageSubtitle}>
              Enter your Master-PIN to access saved App-Lock sequences and credentials.
            </Text>
            <TextInput
              value={pinEntry}
              onChangeText={setPinEntry}
              secureTextEntry
              keyboardType="number-pad"
              placeholder="Enter Master-PIN"
              placeholderTextColor={C.textMuted}
              style={styles.inputFull}
            />
            <Pressable
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed]}
              onPress={async () => {
                const ok = await verifyMasterVaultPin(pinEntry);
                if (ok) {
                  setVaultUnlocked(true);
                  setPinEntry('');
                } else {
                  setVaultStatus('⊗ Invalid Master-PIN.');
                }
              }}
            >
              <Text style={styles.primaryBtnText}>UNLOCK VAULT</Text>
            </Pressable>
            <Text style={styles.statusNote}>{vaultStatus}</Text>
          </View>
        </View>
      );
    }

    return (
      <ScrollView
        style={styles.pageScroll}
        contentContainerStyle={styles.pageContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerSplit}>
          <View>
            <Text style={styles.pageTitle}>Security & App-Lock Vault</Text>
            <Text style={styles.pageSubtitle}>
              Learn Instagram or any app lock once—Vortex unlocks it automatically thereafter.
            </Text>
          </View>
          <Pressable
            onPress={() => {
              const next = !privacyShield;
              setPrivacyShieldState(next);
              setVaultStatus(setPrivacyShield(next));
            }}
            style={[styles.shieldPill, privacyShield && styles.shieldPillActive]}
          >
            <Text style={[styles.shieldPillText, privacyShield && { color: C.danger }]}>
              {privacyShield ? 'SHIELD: ON' : 'SHIELD: OFF'}
            </Text>
          </Pressable>
        </View>

        {/* One-Time App Lock Learner */}
        <Text style={styles.sectionHeader}>ONE-TIME APP LOCK LEARNER</Text>
        <View style={styles.panel}>
          <View style={styles.chipRow}>
            {['Instagram', 'WhatsApp', 'Gallery', 'Settings'].map((app) => (
              <Pressable
                key={app}
                onPress={() => setLockAppInput(app)}
                style={[styles.chip, lockAppInput === app && styles.chipActive]}
              >
                <Text style={[styles.chipText, lockAppInput === app && styles.chipTextActive]}>
                  {app}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.inlineInputRow}>
            <TextInput
              value={lockAppInput}
              onChangeText={setLockAppInput}
              placeholder="App name (e.g. Instagram)"
              placeholderTextColor={C.textMuted}
              style={styles.inputFlex}
            />
            <Pressable
              style={({ pressed }) => [styles.primaryBtnCompact, pressed && styles.btnPressed]}
              onPress={async () => {
                const msg = await startOneTimeAppLockLearning(lockAppInput);
                setVaultStatus(msg);
                await refreshAllData();
              }}
            >
              <Text style={styles.primaryBtnText}>LEARN ONCE</Text>
            </Pressable>
          </View>

          {/* Manual PIN / Pattern Fallback */}
          <View style={styles.dividerLine} />
          <Text style={styles.subLabel}>
            OR REGISTER PIN / PATTERN COORDINATES DIRECTLY
          </Text>
          <View style={styles.chipRow}>
            <Pressable
              onPress={() => setLockType('pin')}
              style={[styles.chip, lockType === 'pin' && styles.chipActive]}
            >
              <Text style={[styles.chipText, lockType === 'pin' && styles.chipTextActive]}>
                PIN DIGITS
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setLockType('pattern')}
              style={[styles.chip, lockType === 'pattern' && styles.chipActive]}
            >
              <Text style={[styles.chipText, lockType === 'pattern' && styles.chipTextActive]}>
                3x3 PATTERN
              </Text>
            </Pressable>
          </View>

          <View style={styles.inlineInputRow}>
            <TextInput
              value={lockSecretInput}
              onChangeText={setLockSecretInput}
              placeholder={
                lockType === 'pin'
                  ? 'PIN digits (e.g. 2580)'
                  : 'Normalized coords (e.g. 0.25,0.45;0.5,0.45;0.75,0.45)'
              }
              placeholderTextColor={C.textMuted}
              style={styles.inputFlex}
            />
            <Pressable
              style={({ pressed }) => [styles.secondaryBtnCompact, pressed && styles.btnPressed]}
              onPress={async () => {
                const ok = await saveAppLockProfile(lockAppInput, lockType, lockSecretInput);
                setVaultStatus(
                  ok ? `⊕ Saved ${lockAppInput} ${lockType} lock.` : '⊗ Enter valid lock sequence.'
                );
                setLockSecretInput('');
                await refreshAllData();
              }}
            >
              <Text style={styles.secondaryBtnText}>SAVE</Text>
            </Pressable>
          </View>

          {appLocks.map((item) => (
            <View key={item.id} style={styles.listRow}>
              <View>
                <Text style={styles.listTitle}>{item.app_label}</Text>
                <Text style={styles.listMeta}>
                  {item.package_name}  ·  {item.lock_type.toUpperCase()}
                </Text>
              </View>
              <Pressable
                style={styles.miniActionBtn}
                onPress={async () => {
                  const msg = await openAndAutoUnlockApp(item.package_name);
                  setVaultStatus(msg);
                }}
              >
                <Text style={styles.miniActionText}>TEST UNLOCK</Text>
              </Pressable>
            </View>
          ))}
        </View>

        {/* Password & Credential Vault */}
        <Text style={styles.sectionHeader}>ENCRYPTED PASSWORD VAULT</Text>
        <View style={styles.panel}>
          <TextInput
            value={credService}
            onChangeText={setCredService}
            placeholder="Service / App (e.g. instagram, github)"
            placeholderTextColor={C.textMuted}
            style={styles.inputFull}
          />
          <TextInput
            value={credUser}
            onChangeText={setCredUser}
            placeholder="Username or Email"
            placeholderTextColor={C.textMuted}
            style={styles.inputFull}
          />
          <TextInput
            value={credPass}
            onChangeText={setCredPass}
            secureTextEntry
            placeholder="Password"
            placeholderTextColor={C.textMuted}
            style={styles.inputFull}
          />
          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed]}
            onPress={async () => {
              const ok = await saveCredential(credService, credUser, credPass);
              if (ok) {
                setVaultStatus(`⊕ Encrypted credential stored for ${credService}.`);
                setCredService('');
                setCredUser('');
                setCredPass('');
                await refreshAllData();
              }
            }}
          >
            <Text style={styles.primaryBtnText}>STORE CREDENTIAL</Text>
          </Pressable>

          {credentials.map((c) => (
            <View key={c.id} style={styles.listRow}>
              <View>
                <Text style={styles.listTitle}>{c.service.toUpperCase()}</Text>
                <Text style={styles.listMeta}>{c.username}  ·  ••••••••</Text>
              </View>
              <Pressable
                style={styles.miniActionBtn}
                onPress={async () => {
                  const msg = await autoFillCredentialOnScreen(c.service);
                  setVaultStatus(msg);
                }}
              >
                <Text style={styles.miniActionText}>AUTO-FILL</Text>
              </Pressable>
            </View>
          ))}

          {/* Master PIN Setup */}
          {!hasPinConfigured ? (
            <View style={{ marginTop: 14 }}>
              <Text style={styles.subLabel}>SET MASTER VAULT PIN (4+ DIGITS)</Text>
              <View style={styles.inlineInputRow}>
                <TextInput
                  value={pinEntry}
                  onChangeText={setPinEntry}
                  keyboardType="number-pad"
                  secureTextEntry
                  placeholder="New Master-PIN"
                  placeholderTextColor={C.textMuted}
                  style={styles.inputFlex}
                />
                <Pressable
                  style={styles.secondaryBtnCompact}
                  onPress={async () => {
                    const ok = await setMasterVaultPin(pinEntry);
                    if (ok) {
                      setPinEntry('');
                      setVaultStatus('⊕ Master-PIN active.');
                      await refreshAllData();
                    }
                  }}
                >
                  <Text style={styles.secondaryBtnText}>SET PIN</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          <Text style={styles.statusNote}>{vaultStatus}</Text>
        </View>
      </ScrollView>
    );
  };

  // ==========================================================================
  // PAGE 4: NEURAL MEMORY & MULTI-KEY API ROTATOR
  // ==========================================================================
  const renderMemoryPage = () => (
    <ScrollView
      style={styles.pageScroll}
      contentContainerStyle={styles.pageContent}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.pageTitle}>Neural Memory & API Pool</Text>
      <Text style={styles.pageSubtitle}>
        Persistent SQLite episodic memory and zero-downtime multi-key auto-rotator.
      </Text>

      {/* Multi-Key Rotator */}
      <Text style={styles.sectionHeader}>API KEY AUTO-ROTATOR POOL</Text>
      <View style={styles.panel}>
        <View style={styles.chipRow}>
          {(['gemini', 'elevenlabs'] as ApiProvider[]).map((prov) => (
            <Pressable
              key={prov}
              onPress={() => setKeyProvider(prov)}
              style={[styles.chip, keyProvider === prov && styles.chipActive]}
            >
              <Text style={[styles.chipText, keyProvider === prov && styles.chipTextActive]}>
                {prov.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>

        <TextInput
          value={bulkKeyInput}
          onChangeText={setBulkKeyInput}
          multiline
          placeholder={`Paste one or multiple ${keyProvider.toUpperCase()} API keys (separated by newline or comma)`}
          placeholderTextColor={C.textMuted}
          style={[styles.inputFull, { minHeight: 72, textAlignVertical: 'top' }]}
        />

        <Pressable
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed]}
          onPress={async () => {
            const count = await importBulkApiKeys(keyProvider, bulkKeyInput);
            setBulkKeyInput('');
            appendConsole('VORTEX', 'KEY_POOL', `⊕ Imported ${count} ${keyProvider} keys into rotator.`);
            await refreshAllData();
          }}
        >
          <Text style={styles.primaryBtnText}>IMPORT TO ROTATOR POOL</Text>
        </Pressable>

        {keyPool.map((k) => (
          <View key={k.id} style={styles.listRow}>
            <View>
              <Text style={styles.listTitle}>
                {k.provider.toUpperCase()}  ·  ••••{k.api_key.slice(-5)}
              </Text>
              <Text style={styles.listMeta}>
                {k.label}  ·  Fails: {k.fail_count}
              </Text>
            </View>
            <Text
              style={[
                styles.statusBadge,
                { color: k.status === 'ACTIVE' ? C.emerald : C.amber },
              ]}
            >
              {k.status}
            </Text>
          </View>
        ))}
      </View>

      {/* Permanent Episodic Memory */}
      <Text style={styles.sectionHeader}>PERSISTENT EPISODIC MEMORY ({memories.length})</Text>
      <View style={styles.panel}>
        <View style={styles.inlineInputRow}>
          <TextInput
            value={newFactInput}
            onChangeText={setNewFactInput}
            placeholder="Store permanent project rule, preference, or fact..."
            placeholderTextColor={C.textMuted}
            style={styles.inputFlex}
          />
          <Pressable
            style={styles.primaryBtnCompact}
            onPress={async () => {
              if (!newFactInput.trim()) return;
              await rememberFact(newFactInput, 'preference', 'pinned', 9);
              setNewFactInput('');
              await refreshAllData();
            }}
          >
            <Text style={styles.primaryBtnText}>STORE</Text>
          </Pressable>
        </View>

        {memories.map((m) => (
          <View key={m.id} style={styles.listRow}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={styles.listMeta}>
                [{m.category.toUpperCase()} · {m.tag}]
              </Text>
              <Text style={styles.memoryBody}>{m.content}</Text>
            </View>
            <Pressable
              onPress={async () => {
                await deleteMemoryById(m.id);
                await refreshAllData();
              }}
            >
              <Text style={[styles.miniActionText, { color: C.danger }]}>DEL</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Top Brand Header */}
      <View style={styles.topBar}>
        <View style={styles.brandLeft}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>ẞ</Text>
          </View>
          <View>
            <Text style={styles.brandTitle}>VORTEX ẞ</Text>
            <Text style={styles.brandSub}>AUTONOMOUS OS INTELLIGENCE</Text>
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [styles.overlayTrigger, pressed && styles.btnPressed]}
          onPress={() =>
            VortexBridge?.updateFloatingHud?.(
              'VORTEX ẞ  ⊕  ACTIVE',
              'Floating capsule ready across all apps.',
              3500
            )
          }
        >
          <Text style={styles.overlayTriggerText}>ORB SYNC</Text>
        </Pressable>
      </View>

      {/* Active Page Viewport */}
      <View style={styles.viewport}>
        {activeTab === 'CORE' && renderCorePage()}
        {activeTab === 'SYSTEM' && renderSystemPage()}
        {activeTab === 'VAULT' && renderVaultPage()}
        {activeTab === 'MEMORY' && renderMemoryPage()}
      </View>

      {/* Precision Command Input Dock (Visible on CORE tab) */}
      {activeTab === 'CORE' ? (
        <View style={styles.commandDock}>
          <TextInput
            value={commandInput}
            onChangeText={setCommandInput}
            onSubmitEditing={() => handleExecuteCommand()}
            placeholder="Command Vortex (solve code, clean cache, open insta, search...)"
            placeholderTextColor={C.textMuted}
            style={styles.dockInput}
            returnKeyType="send"
          />
          <Pressable
            onPress={() => handleExecuteCommand()}
            disabled={isProcessing}
            style={({ pressed }) => [
              styles.sendBtn,
              pressed && styles.btnPressed,
              isProcessing && { opacity: 0.5 },
            ]}
          >
            <Text style={styles.sendBtnText}>{isProcessing ? '···' : '→'}</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Clean Brand Bottom Navigation Bar */}
      <View style={styles.bottomNav}>
        {(['CORE', 'SYSTEM', 'VAULT', 'MEMORY'] as NavTab[]).map((tab) => {
          const active = activeTab === tab;
          return (
            <Pressable
              key={tab}
              onPress={() => {
                setActiveTab(tab);
                refreshAllData();
              }}
              style={[styles.navItem, active && styles.navItemActive]}
            >
              <View style={[styles.navIndicator, active && styles.navIndicatorActive]} />
              <Text style={[styles.navLabel, active && styles.navLabelActive]}>{tab}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
};

// ============================================================================
// GEOMETRIC ICON STYLES
// ============================================================================

const geoStyles = StyleSheet.create({
  iconBox: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bracketLeft: {
    position: 'absolute',
    left: 2,
    width: 7,
    height: 7,
    borderLeftWidth: 1.6,
    borderBottomWidth: 1.6,
    transform: [{ rotate: '45deg' }],
  },
  bracketRight: {
    position: 'absolute',
    right: 2,
    width: 7,
    height: 7,
    borderRightWidth: 1.6,
    borderTopWidth: 1.6,
    transform: [{ rotate: '45deg' }],
  },
  slashLine: {
    width: 1.6,
    height: 14,
    transform: [{ rotate: '18deg' }],
  },
  visionFrame: {
    width: 18,
    height: 13,
    borderRadius: 7,
    borderWidth: 1.6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visionPupil: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  diamondOuter: {
    width: 14,
    height: 14,
    borderWidth: 1.6,
    transform: [{ rotate: '45deg' }],
    alignItems: 'center',
    justifyContent: 'center',
  },
  diamondCore: {
    width: 4,
    height: 4,
  },
  searchLens: {
    width: 13,
    height: 13,
    borderRadius: 6.5,
    borderWidth: 1.6,
    marginRight: 3,
    marginBottom: 3,
  },
  searchStem: {
    position: 'absolute',
    right: 3,
    bottom: 4,
    width: 7,
    height: 1.8,
    transform: [{ rotate: '45deg' }],
  },
  powerRing: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.6,
  },
  powerAxis: {
    position: 'absolute',
    top: 2,
    width: 1.8,
    height: 8,
  },
  vaultBody: {
    width: 16,
    height: 14,
    borderRadius: 3,
    borderWidth: 1.6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vaultHole: {
    width: 4,
    height: 5,
    borderRadius: 2,
  },
});

// ============================================================================
// BRAND DARK THEME STYLES
// ============================================================================

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.bg,
  },
  brandLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  brandMark: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: C.surfaceElevated,
    borderWidth: 1,
    borderColor: C.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkText: {
    color: C.accent,
    fontSize: 17,
    fontWeight: '700',
  },
  brandTitle: {
    color: C.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  brandSub: {
    color: C.textMuted,
    fontSize: 10,
    letterSpacing: 1,
    marginTop: 1,
  },
  overlayTrigger: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: C.surfaceElevated,
    borderWidth: 1,
    borderColor: C.borderStrong,
  },
  overlayTriggerText: {
    color: C.accent,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  viewport: {
    flex: 1,
  },
  pageScroll: {
    flex: 1,
  },
  pageContent: {
    padding: 18,
    paddingBottom: 32,
  },
  coreStage: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    marginBottom: 14,
    gap: 16,
  },
  coreRingOuter: {
    width: CORE_OUTER,
    height: CORE_OUTER,
    borderRadius: CORE_OUTER / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.03)',
  },
  coreRingMid: {
    width: CORE_MID,
    height: CORE_MID,
    borderRadius: CORE_MID / 2,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coreRingInner: {
    width: CORE_INNER,
    height: CORE_INNER,
    borderRadius: CORE_INNER / 2,
    backgroundColor: C.surfaceElevated,
    borderWidth: 1,
    borderColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coreGlyph: {
    color: C.accent,
    fontSize: 22,
    fontWeight: '700',
  },
  coreMetaBlock: {
    flex: 1,
  },
  statusPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusPillText: {
    color: C.textPrimary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.7,
  },
  habitText: {
    color: C.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  telemetryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 11,
    marginBottom: 18,
  },
  telemetryCell: {
    flex: 1,
    alignItems: 'center',
  },
  telemetryDivider: {
    width: 1,
    height: 24,
    backgroundColor: C.border,
  },
  telemetryLabel: {
    color: C.textMuted,
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  telemetryValue: {
    color: C.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 3,
    fontVariant: ['tabular-nums'],
  },
  sectionHeader: {
    color: C.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
    marginBottom: 10,
    marginTop: 4,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 18,
  },
  actionBtn: {
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
  },
  actionBtnHalf: {
    width: '48.4%',
  },
  actionBtnFull: {
    width: '100%',
  },
  actionBtnPressed: {
    backgroundColor: C.surfacePressed,
    borderColor: C.borderStrong,
  },
  actionTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  actionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: C.surfaceElevated,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBadge: {
    color: C.textMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    fontVariant: ['tabular-nums'],
  },
  actionTitle: {
    color: C.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  actionSub: {
    color: C.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  streamContainer: {
    gap: 8,
  },
  streamRow: {
    borderRadius: 12,
    padding: 13,
    borderWidth: 1,
  },
  streamRowUser: {
    backgroundColor: C.surfaceElevated,
    borderColor: C.borderStrong,
  },
  streamRowVortex: {
    backgroundColor: C.surface,
    borderColor: C.border,
  },
  streamMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  streamTag: {
    color: C.accent,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.7,
  },
  streamTime: {
    color: C.textMuted,
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
  streamText: {
    color: C.textPrimary,
    fontSize: 13,
    lineHeight: 19,
  },
  codeBlock: {
    marginTop: 10,
    backgroundColor: '#05070B',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    padding: 10,
  },
  codeText: {
    color: C.emerald,
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  pageTitle: {
    color: C.textPrimary,
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  pageSubtitle: {
    color: C.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 16,
  },
  panel: {
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 15,
    marginBottom: 18,
  },
  metricSplit: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 14,
  },
  metricBlock: {
    flex: 1,
  },
  metricBig: {
    color: C.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  metricUnit: {
    color: C.textMuted,
    fontSize: 11,
    fontWeight: '500',
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: C.surfaceElevated,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  dualBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: C.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#04070D',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  secondaryBtn: {
    flex: 1,
    backgroundColor: C.surfaceElevated,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.borderStrong,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    color: C.textPrimary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  primaryBtnCompact: {
    backgroundColor: C.accent,
    borderRadius: 10,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryBtnCompact: {
    backgroundColor: C.surfaceElevated,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.borderStrong,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }],
  },
  statusNote: {
    color: C.textSecondary,
    fontSize: 11,
    marginTop: 12,
    lineHeight: 16,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: C.surfaceElevated,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipActive: {
    backgroundColor: C.accentSoft,
    borderColor: C.accent,
  },
  chipText: {
    color: C.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  chipTextActive: {
    color: C.accent,
  },
  inlineInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  inputFlex: {
    flex: 1,
    backgroundColor: C.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.borderStrong,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: C.textPrimary,
    fontSize: 12,
  },
  inputFull: {
    backgroundColor: C.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.borderStrong,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: C.textPrimary,
    fontSize: 12,
    marginBottom: 10,
  },
  dividerLine: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: 14,
  },
  subLabel: {
    color: C.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.7,
    marginBottom: 8,
  },
  headerSplit: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  shieldPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: C.surfaceElevated,
    borderWidth: 1,
    borderColor: C.borderStrong,
  },
  shieldPillActive: {
    borderColor: C.danger,
    backgroundColor: 'rgba(248, 113, 113, 0.12)',
  },
  shieldPillText: {
    color: C.emerald,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.7,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: C.border,
    marginTop: 10,
  },
  listTitle: {
    color: C.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  listMeta: {
    color: C.textMuted,
    fontSize: 10,
    marginTop: 2,
  },
  memoryBody: {
    color: C.textPrimary,
    fontSize: 12,
    marginTop: 3,
    lineHeight: 17,
  },
  miniActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 7,
    backgroundColor: C.surfaceElevated,
    borderWidth: 1,
    borderColor: C.borderStrong,
  },
  miniActionText: {
    color: C.accent,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  statusBadge: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.7,
  },
  vaultGateWrap: {
    flex: 1,
    justifyContent: 'center',
    padding: 18,
  },
  commandDock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  dockInput: {
    flex: 1,
    backgroundColor: C.bg,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: C.borderStrong,
    paddingHorizontal: 13,
    paddingVertical: 10,
    color: C.textPrimary,
    fontSize: 13,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 11,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnText: {
    color: '#04070D',
    fontSize: 18,
    fontWeight: '800',
  },
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: C.bg,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingBottom: Platform.OS === 'ios' ? 4 : 6,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
  },
  navItemActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.04)',
  },
  navIndicator: {
    width: 18,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'transparent',
    marginBottom: 5,
  },
  navIndicatorActive: {
    backgroundColor: C.accent,
  },
  navLabel: {
    color: C.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  navLabelActive: {
    color: C.textPrimary,
  },
});

export default VortexGlassCockpit;
