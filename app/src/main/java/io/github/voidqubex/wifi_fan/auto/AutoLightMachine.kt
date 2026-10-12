package io.github.voidqubex.wifi_fan.auto

/** What Auto light thinks the phone is doing. */
enum class AutoState {
    /** Nothing decided yet, or counting down to Night. */
    WAITING,
    /** Screen on and unlocked: the phone is being used. */
    IN_HAND,
    /** Locked (or screen off) for the wait time: the phone is down. */
    NIGHT,
    /** Room light: the light sensor sees a dark room. */
    ROOM_DARK,
    /** Room light: the light sensor sees a lit room. */
    ROOM_BRIGHT
}

/**
 * Room light: dark or bright from the light sensor (lux), with a gap between the two thresholds
 * and a settle time, so a passing shadow or a lamp flickering changes nothing.
 */
class RoomLight(
    /** At or below: dark. Bright starts at twice this (at least 15 lux more). */
    var darkLux: Float = DARK_LUX,
    private val settleMs: Long = SETTLE_MS
) {
    val brightLux: Float get() = maxOf(darkLux * 2f, darkLux + 15f)

    /** The room as last decided (true = dark), null before the first decision. */
    var dark: Boolean? = null
        private set
    private var pending: Boolean? = null
    private var pendingSince = 0L

    /** A different room is being seen and waits out [settleMs] (call [check] then). */
    val settling: Boolean get() = pending != null

    /** A reading; the new room state once it has held for the settle time, else null. */
    fun sample(lux: Float, now: Long): Boolean? {
        val seen = when {
            lux <= darkLux -> true
            lux >= brightLux -> false
            else -> null            // in between keeps whatever the room was
        }
        if (seen == null || seen == dark) {
            pending = null
            return null
        }
        if (seen != pending) {
            pending = seen
            pendingSince = now
        }
        return check(now)
    }

    /** The new room state if the reading being settled has held long enough, else null. */
    fun check(now: Long): Boolean? {
        val p = pending ?: return null
        if (now - pendingSince < settleMs) return null
        dark = p
        pending = null
        return p
    }

    fun reset() {
        dark = null
        pending = null
    }

    companion object {
        const val DARK_LUX = 30f
        const val SETTLE_MS = 3_000L
    }
}

/**
 * Auto light's decisions, as plain Kotlin: feed it screen and lock events with a clock
 * (milliseconds, any monotonic base), and [evaluate] says when the light should change. It looks
 * at nothing but the screen: no sensors, so nothing can change the light while you use the phone.
 *
 * - In hand: screen on AND unlocked, right away.
 * - Night: locked or screen off for [nightDelayMs] (counted from the moment the phone went down;
 *   0 means right away).
 * - Anything else keeps the current state, so a short wait after locking changes nothing. A state
 *   is only reported once when entered.
 * - While [paused] (another sync drives the LED) nothing is reported; on resume the machine
 *   takes the state of the moment without reporting it, so it only acts on the next change.
 */
class AutoLightMachine(var nightDelayMs: Long) {
    var state = AutoState.WAITING
        private set
    var screenOn = true
        private set
    var locked = false
        private set
    var paused = false
        private set
    /** When the phone went locked / screen off; null while it is up. */
    var downSinceMs: Long? = null
        private set

    /** Locked or screen off. */
    val down: Boolean get() = locked || !screenOn

    /** Starts from the current screen and lock state (a phone already down waits the full time). */
    fun start(now: Long, screenOn: Boolean, locked: Boolean) {
        this.screenOn = screenOn
        this.locked = locked
        downSinceMs = if (down) now else null
        state = AutoState.WAITING
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
        !down -> AutoState.IN_HAND
        now - (downSinceMs ?: now) >= nightDelayMs -> AutoState.NIGHT
        else -> null
    }

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
        val since = downSinceMs ?: return null
        if (paused || state == AutoState.NIGHT) return null
        return (since + nightDelayMs - now).coerceAtLeast(0)
    }

    /** What to show: counting down to Night shows Waiting. */
    fun shown(now: Long): AutoState = if (msUntilNight(now) != null) AutoState.WAITING else state
}
