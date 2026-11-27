package com.vortex.app

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
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.facebook.react.bridge.Arguments
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.security.MessageDigest
import java.util.concurrent.Executors
import kotlin.math.hypot
import kotlin.random.Random

class VortexAccessibilityService : AccessibilityService() {

    companion object {
        @Volatile
        var instance: VortexAccessibilityService? = null

        @Volatile
        var autoUnlockEnabled: Boolean = true

        @Volatile
        var learnAppLockMode: Boolean = false
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    private val bgExecutor = Executors.newSingleThreadExecutor()
    private var lastScreenshotMs: Long = 0L
    private var lastUnlockAttemptMs: Long = 0L
    private var lastClipboardHash: String = ""

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        startClipboardMonitor()
    }

    override fun onUnbind(intent: android.content.Intent?): Boolean {
        if (instance === this) {
            instance = null
        }
        return super.onUnbind(intent)
    }

    override fun onDestroy() {
        if (instance === this) {
            instance = null
        }
        mainHandler.removeCallbacksAndMessages(null)
        bgExecutor.shutdownNow()
        super.onDestroy()
    }

    override fun onInterrupt() {
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return
        val pkg = event.packageName?.toString() ?: return

        if (event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED ||
            event.eventType == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
        ) {
            if (autoUnlockEnabled && isAppLockScreen(pkg)) {
                val now = System.currentTimeMillis()
                if (now - lastUnlockAttemptMs > 2500L) {
                    lastUnlockAttemptMs = now
                    mainHandler.postDelayed({ attemptAutoUnlock() }, 350L)
                }
            }
        }
    }

    private fun startClipboardMonitor() {
        val cm = getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return
        cm.addPrimaryClipChangedListener {
            try {
                val clip = cm.primaryClip ?: return@addPrimaryClipChangedListener
                if (clip.itemCount == 0) return@addPrimaryClipChangedListener
                val text = clip.getItemAt(0).coerceToText(this)?.toString()?.trim() ?: return@addPrimaryClipChangedListener
                if (text.length < 8 || text.length > 8000) return@addPrimaryClipChangedListener

                val hash = sha256Short(text)
                if (hash == lastClipboardHash) return@addPrimaryClipChangedListener
                lastClipboardHash = hash


                val looksLikeCodeOrError = text.contains("Exception") ||
                    text.contains("Error:") ||
                    text.contains("SyntaxError") ||
                    text.contains("undefined reference") ||
                    text.contains("segmentation fault", ignoreCase = true) ||
                    text.contains("#include") ||
                    text.contains("public static void") ||
                    text.contains("def ") ||
                    text.contains("function ")

                if (looksLikeCodeOrError) {
                    val map = Arguments.createMap().apply {
                        putString("text", text)
                        putString("hash", hash)
                        putDouble("timestamp", System.currentTimeMillis().toDouble())
                    }
                    VortexBridgeModule.instance?.emitNativeEvent("VORTEX_CLIPBOARD_RADAR", map)
                }
            } catch (_: Throwable) {
            }
        }
    }

    private fun isAppLockScreen(pkg: String): Boolean {
        if (pkg == "com.miui.securitycenter" || pkg == "com.android.systemui") {
            val root = rootInActiveWindow ?: return false
            val indicators = listOf("Enter password", "Enter PIN", "Draw pattern", "App lock", "Forgot password")
            for (hint in indicators) {
                val found = root.findAccessibilityNodeInfosByText(hint)
                if (!found.isNullOrEmpty()) {
                    return true
                }
            }
        }
        return false
    }

    private fun readVaultPin(): String? {
        return try {
            val masterKey = MasterKey.Builder(this)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            val prefs = EncryptedSharedPreferences.create(
                this,
                "vortex_secure_vault_v5",
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
            prefs.getString("applock_pin", null)
        } catch (_: Throwable) {
            null
        }
    }

    private fun attemptAutoUnlock() {
        val pin = readVaultPin() ?: return
        if (pin.length < 4 || !pin.all { it.isDigit() }) return
        val root = rootInActiveWindow ?: return

        fun tapDigitAt(index: Int) {
            if (index >= pin.length) return
            val digit = pin[index].toString()
            val candidates = root.findAccessibilityNodeInfosByText(digit)
            var tapped = false
            if (!candidates.isNullOrEmpty()) {
                for (node in candidates) {
                    val txt = node.text?.toString()?.trim() ?: ""
                    val desc = node.contentDescription?.toString()?.trim() ?: ""
                    if (txt == digit || desc == digit) {
                        val rect = Rect()
                        node.getBoundsInScreen(rect)
                        if (rect.width() > 10 && rect.height() > 10) {
                            performGhostTap(rect.exactCenterX(), rect.exactCenterY()) {
                                mainHandler.postDelayed({ tapDigitAt(index + 1) }, 140L)
                            }
                            tapped = true
                            break
                        }
                    }
                }
            }
            if (!tapped) {
                mainHandler.postDelayed({ tapDigitAt(index + 1) }, 140L)
            }
        }

        tapDigitAt(0)
    }

    fun performGhostTap(x: Float, y: Float, callback: (Boolean) -> Unit) {
        val jitterX = x + Random.nextFloat() * 7f - 3.5f
        val jitterY = y + Random.nextFloat() * 7f - 3.5f
        val safeX = jitterX.coerceAtLeast(1f)
        val safeY = jitterY.coerceAtLeast(1f)

        val path = Path().apply {
            moveTo(safeX, safeY)
        }
        val pressDuration = Random.nextLong(48L, 88L)
        val stroke = GestureDescription.StrokeDescription(path, 0L, pressDuration)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()

        val dispatched = dispatchGesture(
            gesture,
            object : GestureResultCallback() {
                override fun onCompleted(gestureDescription: GestureDescription?) {
                    callback(true)
                }

                override fun onCancelled(gestureDescription: GestureDescription?) {
                    callback(false)
                }
            },
            mainHandler
        )
        if (!dispatched) {
            callback(false)
        }
    }

    fun performGhostSwipe(
        startX: Float,
        startY: Float,
        endX: Float,
        endY: Float,
        durationMs: Long,
        callback: (Boolean) -> Unit
    ) {
        val dx = endX - startX
        val dy = endY - startY
        val dist = hypot(dx.toDouble(), dy.toDouble()).toFloat().coerceAtLeast(1f)
        val perpX = -dy / dist
        val perpY = dx / dist
        val arcOffset = (dist * 0.14f).coerceIn(12f, 95f) * (if (Random.nextBoolean()) 1f else -1f)

        val ctrl1X = (startX + dx * 0.32f + perpX * arcOffset).coerceAtLeast(1f)
        val ctrl1Y = (startY + dy * 0.32f + perpY * arcOffset).coerceAtLeast(1f)
        val ctrl2X = (startX + dx * 0.72f + perpX * (arcOffset * 0.45f)).coerceAtLeast(1f)
        val ctrl2Y = (startY + dy * 0.72f + perpY * (arcOffset * 0.45f)).coerceAtLeast(1f)

        val path = Path().apply {
            moveTo(startX.coerceAtLeast(1f), startY.coerceAtLeast(1f))
            cubicTo(ctrl1X, ctrl1Y, ctrl2X, ctrl2Y, endX.coerceAtLeast(1f), endY.coerceAtLeast(1f))
        }

        val stroke = GestureDescription.StrokeDescription(path, 0L, durationMs)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()

        val dispatched = dispatchGesture(
            gesture,
            object : GestureResultCallback() {
                override fun onCompleted(gestureDescription: GestureDescription?) {
                    callback(true)
                }

                override fun onCancelled(gestureDescription: GestureDescription?) {
                    callback(false)
                }
            },
            mainHandler
        )
        if (!dispatched) {
            callback(false)
        }
    }

    private fun findBestEditableNode(root: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
        if (root == null) return null
        val directFocus = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
        if (directFocus != null && directFocus.isEditable) {
            return directFocus
        }
        var bestNode: AccessibilityNodeInfo? = null
        var bestArea = 0

        fun traverse(node: AccessibilityNodeInfo?, depth: Int) {
            if (node == null || depth > 18) return
            if (node.isEditable && node.isVisibleToUser) {
                val r = Rect()
                node.getBoundsInScreen(r)
                val area = r.width().coerceAtLeast(0) * r.height().coerceAtLeast(0)
                if (area > bestArea) {
                    bestArea = area
                    bestNode = node
                }
            }
            for (i in 0 until node.childCount) {
                traverse(node.getChild(i), depth + 1)
            }
        }

        traverse(root, 0)
        return bestNode
    }

    fun injectTextToFocusedNode(text: String, humanCadence: Boolean, callback: (Boolean) -> Unit) {
        val target = findBestEditableNode(rootInActiveWindow)
        if (target == null) {
            callback(false)
            return
        }

        target.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
        target.performAction(AccessibilityNodeInfo.ACTION_CLICK)

        if (humanCadence && text.length <= 160) {
            val existing = target.text?.toString() ?: ""
            val basePrefix = if (existing == target.hintText?.toString()) "" else existing
            var idx = 0

            fun stepType() {
                if (idx >= text.length) {
                    callback(true)
                    return
                }
                idx += 1
                val partial = basePrefix + text.substring(0, idx)
                val args = Bundle().apply {
                    putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, partial)
                }
                val ok = target.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
                if (!ok && idx == 1) {
                    pasteViaClipboard(target, text, callback)
                    return
                }
                val delay = Random.nextLong(42L, 88L)
                mainHandler.postDelayed({ stepType() }, delay)
            }

            mainHandler.postDelayed({ stepType() }, 80L)
            return
        }

        val args = Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        }
        val directSuccess = target.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
        if (directSuccess) {
            callback(true)
        } else {
            pasteViaClipboard(target, text, callback)
        }
    }

    private fun pasteViaClipboard(
        node: AccessibilityNodeInfo,
        text: String,
        callback: (Boolean) -> Unit
    ) {
        try {
            val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            cm.setPrimaryClip(ClipData.newPlainText("VORTEX_INJECT", text))
            mainHandler.postDelayed({
                val pasted = node.performAction(AccessibilityNodeInfo.ACTION_PASTE)
                callback(pasted)
            }, 90L)
        } catch (_: Throwable) {
            callback(false)
        }
    }

    fun captureScreenAndDom(callback: (String) -> Unit) {
        val root = rootInActiveWindow
        val pkgName = root?.packageName?.toString() ?: "unknown"
        val nodesArray = JSONArray()
        val hashBuilder = StringBuilder(pkgName)
        var tagCounter = 1
        var visitedCount = 0

        fun walk(node: AccessibilityNodeInfo?, depth: Int) {
            if (node == null || depth > 18 || visitedCount >= 240) return
            visitedCount += 1

            val text = node.text?.toString()?.trim() ?: ""
            val desc = node.contentDescription?.toString()?.trim() ?: ""
            val viewId = node.viewIdResourceName ?: ""
            val clickable = node.isClickable
            val editable = node.isEditable
            val scrollable = node.isScrollable

            if (node.isVisibleToUser && (text.isNotEmpty() || desc.isNotEmpty() || clickable || editable || scrollable)) {
                val rect = Rect()
                node.getBoundsInScreen(rect)
                if (rect.width() > 4 && rect.height() > 4) {
                    val obj = JSONObject().apply {
                        put("tag", tagCounter++)
                        put("text", text.take(180))
                        put("desc", desc.take(120))
                        put("viewId", viewId)
                        put("className", node.className?.toString() ?: "")
                        put("clickable", clickable)
                        put("editable", editable)
                        put("scrollable", scrollable)
                        put("focused", node.isFocused)
                        put("centerX", rect.exactCenterX().toInt())
                        put("centerY", rect.exactCenterY().toInt())
                        put("bounds", "${rect.left},${rect.top},${rect.right},${rect.bottom}")
                    }
                    nodesArray.put(obj)
                    hashBuilder.append('|').append(text).append(':').append(rect.left).append(',').append(rect.top)
                }
            }

            for (i in 0 until node.childCount) {
                walk(node.getChild(i), depth + 1)
            }
        }

        walk(root, 0)
        val domHash = sha256Short(hashBuilder.toString())

        val now = System.currentTimeMillis()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && (now - lastScreenshotMs > 1150L)) {
            lastScreenshotMs = now
            try {
                takeScreenshot(
                    Display.DEFAULT_DISPLAY,
                    bgExecutor,
                    object : TakeScreenshotCallback {
                        override fun onSuccess(screenshot: ScreenshotResult) {
                            var base64Img = ""
                            try {
                                val hwBuffer = screenshot.hardwareBuffer
                                val colorSpace = screenshot.colorSpace
                                val rawBmp = Bitmap.wrapHardwareBuffer(hwBuffer, colorSpace)
                                hwBuffer.close()
                                if (rawBmp != null) {
                                    val softBmp = rawBmp.copy(Bitmap.Config.ARGB_8888, false)
                                    rawBmp.recycle()
                                    if (softBmp != null) {
                                        val targetW = 720
                                        val scale = targetW.toFloat() / softBmp.width.coerceAtLeast(1)
                                        val targetH = (softBmp.height * scale).toInt().coerceAtLeast(1)
                                        val scaled = Bitmap.createScaledBitmap(softBmp, targetW, targetH, true)
                                        softBmp.recycle()
                                        val out = ByteArrayOutputStream()
                                        scaled.compress(Bitmap.CompressFormat.JPEG, 65, out)
                                        scaled.recycle()
                                        base64Img = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
                                    }
                                }
                            } catch (_: Throwable) {
                            }

                            val payload = JSONObject().apply {
                                put("packageName", pkgName)
                                put("timestamp", now)
                                put("domHash", domHash)
                                put("screenshotBase64", base64Img)
                                put("nodes", nodesArray)
                            }
                            mainHandler.post { callback(payload.toString()) }
                        }

                        override fun onFailure(errorCode: Int) {
                            val payload = JSONObject().apply {
                                put("packageName", pkgName)
                                put("timestamp", now)
                                put("domHash", domHash)
                                put("screenshotBase64", "")
                                put("screenshotError", errorCode)
                                put("nodes", nodesArray)
                            }
                            mainHandler.post { callback(payload.toString()) }
                        }
                    }
                )
                return
            } catch (_: Throwable) {
            }
        }

        val fallbackPayload = JSONObject().apply {
            put("packageName", pkgName)
            put("timestamp", now)
            put("domHash", domHash)
            put("screenshotBase64", "")
            put("nodes", nodesArray)
        }
        callback(fallbackPayload.toString())
    }

    private fun sha256Short(input: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(input.toByteArray())
        return digest.take(8).joinToString("") { "%02x".format(it) }
    }
}
