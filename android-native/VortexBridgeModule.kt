package com.vortex.app

import android.Manifest
import android.accessibilityservice.AccessibilityServiceInfo
import android.app.ActivityManager
import android.app.AlarmManager
import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.media.AudioManager
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.os.Environment
import android.os.PowerManager
import android.os.StatFs
import android.provider.Settings
import android.telephony.SmsManager
import android.text.TextUtils
import android.util.DisplayMetrics
import android.view.WindowManager
import android.view.accessibility.AccessibilityManager
import androidx.core.content.ContextCompat
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.io.FileInputStream
import java.util.Calendar

class VortexBridgeModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        @Volatile
        var instance: VortexBridgeModule? = null
        private const val VAULT_PREFS = "vortex_secure_vault_v5"
        private val KEY_PATTERN = Regex("^[a-zA-Z0-9_.-]{1,64}$")
    }

    private var savedNotificationVol: Int? = null
    private var savedSystemVol: Int? = null
    private var torchState: Boolean = false

    override fun getName(): String = "VortexBridge"

    override fun initialize() {
        super.initialize()
        instance = this
    }

    override fun invalidate() {
        if (instance === this) {
            instance = null
        }
        super.invalidate()
    }

    fun emitNativeEvent(eventName: String, payload: WritableMap) {
        try {
            if (reactContext.hasActiveReactInstance()) {
                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit(eventName, payload)
            }
        } catch (_: Throwable) {
        }
    }

    private fun getVaultPrefs(): SharedPreferences {
        return try {
            val masterKey = MasterKey.Builder(reactContext)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            EncryptedSharedPreferences.create(
                reactContext,
                VAULT_PREFS,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (_: Throwable) {
            reactContext.deleteSharedPreferences(VAULT_PREFS)
            val fallbackKey = MasterKey.Builder(reactContext)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            EncryptedSharedPreferences.create(
                reactContext,
                VAULT_PREFS,
                fallbackKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        }
    }

    @ReactMethod
    fun saveSecureVaultItem(key: String, value: String, promise: Promise) {
        try {
            if (!KEY_PATTERN.matches(key)) {
                promise.reject("INVALID_KEY", "Key format rejected by vault guard")
                return
            }
            getVaultPrefs().edit().putString(key, value).apply()
            promise.resolve(true)
        } catch (t: Throwable) {
            promise.reject("VAULT_WRITE_ERR", t.message, t)
        }
    }

    @ReactMethod
    fun getSecureVaultItem(key: String, promise: Promise) {
        try {
            if (!KEY_PATTERN.matches(key)) {
                promise.reject("INVALID_KEY", "Key format rejected by vault guard")
                return
            }
            val value = getVaultPrefs().getString(key, null)
            promise.resolve(value)
        } catch (t: Throwable) {
            promise.reject("VAULT_READ_ERR", t.message, t)
        }
    }

    @ReactMethod
    fun deleteSecureVaultItem(key: String, promise: Promise) {
        try {
            if (!KEY_PATTERN.matches(key)) {
                promise.reject("INVALID_KEY", "Key format rejected by vault guard")
                return
            }
            getVaultPrefs().edit().remove(key).apply()
            promise.resolve(true)
        } catch (t: Throwable) {
            promise.reject("VAULT_DEL_ERR", t.message, t)
        }
    }

    @ReactMethod
    fun validateAndStageAsset(rawPath: String, assetType: String, promise: Promise) {
        try {
            val cleaned = rawPath.removePrefix("file://").trim()
            val sourceFile = File(cleaned)
            if (!sourceFile.exists() || !sourceFile.isFile) {
                promise.reject("ASSET_NOT_FOUND", "File does not exist at path")
                return
            }

            val canonical = sourceFile.canonicalPath
            val extRoot = Environment.getExternalStorageDirectory().canonicalPath
            val appFiles = reactContext.filesDir.canonicalPath
            val appCache = reactContext.cacheDir.canonicalPath

            val isAllowedRoot = canonical.startsWith(extRoot) ||
                canonical.startsWith(appFiles) ||
                canonical.startsWith(appCache)

            if (!isAllowedRoot) {
                promise.reject("PATH_BLOCKED", "Path traversal guard rejected location")
                return
            }

            if (assetType == "gguf") {
                if (sourceFile.length() < 65536L) {
                    promise.reject("CORRUPT_GGUF", "Model file too small")
                    return
                }
                val header = ByteArray(4)
                FileInputStream(sourceFile).use { stream ->
                    if (stream.read(header) != 4) {
                        promise.reject("CORRUPT_GGUF", "Unable to read GGUF header")
                        return
                    }
                }
                val isGguf = header[0] == 0x47.toByte() &&
                    header[1] == 0x47.toByte() &&
                    header[2] == 0x55.toByte() &&
                    header[3] == 0x46.toByte()
                if (!isGguf) {
                    promise.reject("INVALID_GGUF_MAGIC", "File is not a valid GGUF binary")
                    return
                }
                val result = Arguments.createMap().apply {
                    putString("stagedPath", canonical)
                    putDouble("sizeMb", sourceFile.length() / (1024.0 * 1024.0))
                    putBoolean("verified", true)
                }
                promise.resolve(result)
                return
            }

            val privateDir = File(reactContext.filesDir, "vortex_staged")
            if (!privateDir.exists()) {
                privateDir.mkdirs()
            }
            val safeName = sourceFile.name.replace(Regex("[^a-zA-Z0-9_.-]"), "_")
            val destFile = File(privateDir, safeName)
            sourceFile.copyTo(destFile, overwrite = true)

            val result = Arguments.createMap().apply {
                putString("stagedPath", destFile.canonicalPath)
                putDouble("sizeMb", destFile.length() / (1024.0 * 1024.0))
                putBoolean("verified", true)
            }
            promise.resolve(result)
        } catch (t: Throwable) {
            promise.reject("STAGE_ERR", t.message, t)
        }
    }

    @ReactMethod
    fun checkPermissionsStatus(promise: Promise) {
        try {
            val overlay = Settings.canDrawOverlays(reactContext)
            val accessibility = isAccessibilityServiceActive()
            val notifListener = isNotificationServiceActive()
            val alarmManager = reactContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val exactAlarm = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                alarmManager.canScheduleExactAlarms()
            } else {
                true
            }
            val pm = reactContext.getSystemService(Context.POWER_SERVICE) as PowerManager
            val batteryIgnored = pm.isIgnoringBatteryOptimizations(reactContext.packageName)

            val map = Arguments.createMap().apply {
                putBoolean("overlay", overlay)
                putBoolean("accessibility", accessibility)
                putBoolean("notificationListener", notifListener)
                putBoolean("exactAlarm", exactAlarm)
                putBoolean("batteryIgnored", batteryIgnored)
                putBoolean("orbRunning", VortexFloatingService.isRunning)
            }
            promise.resolve(map)
        } catch (t: Throwable) {
            promise.reject("PERM_CHECK_ERR", t.message, t)
        }
    }

    private fun isAccessibilityServiceActive(): Boolean {
        val am = reactContext.getSystemService(Context.ACCESSIBILITY_SERVICE) as AccessibilityManager
        val enabled = am.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK)
        for (info in enabled) {
            val serviceInfo = info.resolveInfo?.serviceInfo ?: continue
            if (serviceInfo.packageName == reactContext.packageName &&
                serviceInfo.name == VortexAccessibilityService::class.java.name
            ) {
                return true
            }
        }
        val expected = "${reactContext.packageName}/${VortexAccessibilityService::class.java.name}"
        val settingValue = Settings.Secure.getString(
            reactContext.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: return false
        val splitter = TextUtils.SimpleStringSplitter(':')
        splitter.setString(settingValue)
        while (splitter.hasNext()) {
            if (splitter.next().equals(expected, ignoreCase = true)) {
                return true
            }
        }
        return false
    }

    private fun isNotificationServiceActive(): Boolean {
        val flat = Settings.Secure.getString(
            reactContext.contentResolver,
            "enabled_notification_listeners"
        ) ?: return false
        val cn = ComponentName(reactContext, VortexNotificationListener::class.java)
        return flat.contains(cn.flattenToString()) || flat.contains(cn.flattenToShortString())
    }

    @ReactMethod
    fun openSystemSettingsScreen(screen: String, promise: Promise) {
        try {
            val intent = when (screen) {
                "overlay" -> Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:${reactContext.packageName}")
                )
                "accessibility" -> Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
                "notification" -> Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
                "alarm" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    Intent(
                        Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                        Uri.parse("package:${reactContext.packageName}")
                    )
                } else {
                    Intent(Settings.ACTION_SETTINGS)
                }
                "battery" -> Intent(
                    Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                    Uri.parse("package:${reactContext.packageName}")
                )
                "assistant" -> Intent(Settings.ACTION_VOICE_INPUT_SETTINGS)
                "miui_autostart" -> Intent().apply {
                    component = ComponentName(
                        "com.miui.securitycenter",
                        "com.miui.permcenter.autostart.AutoStartManagementActivity"
                    )
                }
                else -> Intent(
                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:${reactContext.packageName}")
                )
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            try {
                reactContext.startActivity(intent)
            } catch (_: Throwable) {
                val fallback = Intent(
                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:${reactContext.packageName}")
                ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
                reactContext.startActivity(fallback)
            }
            promise.resolve(true)
        } catch (t: Throwable) {
            promise.reject("SETTINGS_INTENT_ERR", t.message, t)
        }
    }

    @ReactMethod
    fun startFloatingOrb(opacity: Double, glowHex: String, stealth: Boolean, promise: Promise) {
        try {
            if (!Settings.canDrawOverlays(reactContext)) {
                promise.reject("NO_OVERLAY_PERM", "Overlay permission not granted")
                return
            }
            val intent = Intent(reactContext, VortexFloatingService::class.java).apply {
                action = VortexFloatingService.ACTION_START
                putExtra("opacity", opacity.coerceIn(0.15, 1.0).toFloat())
                putExtra("glowHex", glowHex)
                putExtra("stealth", stealth)
            }
            ContextCompat.startForegroundService(reactContext, intent)
            promise.resolve(true)
        } catch (t: Throwable) {
            promise.reject("ORB_START_ERR", t.message, t)
        }
    }

    @ReactMethod
    fun updateFloatingOrb(opacity: Double, glowHex: String, stealth: Boolean, promise: Promise) {
        try {
            val intent = Intent(reactContext, VortexFloatingService::class.java).apply {
                action = VortexFloatingService.ACTION_UPDATE_CONFIG
                putExtra("opacity", opacity.coerceIn(0.15, 1.0).toFloat())
                putExtra("glowHex", glowHex)
                putExtra("stealth", stealth)
            }
            reactContext.startService(intent)
            promise.resolve(true)
        } catch (t: Throwable) {
            promise.reject("ORB_UPDATE_ERR", t.message, t)
        }
    }

    @ReactMethod
    fun stopFloatingOrb(promise: Promise) {
        try {
            val intent = Intent(reactContext, VortexFloatingService::class.java).apply {
                action = VortexFloatingService.ACTION_STOP
            }
            reactContext.startService(intent)
            promise.resolve(true)
        } catch (t: Throwable) {
            promise.reject("ORB_STOP_ERR", t.message, t)
        }
    }

    private fun getScreenDimensions(): Pair<Float, Float> {
        val wm = reactContext.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val metrics = DisplayMetrics()
        @Suppress("DEPRECATION")
        wm.defaultDisplay.getRealMetrics(metrics)
        return Pair(metrics.widthPixels.toFloat(), metrics.heightPixels.toFloat())
    }

    @ReactMethod
    fun performGhostTap(x: Double, y: Double, promise: Promise) {
        try {
            val service = VortexAccessibilityService.instance
            if (service == null) {
                promise.reject("ACC_INACTIVE", "Accessibility service not running")
                return
            }
            val (maxW, maxH) = getScreenDimensions()
            val safeX = x.toFloat().coerceIn(2f, (maxW - 2f).coerceAtLeast(2f))
            val safeY = y.toFloat().coerceIn(2f, (maxH - 2f).coerceAtLeast(2f))
            service.performGhostTap(safeX, safeY) { success ->
                promise.resolve(success)
            }
        } catch (t: Throwable) {
            promise.reject("TAP_ERR", t.message, t)
        }
    }

    @ReactMethod
    fun performGhostSwipe(
        startX: Double,
        startY: Double,
        endX: Double,
        endY: Double,
        durationMs: Double,
        promise: Promise
    ) {
        try {
            val service = VortexAccessibilityService.instance
            if (service == null) {
                promise.reject("ACC_INACTIVE", "Accessibility service not running")
                return
            }
            val (maxW, maxH) = getScreenDimensions()
            val sx = startX.toFloat().coerceIn(2f, (maxW - 2f).coerceAtLeast(2f))
            val sy = startY.toFloat().coerceIn(2f, (maxH - 2f).coerceAtLeast(2f))
            val ex = endX.toFloat().coerceIn(2f, (maxW - 2f).coerceAtLeast(2f))
            val ey = endY.toFloat().coerceIn(2f, (maxH - 2f).coerceAtLeast(2f))
            val dur = durationMs.toLong().coerceIn(80L, 4000L)
            service.performGhostSwipe(sx, sy, ex, ey, dur) { success ->
                promise.resolve(success)
            }
        } catch (t: Throwable) {
            promise.reject("SWIPE_ERR", t.message, t)
        }
    }

    @ReactMethod
    fun injectTextToFocusedNode(text: String, humanCadence: Boolean, promise: Promise) {
        try {
            val service = VortexAccessibilityService.instance
            if (service == null) {
                promise.reject("ACC_INACTIVE", "Accessibility service not running")
                return
            }
            service.injectTextToFocusedNode(text, humanCadence) { success ->
                promise.resolve(success)
            }
        } catch (t: Throwable) {
            promise.reject("INJECT_ERR", t.message, t)
        }
    }

    @ReactMethod
    fun captureScreenAndDom(promise: Promise) {
        try {
            val service = VortexAccessibilityService.instance
            if (service == null) {
                promise.reject("ACC_INACTIVE", "Accessibility service not running")
                return
            }
            service.captureScreenAndDom { jsonPayload ->
                promise.resolve(jsonPayload)
            }
        } catch (t: Throwable) {
            promise.reject("CAPTURE_ERR", t.message, t)
        }
    }

    @ReactMethod
    fun setZeroBeepMute(mute: Boolean, promise: Promise) {
        try {
            val audioManager = reactContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            if (mute) {
                if (savedNotificationVol == null) {
                    savedNotificationVol = audioManager.getStreamVolume(AudioManager.STREAM_NOTIFICATION)
                }
                if (savedSystemVol == null) {
                    savedSystemVol = audioManager.getStreamVolume(AudioManager.STREAM_SYSTEM)
                }
                try {
                    audioManager.adjustStreamVolume(
                        AudioManager.STREAM_NOTIFICATION,
                        AudioManager.ADJUST_MUTE,
                        0
                    )
                    audioManager.adjustStreamVolume(
                        AudioManager.STREAM_SYSTEM,
                        AudioManager.ADJUST_MUTE,
                        0
                    )
                } catch (_: SecurityException) {
                    audioManager.setStreamVolume(AudioManager.STREAM_NOTIFICATION, 0, 0)
                    audioManager.setStreamVolume(AudioManager.STREAM_SYSTEM, 0, 0)
                }
            } else {
                try {
                    audioManager.adjustStreamVolume(
                        AudioManager.STREAM_NOTIFICATION,
                        AudioManager.ADJUST_UNMUTE,
                        0
                    )
                    audioManager.adjustStreamVolume(
                        AudioManager.STREAM_SYSTEM,
                        AudioManager.ADJUST_UNMUTE,
                        0
                    )
                } catch (_: SecurityException) {
                }
                savedNotificationVol?.let { vol ->
                    try {
                        audioManager.setStreamVolume(AudioManager.STREAM_NOTIFICATION, vol, 0)
                    } catch (_: Throwable) {
                    }
                }
                savedSystemVol?.let { vol ->
                    try {
                        audioManager.setStreamVolume(AudioManager.STREAM_SYSTEM, vol, 0)
                    } catch (_: Throwable) {
                    }
                }
                savedNotificationVol = null
                savedSystemVol = null
            }
            promise.resolve(true)
        } catch (t: Throwable) {
            promise.reject("AUDIO_DUCK_ERR", t.message, t)
        }
    }

    @ReactMethod
    fun getSystemTelemetry(promise: Promise) {
        try {
            val am = reactContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val memInfo = ActivityManager.MemoryInfo()
            am.getMemoryInfo(memInfo)

            val freeRamMb = memInfo.availMem / (1024.0 * 1024.0)
            val totalRamMb = memInfo.totalMem / (1024.0 * 1024.0)

            val stat = StatFs(Environment.getDataDirectory().path)
            val freeStorageGb = (stat.availableBlocksLong * stat.blockSizeLong) / (1024.0 * 1024.0 * 1024.0)
            val totalStorageGb = (stat.blockCountLong * stat.blockSizeLong) / (1024.0 * 1024.0 * 1024.0)

            val bm = reactContext.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
            val batteryPct = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
            val isCharging = bm.isCharging

            val pm = reactContext.getSystemService(Context.POWER_SERVICE) as PowerManager
            val thermalStatus = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                pm.currentThermalStatus
            } else {
                0
            }

            val map = Arguments.createMap().apply {
                putDouble("freeRamMb", freeRamMb)
                putDouble("totalRamMb", totalRamMb)
                putBoolean("isLowMemory", memInfo.lowMemory)
                putDouble("freeStorageGb", freeStorageGb)
                putDouble("totalStorageGb", totalStorageGb)
                putInt("batteryPercent", batteryPct)
                putBoolean("isCharging", isCharging)
                putInt("thermalStatus", thermalStatus)
            }
            promise.resolve(map)
        } catch (t: Throwable) {
            promise.reject("TELEMETRY_ERR", t.message, t)
        }
    }

    @ReactMethod
    fun runTurboSweep(promise: Promise) {
        try {
            val am = reactContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val beforeMem = ActivityManager.MemoryInfo()
            am.getMemoryInfo(beforeMem)

            reactContext.cacheDir?.deleteRecursively()
            reactContext.externalCacheDir?.deleteRecursively()

            val pm = reactContext.packageManager
            val apps = pm.getInstalledApplications(PackageManager.GET_META_DATA)
            for (app in apps) {
                if (app.packageName != reactContext.packageName) {
                    try {
                        am.killBackgroundProcesses(app.packageName)
                    } catch (_: Throwable) {
                    }
                }
            }
            System.gc()

            val afterMem = ActivityManager.MemoryInfo()
            am.getMemoryInfo(afterMem)
            val freedMb = ((afterMem.availMem - beforeMem.availMem).coerceAtLeast(0L)) / (1024.0 * 1024.0)

            val result = Arguments.createMap().apply {
                putDouble("freedMb", freedMb)
                putDouble("freeRamMb", afterMem.availMem / (1024.0 * 1024.0))
            }
            promise.resolve(result)
        } catch (t: Throwable) {
            promise.reject("SWEEP_ERR", t.message, t)
        }
    }

    @ReactMethod
    fun scheduleMacroAlarm(
        macroId: String,
        hour: Int,
        minute: Int,
        daysMask: Int,
        actionPayload: String,
        promise: Promise
    ) {
        try {
            val alarmManager = reactContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val intent = Intent(reactContext, VortexAlarmMacroReceiver::class.java).apply {
                putExtra(VortexAlarmMacroReceiver.EXTRA_MACRO_ID, macroId)
                putExtra(VortexAlarmMacroReceiver.EXTRA_ACTION_PAYLOAD, actionPayload)
                putExtra(VortexAlarmMacroReceiver.EXTRA_DAYS_MASK, daysMask)
                putExtra(VortexAlarmMacroReceiver.EXTRA_HOUR, hour)
                putExtra(VortexAlarmMacroReceiver.EXTRA_MINUTE, minute)
            }
            val requestCode = macroId.hashCode()
            val pending = PendingIntent.getBroadcast(
                reactContext,
                requestCode,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val cal = Calendar.getInstance().apply {
                set(Calendar.HOUR_OF_DAY, hour.coerceIn(0, 23))
                set(Calendar.MINUTE, minute.coerceIn(0, 59))
                set(Calendar.SECOND, 0)
                set(Calendar.MILLISECOND, 0)
                if (timeInMillis <= System.currentTimeMillis()) {
                    add(Calendar.DAY_OF_YEAR, 1)
                }
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
                alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cal.timeInMillis, pending)
            } else {
                alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cal.timeInMillis, pending)
            }

            promise.resolve(cal.timeInMillis.toDouble())
        } catch (t: Throwable) {
            promise.reject("ALARM_SCHED_ERR", t.message, t)
        }
    }

    @ReactMethod
    fun cancelMacroAlarm(macroId: String, promise: Promise) {
        try {
            val alarmManager = reactContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val intent = Intent(reactContext, VortexAlarmMacroReceiver::class.java)
            val pending = PendingIntent.getBroadcast(
                reactContext,
                macroId.hashCode(),
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            alarmManager.cancel(pending)
            pending.cancel()
            promise.resolve(true)
        } catch (t: Throwable) {
            promise.reject("ALARM_CANCEL_ERR", t.message, t)
        }
    }

    @ReactMethod
    fun toggleTorch(enable: Boolean, promise: Promise) {
        try {
            val camManager = reactContext.getSystemService(Context.CAMERA_SERVICE) as CameraManager
            var targetCameraId: String? = null
            for (id in camManager.cameraIdList) {
                val chars = camManager.getCameraCharacteristics(id)
                val hasFlash = chars.get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
                val facing = chars.get(CameraCharacteristics.LENS_FACING)
                if (hasFlash && facing == CameraCharacteristics.LENS_FACING_BACK) {
                    targetCameraId = id
                    break
                }
            }
            if (targetCameraId == null) {
                promise.reject("NO_TORCH", "Rear flash hardware unavailable")
                return
            }
            camManager.setTorchMode(targetCameraId, enable)
            torchState = enable
            promise.resolve(torchState)
        } catch (t: Throwable) {
            promise.reject("TORCH_ERR", t.message, t)
        }
    }

    @ReactMethod
    fun launchApp(query: String, promise: Promise) {
        try {
            val pm = reactContext.packageManager
            val directIntent = pm.getLaunchIntentForPackage(query.trim())
            if (directIntent != null) {
                directIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                reactContext.startActivity(directIntent)
                promise.resolve(query.trim())
                return
            }

            val cleanQuery = query.trim().lowercase()
            val apps = pm.getInstalledApplications(PackageManager.GET_META_DATA)
            for (app in apps) {
                val label = pm.getApplicationLabel(app).toString().lowercase()
                if (label == cleanQuery || label.contains(cleanQuery)) {
                    val launch = pm.getLaunchIntentForPackage(app.packageName)
                    if (launch != null) {
                        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        reactContext.startActivity(launch)
                        promise.resolve(app.packageName)
                        return
                    }
                }
            }
            promise.reject("APP_NOT_FOUND", "No launchable app matched query")
        } catch (t: Throwable) {
            promise.reject("APP_LAUNCH_ERR", t.message, t)
        }
    }

    @ReactMethod
    fun makeDirectCall(phoneNumber: String, promise: Promise) {
        try {
            val sanitized = phoneNumber.replace(Regex("[^0-9+*#]"), "")
            if (sanitized.length < 3) {
                promise.reject("INVALID_NUMBER", "Phone number too short")
                return
            }
            val hasPerm = ContextCompat.checkSelfPermission(
                reactContext,
                Manifest.permission.CALL_PHONE
            ) == PackageManager.PERMISSION_GRANTED
            val action = if (hasPerm) Intent.ACTION_CALL else Intent.ACTION_DIAL
            val intent = Intent(action, Uri.parse("tel:$sanitized")).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (t: Throwable) {
            promise.reject("CALL_ERR", t.message, t)
        }
    }

    @ReactMethod
    fun sendDirectSms(phoneNumber: String, message: String, promise: Promise) {
        try {
            val sanitized = phoneNumber.replace(Regex("[^0-9+]"), "")
            if (sanitized.length < 3 || message.isBlank()) {
                promise.reject("INVALID_SMS", "Recipient or message invalid")
                return
            }
            val smsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                reactContext.getSystemService(SmsManager::class.java)
            } else {
                @Suppress("DEPRECATION")
                SmsManager.getDefault()
            }
            val parts = smsManager.divideMessage(message)
            smsManager.sendMultipartTextMessage(sanitized, null, parts, null, null)
            promise.resolve(true)
        } catch (t: Throwable) {
            promise.reject("SMS_ERR", t.message, t)
        }
    }

    @ReactMethod
    fun sendDirectReply(keyOrSender: String, message: String, promise: Promise) {
        try {
            val sent = VortexNotificationListener.sendDirectReply(keyOrSender, message)
            promise.resolve(sent)
        } catch (t: Throwable) {
            promise.reject("REPLY_ERR", t.message, t)
        }
    }

    @ReactMethod
    fun dismissNotification(key: String, promise: Promise) {
        try {
            VortexNotificationListener.instance?.dismissNotificationSafe(key)
            promise.resolve(true)
        } catch (t: Throwable) {
            promise.reject("NOTIF_DISMISS_ERR", t.message, t)
        }
    }
}
