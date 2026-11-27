package com.vortex.app

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import androidx.core.content.ContextCompat

class VortexTileService : TileService() {

    override fun onStartListening() {
        super.onStartListening()
        refreshTileState()
    }

    override fun onTileAdded() {
        super.onTileAdded()
        refreshTileState()
    }

    override fun onClick() {
        super.onClick()
        if (!Settings.canDrawOverlays(this)) {
            openOverlayPermissionScreen()
            return
        }

        if (VortexFloatingService.isRunning) {
            val stopIntent = Intent(this, VortexFloatingService::class.java).apply {
                action = VortexFloatingService.ACTION_STOP
            }
            startService(stopIntent)
            updateTileUi(false)
        } else {
            val prefs = getSharedPreferences(VortexBootReceiver.PREFS_ALARM_REGISTRY, Context.MODE_PRIVATE)
            val opacity = prefs.getFloat(VortexBootReceiver.KEY_ORB_OPACITY, 0.40f).coerceIn(0.15f, 1.0f)
            val glowHex = prefs.getString(VortexBootReceiver.KEY_ORB_GLOW, "#38BDF8") ?: "#38BDF8"
            val stealth = prefs.getBoolean(VortexBootReceiver.KEY_ORB_STEALTH, false)

            val startIntent = Intent(this, VortexFloatingService::class.java).apply {
                action = VortexFloatingService.ACTION_START
                putExtra("opacity", opacity)
                putExtra("glowHex", glowHex)
                putExtra("stealth", stealth)
            }
            ContextCompat.startForegroundService(this, startIntent)
            updateTileUi(true)
        }
    }

    private fun refreshTileState() {
        updateTileUi(VortexFloatingService.isRunning)
    }

    private fun updateTileUi(active: Boolean) {
        val tile = qsTile ?: return
        tile.label = "Vortex Orb"
        tile.state = if (active) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            tile.subtitle = if (active) "Active" else "Standby"
        }
        try {
            tile.updateTile()
        } catch (_: Throwable) {
        }
    }

    private fun openOverlayPermissionScreen() {
        val permIntent = Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:$packageName")
        ).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                val pending = PendingIntent.getActivity(
                    this,
                    4091,
                    permIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                startActivityAndCollapse(pending)
            } else {
                @Suppress("DEPRECATION")
                startActivityAndCollapse(permIntent)
            }
        } catch (_: Throwable) {
        }
    }
}
