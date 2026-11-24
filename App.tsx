import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  addBulkKeys,
  createProject,
  executeOSAction,
  getAllKeyStats,
  getDeviceTelemetry,
  getMemories,
  getProjects,
  getSetting,
  initVortexDB,
  KeyStats,
  MemoryMessage,
  ProjectItem,
  requestAllCorePermissions,
  runVortexCommand,
  setSetting,
  speakVortex,
} from './src/vortexEngine';

export default function App() {
  const [tab, setTab] = useState<'hud' | 'vault' | 'projects'>('hud');
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [activeProject, setActiveProject] = useState<string>('vortex-core');
  const [messages, setMessages] = useState<MemoryMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [telemetry, setTelemetry] = useState({ battery: 100, freeGB: '10.0' });
  const [lastAction, setLastAction] = useState<string>('OS Neural Link Ready');

  // Vault state
  const [geminiInput, setGeminiInput] = useState('');
  const [elevenInput, setElevenInput] = useState('');
  const [keys, setKeys] = useState<KeyStats[]>([]);

  // Project & PC Bridge state
  const [newProjName, setNewProjName] = useState('');
  const [brainMode, setBrainMode] = useState<'cloud' | 'pc_bridge'>('cloud');
  const [pcUrl, setPcUrl] = useState('http://192.168.1.100:8080/v1/chat/completions');

  useEffect(() => {
    bootstrap();
  }, []);

  async function bootstrap() {
    await initVortexDB();
    await requestAllCorePermissions();
    const projs = await getProjects();
    setProjects(projs);
    const savedMode = (await getSetting('brain_mode', 'cloud')) as 'cloud' | 'pc_bridge';
    const savedUrl = await getSetting('pc_url', 'http://192.168.1.100:8080/v1/chat/completions');
    setBrainMode(savedMode);
    setPcUrl(savedUrl);
    await refreshTelemetry();
    await loadChat('vortex-core');
    await refreshKeys();
  }

  async function refreshTelemetry() {
    const info = await getDeviceTelemetry();
    setTelemetry(info);
    if (info.battery <= 20) {
      const msg = `Alert bro, battery sirf ${info.battery}% bachi hai.`;
      setLastAction(msg);
      speakVortex(msg, true);
    } else if (parseFloat(info.freeGB) < 2.0) {
      const msg = `Warning bro, storage low hai, sirf ${info.freeGB} GB free hai.`;
      setLastAction(msg);
      speakVortex(msg, true);
    }
  }

  async function loadChat(projId: string) {
    setActiveProject(projId);
    const hist = await getMemories(projId, 30);
    setMessages(hist);
  }

  async function refreshKeys() {
    const list = await getAllKeyStats();
    setKeys(list);
  }

  async function handleSend(customPrompt?: string) {
    const prompt = (customPrompt ?? input).trim();
    if (!prompt || loading) return;
    if (!customPrompt) setInput('');

    setMessages((prev) => [...prev, { role: 'user', content: prompt, timestamp: Date.now() }]);
    setLoading(true);
    try {
      const res = await runVortexCommand(activeProject, prompt);
      if (res.actionLog) setLastAction(`⚡ ${res.actionLog}`);
      await loadChat(activeProject);
      await refreshKeys();
    } catch (e: any) {
      Alert.alert('VORTEX Error', e?.message || 'Command failed');
    } finally {
      setLoading(false);
    }
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
    Alert.alert('Vault Updated', `${added} nayi API keys secure vault mein save ho gayi hain.`);
  }

  async function handleCreateProject() {
    if (!newProjName.trim()) return;
    const p = await createProject(newProjName);
    setNewProjName('');
    const list = await getProjects();
    setProjects(list);
    await loadChat(p.id);
    setTab('hud');
  }

  async function toggleBrainMode() {
    const next = brainMode === 'cloud' ? 'pc_bridge' : 'cloud';
    setBrainMode(next);
    await setSetting('brain_mode', next);
    await setSetting('pc_url', pcUrl);
  }

  const activeGeminiCount = keys.filter((k) => k.provider === 'gemini' && k.status === 'active').length;
  const activeElevenCount = keys.filter((k) => k.provider === 'elevenlabs' && k.status === 'active').length;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* Top Telemetry Bar */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>VORTEX // MOBILE OS</Text>
          <Text style={styles.subtitle}>
            {brainMode === 'cloud' ? `CLOUD POOL (${activeGeminiCount} KEYS)` : 'PC GEMMA-4 NODE'}
          </Text>
        </View>
        <View style={styles.telemetryBox}>
          <Text style={styles.telemetryText}>🔋 {telemetry.battery}%</Text>
          <Text style={styles.telemetryText}>💾 {telemetry.freeGB} GB</Text>
        </View>
      </View>

      {/* Live Action Status Strip */}
      <View style={styles.statusStrip}>
        <Text style={styles.statusText} numberOfLines={1}>
          {lastAction}
        </Text>
      </View>

      {/* Navigation Tabs */}
      <View style={styles.tabRow}>
        {(['hud', 'vault', 'projects'] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'hud' ? 'COMMAND HUD' : t === 'vault' ? `KEY VAULT (${keys.length})` : 'PROJECTS & PC'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* TAB 1: COMMAND HUD */}
      {tab === 'hud' && (
        <View style={styles.body}>
          {/* Quick OS Automation Chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            {[
              { label: '📸 Reels', cmd: 'Instagram reels lagao' },
              { label: '👻 Snap Streak', cmd: 'Snapchat kholo' },
              { label: '📞 Call Mom', cmd: 'Mom ko call karo' },
              { label: '💬 SMS Abbu', cmd: 'Abbu jaan ko I am coming message karo' },
              { label: '☀️ Bright 80%', cmd: 'brightness 80' },
              { label: '🌙 Bright 20%', cmd: 'brightness 20' },
            ].map((chip) => (
              <TouchableOpacity
                key={chip.label}
                style={styles.chip}
                onPress={() => handleSend(chip.cmd)}
              >
                <Text style={styles.chipText}>{chip.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <ScrollView style={styles.chatArea} contentContainerStyle={{ paddingBottom: 20 }}>
            {messages.length === 0 && (
              <Text style={styles.emptyText}>
                VORTEX ready hai bro. Pehle "KEY VAULT" tab mein apni Gemini aur ElevenLabs keys paste karo, phir koi bhi command do!
              </Text>
            )}
            {messages.map((m, idx) => (
              <View
                key={idx}
                style={[styles.msgBubble, m.role === 'user' ? styles.userBubble : styles.botBubble]}
              >
                <Text style={styles.msgRole}>{m.role === 'user' ? 'SDAIFNY' : 'VORTEX'}</Text>
                <Text style={styles.msgText}>{m.content}</Text>
              </View>
            ))}
            {loading && <ActivityIndicator color="#00F0FF" style={{ marginTop: 10 }} />}
          </ScrollView>

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Command bolo ya likho (e.g. Mom ko call karo)..."
              placeholderTextColor="#64748B"
              value={input}
              onChangeText={setInput}
              onSubmitEditing={() => handleSend()}
            />
            <TouchableOpacity style={styles.sendBtn} onPress={() => handleSend()}>
              <Text style={styles.sendText}>RUN</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* TAB 2: 20-KEY ROTATION VAULT */}
      {tab === 'vault' && (
        <ScrollView style={styles.body}>
          <Text style={styles.sectionTitle}>
            Active Pool: {activeGeminiCount} Gemini | {activeElevenCount} ElevenLabs
          </Text>
          <Text style={styles.label}>Paste Gemini API Keys (ek line mein ek key — 10 ya 20):</Text>
          <TextInput
            style={styles.multiInput}
            multiline
            placeholder="AIzaSy...&#10;AIzaSy..."
            placeholderTextColor="#475569"
            value={geminiInput}
            onChangeText={setGeminiInput}
          />

          <Text style={styles.label}>Paste ElevenLabs API Keys (ek line mein ek key):</Text>
          <TextInput
            style={styles.multiInput}
            multiline
            placeholder="sk_...&#10;sk_..."
            placeholderTextColor="#475569"
            value={elevenInput}
            onChangeText={setElevenInput}
          />

          <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveKeys}>
            <Text style={styles.primaryBtnText}>SAVE & ACTIVATE KEYS</Text>
          </TouchableOpacity>

          <Text style={[styles.sectionTitle, { marginTop: 18 }]}>Saved Keys Status</Text>
          {keys.map((k) => (
            <View key={k.id} style={styles.keyRow}>
              <Text style={styles.keyProvider}>{k.provider.toUpperCase()}</Text>
              <Text style={styles.keyMask}>{k.masked}</Text>
              <Text style={[styles.keyStatus, { color: k.status === 'active' ? '#10B981' : '#F59E0B' }]}>
                {k.status} ({k.usage_count})
              </Text>
            </View>
          ))}
        </ScrollView>
      )}

      {/* TAB 3: ISOLATED PROJECT MEMORIES & PC GEMMA-4 BRIDGE */}
      {tab === 'projects' && (
        <ScrollView style={styles.body}>
          <Text style={styles.sectionTitle}>Project Isolated Memory Pods</Text>
          {projects.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={[styles.projCard, activeProject === p.id && styles.projCardActive]}
              onPress={() => {
                loadChat(p.id);
                setTab('hud');
              }}
            >
              <Text style={styles.projName}>{p.name}</Text>
              <Text style={styles.projDesc}>{p.description || 'Isolated SQLite Memory'}</Text>
            </TouchableOpacity>
          ))}

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="New Project Name (e.g. 4th Sem CSE)"
              placeholderTextColor="#64748B"
              value={newProjName}
              onChangeText={setNewProjName}
            />
            <TouchableOpacity style={styles.sendBtn} onPress={handleCreateProject}>
              <Text style={styles.sendText}>+ ADD</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.sectionTitle, { marginTop: 22 }]}>Future Laptop Bridge (Gemma 4 12B)</Text>
          <TextInput
            style={styles.input}
            value={pcUrl}
            onChangeText={setPcUrl}
            placeholder="http://192.168.1.100:8080/v1/chat/completions"
            placeholderTextColor="#64748B"
          />
          <TouchableOpacity style={styles.primaryBtn} onPress={toggleBrainMode}>
            <Text style={styles.primaryBtnText}>
              SWITCH TO {brainMode === 'cloud' ? 'PC GEMMA-4 BRIDGE' : 'CLOUD GEMINI POOL'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: '#1E293B', marginTop: 12 }]}
            onPress={() => executeOSAction({ type: 'system_settings', target: 'accessibility' })}
          >
            <Text style={[styles.primaryBtnText, { color: '#00F0FF' }]}>
              OPEN ANDROID ACCESSIBILITY SETTINGS
            </Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#090B10', paddingTop: 28 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  title: { color: '#00F0FF', fontSize: 18, fontWeight: '800', letterSpacing: 1.5 },
  subtitle: { color: '#94A3B8', fontSize: 11, marginTop: 2 },
  telemetryBox: { alignItems: 'flex-end' },
  telemetryText: { color: '#E2E8F0', fontSize: 12, fontWeight: '600' },
  statusStrip: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  statusText: { color: '#38BDF8', fontSize: 12, fontWeight: '600' },
  tabRow: { flexDirection: 'row', backgroundColor: '#0D1117', padding: 6, gap: 6 },
  tabBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', backgroundColor: '#161B22' },
  tabBtnActive: { backgroundColor: '#00F0FF22', borderWidth: 1, borderColor: '#00F0FF' },
  tabText: { color: '#94A3B8', fontSize: 11, fontWeight: '700' },
  tabTextActive: { color: '#00F0FF' },
  body: { flex: 1, padding: 14 },
  chipRow: { maxHeight: 42, marginBottom: 10 },
  chip: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  chipText: { color: '#E2E8F0', fontSize: 12, fontWeight: '600' },
  chatArea: { flex: 1 },
  emptyText: { color: '#64748B', textAlign: 'center', marginTop: 40, lineHeight: 22 },
  msgBubble: { padding: 12, borderRadius: 12, marginBottom: 10, maxWidth: '88%' },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#1D4ED833', borderWidth: 1, borderColor: '#3B82F6' },
  botBubble: { alignSelf: 'flex-start', backgroundColor: '#161B22', borderWidth: 1, borderColor: '#30363D' },
  msgRole: { color: '#00F0FF', fontSize: 10, fontWeight: '800', marginBottom: 4 },
  msgText: { color: '#F1F5F9', fontSize: 14, lineHeight: 20 },
  inputRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  input: {
    flex: 1,
    backgroundColor: '#161B22',
    color: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#30363D',
  },
  sendBtn: { backgroundColor: '#00F0FF', borderRadius: 10, paddingHorizontal: 18, justifyContent: 'center' },
  sendText: { color: '#090B10', fontWeight: '900', fontSize: 13 },
  sectionTitle: { color: '#00F0FF', fontSize: 14, fontWeight: '800', marginBottom: 10 },
  label: { color: '#CBD5E1', fontSize: 12, marginBottom: 6, marginTop: 8 },
  multiInput: {
    backgroundColor: '#161B22',
    color: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    height: 95,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#30363D',
  },
  primaryBtn: {
    backgroundColor: '#00F0FF',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  primaryBtnText: { color: '#090B10', fontWeight: '800', fontSize: 13 },
  keyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#161B22',
    padding: 10,
    borderRadius: 8,
    marginBottom: 6,
  },
  keyProvider: { color: '#38BDF8', fontWeight: '700', fontSize: 12 },
  keyMask: { color: '#CBD5E1', fontSize: 12 },
  keyStatus: { fontWeight: '700', fontSize: 12 },
  projCard: {
    backgroundColor: '#161B22',
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#30363D',
  },
  projCardActive: { borderColor: '#00F0FF', backgroundColor: '#00F0FF14' },
  projName: { color: '#F8FAFC', fontWeight: '800', fontSize: 15 },
  projDesc: { color: '#94A3B8', fontSize: 12, marginTop: 2 },
});
