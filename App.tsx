import * as Font from 'expo-font';
import React, { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, NativeModules, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initSqliteRag } from './src/db/vortexSqliteRag';
import { vortexMacroScheduler } from './src/engines/vortexMacroScheduler';
import { vortexVoiceWakeword } from './src/engines/vortexVoiceWakeword';
import { VortexChatScreen } from './src/screens/VortexChatScreen';
import { VortexGhostLoopScreen } from './src/screens/VortexGhostLoopScreen';
import { VortexImageStudioScreen } from './src/screens/VortexImageStudioScreen';
import {
  VortexCodeCanvasScreen,
  VortexLocalAiWakewordScreen,
} from './src/screens/VortexLocalAiAndCodeCanvasScreen';
import { VortexMacrosAndWorkflowsScreen } from './src/screens/VortexMacrosAndWorkflowsScreen';
import { VortexOrbStudioScreen } from './src/screens/VortexOrbStudioScreen';
import { VortexSettingsVaultScreen } from './src/screens/VortexSettingsVaultScreen';
import { VortexStudyNotebooksScreen } from './src/screens/VortexStudyNotebooksScreen';
import { VortexSystemTelemetryScreen } from './src/screens/VortexSystemTelemetryScreen';
import { VortexWebInspectorScreen } from './src/screens/VortexWebInspectorScreen';
import { useVortexStore } from './src/store/useVortexStore';
import { VORTEX_PALETTE } from './src/theme/vortexTheme';

const { VortexBridge } = NativeModules;

export default function App() {
  const activeScreen = useVortexStore((s) => s.activeScreen);
  const hydrateStore = useVortexStore((s) => s.hydrateStore);
  const refreshNativeDiagnostics = useVortexStore((s) => s.refreshNativeDiagnostics);
  const notebooks = useVortexStore((s) => s.notebooks);
  const addNotebook = useVortexStore((s) => s.addNotebook);

  const bootedRef = useRef(false);

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;

    const bootstrapVortex = async () => {
      try {
        await Font.loadAsync({
          Aero: require('./assets/fonts/Aero.ttf'),
          Orbitron: require('./assets/fonts/Orbitron.ttf'),
          'Good Times': require('./assets/fonts/GoodTimes.ttf'),
          'Tech Mono': require('./assets/fonts/ShareTechMono.ttf'),
        });
      } catch (_e) {
      }

      try {
        await initSqliteRag();
      } catch (_e) {
      }

      await hydrateStore();
      await refreshNativeDiagnostics();

      const state = useVortexStore.getState();

      if (state.notebooks.length === 0) {
        const defaults = [
          {
            id: 'nb_ds_301',
            subject: 'Data Structures',
            code: 'CS-303',
            semester: 'SBTET 3rd Sem',
            notes:
              'Stacks, Queues, Linked Lists, Binary Search Trees (BST), AVL Rotations, Graph Traversals (BFS/DFS), Sorting Algorithms (Quick Sort, Merge Sort, Insertion Sort).',
            updatedAt: Date.now(),
          },
          {
            id: 'nb_oop_302',
            subject: 'OOP in C++',
            code: 'CS-302',
            semester: 'SBTET 3rd Sem',
            notes:
              'Classes & Objects, Constructors/Destructors, Operator Overloading, Inheritance Types, Virtual Functions, Runtime Polymorphism, Templates & Exception Handling.',
            updatedAt: Date.now(),
          },
          {
            id: 'nb_cn_303',
            subject: 'Computer Networks',
            code: 'CS-304',
            semester: 'SBTET 3rd Sem',
            notes:
              'OSI 7-Layer Model, TCP/IP Suite, IPv4 Subnetting, Sliding Window Protocols, Routing Algorithms, DNS, HTTP/HTTPS, Network Security.',
            updatedAt: Date.now(),
          },
          {
            id: 'nb_de_304',
            subject: 'Digital Electronics & COA',
            code: 'CS-305',
            semester: 'SBTET 3rd Sem',
            notes:
              'Boolean Algebra, K-Map Minimization, Combinational Circuits (Mux, Adder), Flip-Flops (SR, JK, D, T), Counters, CPU Pipelining & Cache Mapping.',
            updatedAt: Date.now(),
          },
        ];
        defaults.forEach((nb) => addNotebook(nb));
      }

      vortexMacroScheduler.initialize();

      if (state.orbEnabled && VortexBridge?.startFloatingOrb) {
        try {
          await VortexBridge.startFloatingOrb(state.orbOpacity, state.orbAccentKey);
        } catch (_e) {
        }
      }

      if (state.wakewordEnabled) {
        try {
          await vortexVoiceWakeword.startContinuousWakeword();
        } catch (_e) {
        }
      }
    };

    void bootstrapVortex();

    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        void refreshNativeDiagnostics();
      }
    });

    return () => {
      sub.remove();
      vortexMacroScheduler.destroy();
    };
  }, [addNotebook, hydrateStore, refreshNativeDiagnostics]);

  const renderActiveScreen = () => {
    switch (activeScreen) {
      case 'system_telemetry':
        return <VortexSystemTelemetryScreen />;
      case 'web_inspector':
        return <VortexWebInspectorScreen />;
      case 'orb_studio':
        return <VortexOrbStudioScreen />;
      case 'ghost_loop':
        return <VortexGhostLoopScreen />;
      case 'macros_workflows':
        return <VortexMacrosAndWorkflowsScreen />;
      case 'image_studio':
        return <VortexImageStudioScreen />;
      case 'study_notebooks':
        return <VortexStudyNotebooksScreen />;
      case 'local_ai':
        return <VortexLocalAiWakewordScreen />;
      case 'code_canvas':
        return <VortexCodeCanvasScreen />;
      case 'settings_vault':
        return <VortexSettingsVaultScreen />;
      case 'chat':
      default:
        return <VortexChatScreen />;
    }
  };

  return (
    <SafeAreaProvider>
      <View style={styles.rootContainer}>
        <StatusBar
          barStyle="light-content"
          backgroundColor={VORTEX_PALETTE.oledBlack}
          translucent={false}
        />
        {renderActiveScreen()}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: VORTEX_PALETTE.oledBlack,
  },
});
