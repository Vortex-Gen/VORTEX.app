package com.vortex.app

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.UserManager
import android.provider.Settings
import androidx.core.content.ContextCompat
import org.json.JSONArray
import java.util.Calendar

class VortexBootReceiver : BroadcastReceiver() {

    companion object {
        const val PREFS_ALARM_REGISTRY = "vortex_alarm_registry_v5"
        const val KEY_ALARMS_JSON = "scheduled_alarms_json"
        const val KEY_ORB_AUTOSTART = "orb_autostart_enabled"
        const val KEY_ORB_OPACITY = "orb_saved_opacity"
        const val KEY_ORB_GLOW = "orb_saved_glow"
        const val KEY_ORB_STEALTH = "orb_saved_stealth"
    }

    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        val validActions = setOf(
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_LOCKED_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            "android.intent.action.QUICKBOOT_POWERON",
            "com.htc.intent.action.QUICKBOOT_POWERON"
        )
        if (action !in validActions) return

        val userManager = context.getSystemService(Context.USER_SERVICE) as? UserManager
        if (userManager != null && !userManager.isUserUnlocked) {
            return
        }

        restoreScheduledAlarms(context)
        restoreFloatingOrbIfEnabled(context)
    }

    private fun restoreScheduledAlarms(context: Context) {
        try {
            val prefs = context.getSharedPreferences(PREFS_ALARM_REGISTRY, Context.MODE_PRIVATE)
            val rawJson = prefs.getString(KEY_ALARMS_JSON, null) ?: return
            val list = JSONArray(rawJson)
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

            for (i in 0 until list.length()) {
                val item = list.optJSONObject(i) ?: continue
                if (!item.optBoolean("enabled", true)) continue

                val macroId = item.optString("id", "")
                if (macroId.isEmpty()) continue

                val hour = item.optInt("hour", 7).coerceIn(0, 23)
                val minute = item.optInt("minute", 30).coerceIn(0, 59)
                val daysMask = item.optInt("daysMask", 0)
                val payload = item.optString("actionPayload", "{}")

                val triggerAt = computeNextTriggerMillis(hour, minute, daysMask)
                val alarmIntent = Intent(context, VortexAlarmMacroReceiver::class.java).apply {
                    putExtra(VortexAlarmMacroReceiver.EXTRA_MACRO_ID, macroId)
                    putExtra(VortexAlarmMacroReceiver.EXTRA_ACTION_PAYLOAD, payload)
                    putExtra(VortexAlarmMacroReceiver.EXTRA_DAYS_MASK, daysMask)
                    putExtra(VortexAlarmMacroReceiver.EXTRA_HOUR, hour)
                    putExtra(VortexAlarmMacroReceiver.EXTRA_MINUTE, minute)
                }

                val pending = PendingIntent.getBroadcast(
                    context,
                    macroId.hashCode(),
                    alarmIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
                    alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pending)
                } else {
                    alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pending)
                }
            }
        } catch (_: Throwable) {
        }
    }

    private fun computeNextTriggerMillis(hour: Int, minute: Int, daysMask: Int): Long {
        val cal = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, hour)
            set(Calendar.MINUTE, minute)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
            if (timeInMillis <= System.currentTimeMillis()) {
                add(Calendar.DAY_OF_YEAR, 1)
            }
        }

        if (daysMask > 0) {
            for (offset in 0 until 7) {
                val dayBit = 1 shl (cal.get(Calendar.DAY_OF_WEEK) - 1)
                if ((daysMask and dayBit) != 0) {
                    break
                }
                cal.add(Calendar.DAY_OF_YEAR, 1)
            }
        }
        return cal.timeInMillis
    }

    private fun restoreFloatingOrbIfEnabled(context: Context) {
        try {
            val prefs = context.getSharedPreferences(PREFS_ALARM_REGISTRY, Context.MODE_PRIVATE)
            val autoStart = prefs.getBoolean(KEY_ORB_AUTOSTART, true)
            if (!autoStart) return
            if (!Settings.canDrawOverlays(context)) return

            val opacity = prefs.getFloat(KEY_ORB_OPACITY, 0.40f).coerceIn(0.15f, 1.0f)
            val glowHex = prefs.getString(KEY_ORB_GLOW, "#38BDF8") ?: "#38BDF8"
            val stealth = prefs.getBoolean(KEY_ORB_STEALTH, false)

            val serviceIntent = Intent(context, VortexFloatingService::class.java).apply {
                action = VortexFloatingService.ACTION_START
                putExtra("opacity", opacity)
                putExtra("glowHex", glowHex)
                putExtra("stealth", stealth)
            }
            ContextCompat.startForegroundService(context, serviceIntent)
        } catch (_: Throwable) {
        }
    }
}
