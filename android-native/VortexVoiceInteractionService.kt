package com.vortex.app

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.service.voice.VoiceInteractionService
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments

class VortexVoiceInteractionService : VoiceInteractionService() {

    companion object {
        @Volatile
        var instance: VortexVoiceInteractionService? = null

        @Volatile
        var isDefaultAssistant: Boolean = false

        fun triggerSystemAssistSession(args: Bundle? = null, flags: Int = 0): Boolean {
            val service = instance ?: return false
            return try {
                service.showSession(args ?: Bundle(), flags)
                true
            } catch (_: Throwable) {
                false
            }
        }
    }

    override fun onReady() {
        super.onReady()
        instance = this
        isDefaultAssistant = true

        val payload = Arguments.createMap().apply {
            putBoolean("isDefaultAssistant", true)
            putDouble("readyAt", System.currentTimeMillis().toDouble())
        }
        VortexBridgeModule.instance?.emitNativeEvent("VORTEX_ASSISTANT_READY", payload)

        ensureOrbWarmup()
    }

    override fun onShutdown() {
        isDefaultAssistant = false
        if (instance === this) {
            instance = null
        }
        super.onShutdown()
    }

    private fun ensureOrbWarmup() {
        try {
            if (VortexFloatingService.isRunning) return
            if (!Settings.canDrawOverlays(this)) return

            val prefs = getSharedPreferences(VortexBootReceiver.PREFS_ALARM_REGISTRY, Context.MODE_PRIVATE)
            val autoStart = prefs.getBoolean(VortexBootReceiver.KEY_ORB_AUTOSTART, true)
            if (!autoStart) return

            val opacity = prefs.getFloat(VortexBootReceiver.KEY_ORB_OPACITY, 0.40f).coerceIn(0.15f, 1.0f)
            val glowHex = prefs.getString(VortexBootReceiver.KEY_ORB_GLOW, "#38BDF8") ?: "#38BDF8"
            val stealth = prefs.getBoolean(VortexBootReceiver.KEY_ORB_STEALTH, false)

            val serviceIntent = Intent(this, VortexFloatingService::class.java).apply {
                action = VortexFloatingService.ACTION_START
                putExtra("opacity", opacity)
                putExtra("glowHex", glowHex)
                putExtra("stealth", stealth)
            }
            ContextCompat.startForegroundService(this, serviceIntent)
        } catch (_: Throwable) {
        }
    }
}
