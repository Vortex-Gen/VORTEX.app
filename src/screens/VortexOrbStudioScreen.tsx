import React, { useEffect, useState } from 'react';
import {
  Linking,
  NativeModules,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { VortexNavigationShell } from '../components/VortexNavigationShell';
import { useVortexStore } from '../store/useVortexStore';
import {
  VORTEX_ACCENTS,
  VORTEX_FONTS,
  VORTEX_LAYOUT,
  VORTEX_PALETTE,
  VortexAccentKey,
} from '../theme/vortexTheme';

const { VortexBridge } = NativeModules;

const OPACITY_PRESETS = [
  { label: '25%', value: 0.25 },
  { label: '40% DIM', value: 0.4 },
  { label: '65%', value: 0.65 },
  { label: '90%', value: 0.9 },
];

interface PermissionDescriptor {
  key: 'overlay' | 'accessibility' | 'notificationListener' | 'exactAlarm' | 'batteryIgnored' | 'orbRunning';
  title: string;
  sub: string;
  intentKey: string;
  actionable: boolean;
}

const PERMISSION_ITEMS: PermissionDescriptor[] = [
  {
    key: 'overlay',
    title: 'Display Over Other Apps',
    sub: 'Required to render the unified floating ẞ orb above all screens',
    intentKey: 'overlay',
    actionable: true,
  },
  {
    key: 'accessibility',
    title: 'VORTEX Accessibility Engine',
    sub: 'Enables DOM node reading, Bezier ghost gestures & code injection',
    intentKey: 'accessibility',
    actionable: true,
  },
  {
    key: 'notificationListener',
    title: 'Notification & OTP Listener',
    sub: 'Captures incoming OTPs and enables direct WhatsApp/SMS replies',
    intentKey: 'notification',
    actionable: true,
  },
  {
    key: 'exactAlarm',
    title: 'Exact Macro & Alarm Trigger',
    sub: 'Fires scheduled routines and wake alarms on exact second',
    intentKey: 'alarm',
    actionable: true,
  },
  {
    key: 'batteryIgnored',
    title: 'Unrestricted Background Power',
    sub: 'Prevents Android Doze from killing wakeword & floating services',
    intentKey: 'battery',
    actionable: true,
  },
  {
    key: 'orbRunning',
    title: 'Foreground Overlay Service',
    sub: 'Live status of native VortexFloatingService process',
    intentKey: 'overlay',
    actionable: false,
  },
];

export const VortexOrbStudioScreen: React.FC = () => {
  const orbEnabled = useVortexStore((s) => s.orbEnabled);
  const orbOpacity = useVortexStore((s) => s.orbOpacity);
  const orbAccentKey = useVortexStore((s) => s.orbAccentKey);
  const orbStealthMode = useVortexStore((s) => s.orbStealthMode);
  const orbAutoStartBoot = useVortexStore((s) => s.orbAutoStartBoot);
  const updateOrbSettings = useVortexStore((s) => s.updateOrbSettings);

  const autoUnlockAppLock = useVortexStore((s) => s.autoUnlockAppLock);
  const setAutoUnlockAppLock = useVortexStore((s) => s.setAutoUnlockAppLock);
  const hasAppLockPin = useVortexStore((s) => s.hasAppLockPin);
  const saveAppLockPin = useVortexStore((s) => s.saveAppLockPin);

  const permissions = useVortexStore((s) => s.permissions);
  const refreshNativeDiagnostics = useVortexStore((s) => s.refreshNativeDiagnostics);
  const fontPreset = useVortexStore((s) => s.fontPreset);

  const accent = VORTEX_ACCENTS[orbAccentKey] || VORTEX_ACCENTS.sky;
  const fonts = VORTEX_FONTS[fontPreset] || VORTEX_FONTS.aero;

  const [previewExpanded, setPreviewExpanded] = useState(true);
  const [pinDraft, setPinDraft] = useState('');
  const [pinFeedback, setPinFeedback] = useState('');

  useEffect(() => {
    void refreshNativeDiagnostics();
  }, [refreshNativeDiagnostics]);

  const handleOpenPermission = async (intentKey: string) => {
    try {
      if (VortexBridge?.openPermissionSettings) {
        await VortexBridge.openPermissionSettings(intentKey);
        return;
      }
      await Linking.openSettings();
    } catch (_e) {
      await Linking.openSettings();
    }
  };

  const handleSavePin = async () => {
    const clean = pinDraft.replace(/[^0-9]/g, '');
    if (clean.length < 4 || clean.length > 8) {
      setPinFeedback('Enter a valid 4 to 8 digit numeric PIN.');
      return;
    }
    const ok = await saveAppLockPin(clean);
    if (ok) {
      setPinDraft('');
      setPinFeedback('PIN encrypted and stored in Android Keystore.');
    } else {
      setPinFeedback('Native Keystore unavailable on this runtime.');
    }
  };

  const grantedCount = Object.values(permissions).filter(Boolean).length;

  return (
    <VortexNavigationShell
      headerTitle="ORB STUDIO"
      headerSubtitle={`Overlay ${Math.round(orbOpacity * 100)}% • ${grantedCount}/6 Active`}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.previewStage, { borderColor: accent.border }]}>
          <View style={styles.previewTopRow}>
            <Text style={styles.eyebrow}>LIVE FLOATING OVERLAY PREVIEW</Text>
            <TouchableOpacity
              onPress={() => setPreviewExpanded((v) => !v)}
              style={[styles.miniPill, { borderColor: VORTEX_PALETTE.borderStrong }]}
            >
              <Text style={styles.miniPillText}>
                {previewExpanded ? 'COLLAPSE HUD' : 'EXPAND HUD'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.orbDemoArena}>
            {previewExpanded ? (
              <View style={styles.radialPillCluster}>
                <View style={[styles.radialNode, { borderColor: accent.border }]}>
                  <Text style={[styles.radialLabel, { color: accent.primary }]}>SCAN</Text>
                </View>
                <View style={[styles.radialNode, { borderColor: accent.border }]}>
                  <Text style={[styles.radialLabel, { color: accent.primary }]}>MIC</Text>
                </View>
                <View style={[styles.radialNode, { borderColor: accent.border }]}>
                  <Text style={[styles.radialLabel, { color: accent.primary }]}>INJECT</Text>
                </View>
              </View>
            ) : null}

            <TouchableOpacity
              onPress={() => setPreviewExpanded((v) => !v)}
              activeOpacity={0.9}
              style={[
                styles.liveOrbCircle,
                {
                  opacity: orbOpacity,
                  borderColor: accent.primary,
                  backgroundColor: VORTEX_PALETTE.surfaceCard,
                  shadowColor: accent.primary,
                },
              ]}
            >
              <Text style={[styles.liveOrbGlyph, { color: accent.primary, fontFamily: fonts.display }]}>
                ẞ
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.previewFooterRow}>
            <Text style={styles.previewStatText}>
              Opacity: {Math.round(orbOpacity * 100)}% • {orbStealthMode ? 'Stealth Dim' : 'Standard Glow'}
            </Text>
            <TouchableOpacity
              onPress={() => void updateOrbSettings({ enabled: !orbEnabled })}
              style={[
                styles.launchOrbBtn,
                {
                  backgroundColor: orbEnabled ? VORTEX_PALETTE.dangerSoft : accent.primary,
                  borderColor: orbEnabled ? VORTEX_PALETTE.danger : accent.primary,
                },
              ]}
            >
              <Text
                style={[
                  styles.launchOrbBtnText,
                  {
                    color: orbEnabled ? VORTEX_PALETTE.danger : VORTEX_PALETTE.oledBlack,
                  },
                ]}
              >
                {orbEnabled ? 'STOP OVERLAY' : 'LAUNCH ORB'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.sectionLabel}>DIMMED OPACITY & ACCENT AURA</Text>
        <View style={styles.card}>
          <View style={styles.opacityControlRow}>
            <TouchableOpacity
              onPress={() => void updateOrbSettings({ opacity: Math.max(0.15, orbOpacity - 0.05) })}
              style={styles.stepBtn}
            >
              <Text style={styles.stepBtnText}>-5%</Text>
            </TouchableOpacity>

            <View style={styles.presetRow}>
              {OPACITY_PRESETS.map((p) => {
                const active = Math.abs(orbOpacity - p.value) < 0.03;
                return (
                  <TouchableOpacity
                    key={p.label}
                    onPress={() => void updateOrbSettings({ opacity: p.value })}
                    style={[
                      styles.presetChip,
                      active && { backgroundColor: accent.soft, borderColor: accent.primary },
                    ]}
                  >
                    <Text
                      style={[
                        styles.presetText,
                        { color: active ? accent.primary : VORTEX_PALETTE.textSecondary },
                      ]}
                    >
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              onPress={() => void updateOrbSettings({ opacity: Math.min(1.0, orbOpacity + 0.05) })}
              style={styles.stepBtn}
            >
              <Text style={styles.stepBtnText}>+5%</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.accentRow}>
            {(Object.keys(VORTEX_ACCENTS) as VortexAccentKey[]).map((key) => {
              const item = VORTEX_ACCENTS[key];
              const selected = orbAccentKey === key;
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => void updateOrbSettings({ accentKey: key })}
                  style={[
                    styles.accentChip,
                    selected && { borderColor: item.primary, backgroundColor: item.soft },
                  ]}
                >
                  <View style={[styles.accentDot, { backgroundColor: item.primary }]} />
                  <Text
                    style={[
                      styles.accentLabel,
                      { color: selected ? item.primary : VORTEX_PALETTE.textSecondary },
                    ]}
                  >
                    {item.label.split(' ')[1]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            onPress={() => void updateOrbSettings({ stealthMode: !orbStealthMode })}
            style={[styles.toggleRow, styles.borderTop]}
          >
            <View style={styles.toggleInfo}>
              <Text style={[styles.toggleTitle, { fontFamily: fonts.bold }]}>
                Stealth Earpiece & Low-Glare Mode
              </Text>
              <Text style={styles.toggleSub}>
                Dims overlay border and routes voice responses through earpiece
              </Text>
            </View>
            <View
              style={[
                styles.stateBadge,
                {
                  backgroundColor: orbStealthMode ? accent.soft : VORTEX_PALETTE.surfacePill,
                },
              ]}
            >
              <Text
                style={{
                  color: orbStealthMode ? accent.primary : VORTEX_PALETTE.textMuted,
                  fontSize: 10,
                  fontWeight: '800',
                }}
              >
                {orbStealthMode ? 'ON' : 'OFF'}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => void updateOrbSettings({ autoStartBoot: !orbAutoStartBoot })}
            style={[styles.toggleRow, styles.borderTop]}
          >
            <View style={styles.toggleInfo}>
              <Text style={[styles.toggleTitle, { fontFamily: fonts.bold }]}>
                Auto-Restore Orb After Reboot
              </Text>
              <Text style={styles.toggleSub}>
                VortexBootReceiver automatically re-arms overlay & scheduled macros
              </Text>
            </View>
            <View
              style={[
                styles.stateBadge,
                {
                  backgroundColor: orbAutoStartBoot
                    ? VORTEX_PALETTE.successSoft
                    : VORTEX_PALETTE.surfacePill,
                },
              ]}
            >
              <Text
                style={{
                  color: orbAutoStartBoot ? VORTEX_PALETTE.success : VORTEX_PALETTE.textMuted,
                  fontSize: 10,
                  fontWeight: '800',
                }}
              >
                {orbAutoStartBoot ? 'ARMED' : 'MANUAL'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>NATIVE ANDROID SYSTEM PERMISSIONS</Text>
          <TouchableOpacity onPress={() => void refreshNativeDiagnostics()}>
            <Text style={[styles.refreshLink, { color: accent.primary }]}>REFRESH</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          {PERMISSION_ITEMS.map((perm, idx) => {
            const granted = Boolean(permissions[perm.key]);
            return (
              <View
                key={perm.key}
                style={[styles.permRow, idx > 0 && styles.borderTop]}
              >
                <View style={styles.permInfo}>
                  <View style={styles.permTitleRow}>
                    <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
                      <Circle
                        cx={12}
                        cy={12}
                        r={9}
                        stroke={granted ? VORTEX_PALETTE.success : VORTEX_PALETTE.warning}
                        strokeWidth={2}
                      />
                      {granted ? (
                        <Path
                          d="M8.5 12.5l2.3 2.3 4.7-5"
                          stroke={VORTEX_PALETTE.success}
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      ) : null}
                    </Svg>
                    <Text style={[styles.permTitle, { fontFamily: fonts.bold }]}>
                      {perm.title}
                    </Text>
                  </View>
                  <Text style={styles.permSub}>{perm.sub}</Text>
                </View>

                {perm.actionable ? (
                  <TouchableOpacity
                    onPress={() => void handleOpenPermission(perm.intentKey)}
                    style={[
                      styles.permBtn,
                      granted
                        ? {
                            backgroundColor: VORTEX_PALETTE.successSoft,
                            borderColor: VORTEX_PALETTE.success,
                          }
                        : {
                            backgroundColor: VORTEX_PALETTE.warningSoft,
                            borderColor: VORTEX_PALETTE.warning,
                          },
                    ]}
                  >
                    <Text
                      style={[
                        styles.permBtnText,
                        {
                          color: granted ? VORTEX_PALETTE.success : VORTEX_PALETTE.warning,
                        },
                      ]}
                    >
                      {granted ? 'ACTIVE' : 'GRANT'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <View
                    style={[
                      styles.permBtn,
                      {
                        backgroundColor: granted ? accent.soft : VORTEX_PALETTE.surfacePill,
                        borderColor: granted ? accent.border : VORTEX_PALETTE.borderHairline,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.permBtnText,
                        { color: granted ? accent.primary : VORTEX_PALETTE.textMuted },
                      ]}
                    >
                      {granted ? 'RUNNING' : 'IDLE'}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        <Text style={styles.sectionLabel}>AUTONOMOUS APP-LOCK PIN VAULT</Text>
        <View style={styles.card}>
          <TouchableOpacity
            onPress={() => setAutoUnlockAppLock(!autoUnlockAppLock)}
            style={styles.toggleRow}
          >
            <View style={styles.toggleInfo}>
              <Text style={[styles.toggleTitle, { fontFamily: fonts.bold }]}>
                Auto-Unlock AppLock During Ghost Loops
              </Text>
              <Text style={styles.toggleSub}>
                {hasAppLockPin
                  ? 'Encrypted PIN configured in Android Keystore'
                  : 'No PIN stored yet • Configure 4-8 digit PIN below'}
              </Text>
            </View>
            <View
              style={[
                styles.stateBadge,
                {
                  backgroundColor: autoUnlockAppLock ? accent.soft : VORTEX_PALETTE.surfacePill,
                },
              ]}
            >
              <Text
                style={{
                  color: autoUnlockAppLock ? accent.primary : VORTEX_PALETTE.textMuted,
                  fontSize: 10,
                  fontWeight: '800',
                }}
              >
                {autoUnlockAppLock ? 'ENABLED' : 'OFF'}
              </Text>
            </View>
          </TouchableOpacity>

          <View style={[styles.pinRow, styles.borderTop]}>
            <TextInput
              value={pinDraft}
              onChangeText={setPinDraft}
              placeholder={hasAppLockPin ? 'Update 4-8 digit PIN...' : 'Set 4-8 digit AppLock PIN...'}
              placeholderTextColor={VORTEX_PALETTE.textMuted}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={8}
              style={styles.pinInput}
            />
            <TouchableOpacity
              onPress={() => void handleSavePin()}
              style={[styles.savePinBtn, { backgroundColor: accent.primary }]}
            >
              <Text style={styles.savePinText}>ENCRYPT PIN</Text>
            </TouchableOpacity>
          </View>

          {pinFeedback ? <Text style={styles.pinFeedbackText}>{pinFeedback}</Text> : null}
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
  previewStage: {
    backgroundColor: VORTEX_PALETTE.surfaceCard,
    borderRadius: VORTEX_LAYOUT.radiusLg,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  previewTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  miniPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: VORTEX_PALETTE.surfaceElevated,
  },
  miniPillText: {
    color: VORTEX_PALETTE.textSecondary,
    fontSize: 9.5,
    fontWeight: '800',
  },
  orbDemoArena: {
    height: 112,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  radialPillCluster: {
    flexDirection: 'row',
    gap: 8,
  },
  radialNode: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: VORTEX_LAYOUT.radiusPill,
    borderWidth: 1,
    backgroundColor: VORTEX_PALETTE.surfaceElevated,
  },
  radialLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  liveOrbCircle: {
    width: 66,
    height: 66,
    borderRadius: 33,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.55,
    shadowRadius: 14,
    elevation: 6,
  },
  liveOrbGlyph: {
    fontSize: 28,
  },
  previewFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: VORTEX_PALETTE.borderHairline,
  },
  previewStatText: {
    color: VORTEX_PALETTE.textSecondary,
    fontSize: 11,
  },
  launchOrbBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  launchOrbBtnText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  sectionLabel: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.9,
    marginTop: 4,
  },
  refreshLink: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  card: {
    backgroundColor: VORTEX_PALETTE.surfaceCard,
    borderRadius: VORTEX_LAYOUT.radiusMd,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderHairline,
    overflow: 'hidden',
  },
  opacityControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    gap: 6,
  },
  stepBtn: {
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: VORTEX_PALETTE.surfaceElevated,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderStrong,
  },
  stepBtnText: {
    color: VORTEX_PALETTE.textPrimary,
    fontSize: 10,
    fontWeight: '800',
  },
  presetRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
  },
  presetChip: {
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderHairline,
    backgroundColor: VORTEX_PALETTE.surfaceBase,
  },
  presetText: {
    fontSize: 10,
    fontWeight: '800',
  },
  accentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 10,
    paddingBottom: 12,
  },
  accentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: VORTEX_LAYOUT.radiusPill,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderHairline,
    backgroundColor: VORTEX_PALETTE.surfaceBase,
  },
  accentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  accentLabel: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    gap: 10,
  },
  borderTop: {
    borderTopWidth: 1,
    borderTopColor: VORTEX_PALETTE.borderHairline,
  },
  toggleInfo: {
    flex: 1,
    gap: 2,
  },
  toggleTitle: {
    color: VORTEX_PALETTE.textPrimary,
    fontSize: 12.5,
  },
  toggleSub: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 10.5,
    lineHeight: 15,
  },
  stateBadge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    gap: 10,
  },
  permInfo: {
    flex: 1,
    gap: 2,
  },
  permTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  permTitle: {
    color: VORTEX_PALETTE.textPrimary,
    fontSize: 12.5,
  },
  permSub: {
    color: VORTEX_PALETTE.textMuted,
    fontSize: 10.5,
    lineHeight: 14,
  },
  permBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  permBtnText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  pinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    gap: 8,
  },
  pinInput: {
    flex: 1,
    height: 40,
    backgroundColor: VORTEX_PALETTE.surfaceInput,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: VORTEX_PALETTE.borderStrong,
    paddingHorizontal: 12,
    color: VORTEX_PALETTE.textPrimary,
    fontSize: 13,
  },
  savePinBtn: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savePinText: {
    color: VORTEX_PALETTE.oledBlack,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  pinFeedbackText: {
    color: VORTEX_PALETTE.success,
    fontSize: 11,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
});
