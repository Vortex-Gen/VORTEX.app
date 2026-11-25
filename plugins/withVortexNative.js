const {
  withAndroidManifest,
  withDangerousMod,
  withGradleProperties,
  withMainApplication,
} = require('expo/config-plugins');

const fs = require('fs');
const path = require('path');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function writeFileIfChanged(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

function withVortexManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const app = manifest.application?.[0];
    if (!app) return cfg;

    manifest.$ = manifest.$ || {};
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    
    app.$['android:usesCleartextTraffic'] = 'true';
    app.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    app.$['tools:replace'] = 'android:appComponentFactory';

    app.service = app.service || [];
    app.service = app.service.filter((s) => {
      const name = s.$?.['android:name'] || '';
      return ![
        '.VortexAccessibilityService',
        '.VortexFloatingService',
        '.VortexNotificationListener',
        '.VortexQuickTileService',
      ].includes(name);
    });

    app.service.push({
      $: {
        'android:name': '.VortexAccessibilityService',
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
    };
    property: [
        {
          $: {
            'android:name': 'android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE',
            'android:value': 'Floating assistant orb overlay',
          },
        },
      ],
    });
  
    app.service.push({
      $: {
        'android:name': '.VortexFloatingService',
        'android:enabled': 'true',
        'android:exported': 'false',
        'android:foregroundServiceType': 'specialUse',
      },
    });

    app.service.push({
      $: {
        'android:name': '.VortexNotificationListener',
        'android:permission': 'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
        'android:exported': 'true',
      },
      'intent-filter': [
        {
          action: [
            { $: { 'android:name': 'android.service.notification.NotificationListenerService' } },
          ],
        },
      ],
    });

    app.service.push({
      $: {
        'android:name': '.VortexQuickTileService',
        'android:icon': '@mipmap/ic_launcher',
        'android:label': 'Vortex ẞ',
        'android:permission': 'android.permission.BIND_QUICK_SETTINGS_TILE',
        'android:exported': 'true',
      },
      'intent-filter': [
        {
          action: [
            { $: { 'android:name': 'android.service.quicksettings.action.QS_TILE' } },
          ],
        },
      ],
    });

    return cfg;
  });
}

function withVortexNativeFiles(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const pkgPath = path.join(projectRoot, 'android', 'app', 'src', 'main', 'java', 'com', 'vortex', 'app');
      const xmlDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res', 'xml');
      const proguardPath = path.join(projectRoot, 'android', 'app', 'proguard-rules.pro');

      writeFileIfChanged(
        path.join(xmlDir, 'vortex_accessibility_config.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android"
    android:accessibilityEventTypes="typeWindowStateChanged|typeWindowContentChanged|typeNotificationStateChanged"
    android:accessibilityFeedbackType="feedbackGeneric"
    android:accessibilityFlags="flagReportViewIds|flagRetrieveInteractiveWindows|flagIncludeNotImportantViews"
    android:canPerformGestures="true"
    android:canRetrieveWindowContent="true"
    android:notificationTimeout="120" />
`
      );

      writeFileIfChanged(
        path.join(xmlDir, 'network_security_config.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
</network-security-config>
`
      );

      writeFileIfChanged(
        proguardPath,
        `-keep class com.vortex.app.** { *; }
-keepclassmembers class com.vortex.app.** { *; }
`
      );

      writeFileIfChanged(
        path.join(pkgPath, 'VortexAccessibilityService.kt'),
        `package com.vortex.app

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.graphics.Rect
import android.os.Bundle
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

class VortexAccessibilityService : AccessibilityService() {

    companion object {
        @Volatile
        var instance: VortexAccessibilityService? = null

        @Volatile
        var activePackage: String = ""
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
    }

    override fun onDestroy() {
        super.onDestroy()
        if (instance === this) {
            instance = null
        }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val pkg = event?.packageName?.toString()
        if (!pkg.isNullOrBlank()) {
            activePackage = pkg
        }
    }

    override fun onInterrupt() {}

    fun readScreenSummary(maxItems: Int = 45): String {
        val root = rootInActiveWindow ?: return "Screen node unavailable"
        val items = ArrayList<String>()
        val seen = HashSet<String>()

        fun walk(node: AccessibilityNodeInfo?) {
            if (node == null || items.size >= maxItems) return
            val txt = node.text?.toString()?.trim()
            val desc = node.contentDescription?.toString()?.trim()
            val label = when {
                !txt.isNullOrEmpty() -> txt
                !desc.isNullOrEmpty() -> desc
                else -> null
            }
            if (label != null && seen.add(label)) {
                val role = if (node.isClickable) "[BTN]" else "[TXT]"
                items.add("$role $label")
            }
            for (i in 0 until node.childCount) {
                walk(node.getChild(i))
                if (items.size >= maxItems) break
            }
        }

        walk(root)
        return if (items.isEmpty()) {
            "Active app: $activePackage (no text nodes detected)"
        } else {
            "App: $activePackage | Elements: " + items.joinToString(" • ")
        }
    }

    fun tapByText(targetText: String, callback: ((Boolean) -> Unit)? = null): Boolean {
        val root = rootInActiveWindow ?: run {
            callback?.invoke(false)
            return false
        }
        val query = targetText.trim().lowercase()
        var matched: AccessibilityNodeInfo? = null

        fun findNode(node: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
            if (node == null) return null
            val t = node.text?.toString()?.trim()?.lowercase() ?: ""
            val d = node.contentDescription?.toString()?.trim()?.lowercase() ?: ""
            if (t == query || d == query || t.contains(query) || d.contains(query)) {
                var cur: AccessibilityNodeInfo? = node
                while (cur != null) {
                    if (cur.isClickable) return cur
                    cur = cur.parent
                }
                return node
            }
            for (i in 0 until node.childCount) {
                val res = findNode(node.getChild(i))
                if (res != null) return res
            }
            return null
        }

        matched = findNode(root)
        if (matched != null) {
            val clicked = matched.performAction(AccessibilityNodeInfo.ACTION_CLICK)
            if (clicked) {
                callback?.invoke(true)
                return true
            }
            val rect = Rect()
            matched.getBoundsInScreen(rect)
            if (!rect.isEmpty) {
                return tapAtPoint(rect.exactCenterX(), rect.exactCenterY(), callback)
            }
        }

        callback?.invoke(false)
        return false
    }

    fun tapAtPoint(x: Float, y: Float, callback: ((Boolean) -> Unit)? = null): Boolean {
        val path = Path().apply { moveTo(x, y) }
        val stroke = GestureDescription.StrokeDescription(path, 0L, 80L)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()
        return dispatchGesture(
            gesture,
            object : GestureResultCallback() {
                override fun onCompleted(gestureDescription: GestureDescription?) {
                    callback?.invoke(true)
                }
                override fun onCancelled(gestureDescription: GestureDescription?) {
                    callback?.invoke(false)
                }
            },
            null
        )
    }

    fun swipeDirection(direction: String, callback: ((Boolean) -> Unit)? = null): Boolean {
        val metrics = resources.displayMetrics
        val w = metrics.widthPixels.toFloat()
        val h = metrics.heightPixels.toFloat()

        val startX: Float
        val startY: Float
        val endX: Float
        val endY: Float

        when (direction.trim().lowercase()) {
            "up" -> {
                startX = w * 0.5f
                startY = h * 0.78f
                endX = w * 0.5f
                endY = h * 0.24f
            }
            "down" -> {
                startX = w * 0.5f
                startY = h * 0.26f
                endX = w * 0.5f
                endY = h * 0.78f
            }
            "left" -> {
                startX = w * 0.85f
                startY = h * 0.5f
                endX = w * 0.15f
                endY = h * 0.5f
            }
            "right" -> {
                startX = w * 0.15f
                startY = h * 0.5f
                endX = w * 0.85f
                endY = h * 0.5f
            }
            else -> {
                callback?.invoke(false)
                return false
            }
        }

        val path = Path().apply {
            moveTo(startX, startY)
            lineTo(endX, endY)
        }
        val stroke = GestureDescription.StrokeDescription(path, 0L, 260L)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()
        return dispatchGesture(
            gesture,
            object : GestureResultCallback() {
                override fun onCompleted(gestureDescription: GestureDescription?) {
                    callback?.invoke(true)
                }
                override fun onCancelled(gestureDescription: GestureDescription?) {
                    callback?.invoke(false)
                }
            },
            null
        )
    }

    fun typeIntoFocusedField(text: String): Boolean {
        val root = rootInActiveWindow ?: return false
        fun findEditable(node: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
            if (node == null) return null
            if (node.isEditable || node.isFocused) return node
            for (i in 0 until node.childCount) {
                val found = findEditable(node.getChild(i))
                if (found != null) return found
            }
            return null
        }
        val target = findEditable(root) ?: return false
        val args = Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        }
        return target.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
    }

    fun pressGlobalBack(): Boolean = performGlobalAction(GLOBAL_ACTION_BACK)
    fun pressGlobalHome(): Boolean = performGlobalAction(GLOBAL_ACTION_HOME)
}
`
      );

      writeFileIfChanged(
        path.join(pkgPath, 'VortexFloatingService.kt'),
        `package com.vortex.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.TextView

class VortexFloatingService : Service() {

    companion object {
        const val CHANNEL_ID = "vortex_beta_orb_channel"
        const val NOTIF_ID = 7070
        const val ACTION_START = "com.vortex.app.action.START_ORB"
        const val ACTION_STOP = "com.vortex.app.action.STOP_ORB"
        const val ACTION_SET_OPACITY = "com.vortex.app.action.SET_OPACITY"

        @Volatile
        var isRunning: Boolean = false

        @Volatile
        var idleAlpha: Float = 0.10f
    }

    private var windowManager: WindowManager? = null
    private var orbView: View? = null
    private var layoutParams: WindowManager.LayoutParams? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startForeground(NOTIF_ID, buildNotification())
        isRunning = true
        if (Settings.canDrawOverlays(this)) {
            showFloatingOrb()
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                removeFloatingOrb()
                isRunning = false
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_SET_OPACITY -> {
                val requested = intent.getFloatExtra("idleAlpha", 0.10f)
                idleAlpha = requested.coerceIn(0.05f, 1.0f)
                orbView?.alpha = idleAlpha
            }
            else -> {
                if (!isRunning) {
                    isRunning = true
                    startForeground(NOTIF_ID, buildNotification())
                }
                if (Settings.canDrawOverlays(this) && orbView == null) {
                    showFloatingOrb()
                }
            }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        removeFloatingOrb()
        isRunning = false
        super.onDestroy()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Vortex ẞ OS Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps Vortex ẞ floating orb and OS triggers active"
                setShowBadge(false)
            }
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        val openIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val piFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }
        val pendingIntent = PendingIntent.getActivity(this, 0, openIntent, piFlags)

        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            Notification.Builder(this)
        }

        return builder
            .setContentTitle("Vortex ẞ Active")
            .setContentText("Floating orb running (10% idle dim)")
            .setSmallIcon(applicationInfo.icon)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()
    }

    private fun showFloatingOrb() {
        if (orbView != null) return
        val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        windowManager = wm

        val sizePx = TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            46f,
            resources.displayMetrics
        ).toInt()

        val pillDrawable = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setColor(Color.argb(185, 11, 16, 28))
            setStroke(
                TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 1.5f, resources.displayMetrics).toInt(),
                Color.parseColor("#8800F0FF")
            )
        }

        val badge = TextView(this).apply {
            text = "ẞ"
            setTextColor(Color.parseColor("#00F0FF"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
            gravity = Gravity.CENTER
            background = pillDrawable
        }

        val typeFlag = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }

        val params = WindowManager.LayoutParams(
            sizePx,
            sizePx,
            typeFlag,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.END
            x = 12
            y = 320
        }

        badge.alpha = idleAlpha

        var initialX = 0
        var initialY = 0
        var initialTouchX = 0f
        var initialTouchY = 0f
        var moved = false

        val dimRunnable = Runnable {
            badge.animate().alpha(idleAlpha).setDuration(250).start()
        }

        badge.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    mainHandler.removeCallbacks(dimRunnable)
                    badge.alpha = 1.0f
                    initialX = params.x
                    initialY = params.y
                    initialTouchX = event.rawX
                    initialTouchY = event.rawY
                    moved = false
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = (initialTouchX - event.rawX).toInt()
                    val dy = (event.rawY - initialTouchY).toInt()
                    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
                        moved = true
                        params.x = (initialX + dx).coerceAtLeast(0)
                        params.y = (initialY + dy).coerceAtLeast(0)
                        try {
                            wm.updateViewLayout(badge, params)
                        } catch (_: Exception) {}
                    }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    if (!moved) {
                        openVortexApp()
                    }
                    mainHandler.postDelayed(dimRunnable, 1600L)
                    true
                }
                else -> false
            }
        }

        try {
            wm.addView(badge, params)
            orbView = badge
            layoutParams = params
        } catch (_: Exception) {
            orbView = null
        }
    }

    private fun openVortexApp() {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra("vortex_orb_triggered", true)
        }
        startActivity(intent)
    }

    private fun removeFloatingOrb() {
        mainHandler.removeCallbacksAndMessages(null)
        orbView?.let { view ->
            try {
                windowManager?.removeView(view)
            } catch (_: Exception) {}
        }
        orbView = null
        layoutParams = null
    }
}
`
      );

      writeFileIfChanged(
        path.join(pkgPath, 'VortexNotificationListener.kt'),
        `package com.vortex.app

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

class VortexNotificationListener : NotificationListenerService() {

    companion object {
        @Volatile
        var lastNotificationSummary: String = ""
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        val pkg = sbn?.packageName ?: return
        if (pkg == applicationContext.packageName) return
        val extras = sbn.notification?.extras
        val title = extras?.getCharSequence("android.title")?.toString() ?: ""
        val text = extras?.getCharSequence("android.text")?.toString() ?: ""
        if (title.isNotBlank() || text.isNotBlank()) {
            lastNotificationSummary = "[$pkg] $title: $text".take(240)
        }
    }
}
`
      );

      writeFileIfChanged(
        path.join(pkgPath, 'VortexQuickTileService.kt'),
        `package com.vortex.app

import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import androidx.annotation.RequiresApi

@RequiresApi(Build.VERSION_CODES.N)
class VortexQuickTileService : TileService() {

    override fun onStartListening() {
        super.onStartListening()
        qsTile?.apply {
            state = if (VortexFloatingService.isRunning) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
            label = "Vortex ẞ"
            updateTile()
        }
    }

    override fun onClick() {
        super.onClick()
        if (!Settings.canDrawOverlays(this)) {
            val intent = Intent(MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            startActivityAndCollapse(intent)
            return
        }

        if (VortexFloatingService.isRunning) {
            val stopIntent = Intent(this, VortexFloatingService::class.java).apply {
                action = VortexFloatingService.ACTION_STOP
            }
            startService(stopIntent)
            qsTile?.state = Tile.STATE_INACTIVE
        } else {
            val startIntent = Intent(this, VortexFloatingService::class.java).apply {
                action = VortexFloatingService.ACTION_START
                putExtra("idleAlpha", 0.10f)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(startIntent)
            } else {
                startService(startIntent)
            }
            qsTile?.state = Tile.STATE_ACTIVE
        }
        qsTile?.updateTile()
    }
}
`
      );

      writeFileIfChanged(
        path.join(pkgPath, 'VortexBridgeModule.kt'),
        `package com.vortex.app

import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.text.TextUtils
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
com.facebook.react.bridge.ReactMethod

class VortexBridgeModule(private val reactCtx: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactCtx) {

    override fun getName(): String = "VortexBridge"

    @ReactMethod
    fun getInstalledApps(promise: Promise) {
        try {
            val pm = reactCtx.packageManager
            val mainIntent = Intent(Intent.ACTION_MAIN, null).apply {
                addCategory(Intent.CATEGORY_LAUNCHER)
            }
            val resolveInfos = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                pm.queryIntentActivities(mainIntent, PackageManager.ResolveInfoFlags.of(0L))
            } else {
                @Suppress("DEPRECATION")
                pm.queryIntentActivities(mainIntent, 0)
            }

            val arr = Arguments.createArray()
            val seenPkgs = HashSet<String>()
            for (ri in resolveInfos) {
                val pkg = ri.activityInfo?.packageName ?: continue
                if (!seenPkgs.add(pkg)) continue
                val label = ri.loadLabel(pm)?.toString()?.trim() ?: pkg
                val item = Arguments.createMap().apply {
                    putString("label", label)
                    putString("packageName", pkg)
                }
                arr.pushMap(item)
            }
            promise.resolve(arr)
        } catch (e: Exception) {
            promise.reject("APPS_LIST_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun openAppByName(rawQuery: String, promise: Promise) {
        try {
            val query = rawQuery.trim().lowercase()
            if (query.isEmpty()) {
                promise.resolve("")
                return
            }

            val pm = reactCtx.packageManager

            // Direct package name match if user passed com.xxx.yyy
            if (query.contains(".")) {
                val directIntent = pm.getLaunchIntentForPackage(rawQuery.trim())
                if (directIntent != null) {
                    directIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    reactCtx.startActivity(directIntent)
                    promise.resolve(rawQuery.trim())
                    return
                }
            }

            val mainIntent = Intent(Intent.ACTION_MAIN, null).apply {
                addCategory(Intent.CATEGORY_LAUNCHER)
            }
            val resolveInfos = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                pm.queryIntentActivities(mainIntent, PackageManager.ResolveInfoFlags.of(0L))
            } else {
                @Suppress("DEPRECATION")
                pm.queryIntentActivities(mainIntent, 0)
            }

            var bestPkg: String? = null
            var bestLabel: String? = null
            var bestScore = -1

            for (ri in resolveInfos) {
                val pkg = ri.activityInfo?.packageName ?: continue
                val label = ri.loadLabel(pm)?.toString()?.trim() ?: continue
                val lLower = label.lowercase()
                val pLower = pkg.lowercase()

                val score = when {
                    lLower == query -> 100
                    lLower.startsWith(query) -> 85
                    lLower.contains(query) -> 70
                    pLower.contains(query) -> 55
                    else -> -1
                }

                if (score > bestScore) {
                    bestScore = score
                    bestPkg = pkg
                    bestLabel = label
                }
            }

            if (bestPkg != null) {
                val launchIntent = pm.getLaunchIntentForPackage(bestPkg)
                if (launchIntent != null) {
                    launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    reactCtx.startActivity(launchIntent)
                    promise.resolve("$bestLabel ($bestPkg)")
                    return
                }
            }

            promise.resolve("")
        } catch (e: Exception) {
            promise.reject("OPEN_APP_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun startFloatingOrb(idleAlpha: Double, promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(reactCtx)) {
                val intent = Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + reactCtx.packageName)
                ).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                reactCtx.startActivity(intent)
                promise.resolve("overlay_permission_requested")
                return
            }

            val alphaFloat = idleAlpha.toFloat().coerceIn(0.05f, 1.0f)
            val intent = Intent(reactCtx, VortexFloatingService::class.java).apply {
                action = VortexFloatingService.ACTION_START
                putExtra("idleAlpha", alphaFloat)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactCtx.startForegroundService(intent)
            } else {
                reactCtx.startService(intent)
            }
            promise.resolve("orb_started")
        } catch (e: Exception) {
            promise.reject("ORB_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun stopFloatingOrb(promise: Promise) {
        try {
            val intent = Intent(reactCtx, VortexFloatingService::class.java).apply {
                action = VortexFloatingService.ACTION_STOP
            }
            reactCtx.startService(intent)
            promise.resolve("orb_stopped")
        } catch (e: Exception) {
            promise.reject("ORB_STOP_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun setOrbIdleAlpha(idleAlpha: Double, promise: Promise) {
        try {
            val intent = Intent(reactCtx, VortexFloatingService::class.java).apply {
                action = VortexFloatingService.ACTION_SET_OPACITY
                putExtra("idleAlpha", idleAlpha.toFloat().coerceIn(0.05f, 1.0f))
            }
            reactCtx.startService(intent)
            promise.resolve("alpha_updated")
        } catch (e: Exception) {
            promise.reject("ALPHA_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getServiceStatuses(promise: Promise) {
        val map = Arguments.createMap()
        val overlayGranted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Settings.canDrawOverlays(reactCtx)
        } else {
            true
        }
        val accEnabled = isAccessibilityServiceEnabled()
        val notifEnabled = isNotificationListenerEnabled()

        map.putBoolean("overlayGranted", overlayGranted)
        map.putBoolean("orbRunning", VortexFloatingService.isRunning)
        map.putBoolean("accessibilityEnabled", accEnabled)
        map.putBoolean("notificationListenerEnabled", notifEnabled)
        map.putString("activePackage", VortexAccessibilityService.activePackage)
        map.putString("lastNotification", VortexNotificationListener.lastNotificationSummary)
        promise.resolve(map)
    }

    @ReactMethod
    fun openAccessibilitySettings(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactCtx.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ACC_SETTINGS_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun openNotificationSettings(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactCtx.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("NOTIF_SETTINGS_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun readScreenText(promise: Promise) {
        val svc = VortexAccessibilityService.instance
        if (svc == null) {
            promise.resolve("Accessibility Service off hai. System tab se on karo.")
            return
        }
        promise.resolve(svc.readScreenSummary())
    }

    @ReactMethod
    fun tapByText(target: String, promise: Promise) {
        val svc = VortexAccessibilityService.instance
        if (svc == null) {
            promise.resolve(false)
            return
        }
        svc.tapByText(target) { ok ->
            promise.resolve(ok)
        }
    }

    @ReactMethod
    fun swipeScreen(direction: String, promise: Promise) {
        val svc = VortexAccessibilityService.instance
        if (svc == null) {
            promise.resolve(false)
            return
        }
        svc.swipeDirection(direction) { ok ->
            promise.resolve(ok)
        }
    }

    @ReactMethod
    fun typeText(text: String, promise: Promise) {
        val svc = VortexAccessibilityService.instance
        if (svc == null) {
            promise.resolve(false)
            return
        }
        promise.resolve(svc.typeIntoFocusedField(text))
    }

    @ReactMethod
    fun pressBack(promise: Promise) {
        val svc = VortexAccessibilityService.instance
        promise.resolve(svc?.pressGlobalBack() ?: false)
    }

    @ReactMethod
    fun pressHome(promise: Promise) {
        val svc = VortexAccessibilityService.instance
        promise.resolve(svc?.pressGlobalHome() ?: false)
    }

    private fun isAccessibilityServiceEnabled(): Boolean {
        val expected = ComponentName(reactCtx, VortexAccessibilityService::class.java).flattenToString()
        val enabledServices = Settings.Secure.getString(
            reactCtx.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: return false
        val splitter = TextUtils.SimpleStringSplitter(':')
        splitter.setString(enabledServices)
        while (splitter.hasNext()) {
            if (splitter.next().equals(expected, ignoreCase = true)) {
                return true
            }
        }
        return false
    }

    private fun isNotificationListenerEnabled(): Boolean {
        val flat = ComponentName(reactCtx, VortexNotificationListener::class.java).flattenToString()
        val names = Settings.Secure.getString(
            reactCtx.contentResolver,
            "enabled_notification_listeners"
        ) ?: return false
        return names.contains(flat, ignoreCase = true)
    }
}
`
      );

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
}

function withVortexMainApplication(config) {
  return withMainApplication(config, (cfg) => {
    let contents = cfg.modResults.contents;
    if (!contents.includes('VortexPackage')) {
      if (contents.includes('PackageList(this).packages.apply {')) {
        contents = contents.replace(
          'PackageList(this).packages.apply {',
          'PackageList(this).packages.apply {\n              add(VortexPackage())'
        );
      } else if (contents.includes('val packages = PackageList(this).packages')) {
        contents = contents.replace(
          'val packages = PackageList(this).packages',
          'val packages = PackageList(this).packages\n            packages.add(VortexPackage())'
        );
      }
      cfg.modResults.contents = contents;
    }
    return cfg;
  });
}

function withVortexGradle(config) {
  return withGradleProperties(config, (cfg) => {
    const props = cfg.modResults;
    const setProp = (key, value) => {
      const existing = props.find((p) => p.type === 'property' && p.key === key);
      if (existing) {
        existing.value = value;
      } else {
        props.push({ type: 'property', key, value });
      }
    };
    setProp('android.useAndroidX', 'true');
    setProp('android.enableJetifier', 'true');
    return cfg;
  });
}

module.exports = function withVortexNative(config) {
  config = withVortexManifest(config);
  config = withVortexNativeFiles(config);
  config = withVortexMainApplication(config);
  config = withVortexGradle(config);
  return config;
};
