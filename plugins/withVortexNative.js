const fs = require('fs');
const path = require('path');

let configPlugins;
try {
  configPlugins = require('expo/config-plugins');
} catch (e) {
  configPlugins = require('@expo/config-plugins');
}

const {
  withAndroidManifest,
  withStringsXml,
  withDangerousMod,
} = configPlugins;

function writeFileIfChanged(filePath, content) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, 'utf8');
    if (existing === content) return;
  }
  fs.writeFileSync(filePath, content, 'utf8');
}

const withVortexStrings = (config) =>
  withStringsXml(config, (cfg) => {
    const strings = cfg.modResults.resources.string || [];
    const upsert = (name, value) => {
      const idx = strings.findIndex((s) => s.$ && s.$.name === name);
      if (idx >= 0) {
        strings[idx]._ = value;
      } else {
        strings.push({ $: { name }, _: value });
      }
    };
    upsert('vortex_accessibility_desc', 'VORTEX Autonomous Vision, Human Ghost Touch, and Study Code Injector');
    upsert('vortex_tile_label', 'Vortex Orb');
    cfg.modResults.resources.string = strings;
    return cfg;
  });

const withVortexManifest = (config) =>
  withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    if (!manifest.queries) {
      manifest.queries = [{}];
    }
    const q = manifest.queries[0];
    if (!q.intent) q.intent = [];
    const ensureIntent = (actionName) => {
      const exists = q.intent.some(
        (it) => it.action && it.action[0] && it.action[0].$['android:name'] === actionName
      );
      if (!exists) {
        q.intent.push({
          action: [{ $: { 'android:name': actionName } }],
        });
      }
    };
    ensureIntent('android.intent.action.MAIN');
    ensureIntent('android.speech.RecognitionService');
    ensureIntent('android.intent.action.TTS_SERVICE');

    const app = manifest.application[0];
    if (!app.service) app.service = [];
    if (!app.receiver) app.receiver = [];

    const upsertService = (name, entry) => {
      const idx = app.service.findIndex((s) => s.$ && s.$['android:name'] === name);
      if (idx >= 0) {
        app.service[idx] = entry;
      } else {
        app.service.push(entry);
      }
    };

    upsertService('.VortexAccessibilityService', {
      $: {
        'android:name': '.VortexAccessibilityService',
        'android:label': 'Vortex Autonomous Engine',
        'android:permission': 'android.permission.BIND_ACCESSIBILITY_SERVICE',
        'android:exported': 'true',
      },
      'intent-filter': [
        {
          action: [{ $: { 'android:name': 'android.accessibilityservice.AccessibilityService' } }],
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

    upsertService('.VortexFloatingService', {
      $: {
        'android:name': '.VortexFloatingService',
        'android:enabled': 'true',
        'android:exported': 'false',
        'android:foregroundServiceType': 'microphone|specialUse',
      },
      property: [
        {
          $: {
            'android:name': 'android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE',
            'android:value': 'Autonomous AI Floating Orb and Voice Assistant',
          },
        },
      ],
    });

    upsertService('.VortexNotificationListener', {
      $: {
        'android:name': '.VortexNotificationListener',
        'android:label': 'Vortex Notification Copilot',
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

    upsertService('.VortexQuickTileService', {
      $: {
        'android:name': '.VortexQuickTileService',
        'android:label': '@string/vortex_tile_label',
        'android:icon': '@mipmap/ic_launcher',
        'android:permission': 'android.permission.BIND_QUICK_SETTINGS_TILE',
        'android:exported': 'true',
      },
      'intent-filter': [
        {
          action: [{ $: { 'android:name': 'android.service.quicksettings.action.QS_TILE' } }],
        },
      ],
    });

    const bootIdx = app.receiver.findIndex((r) => r.$ && r.$['android:name'] === '.VortexBootReceiver');
    const bootEntry = {
      $: {
        'android:name': '.VortexBootReceiver',
        'android:enabled': 'true',
        'android:exported': 'true',
      },
      'intent-filter': [
        {
          action: [
            { $: { 'android:name': 'android.intent.action.BOOT_COMPLETED' } },
            { $: { 'android:name': 'android.intent.action.MY_PACKAGE_REPLACED' } },
          ],
        },
      ],
    };
    if (bootIdx >= 0) {
      app.receiver[bootIdx] = bootEntry;
    } else {
      app.receiver.push(bootEntry);
    }

    return cfg;
  });

const withVortexKotlinFiles = (config) =>
  withDangerousMod(config, [
    'android',
    async (cfg) => {
      const root = cfg.modRequest.platformProjectRoot;
      const pkgPath = path.join(root, 'app', 'src', 'main', 'java', 'com', 'vortex', 'app');
      const xmlPath = path.join(root, 'app', 'src', 'main', 'res', 'xml', 'vortex_accessibility_config.xml');

      const mainAppKt = path.join(pkgPath, 'MainApplication.kt');
      if (fs.existsSync(mainAppKt)) {
        let kt = fs.readFileSync(mainAppKt, 'utf8');
        if (!kt.includes('VortexPackage()')) {
          if (kt.includes('PackageList(this).packages.apply {')) {
            kt = kt.replace(
              'PackageList(this).packages.apply {',
              'PackageList(this).packages.apply {\n              add(VortexPackage())'
            );
          } else if (kt.includes('return PackageList(this).packages')) {
            kt = kt.replace(
              'return PackageList(this).packages',
              'val pkgs = PackageList(this).packages\n            pkgs.add(VortexPackage())\n            return pkgs'
            );
          }
          fs.writeFileSync(mainAppKt, kt, 'utf8');
        }
      }

      const mainAppJava = path.join(pkgPath, 'MainApplication.java');
      if (fs.existsSync(mainAppJava)) {
        let jv = fs.readFileSync(mainAppJava, 'utf8');
        if (!jv.includes('new VortexPackage()')) {
          jv = jv.replace(
            'return packages;',
            'packages.add(new VortexPackage());\n          return packages;'
          );
          fs.writeFileSync(mainAppJava, jv, 'utf8');
        }
      }

      // 1. Accessibility XML (System floating button disabled so only single unified Orb exists)
      writeFileIfChanged(
        xmlPath,
        `<?xml version="1.0" encoding="utf-8"?>
<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android"
    android:description="@string/vortex_accessibility_desc"
    android:accessibilityEventTypes="typeAllMask"
    android:accessibilityFeedbackType="feedbackGeneric"
    android:notificationTimeout="80"
    android:canRetrieveWindowContent="true"
    android:canPerformGestures="true"
    android:canTakeScreenshot="true"
    android:accessibilityFlags="flagDefault|flagRetrieveInteractiveWindows|flagReportViewIds|flagIncludeNotImportantViews" />
`
      );

      // 2. VortexAccessibilityService.kt
      writeFileIfChanged(
        path.join(pkgPath, 'VortexAccessibilityService.kt'),
        `package com.vortex.app

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Path
import android.graphics.Rect
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.view.Display
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.util.Random

class VortexAccessibilityService : AccessibilityService() {

    companion object {
        @Volatile
        var instance: VortexAccessibilityService? = null

        @Volatile
        var activePackage: String = ""

        @Volatile
        var isLearningLock: Boolean = false

        @Volatile
        var learnedLockBuffer: String = ""
    }

    private val random = Random()
    private val mainHandler = Handler(Looper.getMainLooper())

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        VortexBridgeModule.emitJsEvent("VortexAccessibilityState", "CONNECTED")
    }

    override fun onUnbind(intent: android.content.Intent?): Boolean {
        instance = null
        VortexBridgeModule.emitJsEvent("VortexAccessibilityState", "DISCONNECTED")
        return super.onUnbind(intent)
    }

    override fun onDestroy() {
        instance = null
        super.onDestroy()
    }

    override fun onInterrupt() {}

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val pkg = event?.packageName?.toString() ?: return
        if (pkg.isNotBlank() && pkg != activePackage) {
            activePackage = pkg
            VortexBridgeModule.emitJsEvent("VortexPackageChanged", pkg)
        }

        if (isLearningLock && event.eventType == AccessibilityEvent.TYPE_VIEW_CLICKED) {
            val src = event.source
            val label = src?.text?.toString()?.trim()
                ?: src?.contentDescription?.toString()?.trim()
                ?: ""
            if (label.isNotEmpty() && label.length <= 12) {
                learnedLockBuffer = if (learnedLockBuffer.isEmpty()) label else learnedLockBuffer + "|" + label
                VortexBridgeModule.emitJsEvent("VortexLockStep", pkg + "::" + learnedLockBuffer)
            }
        }
    }

    fun captureSilentScreenshotBase64(callback: (String?) -> Unit) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            callback(null)
            return
        }
        try {
            takeScreenshot(
                Display.DEFAULT_DISPLAY,
                mainExecutor,
                object : TakeScreenshotCallback {
                    override fun onSuccess(screenshot: ScreenshotResult) {
                        try {
                            val hwBuffer = screenshot.hardwareBuffer
                            val colorSpace = screenshot.colorSpace
                            val hwBitmap = Bitmap.wrapHardwareBuffer(hwBuffer, colorSpace)
                            if (hwBitmap == null) {
                                hwBuffer.close()
                                callback(null)
                                return
                            }
                            val softBitmap = hwBitmap.copy(Bitmap.Config.ARGB_8888, false)
                            hwBuffer.close()
                            hwBitmap.recycle()

                            val targetW = 720
                            val scale = targetW.toFloat() / softBitmap.width.coerceAtLeast(1).toFloat()
                            val targetH = (softBitmap.height * scale).toInt().coerceAtLeast(1)
                            val scaled = Bitmap.createScaledBitmap(softBitmap, targetW, targetH, true)
                            if (scaled != softBitmap) softBitmap.recycle()

                            val out = ByteArrayOutputStream()
                            scaled.compress(Bitmap.CompressFormat.JPEG, 76, out)
                            scaled.recycle()

                            val b64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
                            callback(b64)
                        } catch (_: Exception) {
                            callback(null)
                        }
                    }

                    override fun onFailure(errorCode: Int) {
                        callback(null)
                    }
                }
            )
        } catch (_: Exception) {
            callback(null)
        }
    }

    fun dumpScreenDomJson(): String {
        val arr = JSONArray()
        val root = rootInActiveWindow ?: return arr.toString()

        fun traverse(node: AccessibilityNodeInfo?, depth: Int) {
            if (node == null || depth > 14 || arr.length() >= 130) return
            val text = node.text?.toString()?.trim() ?: ""
            val desc = node.contentDescription?.toString()?.trim() ?: ""
            val viewId = node.viewIdResourceName ?: ""
            val bounds = Rect()
            node.getBoundsInScreen(bounds)

            if ((text.isNotEmpty() || desc.isNotEmpty() || node.isClickable || node.isEditable) &&
                bounds.width() > 4 && bounds.height() > 4
            ) {
                val obj = JSONObject()
                if (text.isNotEmpty()) obj.put("text", text.take(160))
                if (desc.isNotEmpty()) obj.put("desc", desc.take(120))
                if (viewId.isNotEmpty()) obj.put("id", viewId.substringAfterLast("/"))
                obj.put("clickable", node.isClickable)
                obj.put("editable", node.isEditable)
                obj.put("scrollable", node.isScrollable)
                obj.put("cx", bounds.centerX())
                obj.put("cy", bounds.centerY())
                arr.put(obj)
            }

            for (i in 0 until node.childCount) {
                traverse(node.getChild(i), depth + 1)
            }
        }

        try {
            traverse(root, 0)
        } catch (_: Exception) {}
        return arr.toString()
    }

    fun humanTap(x: Float, y: Float): Boolean {
        val jitterX = (x + (random.nextFloat() * 10f - 5f)).coerceAtLeast(1f)
        val jitterY = (y + (random.nextFloat() * 10f - 5f)).coerceAtLeast(1f)
        val holdMs = (50 + random.nextInt(55)).toLong()
        val path = Path().apply { moveTo(jitterX, jitterY) }
        val stroke = GestureDescription.StrokeDescription(path, 0L, holdMs)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()
        return dispatchGesture(gesture, null, null)
    }

    fun humanSwipe(x1: Float, y1: Float, x2: Float, y2: Float, durationMs: Long): Boolean {
        val midX = (x1 + x2) / 2f + (random.nextFloat() * 70f - 35f)
        val midY = (y1 + y2) / 2f + (random.nextFloat() * 70f - 35f)
        val safeDur = durationMs.coerceIn(180L, 1400L)
        val path = Path().apply {
            moveTo(x1.coerceAtLeast(1f), y1.coerceAtLeast(1f))
            quadTo(midX.coerceAtLeast(1f), midY.coerceAtLeast(1f), x2.coerceAtLeast(1f), y2.coerceAtLeast(1f))
        }
        val stroke = GestureDescription.StrokeDescription(path, 0L, safeDur)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()
        return dispatchGesture(gesture, null, null)
    }

    fun drawPatternGesture(pointsCsv: String): Boolean {
        val pairs = pointsCsv.split(";").mapNotNull { token ->
            val parts = token.split(",")
            if (parts.size == 2) {
                val px = parts[0].trim().toFloatOrNull()
                val py = parts[1].trim().toFloatOrNull()
                if (px != null && py != null) Pair(px, py) else null
            } else null
        }
        if (pairs.size < 2) return false
        val path = Path().apply {
            moveTo(pairs[0].first, pairs[0].second)
            for (i in 1 until pairs.size) {
                lineTo(pairs[i].first, pairs[i].second)
            }
        }
        val stroke = GestureDescription.StrokeDescription(path, 0L, 480L)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()
        return dispatchGesture(gesture, null, null)
    }

    fun clickNodeByQuery(query: String): Boolean {
        val root = rootInActiveWindow ?: return false
        val target = query.trim().lowercase()
        if (target.isEmpty()) return false

        var matched: AccessibilityNodeInfo? = null

        fun search(node: AccessibilityNodeInfo?) {
            if (node == null || matched != null) return
            val t = node.text?.toString()?.lowercase() ?: ""
            val d = node.contentDescription?.toString()?.lowercase() ?: ""
            val id = node.viewIdResourceName?.lowercase() ?: ""
            if (t.contains(target) || d.contains(target) || id.endsWith(target)) {
                matched = node
                return
            }
            for (i in 0 until node.childCount) {
                search(node.getChild(i))
            }
        }

        search(root)
        val found = matched ?: return false

        var clickCandidate: AccessibilityNodeInfo? = found
        var hops = 0
        while (clickCandidate != null && !clickCandidate.isClickable && hops < 4) {
            clickCandidate = clickCandidate.parent
            hops++
        }
        if (clickCandidate != null && clickCandidate.isClickable) {
            if (clickCandidate.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true
        }

        val rect = Rect()
        found.getBoundsInScreen(rect)
        if (rect.width() > 0 && rect.height() > 0) {
            return humanTap(rect.centerX().toFloat(), rect.centerY().toFloat())
        }
        return false
    }

    fun injectTextToEditable(text: String, humanMode: Boolean): Boolean {
        val root = rootInActiveWindow ?: return false
        var targetNode: AccessibilityNodeInfo? = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)

        if (targetNode == null || !targetNode.isEditable) {
            fun findEditable(node: AccessibilityNodeInfo?) {
                if (node == null || targetNode != null) return
                if (node.isEditable && node.isVisibleToUser) {
                    targetNode = node
                    return
                }
                for (i in 0 until node.childCount) {
                    findEditable(node.getChild(i))
                }
            }
            findEditable(root)
        }

        val node = targetNode ?: return false
        node.performAction(AccessibilityNodeInfo.ACTION_FOCUS)

        if (!humanMode || text.length > 45) {
            val args = Bundle().apply {
                putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
            }
            val ok = node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
            if (ok) return true

            val cm = getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
            cm?.setPrimaryClip(ClipData.newPlainText("VortexCode", text))
            return node.performAction(AccessibilityNodeInfo.ACTION_PASTE)
        } else {
            var current = ""
            for (i in text.indices) {
                val ch = text[i]
                val delay = (i * (42 + random.nextInt(48))).toLong()
                mainHandler.postDelayed({
                    current += ch
                    val args = Bundle().apply {
                        putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, current)
                    }
                    node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
                }, delay)
            }
            return true
        }
    }

    fun replayPinNodes(pinCsv: String): Boolean {
        val digits = pinCsv.split(",").map { it.trim() }.filter { it.isNotEmpty() }
        if (digits.isEmpty()) return false
        digits.forEachIndexed { idx, digit ->
            mainHandler.postDelayed({
                clickNodeByQuery(digit)
            }, (idx * 240L))
        }
        return true
    }

    fun executeGlobalActionName(name: String): Boolean {
        val code = when (name.uppercase()) {
            "BACK" -> GLOBAL_ACTION_BACK
            "HOME" -> GLOBAL_ACTION_HOME
            "RECENTS" -> GLOBAL_ACTION_RECENTS
            "NOTIFICATIONS" -> GLOBAL_ACTION_NOTIFICATIONS
            "QUICK_SETTINGS" -> GLOBAL_ACTION_QUICK_SETTINGS
            "POWER_DIALOG" -> GLOBAL_ACTION_POWER_DIALOG
            "LOCK_SCREEN" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) GLOBAL_ACTION_LOCK_SCREEN else return false
            "SPLIT_SCREEN" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) GLOBAL_ACTION_TOGGLE_SPLIT_SCREEN else return false
            else -> return false
        }
        return performGlobalAction(code)
    }
}
`
      );

            // 3. VortexFloatingService.kt
      writeFileIfChanged(
        path.join(pkgPath, 'VortexFloatingService.kt'),
        `package com.vortex.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.DisplayMetrics
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import java.util.Locale

class VortexFloatingService : Service() {

    companion object {
        @Volatile
        var instance: VortexFloatingService? = null

        @Volatile
        var isRunning: Boolean = false

        @Volatile
        var micMode: String = "porcupine"

        @Volatile
        var baseIdleAlpha: Float = 0.40f
    }

    private lateinit var windowManager: WindowManager
    private var orbView: TextView? = null
    private var orbParams: WindowManager.LayoutParams? = null
    private var capsuleView: LinearLayout? = null
    private var capsuleParams: WindowManager.LayoutParams? = null
    private var capsuleTitleView: TextView? = null
    private var capsuleBodyView: TextView? = null

    private val mainHandler = Handler(Looper.getMainLooper())
    private var screenWidth = 1080
    private var screenHeight = 2200
    private var isCapsuleOpen = false

    private var speechRecognizer: SpeechRecognizer? = null
    private var isListeningNative = false
    private var lastClipText = ""
    private var lastClipTime = 0L

    private val dimRunnable = Runnable {
        if (!isCapsuleOpen && !isListeningNative) {
            orbView?.animate()?.alpha(baseIdleAlpha)?.setDuration(350)?.start()
        }
    }

    private val clipListener = ClipboardManager.OnPrimaryClipChangedListener {
        try {
            val cm = getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
            val clip = cm?.primaryClip
            if (clip != null && clip.itemCount > 0) {
                val txt = clip.getItemAt(0).coerceToText(this)?.toString()?.trim() ?: ""
                val now = System.currentTimeMillis()
                if (txt.length >= 4 && (txt != lastClipText || now - lastClipTime > 4000L)) {
                    lastClipText = txt
                    lastClipTime = now
                    pulseOrbTemporarily(0.90f, 1600L)
                    VortexBridgeModule.emitJsEvent("VortexClipboardChanged", txt.take(2500))
                }
            }
        } catch (_: Exception) {}
    }

    private val hardwareReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                Intent.ACTION_POWER_CONNECTED -> {
                    pulseOrbTemporarily(0.95f, 1500L)
                    VortexBridgeModule.emitJsEvent("VortexHardwareEvent", "CHARGER_CONNECTED")
                }
                Intent.ACTION_POWER_DISCONNECTED -> {
                    VortexBridgeModule.emitJsEvent("VortexHardwareEvent", "CHARGER_DISCONNECTED")
                }
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
        isRunning = true

        getSharedPreferences("vortex_prefs", Context.MODE_PRIVATE)
            .edit()
            .putBoolean("orb_enabled", true)
            .apply()

        startForegroundNotification()
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val metrics = DisplayMetrics()
        @Suppress("DEPRECATION")
        windowManager.defaultDisplay.getMetrics(metrics)
        screenWidth = metrics.widthPixels
        screenHeight = metrics.heightPixels

        createUnifiedOrb()
        createGlassCapsule()

        try {
            val cm = getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
            cm?.addPrimaryClipChangedListener(clipListener)
        } catch (_: Exception) {}

        try {
            val filter = IntentFilter().apply {
                addAction(Intent.ACTION_POWER_CONNECTED)
                addAction(Intent.ACTION_POWER_DISCONNECTED)
            }
            registerReceiver(hardwareReceiver, filter)
        } catch (_: Exception) {}

        if (micMode == "native_silent") {
            mainHandler.postDelayed({ startZeroBeepListen() }, 900L)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        isRunning = false
        instance = null
        try {
            val cm = getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
            cm?.removePrimaryClipChangedListener(clipListener)
        } catch (_: Exception) {}
        try {
            unregisterReceiver(hardwareReceiver)
        } catch (_: Exception) {}
        try {
            speechRecognizer?.destroy()
        } catch (_: Exception) {}
        try {
            if (orbView != null) windowManager.removeView(orbView)
            if (capsuleView != null) windowManager.removeView(capsuleView)
        } catch (_: Exception) {}
        super.onDestroy()
    }

    private fun startForegroundNotification() {
        val channelId = "vortex_core_channel"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val ch = NotificationChannel(
                channelId,
                "Vortex Autonomous Core",
                NotificationManager.IMPORTANCE_MIN
            ).apply {
                setShowBadge(false)
                setSound(null, null)
            }
            nm.createNotificationChannel(ch)
        }

        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pi = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, channelId)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }

        val notification = builder
            .setContentTitle("VORTEX ẞ Active")
            .setContentText("Autonomous Orb & Vision Ready")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentIntent(pi)
            .setOngoing(true)
            .build()

        startForeground(4041, notification)
    }

    private fun createUnifiedOrb() {
        val sizePx = (52 * resources.displayMetrics.density).toInt()
        val prefs = getSharedPreferences("vortex_prefs", Context.MODE_PRIVATE)
        val savedX = prefs.getInt("orb_x", screenWidth - sizePx - 20)
        val savedY = prefs.getInt("orb_y", screenHeight / 3)

        val bg = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setColor(Color.parseColor("#CC070B14"))
            setStroke((2 * resources.displayMetrics.density).toInt(), Color.parseColor("#38BDF8"))
        }

        val tv = TextView(this).apply {
            text = "ẞ"
            textSize = 21f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#38BDF8"))
            gravity = Gravity.CENTER
            background = bg
            alpha = baseIdleAlpha
            elevation = 14f
        }

        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }

        val params = WindowManager.LayoutParams(
            sizePx,
            sizePx,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = savedX
            y = savedY
        }

        var initialX = 0
        var initialY = 0
        var touchX = 0f
        var touchY = 0f
        var moved = false
        var lastTapTime = 0L
        var longPressTriggered = false

        val longPressRunnable = Runnable {
            if (!moved) {
                longPressTriggered = true
                vibrateShort(28L)
                pulseOrbTemporarily(1.0f, 2200L)
                VortexBridgeModule.emitJsEvent("VortexOrbAction", "LONG_PRESS_SCAN")
            }
        }

        tv.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    initialX = params.x
                    initialY = params.y
                    touchX = event.rawX
                    touchY = event.rawY
                    moved = false
                    longPressTriggered = false
                    mainHandler.removeCallbacks(dimRunnable)
                    tv.alpha = 1.0f
                    mainHandler.postDelayed(longPressRunnable, 550L)
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = (event.rawX - touchX).toInt()
                    val dy = (event.rawY - touchY).toInt()
                    if (kotlin.math.abs(dx) > 12 || kotlin.math.abs(dy) > 12) {
                        moved = true
                        mainHandler.removeCallbacks(longPressRunnable)
                        params.x = (initialX + dx).coerceIn(0, screenWidth - sizePx)
                        params.y = (initialY + dy).coerceIn(40, screenHeight - sizePx - 40)
                        windowManager.updateViewLayout(tv, params)
                    }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    mainHandler.removeCallbacks(longPressRunnable)
                    if (moved) {
                        val snapX = if (params.x + sizePx / 2 < screenWidth / 2) 18 else (screenWidth - sizePx - 18)
                        params.x = snapX
                        windowManager.updateViewLayout(tv, params)
                        prefs.edit().putInt("orb_x", snapX).putInt("orb_y", params.y).apply()
                        scheduleDim()
                    } else if (!longPressTriggered) {
                        val now = System.currentTimeMillis()
                        if (now - lastTapTime < 310L) {
                            lastTapTime = 0L
                            vibrateShort(20L)
                            startZeroBeepListen()
                            VortexBridgeModule.emitJsEvent("VortexOrbAction", "DOUBLE_TAP_VOICE")
                        } else {
                            lastTapTime = now
                            mainHandler.postDelayed({
                                if (lastTapTime != 0L) {
                                    lastTapTime = 0L
                                    toggleCapsule()
                                }
                            }, 320L)
                        }
                    }
                    true
                }
                else -> false
            }
        }

        orbView = tv
        orbParams = params
        windowManager.addView(tv, params)
    }

    private fun createGlassCapsule() {
        val density = resources.displayMetrics.density
        val cardW = (screenWidth * 0.86f).toInt().coerceAtMost((360 * density).toInt())

        val cardBg = GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            cornerRadius = 22 * density
            setColor(Color.parseColor("#EE080C15"))
            setStroke((1.5f * density).toInt(), Color.parseColor("#38BDF8"))
        }

        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = cardBg
            setPadding((16 * density).toInt(), (14 * density).toInt(), (16 * density).toInt(), (14 * density).toInt())
            visibility = View.GONE
            elevation = 20f
        }

        val titleTv = TextView(this).apply {
            text = "VORTEX ẞ • AUTONOMOUS HUD"
            textSize = 13f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#38BDF8"))
        }

        val bodyTv = TextView(this).apply {
            text = "Tap SCAN to read screen & inject code, or MIC for zero-beep voice."
            textSize = 15f
            setTextColor(Color.parseColor("#F1F5F9"))
            setPadding(0, (8 * density).toInt(), 0, (12 * density).toInt())
            maxLines = 8
        }

        val btnRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }

        fun makeActionChip(label: String, strokeHex: String, textHex: String, onClick: () -> Unit): TextView {
            val chipBg = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = 12 * density
                setColor(Color.parseColor("#131B2E"))
                setStroke((1 * density).toInt(), Color.parseColor(strokeHex))
            }
            return TextView(this).apply {
                text = label
                textSize = 12.5f
                typeface = Typeface.DEFAULT_BOLD
                setTextColor(Color.parseColor(textHex))
                gravity = Gravity.CENTER
                background = chipBg
                setPadding((12 * density).toInt(), (7 * density).toInt(), (12 * density).toInt(), (7 * density).toInt())
                val lp = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                    marginEnd = (6 * density).toInt()
                }
                layoutParams = lp
                setOnClickListener { onClick() }
            }
        }

        btnRow.addView(makeActionChip("SCAN", "#38BDF8", "#38BDF8") {
            updateHud("VORTEX VISION", "Scanning screen & DOM...", true)
            VortexBridgeModule.emitJsEvent("VortexOrbAction", "CAPSULE_SCAN")
        })

        btnRow.addView(makeActionChip("MIC", "#34D399", "#34D399") {
            updateHud("VORTEX VOICE", "Listening silently...", true)
            startZeroBeepListen()
        })

        btnRow.addView(makeActionChip("INJECT", "#A78BFA", "#A78BFA") {
            VortexBridgeModule.emitJsEvent("VortexOrbAction", "CAPSULE_INJECT")
        })

        btnRow.addView(makeActionChip("HIDE", "#64748B", "#CBD5E1") {
            hideCapsule()
        })

        container.addView(titleTv)
        container.addView(bodyTv)
        container.addView(btnRow)

        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }

        val params = WindowManager.LayoutParams(
            cardW,
            WindowManager.LayoutParams.WRAP_CONTENT,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
            y = (90 * density).toInt()
        }

        capsuleView = container
        capsuleTitleView = titleTv
        capsuleBodyView = bodyTv
        capsuleParams = params
        windowManager.addView(container, params)
    }

    fun toggleCapsule() {
        if (isCapsuleOpen) hideCapsule() else showCapsule()
    }

    fun showCapsule() {
        isCapsuleOpen = true
        mainHandler.removeCallbacks(dimRunnable)
        orbView?.alpha = 1.0f
        capsuleView?.visibility = View.VISIBLE
    }

    fun hideCapsule() {
        isCapsuleOpen = false
        capsuleView?.visibility = View.GONE
        scheduleDim()
    }

    fun updateHud(title: String, body: String, openCapsule: Boolean) {
        mainHandler.post {
            capsuleTitleView?.text = title
            capsuleBodyView?.text = body
            if (openCapsule) {
                showCapsule()
            } else {
                pulseOrbTemporarily(0.95f, 2000L)
            }
        }
    }

    fun setIdleAlpha(newAlpha: Float) {
        baseIdleAlpha = newAlpha.coerceIn(0.15f, 1.0f)
        mainHandler.post {
            if (!isCapsuleOpen && !isListeningNative) {
                orbView?.alpha = baseIdleAlpha
            }
        }
    }

    fun pulseOrbTemporarily(peakAlpha: Float, holdMs: Long) {
        mainHandler.post {
            mainHandler.removeCallbacks(dimRunnable)
            orbView?.animate()?.alpha(peakAlpha)?.setDuration(180)?.start()
            mainHandler.postDelayed(dimRunnable, holdMs)
        }
    }

    private fun scheduleDim() {
        mainHandler.removeCallbacks(dimRunnable)
        mainHandler.postDelayed(dimRunnable, 2400L)
    }

    private fun vibrateShort(ms: Long) {
        try {
            @Suppress("DEPRECATION")
            val vib = getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vib?.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")
                vib?.vibrate(ms)
            }
        } catch (_: Exception) {}
    }

    fun duckSystemBeepStreams(durationMs: Long) {
        try {
            val am = getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
            am.adjustStreamVolume(AudioManager.STREAM_NOTIFICATION, AudioManager.ADJUST_MUTE, 0)
            am.adjustStreamVolume(AudioManager.STREAM_SYSTEM, AudioManager.ADJUST_MUTE, 0)
            mainHandler.postDelayed({
                try {
                    am.adjustStreamVolume(AudioManager.STREAM_NOTIFICATION, AudioManager.ADJUST_UNMUTE, 0)
                    am.adjustStreamVolume(AudioManager.STREAM_SYSTEM, AudioManager.ADJUST_UNMUTE, 0)
                } catch (_: Exception) {}
            }, durationMs.coerceIn(150L, 1200L))
        } catch (_: Exception) {}
    }

    fun startZeroBeepListen() {
        mainHandler.post {
            if (!SpeechRecognizer.isRecognitionAvailable(this)) return@post
            try {
                duckSystemBeepStreams(420L)
                speechRecognizer?.destroy()
                speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this).apply {
                    setRecognitionListener(object : RecognitionListener {
                        override fun onReadyForSpeech(params: Bundle?) {
                            isListeningNative = true
                            orbView?.alpha = 1.0f
                        }
                        override fun onBeginningOfSpeech() {}
                        override fun onRmsChanged(rmsdB: Float) {}
                        override fun onBufferReceived(buffer: ByteArray?) {}
                        override fun onEndOfSpeech() {
                            duckSystemBeepStreams(320L)
                        }
                        override fun onError(error: Int) {
                            isListeningNative = false
                            duckSystemBeepStreams(300L)
                            scheduleDim()
                            if (micMode == "native_silent") {
                                mainHandler.postDelayed({ startZeroBeepListen() }, 950L)
                            }
                        }
                        override fun onResults(results: Bundle?) {
                            isListeningNative = false
                            duckSystemBeepStreams(280L)
                            scheduleDim()
                            val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                            val heard = matches?.firstOrNull()?.trim() ?: ""
                            if (heard.isNotEmpty()) {
                                VortexBridgeModule.emitJsEvent("VortexVoiceTranscript", heard)
                            }
                            if (micMode == "native_silent") {
                                mainHandler.postDelayed({ startZeroBeepListen() }, 750L)
                            }
                        }
                        override fun onPartialResults(partialResults: Bundle?) {}
                        override fun onEvent(eventType: Int, params: Bundle?) {}
                    })
                }
                val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault())
                    putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
                    putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                }
                speechRecognizer?.startListening(intent)
            } catch (_: Exception) {
                isListeningNative = false
            }
        }
    }
}
`
      );

      // 4. VortexNotificationListener.kt
      writeFileIfChanged(
        path.join(pkgPath, 'VortexNotificationListener.kt'),
        `package com.vortex.app

import android.app.Notification
import android.app.RemoteInput
import android.content.Intent
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList

class VortexNotificationListener : NotificationListenerService() {

    companion object {
        @Volatile
        var instance: VortexNotificationListener? = null

        @Volatile
        var isConnected: Boolean = false

        @Volatile
        var lastNotificationSummary: String = ""

        val activeSbnMap = ConcurrentHashMap<String, StatusBarNotification>()
        val recentFeed = CopyOnWriteArrayList<String>()
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        instance = this
        isConnected = true
    }

    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        isConnected = false
        instance = null
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn == null) return
        val pkg = sbn.packageName ?: return
        if (pkg == packageName) return
        val extras = sbn.notification?.extras ?: return
        val title = extras.getCharSequence("android.title")?.toString()?.trim() ?: ""
        val text = extras.getCharSequence("android.text")?.toString()?.trim() ?: ""
        if (title.isEmpty() && text.isEmpty()) return

        activeSbnMap[sbn.key] = sbn
        lastNotificationSummary = pkg + ": " + title + " - " + text

        val canReply = hasRemoteInput(sbn.notification)
        val item = JSONObject().apply {
            put("key", sbn.key)
            put("pkg", pkg)
            put("title", title.take(80))
            put("text", text.take(220))
            put("time", sbn.postTime)
            put("canReply", canReply)
        }
        recentFeed.add(0, item.toString())
        while (recentFeed.size > 25) {
            recentFeed.removeAt(recentFeed.size - 1)
        }

        if (canReply) {
            VortexBridgeModule.emitJsEvent("VortexIncomingMessage", item.toString())
        }
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        if (sbn != null) {
            activeSbnMap.remove(sbn.key)
        }
    }

    private fun hasRemoteInput(notification: Notification?): Boolean {
        val actions = notification?.actions ?: return false
        return actions.any { act ->
            val ri = act.remoteInputs
            ri != null && ri.isNotEmpty()
        }
    }

    fun replyToTarget(targetQuery: String, replyMessage: String): Boolean {
        val needle = targetQuery.trim().lowercase()
        for (sbn in activeSbnMap.values) {
            val extras = sbn.notification?.extras ?: continue
            val title = extras.getCharSequence("android.title")?.toString()?.lowercase() ?: ""
            val text = extras.getCharSequence("android.text")?.toString()?.lowercase() ?: ""
            val pkg = sbn.packageName?.lowercase() ?: ""

            if (needle.isEmpty() || title.contains(needle) || text.contains(needle) || pkg.contains(needle)) {
                val actions = sbn.notification?.actions ?: continue
                for (action in actions) {
                    val remoteInputs = action.remoteInputs
                    if (remoteInputs != null && remoteInputs.isNotEmpty()) {
                        try {
                            val replyIntent = Intent()
                            val bundle = Bundle()
                            for (ri in remoteInputs) {
                                bundle.putCharSequence(ri.resultKey, replyMessage)
                            }
                            RemoteInput.addResultsToIntent(remoteInputs, replyIntent, bundle)
                            action.actionIntent.send(this, 0, replyIntent)
                            return true
                        } catch (_: Exception) {}
                    }
                }
            }
        }
        return false
    }

    fun getFeedJson(): String {
        val arr = JSONArray()
        for (raw in recentFeed) {
            try {
                arr.put(JSONObject(raw))
            } catch (_: Exception) {}
        }
        return arr.toString()
    }
}
`
      );

      // 5. VortexQuickTileService.kt & VortexBootReceiver.kt
      writeFileIfChanged(
        path.join(pkgPath, 'VortexQuickTileService.kt'),
        `package com.vortex.app

import android.content.Intent
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

class VortexQuickTileService : TileService() {

    override fun onStartListening() {
        super.onStartListening()
        qsTile?.state = if (VortexFloatingService.isRunning) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
        qsTile?.updateTile()
    }

    override fun onClick() {
        super.onClick()
        val intent = Intent(this, VortexFloatingService::class.java)
        if (VortexFloatingService.isRunning) {
            stopService(intent)
            qsTile?.state = Tile.STATE_INACTIVE
        } else {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(intent)
            } else {
                startService(intent)
            }
            qsTile?.state = Tile.STATE_ACTIVE
        }
        qsTile?.updateTile()
    }
}
`
      );

      writeFileIfChanged(
        path.join(pkgPath, 'VortexBootReceiver.kt'),
        `package com.vortex.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings

class VortexBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        if (action == Intent.ACTION_BOOT_COMPLETED || action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            val prefs = context.getSharedPreferences("vortex_prefs", Context.MODE_PRIVATE)
            val enabled = prefs.getBoolean("orb_enabled", true)
            if (enabled && Settings.canDrawOverlays(context)) {
                val svc = Intent(context, VortexFloatingService::class.java)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(svc)
                } else {
                    context.startService(svc)
                }
            }
        }
    }
}
`
      );

            // 6. VortexBridgeModule.kt
      writeFileIfChanged(
        path.join(pkgPath, 'VortexBridgeModule.kt'),
        `package com.vortex.app

import android.app.ActivityManager
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.hardware.camera2.CameraManager
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.os.Environment
import android.os.StatFs
import android.provider.ContactsContract
import android.provider.Settings
import android.telephony.SmsManager
import android.text.TextUtils
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONArray
import org.json.JSONObject

class VortexBridgeModule(private val appContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(appContext) {

    companion object {
        @Volatile
        var reactCtx: ReactApplicationContext? = null

        fun emitJsEvent(eventName: String, payload: String) {
            try {
                reactCtx
                    ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    ?.emit(eventName, payload)
            } catch (_: Exception) {}
        }
    }

    init {
        Companion.reactCtx = appContext
    }

    override fun getName(): String = "VortexBridge"

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    @ReactMethod
    fun startFloatingOrb(promise: Promise) {
        try {
            if (!Settings.canDrawOverlays(appContext)) {
                promise.resolve(false)
                return
            }
            val intent = Intent(appContext, VortexFloatingService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                appContext.startForegroundService(intent)
            } else {
                appContext.startService(intent)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ORB_ERR", e.message)
        }
    }

    @ReactMethod
    fun stopFloatingOrb(promise: Promise) {
        try {
            appContext.getSharedPreferences("vortex_prefs", Context.MODE_PRIVATE)
                .edit()
                .putBoolean("orb_enabled", false)
                .apply()
            appContext.stopService(Intent(appContext, VortexFloatingService::class.java))
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ORB_STOP_ERR", e.message)
        }
    }

    @ReactMethod
    fun setOrbOpacity(alpha: Double, promise: Promise) {
        VortexFloatingService.instance?.setIdleAlpha(alpha.toFloat())
        VortexFloatingService.baseIdleAlpha = alpha.toFloat().coerceIn(0.15f, 1.0f)
        promise.resolve(true)
    }

    @ReactMethod
    fun updateFloatingHud(title: String, body: String, openCapsule: Boolean, promise: Promise) {
        VortexFloatingService.instance?.updateHud(title, body, openCapsule)
        promise.resolve(true)
    }

    @ReactMethod
    fun setMicMode(mode: String, promise: Promise) {
        VortexFloatingService.micMode = mode
        if (mode == "native_silent") {
            VortexFloatingService.instance?.startZeroBeepListen()
        }
        promise.resolve(true)
    }

    @ReactMethod
    fun triggerZeroBeepListen(promise: Promise) {
        val svc = VortexFloatingService.instance
        if (svc != null) {
            svc.startZeroBeepListen()
            promise.resolve(true)
        } else {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun muteSystemBeepsTemporarily(durationMs: Int, promise: Promise) {
        VortexFloatingService.instance?.duckSystemBeepStreams(durationMs.toLong())
        promise.resolve(true)
    }

    @ReactMethod
    fun isAccessibilityEnabled(promise: Promise) {
        try {
            val expected = appContext.packageName + "/" + VortexAccessibilityService::class.java.canonicalName
            val enabledServices = Settings.Secure.getString(
                appContext.contentResolver,
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
            ) ?: ""
            val splitter = TextUtils.SimpleStringSplitter(':')
            splitter.setString(enabledServices)
            var found = VortexAccessibilityService.instance != null
            while (splitter.hasNext()) {
                if (splitter.next().equals(expected, ignoreCase = true)) {
                    found = true
                    break
                }
            }
            promise.resolve(found)
        } catch (_: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun openAccessibilitySettings(promise: Promise) {
        val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        appContext.startActivity(intent)
        promise.resolve(true)
    }

    @ReactMethod
    fun canDrawOverlays(promise: Promise) {
        promise.resolve(Settings.canDrawOverlays(appContext))
    }

    @ReactMethod
    fun openOverlaySettings(promise: Promise) {
        val intent = Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:" + appContext.packageName)
        ).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        appContext.startActivity(intent)
        promise.resolve(true)
    }

    @ReactMethod
    fun isNotificationListenerEnabled(promise: Promise) {
        try {
            val flat = Settings.Secure.getString(
                appContext.contentResolver,
                "enabled_notification_listeners"
            ) ?: ""
            promise.resolve(flat.contains(appContext.packageName) || VortexNotificationListener.isConnected)
        } catch (_: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun openNotificationListenerSettings(promise: Promise) {
        val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        appContext.startActivity(intent)
        promise.resolve(true)
    }

    @ReactMethod
    fun captureScreenBase64(promise: Promise) {
        val svc = VortexAccessibilityService.instance
        if (svc == null) {
            promise.resolve(null)
            return
        }
        svc.captureSilentScreenshotBase64 { b64 ->
            promise.resolve(b64)
        }
    }

    @ReactMethod
    fun dumpScreenDom(promise: Promise) {
        val svc = VortexAccessibilityService.instance
        if (svc == null) {
            promise.resolve("[]")
            return
        }
        promise.resolve(svc.dumpScreenDomJson())
    }

    @ReactMethod
    fun humanTap(x: Double, y: Double, promise: Promise) {
        val svc = VortexAccessibilityService.instance
        promise.resolve(svc?.humanTap(x.toFloat(), y.toFloat()) ?: false)
    }

    @ReactMethod
    fun humanSwipe(x1: Double, y1: Double, x2: Double, y2: Double, durationMs: Int, promise: Promise) {
        val svc = VortexAccessibilityService.instance
        promise.resolve(
            svc?.humanSwipe(x1.toFloat(), y1.toFloat(), x2.toFloat(), y2.toFloat(), durationMs.toLong()) ?: false
        )
    }

    @ReactMethod
    fun clickNodeByQuery(query: String, promise: Promise) {
        val svc = VortexAccessibilityService.instance
        promise.resolve(svc?.clickNodeByQuery(query) ?: false)
    }

    @ReactMethod
    fun injectTextToScreen(text: String, humanMode: Boolean, promise: Promise) {
        val svc = VortexAccessibilityService.instance
        promise.resolve(svc?.injectTextToEditable(text, humanMode) ?: false)
    }

    @ReactMethod
    fun performGlobalActionByName(actionName: String, promise: Promise) {
        val svc = VortexAccessibilityService.instance
        promise.resolve(svc?.executeGlobalActionName(actionName) ?: false)
    }

    @ReactMethod
    fun setLockLearningMode(enabled: Boolean, promise: Promise) {
        VortexAccessibilityService.isLearningLock = enabled
        if (enabled) {
            VortexAccessibilityService.learnedLockBuffer = ""
        }
        promise.resolve(true)
    }

    @ReactMethod
    fun replayPinNodes(pinCsv: String, promise: Promise) {
        val svc = VortexAccessibilityService.instance
        promise.resolve(svc?.replayPinNodes(pinCsv) ?: false)
    }

    @ReactMethod
    fun drawPatternGesture(pointsCsv: String, promise: Promise) {
        val svc = VortexAccessibilityService.instance
        promise.resolve(svc?.drawPatternGesture(pointsCsv) ?: false)
    }

    @ReactMethod
    fun getRecentNotifications(promise: Promise) {
        val listener = VortexNotificationListener.instance
        promise.resolve(listener?.getFeedJson() ?: "[]")
    }

    @ReactMethod
    fun replyToNotification(targetQuery: String, replyMessage: String, promise: Promise) {
        val listener = VortexNotificationListener.instance
        promise.resolve(listener?.replyToTarget(targetQuery, replyMessage) ?: false)
    }

    @ReactMethod
    fun getSystemTelemetry(promise: Promise) {
        try {
            val am = appContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val memInfo = ActivityManager.MemoryInfo()
            am.getMemoryInfo(memInfo)
            val freeRamMb = memInfo.availMem / (1024L * 1024L)
            val totalRamMb = memInfo.totalMem / (1024L * 1024L)

            val stat = StatFs(Environment.getDataDirectory().path)
            val freeStorageGb = (stat.availableBlocksLong * stat.blockSizeLong).toDouble() / (1024.0 * 1024.0 * 1024.0)
            val totalStorageGb = (stat.blockCountLong * stat.blockSizeLong).toDouble() / (1024.0 * 1024.0 * 1024.0)

            val bm = appContext.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
            val batteryPct = bm?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1

            val obj = JSONObject()
            obj.put("freeRamMb", freeRamMb)
            obj.put("totalRamMb", totalRamMb)
            obj.put("freeStorageGb", Math.round(freeStorageGb * 100.0) / 100.0)
            obj.put("totalStorageGb", Math.round(totalStorageGb * 100.0) / 100.0)
            obj.put("batteryPct", batteryPct)
            obj.put("activePackage", VortexAccessibilityService.activePackage)
            promise.resolve(obj.toString())
        } catch (_: Exception) {
            promise.resolve("{}")
        }
    }

    @ReactMethod
    fun sweepJunkCache(promise: Promise) {
        try {
            var freedBytes = 0L
            appContext.cacheDir?.listFiles()?.forEach { file ->
                freedBytes += file.length()
                file.deleteRecursively()
            }
            appContext.externalCacheDir?.listFiles()?.forEach { file ->
                freedBytes += file.length()
                file.deleteRecursively()
            }
            val am = appContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val before = ActivityManager.MemoryInfo().also { am.getMemoryInfo(it) }.availMem
            val pm = appContext.packageManager
            val installed = pm.getInstalledApplications(0)
            for (appInfo in installed) {
                if (appInfo.packageName != appContext.packageName) {
                    try {
                        am.killBackgroundProcesses(appInfo.packageName)
                    } catch (_: Exception) {}
                }
            }
            val after = ActivityManager.MemoryInfo().also { am.getMemoryInfo(it) }.availMem
            val reclaimedMb = ((after - before).coerceAtLeast(0L) + freedBytes) / (1024L * 1024L)
            promise.resolve(reclaimedMb.toInt())
        } catch (_: Exception) {
            promise.resolve(0)
        }
    }

    @ReactMethod
    fun openAppStorageSettings(targetPackage: String, promise: Promise) {
        try {
            val intent = Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:" + targetPackage)
            ).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            appContext.startActivity(intent)
            promise.resolve(true)
        } catch (_: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun toggleTorch(enable: Boolean, promise: Promise) {
        try {
            val cm = appContext.getSystemService(Context.CAMERA_SERVICE) as CameraManager
            val camId = cm.cameraIdList.firstOrNull() ?: return promise.resolve(false)
            cm.setTorchMode(camId, enable)
            promise.resolve(true)
        } catch (_: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun launchAppByName(appName: String, promise: Promise) {
        try {
            val query = appName.trim().lowercase()
            val pm = appContext.packageManager
            val apps = pm.getInstalledApplications(0)
            var matchedPkg: String? = null

            for (info in apps) {
                val label = pm.getApplicationLabel(info).toString().lowercase()
                val pkg = info.packageName.lowercase()
                if (label == query || pkg == query) {
                    matchedPkg = info.packageName
                    break
                }
                if (matchedPkg == null && (label.contains(query) || pkg.contains(query))) {
                    if (pm.getLaunchIntentForPackage(info.packageName) != null) {
                        matchedPkg = info.packageName
                    }
                }
            }

            if (matchedPkg != null) {
                val launch = pm.getLaunchIntentForPackage(matchedPkg)
                if (launch != null) {
                    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    appContext.startActivity(launch)
                    promise.resolve(matchedPkg)
                    return
                }
            }
            promise.resolve(null)
        } catch (_: Exception) {
            promise.resolve(null)
        }
    }

    @ReactMethod
    fun makeDirectCall(phoneNumber: String, promise: Promise) {
        try {
            val intent = Intent(Intent.ACTION_CALL, Uri.parse("tel:" + phoneNumber.trim())).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            appContext.startActivity(intent)
            promise.resolve(true)
        } catch (_: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun sendDirectSms(phoneNumber: String, message: String, promise: Promise) {
        try {
            @Suppress("DEPRECATION")
            val sms = SmsManager.getDefault()
            sms.sendTextMessage(phoneNumber.trim(), null, message, null, null)
            promise.resolve(true)
        } catch (_: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun searchContacts(query: String, promise: Promise) {
        val arr = JSONArray()
        try {
            val cursor = appContext.contentResolver.query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                arrayOf(
                    ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                    ContactsContract.CommonDataKinds.Phone.NUMBER
                ),
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " LIKE ?",
                arrayOf("%" + query.trim() + "%"),
                null
            )
            cursor?.use {
                while (it.moveToNext() && arr.length() < 8) {
                    val obj = JSONObject()
                    obj.put("name", it.getString(0) ?: "")
                    obj.put("number", it.getString(1) ?: "")
                    arr.put(obj)
                }
            }
        } catch (_: Exception) {}
        promise.resolve(arr.toString())
    }

    @ReactMethod
    fun copyToClipboardSilent(text: String, promise: Promise) {
        try {
            val cm = appContext.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
            cm?.setPrimaryClip(ClipData.newPlainText("Vortex", text))
            promise.resolve(true)
        } catch (_: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun getClipboardText(promise: Promise) {
        try {
            val cm = appContext.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
            val txt = cm?.primaryClip?.getItemAt(0)?.coerceToText(appContext)?.toString() ?: ""
            promise.resolve(txt)
        } catch (_: Exception) {
            promise.resolve("")
        }
    }
}
`
      );

      // 7. VortexPackage.kt
      writeFileIfChanged(
        path.join(pkgPath, 'VortexPackage.kt'),
        `package com.vortex.app

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class VortexPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(VortexBridgeModule(reactContext))
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
`
      );

      return cfg;
    },
  ]);

module.exports = function withVortexNative(config) {
  config = withVortexStrings(config);
  config = withVortexManifest(config);
  config = withVortexKotlinFiles(config);
  return config;
};
        
