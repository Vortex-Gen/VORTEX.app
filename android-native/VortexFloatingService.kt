package com.vortex.app

import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.DisplayMetrics
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import android.view.animation.DecelerateInterpolator
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.app.NotificationCompat
import com.facebook.react.bridge.Arguments
import kotlin.math.abs

class VortexFloatingService : Service() {

    companion object {
        @Volatile
        var isRunning: Boolean = false

        const val ACTION_START = "com.vortex.app.ORB_START"
        const val ACTION_STOP = "com.vortex.app.ORB_STOP"
        const val ACTION_UPDATE_CONFIG = "com.vortex.app.ORB_UPDATE"
        const val ACTION_TOGGLE = "com.vortex.app.ORB_TOGGLE"
        private const val CHANNEL_ID = "vortex_orb_channel"
        private const val NOTIF_ID = 5051
    }

    private lateinit var windowManager: WindowManager
    private var orbView: VortexOrbCanvasView? = null
    private var hudView: LinearLayout? = null
    private var orbParams: WindowManager.LayoutParams? = null
    private var hudParams: WindowManager.LayoutParams? = null

    private val mainHandler = Handler(Looper.getMainLooper())
    private var idleOpacity: Float = 0.40f
    private var glowColor: Int = Color.parseColor("#38BDF8")
    private var stealthMode: Boolean = false
    private var isHudVisible: Boolean = false
    private var isMinimizedEdgeTab: Boolean = false
    private var dockedRight: Boolean = true

    private val dimRunnable = Runnable {
        if (!isHudVisible) {
            animateOrbAlpha(if (stealthMode) 0.25f else idleOpacity)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        createNotificationChannel()
        startForeground(NOTIF_ID, buildNotification())
        isRunning = true
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_TOGGLE -> {
                if (orbView != null) {
                    stopSelf()
                    return START_NOT_STICKY
                }
            }
            ACTION_UPDATE_CONFIG -> {
                idleOpacity = intent.getFloatExtra("opacity", idleOpacity).coerceIn(0.15f, 1.0f)
                stealthMode = intent.getBooleanExtra("stealth", stealthMode)
                parseHexSafe(intent.getStringExtra("glowHex"))?.let { glowColor = it }
                orbView?.updateTheme(glowColor, stealthMode)
                scheduleIdleDim()
                return START_STICKY
            }
        }

        if (intent != null) {
            idleOpacity = intent.getFloatExtra("opacity", 0.40f).coerceIn(0.15f, 1.0f)
            stealthMode = intent.getBooleanExtra("stealth", false)
            parseHexSafe(intent.getStringExtra("glowHex"))?.let { glowColor = it }
        }

        if (orbView == null) {
            mountOrbOverlay()
        } else {
            orbView?.updateTheme(glowColor, stealthMode)
            scheduleIdleDim()
        }

        return START_STICKY
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        hideHudCapsule()
        val params = orbParams ?: return
        val view = orbView ?: return
        val (screenW, screenH) = getScreenSize()
        val orbPx = dpToPx(56)
        params.x = if (dockedRight) (screenW - orbPx - dpToPx(10)) else dpToPx(10)
        params.y = params.y.coerceIn(dpToPx(48), (screenH - orbPx - dpToPx(80)).coerceAtLeast(dpToPx(60)))
        try {
            windowManager.updateViewLayout(view, params)
        } catch (_: Throwable) {
        }
    }

    override fun onDestroy() {
        isRunning = false
        mainHandler.removeCallbacksAndMessages(null)
        hideHudCapsule()
        orbView?.let { v ->
            try {
                windowManager.removeView(v)
            } catch (_: Throwable) {
            }
        }
        orbView = null
        super.onDestroy()
    }

    private fun parseHexSafe(hex: String?): Int? {
        if (hex.isNullOrBlank()) return null
        return try {
            Color.parseColor(hex)
        } catch (_: Throwable) {
            null
        }
    }

    private fun dpToPx(dp: Int): Int {
        return TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            dp.toFloat(),
            resources.displayMetrics
        ).toInt()
    }

    private fun getScreenSize(): Pair<Int, Int> {
        val metrics = DisplayMetrics()
        @Suppress("DEPRECATION")
        windowManager.defaultDisplay.getRealMetrics(metrics)
        return Pair(metrics.widthPixels, metrics.heightPixels)
    }

    private fun overlayLayoutType(): Int {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun mountOrbOverlay() {
        val (screenW, screenH) = getScreenSize()
        val orbSize = dpToPx(56)

        val view = VortexOrbCanvasView(this).apply {
            updateTheme(glowColor, stealthMode)
            alpha = idleOpacity
        }

        val params = WindowManager.LayoutParams(
            orbSize,
            orbSize,
            overlayLayoutType(),
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = screenW - orbSize - dpToPx(10)
            y = (screenH * 0.42f).toInt()
        }

        val touchSlop = ViewConfiguration.get(this).scaledTouchSlop
        var initialX = 0
        var initialY = 0
        var touchStartX = 0f
        var touchStartY = 0f
        var isDragging = false
        var lastTapTime = 0L
        var longPressTriggered = false

        val longPressRunnable = Runnable {
            if (!isDragging) {
                longPressTriggered = true
                wakeOrb()
                emitOrbAction("SILENT_SCAN")
            }
        }

        view.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    wakeOrb()
                    initialX = params.x
                    initialY = params.y
                    touchStartX = event.rawX
                    touchStartY = event.rawY
                    isDragging = false
                    longPressTriggered = false
                    mainHandler.postDelayed(longPressRunnable, 520L)
                    true
                }

                MotionEvent.ACTION_MOVE -> {
                    val dx = (event.rawX - touchStartX).toInt()
                    val dy = (event.rawY - touchStartY).toInt()
                    if (!isDragging && (abs(dx) > touchSlop || abs(dy) > touchSlop)) {
                        isDragging = true
                        mainHandler.removeCallbacks(longPressRunnable)
                        hideHudCapsule()
                    }
                    if (isDragging) {
                        val (w, h) = getScreenSize()
                        params.x = (initialX + dx).coerceIn(0, (w - orbSize).coerceAtLeast(0))
                        params.y = (initialY + dy).coerceIn(dpToPx(36), (h - orbSize - dpToPx(56)).coerceAtLeast(dpToPx(40)))
                        try {
                            windowManager.updateViewLayout(view, params)
                        } catch (_: Throwable) {
                        }
                    }
                    true
                }

                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    mainHandler.removeCallbacks(longPressRunnable)
                    if (isDragging) {
                        snapOrbToNearestEdge()
                        scheduleIdleDim()
                    } else if (!longPressTriggered) {
                        if (isMinimizedEdgeTab) {
                            restoreFromEdgeTab()
                        } else {
                            val now = System.currentTimeMillis()
                            if (now - lastTapTime < 280L) {
                                lastTapTime = 0L
                                hideHudCapsule()
                                emitOrbAction("VOICE_CAPTURE")
                            } else {
                                lastTapTime = now
                                mainHandler.postDelayed({
                                    if (lastTapTime != 0L && System.currentTimeMillis() - lastTapTime >= 270L) {
                                        lastTapTime = 0L
                                        toggleHudCapsule()
                                    }
                                }, 285L)
                            }
                        }
                    }
                    true
                }

                else -> false
            }
        }

        orbView = view
        orbParams = params
        try {
            windowManager.addView(view, params)
            scheduleIdleDim()
        } catch (_: Throwable) {
            stopSelf()
        }
    }

    private fun snapOrbToNearestEdge() {
        val view = orbView ?: return
        val params = orbParams ?: return
        val (screenW, _) = getScreenSize()
        val orbSize = dpToPx(56)
        val margin = dpToPx(10)

        dockedRight = (params.x + orbSize / 2) >= (screenW / 2)
        val targetX = if (dockedRight) (screenW - orbSize - margin) else margin

        ValueAnimator.ofInt(params.x, targetX).apply {
            duration = 240L
            interpolator = DecelerateInterpolator()
            addUpdateListener { anim ->
                params.x = anim.animatedValue as Int
                try {
                    windowManager.updateViewLayout(view, params)
                } catch (_: Throwable) {
                }
            }
            start()
        }
    }

    private fun minimizeToEdgeTab() {
        val view = orbView ?: return
        val params = orbParams ?: return
        val (screenW, _) = getScreenSize()
        val orbSize = dpToPx(56)
        hideHudCapsule()
        isMinimizedEdgeTab = true
        params.x = if (dockedRight) (screenW - dpToPx(16)) else (-orbSize + dpToPx(16))
        try {
            windowManager.updateViewLayout(view, params)
        } catch (_: Throwable) {
        }
        animateOrbAlpha(0.32f)
    }

    private fun restoreFromEdgeTab() {
        isMinimizedEdgeTab = false
        wakeOrb()
        snapOrbToNearestEdge()
        scheduleIdleDim()
    }

    private fun wakeOrb() {
        mainHandler.removeCallbacks(dimRunnable)
        animateOrbAlpha(1.0f)
    }

    private fun scheduleIdleDim() {
        mainHandler.removeCallbacks(dimRunnable)
        mainHandler.postDelayed(dimRunnable, 2800L)
    }

    private fun animateOrbAlpha(targetAlpha: Float) {
        val view = orbView ?: return
        view.animate().alpha(targetAlpha).setDuration(220L).start()
    }

    private fun toggleHudCapsule() {
        if (isHudVisible) {
            hideHudCapsule()
            scheduleIdleDim()
        } else {
            showHudCapsule()
        }
    }

    private fun showHudCapsule() {
        if (isHudVisible) return
        val oParams = orbParams ?: return
        val (screenW, _) = getScreenSize()

        val capsule = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dpToPx(10), dpToPx(6), dpToPx(10), dpToPx(6))
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#E60A0E17"))
                cornerRadius = dpToPx(24).toFloat()
                setStroke(dpToPx(1), Color.parseColor("#4D38BDF8"))
            }
        }

        val items = listOf(
            Pair("SCAN", "SILENT_SCAN"),
            Pair("MIC", "VOICE_CAPTURE"),
            Pair("INJECT", "QUICK_INJECT"),
            Pair("HIDE", "MINIMIZE_ORB")
        )

        items.forEachIndexed { index, (label, actionCode) ->
            val chip = TextView(this).apply {
                text = label
                setTextColor(if (actionCode == "MINIMIZE_ORB") Color.parseColor("#94A3B8") else Color.WHITE)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
                typeface = Typeface.create("sans-serif-medium", Typeface.BOLD)
                setPadding(dpToPx(9), dpToPx(6), dpToPx(9), dpToPx(6))
                setOnClickListener {
                    if (actionCode == "MINIMIZE_ORB") {
                        minimizeToEdgeTab()
                    } else {
                        hideHudCapsule()
                        scheduleIdleDim()
                        emitOrbAction(actionCode)
                    }
                }
            }
            capsule.addView(chip)

            if (index < items.lastIndex) {
                val divider = View(this).apply {
                    setBackgroundColor(Color.parseColor("#26FFFFFF"))
                    layoutParams = LinearLayout.LayoutParams(dpToPx(1), dpToPx(16))
                }
                capsule.addView(divider)
            }
        }

        capsule.measure(
            View.MeasureSpec.makeMeasureSpec(screenW, View.MeasureSpec.AT_MOST),
            View.MeasureSpec.makeMeasureSpec(dpToPx(60), View.MeasureSpec.AT_MOST)
        )
        val capsuleW = capsule.measuredWidth
        val capsuleH = capsule.measuredHeight
        val orbSize = dpToPx(56)

        val targetX = if (dockedRight) {
            (oParams.x - capsuleW - dpToPx(8)).coerceAtLeast(dpToPx(8))
        } else {
            (oParams.x + orbSize + dpToPx(8)).coerceAtMost((screenW - capsuleW - dpToPx(8)).coerceAtLeast(dpToPx(8)))
        }
        val targetY = oParams.y + ((orbSize - capsuleH) / 2)

        val hParams = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            overlayLayoutType(),
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = targetX
            y = targetY
        }

        hudView = capsule
        hudParams = hParams
        isHudVisible = true
        try {
            windowManager.addView(capsule, hParams)
        } catch (_: Throwable) {
            isHudVisible = false
        }
    }

    private fun hideHudCapsule() {
        if (!isHudVisible) return
        hudView?.let { v ->
            try {
                windowManager.removeView(v)
            } catch (_: Throwable) {
            }
        }
        hudView = null
        hudParams = null
        isHudVisible = false
    }

    private fun emitOrbAction(action: String) {
        val map = Arguments.createMap().apply {
            putString("action", action)
            putDouble("timestamp", System.currentTimeMillis().toDouble())
        }
        VortexBridgeModule.instance?.emitNativeEvent("VORTEX_ORB_ACTION", map)
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "VORTEX Autonomous Core",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                setShowBadge(false)
                enableLights(false)
                enableVibration(false)
                setSound(null, null)
            }
            val nm = getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        val openIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pending = PendingIntent.getActivity(
            this,
            0,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("VORTEX ẞ Active")
            .setContentText("Autonomous floating orb and zero-beep core ready")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentIntent(pending)
            .setOngoing(true)
            .setSilent(true)
            .build()
    }

    private class VortexOrbCanvasView(context: Context) : View(context) {
        private var accentColor: Int = Color.parseColor("#38BDF8")
        private var stealth: Boolean = false

        private val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#E6060911")
            style = Paint.Style.FILL
        }

        private val glowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = 4.5f
        }

        private val innerRingPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = 1.5f
            color = Color.parseColor("#33FFFFFF")
        }

        private val glyphPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            textAlign = Paint.Align.CENTER
            typeface = Typeface.create("sans-serif-medium", Typeface.BOLD)
        }

        fun updateTheme(color: Int, isStealth: Boolean) {
            accentColor = color
            stealth = isStealth
            invalidate()
        }

        override fun onDraw(canvas: Canvas) {
            super.onDraw(canvas)
            val cx = width / 2f
            val cy = height / 2f
            val radius = (minOf(width, height) / 2f) - 4f

            canvas.drawCircle(cx, cy, radius, bgPaint)

            glowPaint.color = if (stealth) Color.parseColor("#6638BDF8") else accentColor
            canvas.drawCircle(cx, cy, radius - 1.5f, glowPaint)
            canvas.drawCircle(cx, cy, radius - 7f, innerRingPaint)

            glyphPaint.color = if (stealth) Color.parseColor("#94A3B8") else accentColor
            glyphPaint.textSize = radius * 0.92f
            val fontMetrics = glyphPaint.fontMetrics
            val textY = cy - (fontMetrics.ascent + fontMetrics.descent) / 2f
            canvas.drawText("ẞ", cx, textY, glyphPaint)
        }
    }
}
