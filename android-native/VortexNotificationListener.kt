package com.vortex.app

import android.app.Notification
import android.app.PendingIntent
import android.app.RemoteInput
import android.content.Intent
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import com.facebook.react.bridge.Arguments
import java.util.concurrent.ConcurrentHashMap

class VortexNotificationListener : NotificationListenerService() {

    data class CachedReplyTarget(
        val key: String,
        val packageName: String,
        val sender: String,
        val pendingIntent: PendingIntent,
        val remoteInput: RemoteInput,
        val timestampMs: Long
    )

    companion object {
        @Volatile
        var instance: VortexNotificationListener? = null

        private const val MAX_CACHE_ENTRIES = 40
        private const val CACHE_TTL_MS = 30L * 60L * 1000L
        private val replyCache = ConcurrentHashMap<String, CachedReplyTarget>()
        private val OTP_REGEX = Regex("\\b(\\d{4,8})\\b")

        private val MESSAGING_PACKAGES = setOf(
            "com.whatsapp",
            "com.whatsapp.w4b",
            "org.telegram.messenger",
            "com.instagram.android",
            "com.google.android.apps.messaging",
            "com.android.mms",
            "com.discord"
        )

        fun sendDirectReply(keyOrSender: String, message: String): Boolean {
            val cleanMsg = message.trim().take(1000)
            if (cleanMsg.isEmpty()) return false
            purgeExpiredEntries()

            val normalized = keyOrSender.trim().lowercase()
            val target = replyCache[keyOrSender]
                ?: replyCache.values.firstOrNull {
                    it.sender.lowercase().contains(normalized) ||
                        it.packageName.lowercase().contains(normalized)
                }
                ?: return false

            val ctx = instance ?: return false
            return try {
                val fillIntent = Intent()
                val bundle = Bundle().apply {
                    putCharSequence(target.remoteInput.resultKey, cleanMsg)
                }
                RemoteInput.addResultsToIntent(arrayOf(target.remoteInput), fillIntent, bundle)
                target.pendingIntent.send(ctx, 0, fillIntent)
                true
            } catch (_: Throwable) {
                replyCache.remove(target.key)
                false
            }
        }

        private fun purgeExpiredEntries() {
            val now = System.currentTimeMillis()
            val iterator = replyCache.entries.iterator()
            while (iterator.hasNext()) {
                val entry = iterator.next()
                if (now - entry.value.timestampMs > CACHE_TTL_MS) {
                    iterator.remove()
                }
            }
            while (replyCache.size > MAX_CACHE_ENTRIES) {
                val oldestKey = replyCache.minByOrNull { it.value.timestampMs }?.key ?: break
                replyCache.remove(oldestKey)
            }
        }
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        instance = this
    }

    override fun onListenerDisconnected() {
        if (instance === this) {
            instance = null
        }
        super.onListenerDisconnected()
    }

    override fun onDestroy() {
        if (instance === this) {
            instance = null
        }
        replyCache.clear()
        super.onDestroy()
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn == null) return
        val pkg = sbn.packageName ?: return
        if (pkg == applicationContext.packageName) return

        val notification = sbn.notification ?: return
        if ((notification.flags and Notification.FLAG_GROUP_SUMMARY) != 0) return
        if (sbn.isOngoing && pkg !in MESSAGING_PACKAGES) return

        val extras = notification.extras ?: return
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.trim() ?: ""
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()?.trim() ?: ""
        val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()?.trim() ?: text
        if (title.isEmpty() && bigText.isEmpty()) return

        var canReply = false
        val actions = notification.actions
        if (actions != null) {
            for (action in actions) {
                val inputs = action.remoteInputs
                val pending = action.actionIntent
                if (!inputs.isNullOrEmpty() && pending != null) {
                    purgeExpiredEntries()
                    replyCache[sbn.key] = CachedReplyTarget(
                        key = sbn.key,
                        packageName = pkg,
                        sender = title.ifEmpty { pkg },
                        pendingIntent = pending,
                        remoteInput = inputs[0],
                        timestampMs = System.currentTimeMillis()
                    )
                    canReply = true
                    break
                }
            }
        }

        val combined = "$title $bigText"
        val lower = combined.lowercase()
        val otpCode = if (lower.contains("otp") ||
            lower.contains("verification") ||
            lower.contains("code") ||
            lower.contains("verify")
        ) {
            OTP_REGEX.find(bigText)?.groupValues?.getOrNull(1) ?: ""
        } else {
            ""
        }

        val priority = when {
            otpCode.isNotEmpty() -> "URGENT_OTP"
            canReply || pkg in MESSAGING_PACKAGES -> "DIRECT_CHAT"
            pkg.contains("security") || pkg.contains("google") || pkg.contains("android") -> "SYSTEM_SECURITY"
            else -> "LOW_SPAM"
        }

        val payload = Arguments.createMap().apply {
            putString("key", sbn.key)
            putString("packageName", pkg)
            putString("title", title.take(160))
            putString("body", bigText.take(400))
            putString("priority", priority)
            putString("otp", otpCode)
            putBoolean("canDirectReply", canReply)
            putDouble("timestamp", sbn.postTime.toDouble())
        }
        VortexBridgeModule.instance?.emitNativeEvent("VORTEX_NOTIFICATION_EVENT", payload)
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        if (sbn != null) {
            replyCache.remove(sbn.key)
        }
    }

    fun dismissNotificationSafe(key: String) {
        try {
            cancelNotification(key)
            replyCache.remove(key)
        } catch (_: Throwable) {
        }
    }
}
