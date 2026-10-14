package io.github.voidqubex.wifi_fan.sync

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class SyncHubTest {
    @Before fun nothingRuns() {
        SyncHub.active.value = SyncKind.NONE
        SyncHub.level.value = 0f
    }

    // Screen sync used to be stopped the moment it started, because it was not "the same service" as itself.
    @Test fun everyKindIsTheSameServiceAsItself() {
        for (kind in SyncKind.entries) assertTrue(kind.toString(), kind.sharesServiceWith(kind))
    }

    @Test fun musicAndVisualizerShareOneService() {
        assertTrue(SyncKind.MUSIC.sharesServiceWith(SyncKind.VISUALIZER))
        assertTrue(SyncKind.VISUALIZER.sharesServiceWith(SyncKind.MUSIC))
    }

    @Test fun screenSyncIsItsOwnService() {
        assertFalse(SyncKind.SCREEN.sharesServiceWith(SyncKind.MUSIC))
        assertFalse(SyncKind.SCREEN.sharesServiceWith(SyncKind.VISUALIZER))
        assertFalse(SyncKind.MUSIC.sharesServiceWith(SyncKind.SCREEN))
        assertFalse(SyncKind.VISUALIZER.sharesServiceWith(SyncKind.SCREEN))
    }

    @Test fun solarIsItsOwnServiceToo() {
        assertFalse(SyncKind.SOLAR.sharesServiceWith(SyncKind.MUSIC))
        assertFalse(SyncKind.SOLAR.sharesServiceWith(SyncKind.SCREEN))
        assertFalse(SyncKind.VISUALIZER.sharesServiceWith(SyncKind.SOLAR))
        assertTrue(SyncKind.SOLAR.sharesServiceWith(SyncKind.SOLAR))
    }

    @Test fun aStoppingServiceClearsWhatIsItsOwn() {
        SyncHub.active.value = SyncKind.MUSIC
        SyncHub.level.value = 0.7f
        assertTrue(SyncHub.release(SyncKind.MUSIC, SyncKind.VISUALIZER))
        assertEquals(SyncKind.NONE, SyncHub.active.value)
        assertEquals(0f, SyncHub.level.value, 0f)
    }

    @Test fun aStoppingServiceLeavesWhatAnotherSyncTookOver() {
        // Screen sync started before the old audio service finished stopping.
        SyncHub.active.value = SyncKind.SCREEN
        assertFalse(SyncHub.release(SyncKind.MUSIC, SyncKind.VISUALIZER))
        assertEquals(SyncKind.SCREEN, SyncHub.active.value)
        // And the other way round.
        SyncHub.active.value = SyncKind.VISUALIZER
        assertFalse(SyncHub.release(SyncKind.SCREEN))
        assertEquals(SyncKind.VISUALIZER, SyncHub.active.value)
    }

    @Test fun releasingWhileNothingRunsIsHarmless() {
        assertTrue(SyncHub.release(SyncKind.SCREEN))
        assertEquals(SyncKind.NONE, SyncHub.active.value)
    }
}
