package io.github.voidqubex.wifi_fan.ui.components

import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs
import kotlin.math.sqrt

class FluidSimTest {
    /** 1 g at the background's step rate (4 steps a frame). */
    private val g = 0.003f

    private fun sim() = FluidSim(14f, 31f, 600)

    private fun FluidSim.inBox() = (0 until count).all {
        x[it].isFinite() && y[it].isFinite() && x[it] in 0f..width && y[it] in 0f..height
    }

    /** Mean distance to the nearest other particle: how tightly the liquid packs. */
    private fun FluidSim.meanGap(): Float {
        var sum = 0f
        for (i in 0 until count) {
            var best = Float.MAX_VALUE
            for (j in 0 until count) if (j != i) {
                val d = sqrt((x[i] - x[j]) * (x[i] - x[j]) + (y[i] - y[j]) * (y[i] - y[j]))
                if (d < best) best = d
            }
            sum += best
        }
        return sum / count
    }

    /** Mean distance a particle moves in one more step under plain gravity. */
    private fun FluidSim.restlessness(): Double {
        val bx = x.copyOf()
        val by = y.copyOf()
        step(0f, g, 0f)
        return (0 until count).map { abs(x[it] - bx[it]) + abs(y[it] - by[it]) }.average()
    }

    @Test
    fun `liquid settles at the bottom, keeps its volume and holds still`() {
        val sim = sim()
        repeat(2400) { sim.step(0f, g, 0f) }
        assertTrue(sim.inBox())
        val gap = sim.meanGap()
        assertTrue("packed too tight: $gap", gap > 0.3f)
        assertTrue("too loose: $gap", gap < 0.5f)
        assertTrue((0 until sim.count).count { sim.y[it] < sim.height / 2 } < sim.count / 50)
        val rest = sim.restlessness()
        assertTrue("still moving: $rest", rest < 0.005)
    }

    @Test
    fun `tilting moves the liquid sideways`() {
        val sim = sim()
        repeat(1200) { sim.step(0f, g, 0f) }
        repeat(1200) { sim.step(g, 0f, 0f) }
        assertTrue(sim.inBox())
        val meanX = (0 until sim.count).sumOf { sim.x[it].toDouble() } / sim.count
        assertTrue("mean x $meanX", meanX > sim.width * 0.6)
    }

    @Test
    fun `spinning the box turns the liquid the other way`() {
        val sim = sim()
        repeat(1200) { sim.step(0f, g, 0f) }
        val meanX = (0 until sim.count).sumOf { sim.x[it].toDouble() } / sim.count
        // the box turns clockwise, so its bottom swings left under the liquid, which stays put:
        // inside the box the liquid at the bottom slides right
        repeat(10) { sim.step(0f, 0f, 0.01f) }
        val after = (0 until sim.count).sumOf { sim.x[it].toDouble() } / sim.count
        assertTrue("before $meanX after $after", after > meanX)
    }

    @Test
    fun `shaking and spinning stay stable and calm down again`() {
        val sim = sim()
        for (s in 0 until 3000) {
            val shake = if ((s / 40) % 2 == 0) 4 * g else -4 * g
            sim.step(shake, g - shake, if (s % 7 == 0) 0.03f else -0.005f)
        }
        assertTrue(sim.inBox())
        repeat(1800) { sim.step(0f, g, 0f) }
        assertTrue(sim.inBox())
        val rest = sim.restlessness()
        assertTrue("still moving: $rest", rest < 0.005)
    }

    @Test
    fun `a frame's four steps are fast`() {
        val sim = sim()
        repeat(400) { sim.step(0f, g, 0f) }   // warm up the JIT
        val t = System.nanoTime()
        repeat(400) { sim.step(0f, g, 0f) }
        val perFrameMs = (System.nanoTime() - t) / 1e6 / 100
        println("ms per frame: $perFrameMs")
        assertTrue("$perFrameMs ms per frame", perFrameMs < 4.0)
    }
}
