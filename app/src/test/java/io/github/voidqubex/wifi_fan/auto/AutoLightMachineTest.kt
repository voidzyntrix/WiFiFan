package io.github.voidqubex.wifi_fan.auto

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RoomLightTest {
    @Test fun darkAfterTheSettleTime() {
        val r = RoomLight()
        assertNull(r.sample(2f, 0))
        assertTrue(r.settling)
        assertNull(r.check(2_999))
        assertEquals(true, r.check(3_000))
        assertEquals(true, r.dark)
    }

    @Test fun aPassingShadowChangesNothing() {
        val r = RoomLight()
        r.sample(200f, 0); r.check(3_000)
        assertEquals(false, r.dark)
        assertNull(r.sample(1f, 10_000))
        assertNull(r.sample(150f, 11_000))     // back to bright within the settle time
        assertNull(r.check(20_000))
        assertEquals(false, r.dark)
    }

    @Test fun inBetweenKeepsTheRoomAsItWas() {
        val r = RoomLight()
        r.sample(1f, 0); r.check(3_000)
        assertNull(r.sample(25f, 5_000))
        assertNull(r.check(60_000))
        assertEquals(true, r.dark)
        assertNull(r.sample(60f, 61_000))
        assertEquals(false, r.check(64_000))
    }
}

class AutoLightMachineTest {
    private val min = 60_000L

    /** Started unlocked with the screen on, 2 min wait. */
    private fun machine(now: Long = 0L) = AutoLightMachine(nightDelayMs = 2 * min).apply {
        start(now, screenOn = true, locked = false)
    }

    @Test fun startedInHandIsInHandOnce() {
        val m = machine()
        assertEquals(AutoState.IN_HAND, m.evaluate(1_000))
        assertNull(m.evaluate(60_000))
        assertEquals(AutoState.IN_HAND, m.state)
    }

    @Test fun unlockingIsInHandAtOnceWithoutAnyMovement() {
        val m = machine()
        m.evaluate(0)
        m.screen(30_000, screenOn = true, locked = true)
        assertEquals(AutoState.NIGHT, m.evaluate(30_000 + 2 * min))
        // The phone never moved on the desk, yet unlocking brings the reading light.
        assertEquals(AutoState.IN_HAND, m.screen(10 * min, screenOn = true, locked = false))
    }

    @Test fun screenOnButStillLockedIsNotInHand() {
        val m = machine()
        m.evaluate(0)
        m.screen(0, screenOn = false, locked = true)
        assertEquals(AutoState.NIGHT, m.evaluate(2 * min))
        assertNull(m.screen(5 * min, screenOn = true, locked = true))
        assertEquals(AutoState.NIGHT, m.state)
        assertEquals(AutoState.IN_HAND, m.screen(5 * min + 1_000, screenOn = true, locked = false))
    }

    @Test fun nightWithNoWaitOnLock() {
        val m = machine().apply { nightDelayMs = 0 }
        m.evaluate(0)
        assertEquals(AutoState.NIGHT, m.screen(5_000, screenOn = false, locked = true))
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

    @Test fun waitCountsFromTheMomentThePhoneWentDown() {
        val m = machine()
        m.evaluate(0)
        // Used for 10 minutes, then locked: the wait starts at the lock.
        m.screen(10 * min, screenOn = false, locked = true)
        assertNull(m.evaluate(10 * min + 1))
        assertEquals(AutoState.NIGHT, m.evaluate(12 * min))
    }

    @Test fun lockingAndUnlockingWithinTheWaitChangesNothingButTheHandLight() {
        val m = machine()
        m.evaluate(0)
        m.screen(1 * min, screenOn = false, locked = true)
        // Back before Night was due: still in hand, nothing to report, and the countdown is gone.
        assertNull(m.screen(1 * min + 30_000, screenOn = true, locked = false))
        assertEquals(AutoState.IN_HAND, m.state)
        assertNull(m.msUntilNight(1 * min + 30_000))
        // A later lock counts the full wait again.
        m.screen(5 * min, screenOn = false, locked = true)
        assertNull(m.evaluate(5 * min + 2 * min - 1))
        assertEquals(AutoState.NIGHT, m.evaluate(7 * min))
    }

    @Test fun screenOffWithoutKeyguardCountsAsDown() {
        val m = machine()
        m.evaluate(0)
        m.screen(0, screenOn = false, locked = false)
        assertTrue(m.down)
        assertEquals(AutoState.NIGHT, m.evaluate(2 * min))
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
