package io.github.voidqubex.wifi_fan.auto

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AutoLightMachineTest {
    private val min = 60_000L

    /** Started unlocked with the screen on, 2 min wait. */
    private fun machine(now: Long = 0L) = AutoLightMachine(nightDelayMs = 2 * min).apply {
        start(now, screenOn = true, locked = false)
    }

    @Test fun motionWhileUnlockedIsInHandOnce() {
        val m = machine()
        // The start counts as motion: in hand right away, reported once.
        assertEquals(AutoState.IN_HAND, m.evaluate(1_000))
        assertNull(m.motion(5_000))
        assertNull(m.motion(10_000))
        assertNull(m.evaluate(60_000))
        assertEquals(AutoState.IN_HAND, m.state)
    }

    @Test fun handInstantUnlockOnAStillPhone() {
        val m = machine().apply { handInstant = true }
        m.evaluate(0)
        m.screen(30_000, screenOn = true, locked = true)
        assertEquals(AutoState.NIGHT, m.evaluate(30_000 + 2 * min))
        assertEquals(AutoState.IN_HAND, m.screen(10 * min, screenOn = true, locked = false))
    }

    @Test fun nightWithNoWaitOnLock() {
        val m = machine().apply { nightDelayMs = 0 }
        m.evaluate(0)
        assertEquals(AutoState.NIGHT, m.screen(5_000, screenOn = false, locked = true))
    }

    @Test fun stillUnlockedPhoneChangesNothing() {
        val m = machine()
        m.evaluate(0)
        m.screen(30_000, screenOn = true, locked = true)
        assertEquals(AutoState.NIGHT, m.evaluate(30_000 + 2 * min))
        // Unlocked again but lying still: no motion within 20 s, so not "in hand".
        assertNull(m.screen(10 * min, screenOn = true, locked = false))
        assertEquals(AutoState.NIGHT, m.state)
        // Picked up: in hand.
        assertEquals(AutoState.IN_HAND, m.motion(10 * min + 3_000))
    }

    @Test fun nightAfterTheWaitFromLocking() {
        val m = machine()
        m.evaluate(0)
        assertNull(m.screen(10_000, screenOn = false, locked = true))
        assertEquals(2 * min, m.msUntilNight(10_000))
        assertEquals(AutoState.WAITING, m.shown(10_000))
        assertNull(m.evaluate(10_000 + 2 * min - 1))
        assertEquals(AutoState.NIGHT, m.evaluate(10_000 + 2 * min))
        assertNull(m.evaluate(10_000 + 3 * min))
        assertNull(m.msUntilNight(10_000 + 3 * min))
        assertEquals(AutoState.NIGHT, m.shown(10_000 + 3 * min))
    }

    @Test fun motionRestartsTheCountdown() {
        val m = machine()
        m.evaluate(0)
        m.screen(0, screenOn = false, locked = true)
        assertNull(m.motion(1 * min))           // carried in a pocket
        assertNull(m.evaluate(2 * min))
        assertEquals(2 * min, m.msUntilNight(1 * min))
        assertEquals(AutoState.NIGHT, m.evaluate(3 * min))
    }

    @Test fun waitCountsFromTheLaterOfLockAndMotion() {
        val m = machine()
        m.evaluate(0)
        // Read with the phone propped up (no motion) for 10 min, then locked: the full wait still applies.
        m.screen(10 * min, screenOn = false, locked = true)
        assertNull(m.evaluate(10 * min + 1))
        assertEquals(AutoState.NIGHT, m.evaluate(12 * min))
    }

    @Test fun screenOffWithoutKeyguardCountsAsDown() {
        val m = machine()
        m.evaluate(0)
        m.screen(0, screenOn = false, locked = false)
        assertTrue(m.down)
        assertEquals(AutoState.NIGHT, m.evaluate(2 * min))
    }

    @Test fun unlockingAfterNightWithMotionIsInHand() {
        val m = machine()
        m.evaluate(0)
        m.screen(0, screenOn = false, locked = true)
        assertEquals(AutoState.NIGHT, m.evaluate(2 * min))
        assertNull(m.motion(30 * min))                       // picked up, still locked
        assertNull(m.screen(30 * min + 500, screenOn = true, locked = true))
        assertEquals(AutoState.IN_HAND, m.screen(30 * min + 2_000, screenOn = true, locked = false))
    }

    @Test fun motionOlderThanTheWindowIsNotInHand() {
        val m = machine()
        m.evaluate(0)
        m.screen(0, screenOn = false, locked = true)
        m.evaluate(2 * min)
        m.motion(10 * min)
        assertNull(m.screen(10 * min + AutoLightMachine.HAND_WINDOW_MS + 1, screenOn = true, locked = false))
        assertEquals(AutoState.NIGHT, m.state)
    }

    @Test fun pausedReportsNothingAndResumesSilently() {
        val m = machine()
        m.evaluate(0)
        m.setPaused(true, 0)
        m.screen(0, screenOn = false, locked = true)
        assertNull(m.evaluate(5 * min))
        assertNull(m.msUntilNight(5 * min))
        m.setPaused(false, 6 * min)
        // Takes the state of the moment without acting on it ...
        assertEquals(AutoState.NIGHT, m.state)
        assertNull(m.evaluate(6 * min))
        // ... and acts on the next change.
        m.motion(7 * min)
        assertEquals(AutoState.IN_HAND, m.screen(7 * min, screenOn = true, locked = false))
    }

    @Test fun startedLockedWaitsTheFullTime() {
        val m = AutoLightMachine(nightDelayMs = 1 * min)
        m.start(0, screenOn = false, locked = true)
        assertFalse(m.state == AutoState.NIGHT)
        assertNull(m.evaluate(59_999))
        assertEquals(AutoState.NIGHT, m.evaluate(60_000))
    }

    @Test fun changedWaitApplies() {
        val m = machine()
        m.evaluate(0)
        m.screen(0, screenOn = false, locked = true)
        m.nightDelayMs = 5 * min
        assertNull(m.evaluate(2 * min))
        assertEquals(AutoState.NIGHT, m.evaluate(5 * min))
    }
}

class MotionDetectorTest {
    private val g = 9.81f

    @Test fun stillPhoneIsNoMotion() {
        val d = MotionDetector()
        var t = 0L
        var moved = false
        repeat(500) {
            val noise = if (it % 2 == 0) 0.03f else -0.03f
            moved = moved || d.sample(noise, noise, g + noise, t)
            t += 200
        }
        assertFalse(moved)
    }

    @Test fun singleKnockIsIgnored() {
        val d = MotionDetector()
        val shots = (0 until 20).map { i ->
            val z = if (i == 10) g + 4f else g    // one sample spike
            d.sample(0f, 0f, z, i * 200L)
        }
        assertFalse(shots.any { it })
    }

    @Test fun tiltIsIgnored() {
        val d = MotionDetector()
        val shots = (0 until 20).map { i ->
            // Turned on its side in one step, then still.
            if (i < 10) d.sample(0f, 0f, g, i * 200L) else d.sample(g, 0f, 0f, i * 200L)
        }
        assertFalse(shots.any { it })
    }

    @Test fun handHeldIsMotion() {
        val d = MotionDetector()
        val shots = (0 until 10).map { i ->
            val wobble = if (i % 2 == 0) 0.25f else -0.25f
            d.sample(wobble, 0.1f, g - wobble, i * 200L)
        }
        assertTrue(shots.any { it })
    }

    @Test fun hitsTooFarApartAreIgnored() {
        val d = MotionDetector()
        var t = 0L
        val shots = mutableListOf<Boolean>()
        repeat(3) {
            // A single knock every 3 s.
            shots += d.sample(0f, 0f, g, t); t += 200
            shots += d.sample(0f, 0f, g + 1f, t); t += 200
            shots += d.sample(0f, 0f, g, t); t += 2_600
        }
        assertFalse(shots.any { it })
    }
}
