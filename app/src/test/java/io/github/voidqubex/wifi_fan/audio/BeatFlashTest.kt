package io.github.voidqubex.wifi_fan.audio

import org.junit.Assert.assertEquals
import org.junit.Test

class BeatFlashTest {
    @Test fun spikesOnBeatAndDecays() {
        val f = BeatFlash()
        assertEquals(0.3f, f.apply(0.3f, beat = false, windowMs = 40, enabled = true), 1e-4f)
        assertEquals(0.65f, f.apply(0.3f, beat = true, windowMs = 40, enabled = true), 1e-4f)
        val next = f.apply(0.3f, beat = false, windowMs = 40, enabled = true)
        assert(next > 0.3f && next < 0.65f)
        f.apply(0.3f, beat = false, windowMs = 40, enabled = true)
        f.apply(0.3f, beat = false, windowMs = 40, enabled = true)
        assertEquals(0.3f, f.apply(0.3f, beat = false, windowMs = 40, enabled = true), 1e-4f)
    }

    @Test fun capsAtFull() {
        assertEquals(1f, BeatFlash().apply(0.9f, beat = true, windowMs = 40, enabled = true), 1e-4f)
    }

    @Test fun offDoesNothing() {
        assertEquals(0.4f, BeatFlash().apply(0.4f, beat = true, windowMs = 40, enabled = false), 1e-4f)
    }
}
