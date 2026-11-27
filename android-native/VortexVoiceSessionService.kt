package com.vortex.app

import android.app.assist.AssistContent
import android.app.assist.AssistStructure
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.service.voice.VoiceInteractionSession
import android.service.voice.VoiceInteractionSessionService
import android.util.Base64
import com.facebook.react.bridge.Arguments
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream

class VortexVoiceSessionService : VoiceInteractionSessionService() {

    override fun onNewSession(args: Bundle?): VoiceInteractionSession {
        return VortexAssistSession(this)
    }

    private class VortexAssistSession(private val hostContext: Context) :
        VoiceInteractionSession(hostContext) {

        private val mainHandler = Handler(Looper.getMainLooper())
        private var capturedPackage: String = ""
        private var capturedWebUri: String = ""
        private var capturedNodesJson: String = "[]"
        private var capturedScreenshotB64: String = ""
        private var assistDelivered: Boolean = false

        override fun onShow(args: Bundle?, showFlags: Int) {
            super.onShow(args, showFlags)
            assistDelivered = false
            capturedPackage = ""
            capturedWebUri = ""
            capturedNodesJson = "[]"
            capturedScreenshotB64 = ""

            mainHandler.postDelayed({
                if (!assistDelivered) {
                    dispatchAndCloseSession()
                }
            }, 650L)
        }

        override fun onHandleAssist(
            data: Bundle?,
            structure: AssistStructure?,
            content: AssistContent?
        ) {
            super.onHandleAssist(data, structure, content)

            try {
                capturedWebUri = content?.webUri?.toString() ?: ""
                if (structure != null) {
                    capturedPackage = structure.activityComponent?.packageName ?: ""
                    val nodes = JSONArray()
                    var count = 0

                    fun traverseWindowNode(node: AssistStructure.ViewNode?, depth: Int) {
                        if (node == null || depth > 16 || count >= 160) return
                        val text = node.text?.toString()?.trim() ?: ""
                        val desc = node.contentDescription?.toString()?.trim() ?: ""
                        val hint = node.hint?.toString()?.trim() ?: ""

                        if (node.visibility == android.view.View.VISIBLE &&
                            (text.isNotEmpty() || desc.isNotEmpty() || hint.isNotEmpty())
                        ) {
                            count += 1
                            val item = JSONObject().apply {
                                put("tag", count)
                                put("text", text.take(180))
                                put("desc", desc.take(120))
                                put("hint", hint.take(80))
                                put("focused", node.isFocused)
                                put("left", node.left)
                                put("top", node.top)
                                put("width", node.width)
                                put("height", node.height)
                            }
                            nodes.put(item)
                        }

                        for (i in 0 until node.childCount) {
                            traverseWindowNode(node.getChildAt(i), depth + 1)
                        }
                    }

                    for (w in 0 until structure.windowNodeCount) {
                        val windowNode = structure.getWindowNodeAt(w)
                        traverseWindowNode(windowNode.rootViewNode, 0)
                    }
                    capturedNodesJson = nodes.toString()
                }
            } catch (_: Throwable) {
            }

            dispatchAndCloseSession()
        }

        override fun onHandleScreenshot(screenshot: Bitmap?) {
            super.onHandleScreenshot(screenshot)
            if (screenshot != null) {
                try {
                    val targetW = 720
                    val scale = targetW.toFloat() / screenshot.width.coerceAtLeast(1)
                    val targetH = (screenshot.height * scale).toInt().coerceAtLeast(1)
                    val scaled = Bitmap.createScaledBitmap(screenshot, targetW, targetH, true)
                    val out = ByteArrayOutputStream()
                    scaled.compress(Bitmap.CompressFormat.JPEG, 65, out)
                    scaled.recycle()
                    capturedScreenshotB64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
                } catch (_: Throwable) {
                } finally {
                    try {
                        screenshot.recycle()
                    } catch (_: Throwable) {
                    }
                }
            }
        }

        private fun dispatchAndCloseSession() {
            if (assistDelivered) return
            assistDelivered = true
            mainHandler.removeCallbacksAndMessages(null)

            val bridge = VortexBridgeModule.instance
            if (bridge != null) {
                val map = Arguments.createMap().apply {
                    putString("packageName", capturedPackage)
                    putString("webUri", capturedWebUri)
                    putString("nodesJson", capturedNodesJson)
                    putString("screenshotBase64", capturedScreenshotB64)
                    putBoolean("autoListen", true)
                    putDouble("timestamp", System.currentTimeMillis().toDouble())
                }
                bridge.emitNativeEvent("VORTEX_SYSTEM_ASSIST_TRIGGERED", map)
            } else {
                try {
                    val launch = hostContext.packageManager.getLaunchIntentForPackage(hostContext.packageName)
                    if (launch != null) {
                        launch.addFlags(
                            Intent.FLAG_ACTIVITY_NEW_TASK or
                                Intent.FLAG_ACTIVITY_SINGLE_TOP or
                                Intent.FLAG_ACTIVITY_CLEAR_TOP
                        )
                        launch.putExtra("vortex_assist_launch", true)
                        launch.putExtra("assist_package", capturedPackage)
                        launch.putExtra("assist_web_uri", capturedWebUri)
                        hostContext.startActivity(launch)
                    }
                } catch (_: Throwable) {
                }
            }

            try {
                finish()
            } catch (_: Throwable) {
            }
        }

        override fun onDestroy() {
            mainHandler.removeCallbacksAndMessages(null)
            super.onDestroy()
        }
    }
}
