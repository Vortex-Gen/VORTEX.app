package com.vortex.app

import android.app.ActivityManager
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import org.json.JSONObject
import java.util.Calendar

class VortexAlarmMacroReceiver : BroadcastReceiver() {

    companion object {
        const val EXTRA_MACRO_ID = "macro_id"
        const val EXTRA_ACTION_PAYLOAD = "action_payload"
        const val EXTRA_DAYS_MASK = "days_mask"
        const val EXTRA_HOUR = "hour"
        const val EXTRA_MINUTE = "minute"

        private const val ACTION_DISMISS_ALARM = "com.vortex.app.DISMISS_ALARM"
        private const val ACTION_SNOOZE_ALARM = "com.vortex.app.SNOOZE_ALARM"
        private const val ALARM_CHANNEL_ID = "vortex_scheduled_alarms_v5"
    }

    override fun onReceive(context: Context, intent: Intent?) {
        if (intent == null) return

        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        val wakeLock = pm.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "Vortex::MacroAlarmWakeLock"
        )

        try {
            wakeLock.acquire(15_000L)

            when (intent.action) {
                ACTION_DISMISS_ALARM -> {
                    val notifId = intent.getIntExtra("notif_id", 7001)
                    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                    nm.cancel(notifId)
                    return
                }
                ACTION_SNOOZE_ALARM -> {
                    val notifId = intent.getIntExtra("notif_id", 7001)
                    val macroId = intent.getStringExtra(EXTRA_MACRO_ID) ?: "snooze_alarm"
                    val payload = intent.getStringExtra(EXTRA_ACTION_PAYLOAD) ?: "{}"
                    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                    nm.cancel(notifId)
                    scheduleSnooze(context, macroId, payload, 5)
                    return
                }
            }

            val macroId = intent.getStringExtra(EXTRA_MACRO_ID) ?: return
            val payloadStr = intent.getStringExtra(EXTRA_ACTION_PAYLOAD) ?: "{}"
            val daysMask = intent.getIntExtra(EXTRA_DAYS_MASK, 0)
            val hour = intent.getIntExtra(EXTRA_HOUR, 7).coerceIn(0, 23)
            val minute = intent.getIntExtra(EXTRA_MINUTE, 30).coerceIn(0, 59)

            val todayBit = 1 shl (Calendar.getInstance().get(Calendar.DAY_OF_WEEK) - 1)
            val shouldRunToday = (daysMask == 0) || ((daysMask and todayBit) != 0)

            if (daysMask > 0) {
                scheduleNextOccurrence(context, macroId, hour, minute, daysMask, payloadStr)
            }

            if (!shouldRunToday) return

            executeNativeMacroFallback(context, macroId, payloadStr)

            val jsMap = Arguments.createMap().apply {
                putString("macroId", macroId)
                putString("actionPayload", payloadStr)
                putInt("hour", hour)
                putInt("minute", minute)
                putInt("daysMask", daysMask)
                putDouble("triggeredAt", System.currentTimeMillis().toDouble())
            }
            VortexBridgeModule.instance?.emitNativeEvent("VORTEX_MACRO_TRIGGERED", jsMap)
        } catch (_: Throwable) {
        } finally {
            if (wakeLock.isHeld) {
                try {
                    wakeLock.release()
                } catch (_: Throwable) {
                }
            }
        }
    }

    private fun executeNativeMacroFallback(context: Context, macroId: String, payloadStr: String) {
        val json = try {
            JSONObject(payloadStr)
        } catch (_: Throwable) {
            JSONObject()
        }

        val command = json.optString("command", "").uppercase()
        val label = json.optString("label", "VORTEX Scheduled Macro")
        val ringAlarm = json.optBoolean("ringAlarm", command == "ALARM_RING")

        if (command.contains("TURBO_SWEEP")) {
            try {
                val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
                val apps = context.packageManager.getInstalledApplications(0)
                for (app in apps) {
                    if (app.packageName != context.packageName) {
                        try {
                            am.killBackgroundProcesses(app.packageName)
                        } catch (_: Throwable) {
                        }
                    }
                }
            } catch (_: Throwable) {
            }
        }

        if (command.contains("START_ORB") && Settings.canDrawOverlays(context)) {
            try {
                val orbIntent = Intent(context, VortexFloatingService::class.java).apply {
                    action = VortexFloatingService.ACTION_START
                }
                ContextCompat.startForegroundService(context, orbIntent)
            } catch (_: Throwable) {
            }
        }

        if (command.contains("TORCH_ON") || command.contains("TORCH_OFF")) {
            setTorchSafe(context, command.contains("TORCH_ON"))
        }

        if (ringAlarm) {
            showAlarmNotification(context, macroId, label, payloadStr)
        }
    }

    private fun setTorchSafe(context: Context, enable: Boolean) {
        try {
            val camManager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
            for (id in camManager.cameraIdList) {
                val chars = camManager.getCameraCharacteristics(id)
                val hasFlash = chars.get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
                val facing = chars.get(CameraCharacteristics.LENS_FACING)
                if (hasFlash && facing == CameraCharacteristics.LENS_FACING_BACK) {
                    camManager.setTorchMode(id, enable)
                    break
                }
            }
        } catch (_: Throwable) {
        }
    }

    private fun showAlarmNotification(
        context: Context,
        macroId: String,
        label: String,
        payloadStr: String
    ) {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val alarmSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            val attrs = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
            val channel = NotificationChannel(
                ALARM_CHANNEL_ID,
                "VORTEX Alarms and Macros",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                enableVibration(true)
                setSound(alarmSound, attrs)
            }
            nm.createNotificationChannel(channel)
        }

        val notifId = (macroId.hashCode() and 0x7FFFFFFF) % 90000 + 7000

        val dismissIntent = Intent(context, VortexAlarmMacroReceiver::class.java).apply {
            action = ACTION_DISMISS_ALARM
            putExtra("notif_id", notifId)
        }
        val dismissPending = PendingIntent.getBroadcast(
            context,
            notifId + 1,
            dismissIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val snoozeIntent = Intent(context, VortexAlarmMacroReceiver::class.java).apply {
            action = ACTION_SNOOZE_ALARM
            putExtra("notif_id", notifId)
            putExtra(EXTRA_MACRO_ID, macroId)
            putExtra(EXTRA_ACTION_PAYLOAD, payloadStr)
        }
        val snoozePending = PendingIntent.getBroadcast(
            context,
            notifId + 2,
            snoozeIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val openAppIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        val contentPending = PendingIntent.getActivity(
            context,
            notifId,
            openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = NotificationCompat.Builder(context, ALARM_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle("VORTEX Alarm")
            .setContentText(label)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setAutoCancel(true)
            .setContentIntent(contentPending)
            .addAction(0, "Dismiss", dismissPending)
            .addAction(0, "Snooze 5m", snoozePending)

        nm.notify(notifId, builder.build())
    }

    private fun scheduleSnooze(
        context: Context,
        macroId: String,
        payloadStr: String,
        minutesAhead: Int
    ) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val triggerMs = System.currentTimeMillis() + minutesAhead * 60_000L
        val intent = Intent(context, VortexAlarmMacroReceiver::class.java).apply {
            putExtra(EXTRA_MACRO_ID, "${macroId}_snooze")
            putExtra(EXTRA_ACTION_PAYLOAD, payloadStr)
            putExtra(EXTRA_DAYS_MASK, 0)
        }
        val pending = PendingIntent.getBroadcast(
            context,
            "${macroId}_snooze".hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerMs, pending)
        } else {
            alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerMs, pending)
        }
    }

    private fun scheduleNextOccurrence(
        context: Context,
        macroId: String,
        hour: Int,
        minute: Int,
        daysMask: Int,
        payloadStr: String
    ) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val cal = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, hour)
            set(Calendar.MINUTE, minute)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
            add(Calendar.DAY_OF_YEAR, 1)
        }

        for (offset in 0 until 7) {
            val dayBit = 1 shl (cal.get(Calendar.DAY_OF_WEEK) - 1)
            if ((daysMask and dayBit) != 0) {
                break
            }
            cal.add(Calendar.DAY_OF_YEAR, 1)
        }

        val intent = Intent(context, VortexAlarmMacroReceiver::class.java).apply {
            putExtra(EXTRA_MACRO_ID, macroId)
            putExtra(EXTRA_ACTION_PAYLOAD, payloadStr)
            putExtra(EXTRA_DAYS_MASK, daysMask)
            putExtra(EXTRA_HOUR, hour)
            putExtra(EXTRA_MINUTE, minute)
        }
        val pending = PendingIntent.getBroadcast(
            context,
            macroId.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cal.timeInMillis, pending)
        } else {
            alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cal.timeInMillis, pending)
        }
    }
}
