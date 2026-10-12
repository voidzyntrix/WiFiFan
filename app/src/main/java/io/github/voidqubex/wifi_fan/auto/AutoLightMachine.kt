package io.github.voidqubex.wifi_fan.auto

import kotlin.math.max
import kotlin.math.sqrt

/** What Auto light thinks the phone is doing. */
enum class AutoState {
    /** Nothing decided yet, or counting down to Night. */
    WAITING,
    /** Screen on, unlocked and moving: the phone is in a hand. */
    IN_HAND,
    /** Locked (or screen off) and still for the wait time: the phone is down. */
    NIGHT
}

/**
 * Auto light's decisions, as plain Kotlin: feed it motion, screen and lock events with a clock
 * (milliseconds, any monotonic base), and [evaluate] says when the light should change.
 *
 * - In hand: screen on AND unlocked AND motion within the last [handWindowMs].
 * - Night: locked or screen off, AND no motion for [nightDelayMs] (counted from the later of
 *   the last motion and the moment the phone went down).
 * - Anything else keeps the current state, so a phone lying still with the screen on, or a
 *   short wait after locking, changes nothing. A state is only reported once when entered.
 * - While [paused] (another sync drives the LED) nothing is reported; on resume the machine
 *   takes the state of the moment without reporting it, so it only acts on the next change.
 */
class AutoLightMachine(
    var nightDelayMs: Long,
    private val handWindowMs: Long = HAND_WINDOW_MS
) {
    var state = AutoState.WAITING
        private set
    var screenOn = true
        private set
    var locked = false
        private set
    var paused = false
        private set
    /** In hand as soon as the phone is up (screen on, unlocked), without waiting for motion. */
    var handInstant = false
    private var lastMotionMs = Long.MIN_VALUE / 2
    /** When the phone went locked / screen off; null while it is up. */
    var downSinceMs: Long? = null
        private set

    /** Locked or screen off. */
    val down: Boolean get() = locked || !screenOn

    /** Starts from the current screen and lock state; the start counts as motion (Night needs the full wait). */
    fun start(now: Long, screenOn: Boolean, locked: Boolean) {
        this.screenOn = screenOn
        this.locked = locked
        lastMotionMs = now
        downSinceMs = if (down) now else null
        state = AutoState.WAITING
    }

    /** Movement above the threshold (already filtered for jiggles). */
    fun motion(now: Long): AutoState? {
        lastMotionMs = now
        return evaluate(now)
    }

    /** Screen on/off or lock change. */
    fun screen(now: Long, screenOn: Boolean, locked: Boolean): AutoState? {
        val wasDown = down
        this.screenOn = screenOn
        this.locked = locked
        if (down && !wasDown) downSinceMs = now
        if (!down) downSinceMs = null
        return evaluate(now)
    }

    fun setPaused(paused: Boolean, now: Long) {
        if (this.paused && !paused) desired(now)?.let { state = it }
        this.paused = paused
    }

    /** The state the phone is in right now, or null when it is in between (keep the current one). */
    private fun desired(now: Long): AutoState? = when {
        !down && (handInstant || now - lastMotionMs <= handWindowMs) -> AutoState.IN_HAND
        down && now - stillSince() >= nightDelayMs -> AutoState.NIGHT
        else -> null
    }

    private fun stillSince(): Long = max(lastMotionMs, downSinceMs ?: lastMotionMs)

    /** The new state when it changes (act on it), else null. */
    fun evaluate(now: Long): AutoState? {
        if (paused) return null
        val d = desired(now) ?: return null
        if (d == state) return null
        state = d
        return d
    }

    /** Milliseconds until Night is due, or null when no countdown runs. */
    fun msUntilNight(now: Long): Long? {
        if (paused || !down || state == AutoState.NIGHT) return null
        return (stillSince() + nightDelayMs - now).coerceAtLeast(0)
    }

    /** What to show: counting down to Night shows Waiting. */
    fun shown(now: Long): AutoState = if (msUntilNight(now) != null) AutoState.WAITING else state

    companion object {
        /** "Recent motion" for In hand. */
        const val HAND_WINDOW_MS = 20_000L
    }
}

/**
 * Motion from raw accelerometer samples (m/s², gravity included). Gravity is removed by looking
 * only at the change between consecutive samples (a high-pass "jerk" filter): a phone lying
 * still, in any orientation, changes by sensor noise only (~0.05 m/s²), a hand never holds it
 * that still. A sample counts when the change exceeds [threshold]; motion is reported when
 * [hitsNeeded] samples count within [windowMs]. A single knock or a tilt gives at most two
 * counted samples, so brief jiggles are ignored.
 */
class MotionDetector(
    private val threshold: Float = THRESHOLD,
    private val hitsNeeded: Int = HITS_NEEDED,
    private val windowMs: Long = WINDOW_MS
) {
    private val last = FloatArray(3)
    private var primed = false
    private val hits = ArrayDeque<Long>()

    fun reset() {
        primed = false
        hits.clear()
    }

    /** True when this sample completes a movement. */
    fun sample(x: Float, y: Float, z: Float, now: Long): Boolean {
        val dx = x - last[0]
        val dy = y - last[1]
        val dz = z - last[2]
        last[0] = x; last[1] = y; last[2] = z
        if (!primed) {
            primed = true
            return false
        }
        while (hits.isNotEmpty() && now - hits.first() > windowMs) hits.removeFirst()
        if (sqrt(dx * dx + dy * dy + dz * dz) < threshold) return false
        hits.addLast(now)
        if (hits.size < hitsNeeded) return false
        hits.clear()
        return true
    }

    companion object {
        /** m/s² of change between two samples (~0.2 s apart at the normal sensor rate). */
        const val THRESHOLD = 0.2f
        const val HITS_NEEDED = 3
        const val WINDOW_MS = 2_500L
    }
}
