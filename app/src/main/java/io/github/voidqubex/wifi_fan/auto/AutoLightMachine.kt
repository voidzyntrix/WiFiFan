package io.github.voidqubex.wifi_fan.auto

/** What Auto light thinks the phone is doing. */
enum class AutoState {
    /** Nothing decided yet, or counting down to Night. */
    WAITING,
    /** Screen on and unlocked: the phone is being used. */
    IN_HAND,
    /** Locked (or screen off) for the wait time: the phone is down. */
    NIGHT
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
