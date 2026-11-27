const {
  withAndroidManifest,
  withAppBuildGradle,
  withMainApplication,
  withDangerousMod,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function ensureArray(parent, key) {
  if (!parent[key]) {
    parent[key] = [];
  }
  return parent[key];
}

function upsertByName(list, item) {
  const name = item.$['android:name'];
  const idx = list.findIndex((entry) => entry.$ && entry.$['android:name'] === name);
  if (idx >= 0) {
    list[idx] = item;
  } else {
    list.push(item);
  }
}

const withVortexManifest = (config) => {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const app = manifest.application[0];

    app.$['android:requestLegacyExternalStorage'] = 'true';
    app.$['android:usesCleartextTraffic'] = 'true';

    const queries = ensureArray(manifest, 'queries');
    const hasMainQuery = queries.some(
      (q) =>
        q.intent &&
        q.intent.some(
          (i) =>
            i.action &&
            i.action.some((a) => a.$['android:name'] === 'android.intent.action.MAIN')
        )
    );
    if (!hasMainQuery) {
      queries.push({
        intent: [
          { action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }] },
          { action: [{ $: { 'android:name': 'android.speech.RecognitionService' } }] },
        ],
      });
    }

    const services = ensureArray(app, 'service');
    const receivers = ensureArray(app, 'receiver');

    upsertByName(services, {
      $: {
        'android:name': 'com.vortex.app.VortexAccessibilityService',
        'android:permission': 'android.permission.BIND_ACCESSIBILITY_SERVICE',
        'android:exported': 'true',
      },
      'intent-filter': [
        {
          action: [
            { $: { 'android:name': 'android.accessibilityservice.AccessibilityService' } },
          ],
        },
      ],
      'meta-data': [
        {
          $: {
            'android:name': 'android.accessibilityservice',
            'android:resource': '@xml/vortex_accessibility_config',
          },
        },
      ],
    });

    upsertByName(services, {
      $: {
        'android:name': 'com.vortex.app.VortexFloatingService',
        'android:exported': 'false',
        'android:foregroundServiceType': 'specialUse|microphone',
      },
    });

    upsertByName(services, {
      $: {
        'android:name': 'com.vortex.app.VortexNotificationListener',
        'android:permission': 'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
        'android:exported': 'true',
      },
      'intent-filter': [
        {
          action: [
            {
              $: {
                'android:name': 'android.service.notification.NotificationListenerService',
              },
            },
          ],
        },
      ],
    });

    upsertByName(services, {
      $: {
        'android:name': 'com.vortex.app.VortexTileService',
        'android:label': 'Vortex Orb',
        'android:icon': '@mipmap/ic_launcher',
        'android:permission': 'android.permission.BIND_QUICK_SETTINGS_TILE',
        'android:exported': 'true',
      },
      'intent-filter': [
        {
          action: [
            { $: { 'android:name': 'android.service.quicksettings.TileService' } },
          ],
        },
      ],
    });

    upsertByName(services, {
      $: {
        'android:name': 'com.vortex.app.VortexVoiceInteractionService',
        'android:permission': 'android.permission.BIND_VOICE_INTERACTION',
        'android:exported': 'true',
      },
      'intent-filter': [
        {
          action: [
            { $: { 'android:name': 'android.service.voice.VoiceInteractionService' } },
          ],
        },
      ],
      'meta-data': [
        {
          $: {
            'android:name': 'android.voice_interaction',
            'android:resource': '@xml/vortex_voice_interaction',
          },
        },
      ],
    });

    upsertByName(services, {
      $: {
        'android:name': 'com.vortex.app.VortexVoiceSessionService',
        'android:permission': 'android.permission.BIND_VOICE_INTERACTION',
        'android:exported': 'false',
      },
    });

    upsertByName(receivers, {
      $: {
        'android:name': 'com.vortex.app.VortexAlarmMacroReceiver',
        'android:exported': 'false',
      },
    });

    upsertByName(receivers, {
      $: {
        'android:name': 'com.vortex.app.VortexBootReceiver',
        'android:enabled': 'true',
        'android:exported': 'true',
      },
      'intent-filter': [
        {
          action: [
            { $: { 'android:name': 'android.intent.action.BOOT_COMPLETED' } },
            { $: { 'android:name': 'android.intent.action.LOCKED_BOOT_COMPLETED' } },
            { $: { 'android:name': 'android.intent.action.MY_PACKAGE_REPLACED' } },
            { $: { 'android:name': 'android.intent.action.QUICKBOOT_POWERON' } },
          ],
        },
      ],
    });

    return cfg;
  });
};

const withVortexGradle = (config) => {
  return withAppBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;

    if (!contents.includes('androidx.security:security-crypto')) {
      contents = contents.replace(
        /dependencies\s*\{/,
        `dependencies {\n    implementation("androidx.security:security-crypto:1.1.0-alpha06")\n    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")`
      );
    }

    if (!contents.includes('pickFirst("**/libc++_shared.so")')) {
      contents = contents.replace(
        /android\s*\{/,
        `android {\n    packagingOptions {\n        pickFirst("**/libc++_shared.so")\n        exclude("META-INF/DEPENDENCIES")\n    }`
      );
    }

    cfg.modResults.contents = contents;
    return cfg;
  });
};

const withVortexMainApp = (config) => {
  return withMainApplication(config, (cfg) => {
    let contents = cfg.modResults.contents;
    if (!contents.includes('import com.vortex.app.VortexBridgePackage')) {
      contents = contents.replace(
        /(package\s+[^\n]+)/,
        `$1\nimport com.vortex.app.VortexBridgePackage`
      );
    }
    if (!contents.includes('VortexBridgePackage()')) {
      contents = contents.replace(
        /(PackageList\(this\)\.packages\.apply\s*\{)/,
        `$1\n              add(VortexBridgePackage())`
      );
    }
    cfg.modResults.contents = contents;
    return cfg;
  });
};

const withVortexFiles = (config) => {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const root = cfg.modRequest.projectRoot;
      const androidMain = path.join(root, 'android', 'app', 'src', 'main');
      const javaDest = path.join(androidMain, 'java', 'com', 'vortex', 'app');
      const xmlDest = path.join(androidMain, 'res', 'xml');
      const valuesDest = path.join(androidMain, 'res', 'values');

      fs.mkdirSync(javaDest, { recursive: true });
      fs.mkdirSync(xmlDest, { recursive: true });
      fs.mkdirSync(valuesDest, { recursive: true });

      const nativeSrc = path.join(root, 'android-native');
      if (fs.existsSync(nativeSrc)) {
        const files = fs.readdirSync(nativeSrc).filter((f) => f.endsWith('.kt'));
        for (const file of files) {
          fs.copyFileSync(path.join(nativeSrc, file), path.join(javaDest, file));
        }
      }

      const accXml = `<?xml version="1.0" encoding="utf-8"?>
<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android"
    android:description="@string/vortex_accessibility_desc"
    android:accessibilityEventTypes="typeAllMask"
    android:accessibilityFeedbackType="feedbackGeneric"
    android:accessibilityFlags="flagDefault|flagReportViewIds|flagRetrieveInteractiveWindows|flagRequestFilterKeyEvents"
    android:canRetrieveWindowContent="true"
    android:canPerformGestures="true"
    android:notificationTimeout="50" />
`;
      fs.writeFileSync(path.join(xmlDest, 'vortex_accessibility_config.xml'), accXml);

      const voiceXml = `<?xml version="1.0" encoding="utf-8"?>
<voice-interaction-service xmlns:android="http://schemas.android.com/apk/res/android"
    android:sessionService="com.vortex.app.VortexVoiceSessionService"
    android:recognitionService="com.google.android.googlequicksearchbox/com.google.android.voicesearch.serviceapi.GoogleRecognitionService"
    android:supportsAssist="true"
    android:supportsLaunchVoiceAssistFromKeyguard="true" />
`;
      fs.writeFileSync(path.join(xmlDest, 'vortex_voice_interaction.xml'), voiceXml);

      const stringsPath = path.join(valuesDest, 'strings.xml');
      if (fs.existsSync(stringsPath)) {
        let strContent = fs.readFileSync(stringsPath, 'utf8');
        if (!strContent.includes('vortex_accessibility_desc')) {
          strContent = strContent.replace(
            '</resources>',
            '  <string name="vortex_accessibility_desc">VORTEX Autonomous Screen Reader and Ghost Touch Engine</string>\n</resources>'
          );
          fs.writeFileSync(stringsPath, strContent);
        }
      }

      return cfg;
    },
  ]);
};

module.exports = function withVortexNative(config) {
  config = withVortexManifest(config);
  config = withVortexGradle(config);
  config = withVortexMainApp(config);
  config = withVortexFiles(config);
  return config;
};
