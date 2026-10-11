package io.github.voidqubex.wifi_fan.audio

/**
 * A short brightness spike on each beat: the level jumps by [boost] and the extra fades out
 * linearly over [durationMs], spread across the next analysis windows.
 */
class BeatFlash(private val boost: Float = 0.35f, private val durationMs: Long = 150L) {
    private var leftMs = 0L

    /** [level] (0..1) with the flash on top; [beat] starts a new flash. [windowMs] is the time since the last call. */
    fun apply(level: Float, beat: Boolean, windowMs: Long, enabled: Boolean): Float {
        if (!enabled) {
            leftMs = 0L
            return level.coerceIn(0f, 1f)
        }
        leftMs = if (beat) durationMs else (leftMs - windowMs).coerceAtLeast(0L)
        return (level + boost * leftMs / durationMs).coerceIn(0f, 1f)
    }
}
