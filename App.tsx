import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Voice from '@react-native-voice/voice';
import {
  addBulkKeys,
  createProject,
  deleteMacro,
  executeOSAction,
  exportVaultAndMacrosBackup,
  getAllKeyStats,
  getDeviceTelemetry,
  getMacros,
  getMemories,
  getNativeStatus,
  getProjects,
  getSetting,
  importVaultAndMacrosBackup,
  initVortexDB,
  KeyStats,
  MacroStep,
  MemoryMessage,
  NativeServiceStatus,
  openAccessibilitySettings,
  openNotificationSettings,
  ProjectItem,
  requestAllCorePermissions,
  runMacro,
  runVortexCommand,
  saveMacro,
  setSetting,
  speakVortex,
  startFloatingOrb,
  stopFloatingOrb,
  VoiceModeType,
  VoiceProfileType,
  VortexMacro,
  VortexModeType,
} from './src/vortexEngine';

const PHI = 1.618;

export default function App() {
  const [booted, setBooted] = useState(false);
  const [tab, setTab] = useState<'hud' | 'macros' | 'vault' | 'system'>('hud');

  // Parametric Splash Animation
  const orbitAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Core State
  const [mode, setMode] = useState<VortexModeType>('autopilot');
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [activeProject, setActiveProject] = useState<string>('vortex-core');
  const [messages, setMessages] = useState<MemoryMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [wakewordEnabled, setWakewordEnabled] = useState(true);
  const [telemetry, setTelemetry] = useState({ battery: 100, freeGB: '0.0' });
  const [traceLogs, setTraceLogs] = useState<string[]>(['KERNEL_INIT: VORTEX ẞ READY']);

  // Native Service State
  const [nativeStatus, setNativeStatus] = useState<NativeServiceStatus>({
    overlayGranted: false,
    orbRunning: false,
    accessibilityEnabled: false,
    notificationListenerEnabled: false,
    activePackage: '',
    lastNotification: '',
  });

  // Macros State
  const [macros, setMacros] = useState<VortexMacro[]>([]);
  const [macroName, setMacroName] = useState('');
  const [macroPhrase, setMacroPhrase] = useState('');
  const [macroApp, setMacroApp] = useState('');
  const [macroSwipe, setMacroSwipe] = useState<'up' | 'down' | 'none'>('up');
  const [macroSpeak, setMacroSpeak] = useState('');

  // Vault State
  const [geminiInput, setGeminiInput] = useState('');
  const [elevenInput, setElevenInput] = useState('');
  const [keys, setKeys] = useState<KeyStats[]>([]);
  const [backupText, setBackupText] = useState('');

  // System & Bridge State
  const [newProjName, setNewProjName] = useState('');
  const [voiceMode, setVoiceMode] = useState<VoiceModeType>('hybrid');
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfileType>('brian');
  const [brainMode, setBrainMode] = useState<'cloud' | 'pc_bridge'>('cloud');
  const [pcUrl, setPcUrl] = useState('http://192.168.1.100:8080/v1/chat/completions');

  useEffect(() => {
    Animated.loop(
      Animated.timing(orbitAnim, {
        toValue: 1,
        duration: 4200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 950,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1.0,
          duration: 950,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    bootstrap();

    Voice.onSpeechResults = (e) => {
      const spoken = e.value?.[0] || '';
      if (!spoken) return;
      setListening(false);
      const lowerSpoken = spoken.toLowerCase();
      if (wakewordEnabled && lowerSpoken.includes('hey vortex')) {
        const afterWake = spoken.replace(/hey vortex/i, '').trim();
        if (afterWake) {
          handleSend(afterWake);
        } else {
          pushTrace('WAKEWORD "HEY VORTEX" DETECTED');
          speakVortex('Haan bro, bolo.', true);
        }
      } else {
        handleSend(spoken);
      }
    };

    Voice.onSpeechError = () => {
      setListening(false);
    };

    return () => {
      Voice.destroy().catch(() => {});
    };
  }, []);

  function pushTrace(entry: string) {
    setTraceLogs((prev) => [entry, ...prev.slice(0, 7)]);
  }

  async function bootstrap() {
    try {
      await initVortexDB();
      const projs = await getProjects();
      setProjects(projs);
      const savedMode = (await getSetting('vortex_mode', 'autopilot')) as VortexModeType;
      const savedVMode = (await getSetting('voice_mode', 'hybrid')) as VoiceModeType;
      const savedVProf = (await getSetting('voice_profile', 'brian')) as VoiceProfileType;
      const savedBMode = (await getSetting('brain_mode', 'cloud')) as 'cloud' | 'pc_bridge';
      const savedUrl = await getSetting('pc_url', 'http://192.168.1.100:8080/v1/chat/completions');
      const savedWake = (await getSetting('wakeword_enabled', 'true')) === 'true';

      setMode(savedMode);
      setVoiceMode(savedVMode);
      setVoiceProfile(savedVProf);
      setBrainMode(savedBMode);
      setPcUrl(savedUrl);
      setWakewordEnabled(savedWake);

      await loadChat('vortex-core');
      await refreshKeys();
      setMacros(await getMacros());
      await refreshTelemetry();
      await refreshNative();
    } catch (e: any) {
      pushTrace(`BOOT_WARN: ${e?.message || 'OK'}`);
    } finally {
      setTimeout(() => setBooted(true), 1200);
    }

    try {
      await requestAllCorePermissions();
    } catch {}
  }

  async function refreshNative() {
    const st = await getNativeStatus();
    setNativeStatus(st);
  }

  async function refreshTelemetry() {
    const info = await getDeviceTelemetry();
    setTelemetry(info);
    if (info.battery <= 20) {
      const msg = `Alert bro, battery ${info.battery}% bachi hai.`;
      pushTrace(msg);
      speakVortex(msg, true);
    } else if (parseFloat(info.freeGB) > 0 && parseFloat(info.freeGB) < 2.0) {
      const msg = `Storage low: ${info.freeGB} GB free.`;
      pushTrace(msg);
      speakVortex(msg, true);
    }
  }

  async function loadChat(projId: string) {
    setActiveProject(projId);
    setMessages(await getMemories(projId, 30));
  }

  async function refreshKeys() {
    setKeys(await getAllKeyStats());
  }

  async function toggleMic() {
    if (listening) {
      await Voice.stop();
      setListening(false);
      return;
    }
    try {
      setListening(true);
      await Voice.start('en-IN');
    } catch {
      setListening(false);
      Alert.alert('Mic Notice', 'Speech recognition available nahi hai ya mic permission chahiye.');
    }
  }

  async function handleSend(customPrompt?: string) {
    const prompt = (customPrompt ?? input).trim();
    if (!prompt || loading) return;
    if (!customPrompt) setInput('');

    setMessages((prev) => [...prev, { role: 'user', content: prompt, timestamp: Date.now() }]);
    setLoading(true);
    pushTrace(`CMD: ${prompt.slice(0, 36)}`);
    try {
      const res = await runVortexCommand(activeProject, prompt);
      if (res.actionLogs.length > 0) {
        res.actionLogs.forEach((l) => pushTrace(`ACT: ${l}`));
      }
      await loadChat(activeProject);
      await refreshKeys();
      await refreshTelemetry();
      await refreshNative();
    } catch (e: any) {
      pushTrace(`ERR: ${e?.message || 'Failed'}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateMacro() {
    if (!macroName.trim() || !macroPhrase.trim()) {
      Alert.alert('Macro Info', 'Macro name aur voice trigger phrase dono bharo.');
      return;
    }
    const steps: MacroStep[] = [];
    if (macroApp.trim()) {
      steps.push({ action: 'open_app', target: macroApp.trim().toLowerCase() });
      steps.push({ action: 'wait', value: 1800 });
    }
    if (macroSwipe !== 'none') {
      steps.push({ action: 'swipe', target: macroSwipe });
    }
    if (macroSpeak.trim()) {
      steps.push({ action: 'speak', text: macroSpeak.trim() });
    }
    if (steps.length === 0) {
      steps.push({ action: 'speak', text: `${macroName.trim()} executed.` });
    }

    const updated = await saveMacro({
      id: 'macro-' + Date.now(),
      name: macroName.trim(),
      phrase: macroPhrase.trim().toLowerCase(),
      steps,
    });
    setMacros(updated);
    setMacroName('');
    setMacroPhrase('');
    setMacroApp('');
    setMacroSpeak('');
    pushTrace(`MACRO_SAVED: ${updated[0].name}`);
  }

  async function handleRunMacro(m: VortexMacro) {
    setTab('hud');
    setLoading(true);
    pushTrace(`RUN_MACRO: ${m.name}`);
    try {
      const logs = await runMacro(m);
      logs.forEach((l) => pushTrace(`STEP: ${l}`));
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteMacro(id: string) {
    setMacros(await deleteMacro(id));
  }

  async function handleSaveKeys() {
    let added = 0;
    if (geminiInput.trim()) {
      added += await addBulkKeys('gemini', geminiInput);
      setGeminiInput('');
    }
    if (elevenInput.trim()) {
      added += await addBulkKeys('elevenlabs', elevenInput);
      setElevenInput('');
    }
    await refreshKeys();
    Alert.alert('Vault Updated', `${added} nayi API keys save ho gayin.`);
  }

  async function handleExportBackup() {
    const json = await exportVaultAndMacrosBackup();
    setBackupText(json);
    Alert.alert('Backup Copied', 'Keys aur macros JSON clipboard mein copy ho gaye hain.');
  }

  async function handleImportBackup() {
    if (!backupText.trim()) return;
    const count = await importVaultAndMacrosBackup(backupText);
    await refreshKeys();
    setMacros(await getMacros());
    Alert.alert('Restored', `${count} keys aur macros restore ho gaye.`);
  }

  async function handleCreateProject() {
    if (!newProjName.trim()) return;
    const p = await createProject(newProjName);
    setNewProjName('');
    setProjects(await getProjects());
    await loadChat(p.id);
    setTab('hud');
  }

  const spinDeg = orbitAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  if (!booted) {
    const rOuter = 112;
    const rInner = Math.round(rOuter / PHI);
    return (
      <View style={styles.splashContainer}>
        <StatusBar style="light" />
        <Animated.View
          style={[
            styles.orbitRing,
            {
              width: rOuter * 2,
              height: rOuter * 2,
              borderRadius: rOuter,
              transform: [{ rotate: spinDeg }],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.innerRing,
            {
              width: rInner * 2,
              height: rInner * 2,
              borderRadius: rInner,
              transform: [{ scale: pulseAnim }],
            },
          ]}
        />
        <Text style={styles.splashGlyph}>ẞ</Text>
        <Text style={styles.splashTitle}>Vortex ẞ</Text>
        <Text style={styles.splashSub}>φ = 1.618 • KERNEL & NEURAL LINK</Text>
      </View>
    );
  }

  const activeGemini = keys.filter((k) => k.provider === 'gemini' && k.status === 'active').length;
  const activeEleven = keys.filter((k) => k.provider === 'elevenlabs' && k.status === 'active').length;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />

      {/* Top Glass Header */}
      <View style={styles.glassHeader}>
        <View>
          <Text style={styles.brandText}>Vortex ẞ</Text>
          <Text style={styles.modeCaption}>
            {mode.toUpperCase()} • {brainMode === 'cloud' ? `${activeGemini} GEMINI` : 'PC GEMMA-4'}
          </Text>
        </View>
        <View style={styles.telemetryRight}>
          <Text style={styles.teleItem}>BAT {telemetry.battery}%</Text>
          <Text style={styles.teleItem}>FREE {telemetry.freeGB}G</Text>
        </View>
      </View>

      {/* Execution Trace Strip */}
      <View style={styles.traceBar}>
        <Text style={styles.traceText} numberOfLines={1}>
          {traceLogs[0]}
        </Text>
      </View>

      {/* 4 Glass Tabs */}
      <View style={styles.tabBar}>
        {(
          [
            { key: 'hud', label: 'HUD' },
            { key: 'macros', label: 'MACROS' },
            { key: 'vault', label: `VAULT (${keys.length})` },
            { key: 'system', label: 'SYSTEM' },
          ] as const
        ).map((item) => {
          const active = tab === item.key;
          return (
            <TouchableOpacity
              key={item.key}
              style={[styles.tabPill, active && styles.tabPillActive]}
              onPress={() => setTab(item.key)}
            >
              <Text style={[styles.tabPillText, active && styles.tabPillTextActive]}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* TAB 1: HUD */}
      {tab === 'hud' && (
        <View style={styles.screenPad}>
          <View style={styles.glassCardCompact}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {[
                { label: 'Reels', cmd: 'open reels' },
                { label: 'Swipe Up', cmd: 'swipe up' },
                { label: 'Snap Streak', cmd: 'snap streak bhejo' },
                { label: 'Bright 75%', cmd: 'brightness 75' },
                { label: 'Bright 15%', cmd: 'brightness 15' },
                { label: 'Read Screen', cmd: 'screen padho' },
              ].map((q) => (
                <TouchableOpacity
                  key={q.label}
                  style={styles.glassChip}
                  onPress={() => handleSend(q.cmd)}
                >
                  <Text style={styles.glassChipText}>{q.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <ScrollView style={styles.chatList} contentContainerStyle={{ paddingBottom: 14 }}>
            {messages.length === 0 && (
              <View style={styles.glassCard}>
                <Text style={styles.emptyMsg}>
                  Vortex ẞ online hai. Command likho, mic dabao, ya MACROS tab se custom automation chalao.
                </Text>
              </View>
            )}
            {messages.map((m, idx) => (
              <View
                key={idx}
                style={[styles.msgCard, m.role === 'user' ? styles.userMsg : styles.botMsg]}
              >
                <Text style={styles.msgSender}>{m.role === 'user' ? 'YOU' : 'VORTEX ẞ'}</Text>
                <Text style={styles.msgBody}>{m.content}</Text>
              </View>
            ))}
            {loading && <ActivityIndicator color="#38BDF8" style={{ marginTop: 8 }} />}
          </ScrollView>

          <View style={styles.inputBar}>
            <TouchableOpacity
              style={[styles.micBtn, listening && styles.micBtnActive]}
              onPress={toggleMic}
            >
              <Text style={styles.micText}>{listening ? 'REC' : 'MIC'}</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.glassInput}
              placeholder="Command ya 'Hey Vortex'..."
              placeholderTextColor="#64748B"
              value={input}
              onChangeText={setInput}
              onSubmitEditing={() => handleSend()}
            />
            <TouchableOpacity style={styles.runBtn} onPress={() => handleSend()}>
              <Text style={styles.runBtnText}>SEND</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* TAB 2: MACROS */}
      {tab === 'macros' && (
        <ScrollView style={styles.screenPad} contentContainerStyle={{ paddingBottom: 28 }}>
          <View style={styles.glassCard}>
            <Text style={styles.cardHeading}>CUSTOM MACRO BUILDER</Text>
            <TextInput
              style={styles.glassInputFull}
              placeholder="Macro Name (e.g. Insta Morning)"
              placeholderTextColor="#64748B"
              value={macroName}
              onChangeText={setMacroName}
            />
            <TextInput
              style={styles.glassInputFull}
              placeholder="Voice Trigger Phrase (e.g. morning routine)"
              placeholderTextColor="#64748B"
              value={macroPhrase}
              onChangeText={setMacroPhrase}
            />
            <TextInput
              style={styles.glassInputFull}
              placeholder="Open App (instagram / snapchat / reels / youtube)"
              placeholderTextColor="#64748B"
              value={macroApp}
              onChangeText={setMacroApp}
            />
            <View style={styles.rowGap}>
              {(['up', 'down', 'none'] as const).map((dir) => (
                <TouchableOpacity
                  key={dir}
                  style={[styles.miniChoice, macroSwipe === dir && styles.miniChoiceActive]}
                  onPress={() => setMacroSwipe(dir)}
                >
                  <Text style={styles.miniChoiceText}>SWIPE: {dir.toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.glassInputFull}
              placeholder="Voice Confirmation Text (optional)"
              placeholderTextColor="#64748B"
              value={macroSpeak}
              onChangeText={setMacroSpeak}
            />
            <TouchableOpacity style={styles.glassActionBtn} onPress={handleCreateMacro}>
              <Text style={styles.glassActionBtnText}>SAVE MACRO</Text>
            </TouchableOpacity>
          </View>

          {macros.map((m) => (
            <View key={m.id} style={styles.glassCard}>
              <View style={styles.macroHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.macroTitle}>{m.name}</Text>
                  <Text style={styles.macroPhrase}>Trigger: "{m.phrase}" • {m.steps.length} steps</Text>
                </View>
                <TouchableOpacity style={styles.runSmallBtn} onPress={() => handleRunMacro(m)}>
                  <Text style={styles.runSmallText}>RUN</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.delSmallBtn} onPress={() => handleDeleteMacro(m.id)}>
                  <Text style={styles.delSmallText}>DEL</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* TAB 3: VAULT */}
      {tab === 'vault' && (
        <ScrollView style={styles.screenPad} contentContainerStyle={{ paddingBottom: 28 }}>
          <View style={styles.glassCard}>
            <Text style={styles.cardHeading}>
              KEY POOL • {activeGemini} GEMINI • {activeEleven} ELEVENLABS
            </Text>
            <Text style={styles.fieldLabel}>Gemini Keys (one per line)</Text>
            <TextInput
              style={styles.glassArea}
              multiline
              placeholder="AIzaSy..."
              placeholderTextColor="#475569"
              value={geminiInput}
              onChangeText={setGeminiInput}
            />
            <Text style={styles.fieldLabel}>ElevenLabs Keys (one per line)</Text>
            <TextInput
              style={styles.glassArea}
              multiline
              placeholder="sk_..."
              placeholderTextColor="#475569"
              value={elevenInput}
              onChangeText={setElevenInput}
            />
            <TouchableOpacity style={styles.glassActionBtn} onPress={handleSaveKeys}>
              <Text style={styles.glassActionBtnText}>SAVE & ACTIVATE KEYS</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.glassCard}>
            <Text style={styles.cardHeading}>KEYS TELEMETRY</Text>
            {keys.map((k) => (
              <View key={k.id} style={styles.keyRow}>
                <Text style={styles.keyProv}>{k.provider.toUpperCase()}</Text>
                <Text style={styles.keyMasked}>{k.masked}</Text>
                <Text
                  style={[
                    styles.keyBadge,
                    { color: k.status === 'active' ? '#34D399' : '#FBBF24' },
                  ]}
                >
                  {k.status} ({k.usage_count})
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.glassCard}>
            <Text style={styles.cardHeading}>JSON BACKUP & RESTORE</Text>
            <View style={styles.rowGap}>
              <TouchableOpacity style={styles.halfBtn} onPress={handleExportBackup}>
                <Text style={styles.halfBtnText}>EXPORT TO CLIPBOARD</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.halfBtn} onPress={handleImportBackup}>
                <Text style={styles.halfBtnText}>IMPORT JSON</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={[styles.glassArea, { marginTop: 10, height: 75 }]}
              multiline
              placeholder="Paste backup JSON here to restore..."
              placeholderTextColor="#475569"
              value={backupText}
              onChangeText={setBackupText}
            />
          </View>
        </ScrollView>
      )}

      {/* TAB 4: SYSTEM */}
      {tab === 'system' && (
        <ScrollView style={styles.screenPad} contentContainerStyle={{ paddingBottom: 28 }}>
          <View style={styles.glassCard}>
            <Text style={styles.cardHeading}>OPERATIONAL MODE</Text>
            <View style={styles.rowGap}>
              {(
                [
                  { id: 'autopilot', label: 'AUTOPILOT' },
                  { id: 'architect', label: 'ARCHITECT' },
                  { id: 'offline', label: 'OFFLINE' },
                ] as const
              ).map((m) => (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.miniChoice, mode === m.id && styles.miniChoiceActive]}
                  onPress={async () => {
                    setMode(m.id);
                    await setSetting('vortex_mode', m.id);
                  }}
                >
                  <Text style={styles.miniChoiceText}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>
              FLOATING ẞ ORB (10% IDLE DIM) & NATIVE SERVICES
            </Text>
            <Text style={styles.statusSub}>
              Overlay: {nativeStatus.overlayGranted ? 'ON' : 'OFF'} • Orb:{' '}
              {nativeStatus.orbRunning ? 'RUNNING' : 'STOPPED'} • Accessibility:{' '}
              {nativeStatus.accessibilityEnabled ? 'ON' : 'OFF'}
            </Text>
            <View style={[styles.rowGap, { marginTop: 8 }]}>
              <TouchableOpacity
                style={styles.halfBtn}
                onPress={async () => {
                  await startFloatingOrb(0.1);
                  setTimeout(refreshNative, 500);
                }}
              >
                <Text style={styles.halfBtnText}>START 10% ORB</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.halfBtn}
                onPress={async () => {
                  await stopFloatingOrb();
                  setTimeout(refreshNative, 500);
                }}
              >
                <Text style={styles.halfBtnText}>STOP ORB</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.secondaryBtn} onPress={openAccessibilitySettings}>
              <Text style={styles.secondaryBtnText}>ENABLE ACCESSIBILITY (AUTO-TAP / SWIPE)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={openNotificationSettings}>
              <Text style={styles.secondaryBtnText}>ENABLE NOTIFICATION LISTENER</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.glassCard}>
            <Text style={styles.cardHeading}>VOICE ENGINE & PROFILE</Text>
            <View style={styles.rowGap}>
              {(['hybrid', 'elevenlabs', 'offline'] as const).map((vm) => (
                <TouchableOpacity
                  key={vm}
                  style={[styles.miniChoice, voiceMode === vm && styles.miniChoiceActive]}
                  onPress={async () => {
                    setVoiceMode(vm);
                    await setSetting('voice_mode', vm);
                  }}
                >
                  <Text style={styles.miniChoiceText}>{vm.toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={[styles.rowGap, { marginTop: 8 }]}>
              {(['brian', 'callum', 'george'] as const).map((vp) => (
                <TouchableOpacity
                  key={vp}
                  style={[styles.miniChoice, voiceProfile === vp && styles.miniChoiceActive]}
                  onPress={async () => {
                    setVoiceProfile(vp);
                    await setSetting('voice_profile', vp);
                  }}
                >
                  <Text style={styles.miniChoiceText}>{vp.toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={async () => {
                const next = !wakewordEnabled;
                setWakewordEnabled(next);
                await setSetting('wakeword_enabled', String(next));
              }}
            >
              <Text style={styles.secondaryBtnText}>
                "HEY VORTEX" WAKEWORD: {wakewordEnabled ? 'ENABLED' : 'MUTED'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.glassCard}>
            <Text style={styles.cardHeading}>ISOLATED PROJECTS & PC GEMMA-4 BRIDGE</Text>
            {projects.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[styles.projRow, activeProject === p.id && styles.projRowActive]}
                onPress={async () => {
                  await loadChat(p.id);
                  setTab('hud');
                }}
              >
                <Text style={styles.projTitle}>{p.name}</Text>
                <Text style={styles.projId}>{p.id}</Text>
              </TouchableOpacity>
            ))}
            <View style={[styles.inputBar, { marginTop: 8 }]}>
              <TextInput
                style={styles.glassInput}
                placeholder="New project pod..."
                placeholderTextColor="#64748B"
                value={newProjName}
                onChangeText={setNewProjName}
              />
              <TouchableOpacity style={styles.runBtn} onPress={handleCreateProject}>
                <Text style={styles.runBtnText}>ADD</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={[styles.glassInputFull, { marginTop: 12 }]}
              value={pcUrl}
              onChangeText={setPcUrl}
              placeholder="http://192.168.1.100:8080/v1/chat/completions"
              placeholderTextColor="#64748B"
            />
            <TouchableOpacity
              style={styles.glassActionBtn}
              onPress={async () => {
                const next = brainMode === 'cloud' ? 'pc_bridge' : 'cloud';
                setBrainMode(next);
                await setSetting('brain_mode', next);
                await setSetting('pc_url', pcUrl);
              }}
            >
              <Text style={styles.glassActionBtnText}>
                BRAIN: {brainMode === 'cloud' ? 'CLOUD 20-KEY POOL' : 'PC GEMMA-4 BRIDGE'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const glassSurface = {
  backgroundColor: 'rgba(15, 23, 42, 0.56)',
  borderColor: 'rgba(255, 255, 255, 0.12)',
  borderWidth: 1,
};

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: '#05070B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbitRing: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: 'rgba(56, 189, 248, 0.45)',
    borderStyle: 'dashed',
  },
  innerRing: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.55)',
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
  },
  splashGlyph: {
    fontSize: 44,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  splashTitle: {
    marginTop: 14,
    fontSize: 22,
    fontWeight: '700',
    color: '#F8FAFC',
    letterSpacing: 1.2,
  },
  splashSub: {
    marginTop: 4,
    fontSize: 11,
    color: '#94A3B8',
    letterSpacing: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#05070B',
    paddingTop: 28,
  },
  glassHeader: {
    ...glassSurface,
    marginHorizontal: 12,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandText: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  modeCaption: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  telemetryRight: {
    alignItems: 'flex-end',
  },
  teleItem: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '700',
  },
  traceBar: {
    marginHorizontal: 12,
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.2)',
  },
  traceText: {
    color: '#7DD3FC',
    fontSize: 11,
    fontWeight: '600',
  },
  tabBar: {
    flexDirection: 'row',
    gap: 6,
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
  },
  tabPill: {
    ...glassSurface,
    flex: 1,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: 'center',
  },
  tabPillActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderColor: 'rgba(56, 189, 248, 0.65)',
  },
  tabPillText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
  },
  tabPillTextActive: {
    color: '#F8FAFC',
  },
  screenPad: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 6,
  },
  glassCardCompact: {
    ...glassSurface,
    borderRadius: 14,
    padding: 8,
    marginBottom: 8,
  },
  glassChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(30, 41, 59, 0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    marginRight: 8,
  },
  glassChipText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '600',
  },
  chatList: {
    flex: 1,
  },
  glassCard: {
    ...glassSurface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  emptyMsg: {
    color: '#94A3B8',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  msgCard: {
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    maxWidth: '88%',
    borderWidth: 1,
  },
  userMsg: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(59, 130, 246, 0.22)',
    borderColor: 'rgba(96, 165, 250, 0.45)',
  },
  botMsg: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(15, 23, 42, 0.68)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  msgSender: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 3,
  },
  msgBody: {
    color: '#F1F5F9',
    fontSize: 14,
    lineHeight: 20,
  },
  inputBar: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  micBtn: {
    ...glassSurface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  micBtnActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.35)',
    borderColor: '#F87171',
  },
  micText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '800',
  },
  glassInput: {
    ...glassSurface,
    flex: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#F8FAFC',
    fontSize: 13,
  },
  runBtn: {
    backgroundColor: 'rgba(56, 189, 248, 0.28)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.7)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
    justifyContent: 'center',
  },
  runBtnText: {
    color: '#F8FAFC',
    fontWeight: '800',
    fontSize: 12,
  },
  cardHeading: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.7,
    marginBottom: 8,
  },
  fieldLabel: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 6,
    marginBottom: 4,
  },
  glassInputFull: {
    ...glassSurface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#F8FAFC',
    fontSize: 13,
    marginBottom: 8,
  },
  glassArea: {
    ...glassSurface,
    borderRadius: 12,
    padding: 10,
    color: '#F8FAFC',
    fontSize: 12,
    height: 82,
    textAlignVertical: 'top',
    marginBottom: 8,
  },
  rowGap: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  miniChoice: {
    ...glassSurface,
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  miniChoiceActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.24)',
    borderColor: 'rgba(56, 189, 248, 0.7)',
  },
  miniChoiceText: {
    color: '#E2E8F0',
    fontSize: 10,
    fontWeight: '700',
  },
  glassActionBtn: {
    backgroundColor: 'rgba(56, 189, 248, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.65)',
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 6,
  },
  glassActionBtnText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '800',
  },
  secondaryBtn: {
    ...glassSurface,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  secondaryBtnText: {
    color: '#BAE6FD',
    fontSize: 11,
    fontWeight: '700',
  },
  halfBtn: {
    ...glassSurface,
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  halfBtnText: {
    color: '#F8FAFC',
    fontSize: 10,
    fontWeight: '700',
  },
  macroHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  macroTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
  },
  macroPhrase: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  runSmallBtn: {
    backgroundColor: 'rgba(56, 189, 248, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.6)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  runSmallText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '800',
  },
  delSmallBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.5)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  delSmallText: {
    color: '#FCA5A5',
    fontSize: 11,
    fontWeight: '700',
  },
  keyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  keyProv: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
  },
  keyMasked: {
    color: '#CBD5E1',
    fontSize: 11,
  },
  keyBadge: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusSub: {
    color: '#94A3B8',
    fontSize: 11,
    lineHeight: 17,
  },
  projRow: {
    ...glassSurface,
    borderRadius: 12,
    padding: 10,
    marginBottom: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  projRowActive: {
    borderColor: 'rgba(56, 189, 248, 0.7)',
    backgroundColor: 'rgba(56, 189, 248, 0.14)',
  },
  projTitle: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  projId: {
    color: '#94A3B8',
    fontSize: 11,
  },
});
