import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { VortexNavigationShell } from './src/components/VortexNavigationShell';
import { VortexPlusActionSheet } from './src/components/VortexPlusActionSheet';
import { ingestRagMemory, seedInitialProjectKnowledge } from './src/db/vortexSqliteRag';
import { vortexGhostAgent } from './src/engines/vortexGhostAgent';
import { vortexLlmRouter } from './src/engines/vortexLlmRouter';
import { vortexMacroScheduler } from './src/engines/vortexMacroScheduler';
import { vortexVoiceWakeword } from './src/engines/vortexVoiceWakeword';
import { VortexChatScreen } from './src/screens/VortexChatScreen';
import { VortexGhostLoopScreen } from './src/screens/VortexGhostLoopScreen';
import { VortexImageStudioScreen } from './src/screens/VortexImageStudioScreen';
import { VortexLocalAiAndCodeCanvasScreen } from './src/screens/VortexLocalAiAndCodeCanvasScreen';
import { VortexMacrosAndWorkflowsScreen } from './src/screens/VortexMacrosAndWorkflowsScreen';
import { VortexOrbStudioScreen } from './src/screens/VortexOrbStudioScreen';
import { VortexStudyNotebooksScreen } from './src/screens/VortexStudyNotebooksScreen';
import { VortexVoiceLiveScreen } from './src/screens/VortexVoiceLiveScreen';
import { useVortexStore, VortexMessage } from './src/store/useVortexStore';
import { loadVortexFontsFromStorage } from './src/theme/typography';
import { VORTEX_PALETTE } from './src/theme/vortexTheme';

export default function App() {
  const [fontsReady, setFontsReady] = React.useState(false);

  const hydrated = useVortexStore((s) => s.hydrated);
  const activeScreen = useVortexStore((s) => s.activeScreen);
  const wakewordEnabled = useVortexStore((s) => s.wakewordEnabled);
  const hydrateStore = useVortexStore((s) => s.hydrateStore);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      await loadVortexFontsFromStorage();
      if (mounted) {
        setFontsReady(true);
      }
      await hydrateStore();
      await seedInitialProjectKnowledge();
      if (!mounted) return;

      vortexMacroScheduler.start();

      vortexVoiceWakeword.setCommandHandler(async (spokenCommand: string) => {
        const store = useVortexStore.getState();
        const sessionId = store.activeSessionId;

        const userMsg: VortexMessage = {
          id: `voice_u_${Date.now()}`,
          role: 'user',
          content: spokenCommand,
          timestamp: Date.now(),
          mode: store.activePromptMode,
        };
        store.appendMessage(sessionId, userMsg);

        try {
          const agentRes = await vortexGhostAgent.executeCommand(spokenCommand);
          if (agentRes.handled) {
            const botMsg: VortexMessage = {
              id: `voice_a_${Date.now()}`,
              role: 'assistant',
              content: agentRes.replyText,
              timestamp: Date.now(),
              mode: 'ghost',
              providerTag: 'VORTEX Ghost Agent',
            };
            store.appendMessage(sessionId, botMsg);
            await vortexVoiceWakeword.speakResponse(agentRes.spokenText || agentRes.replyText);
            return;
          }

          const currentSess = store.sessions.find((s) => s.id === sessionId);
          const history = (currentSess?.messages || []).slice(-8).map((m) => ({
            role: m.role,
            content: m.content,
          }));

          const llmRes = await vortexLlmRouter.generate({
            prompt: spokenCommand,
            history,
            mode: store.activePromptMode,
          });

          const aiMsg: VortexMessage = {
            id: `voice_ai_${Date.now()}`,
            role: 'assistant',
            content: llmRes.text,
            timestamp: Date.now(),
            mode: llmRes.resolvedMode,
            diagramSpec: llmRes.diagramSpec,
            providerTag: llmRes.providerTag,
            latencyMs: llmRes.latencyMs,
          };
          store.appendMessage(sessionId, aiMsg);

          void ingestRagMemory({
            scope: 'vortex',
            title: `Voice Turn: ${spokenCommand.slice(0, 48)}`,
            content: `User: ${spokenCommand}\nAssistant: ${llmRes.text.slice(0, 1200)}`,
            tags: ['voice', llmRes.resolvedMode],
            importance: 2,
          });

          await vortexVoiceWakeword.speakResponse(llmRes.text);
        } catch (err: any) {
          const errText = err?.message || 'Voice command execution failed.';
          store.appendMessage(sessionId, {
            id: `voice_err_${Date.now()}`,
            role: 'assistant',
            content: errText,
            timestamp: Date.now(),
            mode: 'auto',
            isError: true,
          });
          await vortexVoiceWakeword.speakResponse(errText);
        }
      });

      if (useVortexStore.getState().wakewordEnabled) {
        await vortexVoiceWakeword.startContinuousWakeword();
      }
    };

    void bootstrap();

    return () => {
      mounted = false;
      vortexMacroScheduler.stop();
      void vortexVoiceWakeword.shutdown();
    };
  }, [hydrateStore]);

  useEffect(() => {
    if (!hydrated) return;
    if (wakewordEnabled) {
      void vortexVoiceWakeword.startContinuousWakeword();
    } else {
      void vortexVoiceWakeword.shutdown();
    }
  }, [hydrated, wakewordEnabled]);

  const renderActiveScreen = () => {
    switch (activeScreen) {
      case 'voice_live':
        return <VortexVoiceLiveScreen />;
      case 'orb_studio':
      case 'settings':
        return <VortexOrbStudioScreen />;
      case 'image_studio':
        return <VortexImageStudioScreen />;
      case 'study_notebooks':
        return <VortexStudyNotebooksScreen />;
      case 'ghost_loop':
        return <VortexGhostLoopScreen />;
      case 'macros_alarms':
      case 'skills_workflows':
        return <VortexMacrosAndWorkflowsScreen />;
      case 'local_ai_wakeword':
      case 'code_canvas':
        return <VortexLocalAiAndCodeCanvasScreen />;
      case 'chat':
      default:
        return <VortexChatScreen />;
    }
  };

  if (!fontsReady || !hydrated) {
    return (
      <View style={styles.bootContainer}>
        <StatusBar style="light" backgroundColor={VORTEX_PALETTE.oledBlack} />
        <ActivityIndicator size="large" color="#38BDF8" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="light" backgroundColor={VORTEX_PALETTE.oledBlack} />
        <VortexNavigationShell>{renderActiveScreen()}</VortexNavigationShell>
        <VortexPlusActionSheet />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: VORTEX_PALETTE.oledBlack,
  },
  bootContainer: {
    flex: 1,
    backgroundColor: VORTEX_PALETTE.oledBlack,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
