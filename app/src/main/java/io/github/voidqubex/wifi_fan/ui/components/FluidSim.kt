package io.github.voidqubex.wifi_fan.ui.components

import kotlin.math.sqrt

/**
 * A small particle liquid (Clavet et al. 2005, "Particle-based viscoelastic fluid simulation":
 * double density relaxation plus viscosity) in a box [width] x [height], measured in
 * interaction radii. Positions are prediction-relaxation style: velocities come from how far
 * each particle actually moved, which keeps it stable at a fixed step.
 *
 * Gravity and the box's rotation come from the phone's sensors (see FluidBackground).
 */
internal class FluidSim(val width: Float, val height: Float, val count: Int) {
    val x = FloatArray(count)
    val y = FloatArray(count)
    private val vx = FloatArray(count)
    private val vy = FloatArray(count)
    private val px = FloatArray(count)
    private val py = FloatArray(count)

    private val cols = width.toInt() + 1
    private val rows = height.toInt() + 1
    private val cellStart = IntArray(cols * rows + 1)
    private val cellItems = IntArray(count)
    private val cellOf = IntArray(count)
    private val cellFill = IntArray(cols * rows + 1)

    init {
        // a block of liquid resting at the bottom, a little jittered so it settles naturally
        val perRow = (width / SPACING).toInt()
        for (i in 0 until count) {
            x[i] = SPACING * (i % perRow + 0.5f) + jitter(i)
            y[i] = height - SPACING * (i / perRow + 0.5f) + jitter(i * 7 + 3)
        }
    }

    /**
     * One step. [gx], [gy]: gravity in radii per step², screen axes (y down).
     * [spin]: how far the box turned this step (radians, clockwise on screen); the liquid
     * keeps still in the world, so inside the box it turns the other way.
     */
    fun step(gx: Float, gy: Float, spin: Float) {
        val cx = width / 2f
        val cy = height / 2f
        for (i in 0 until count) {
            vx[i] = (vx[i] + gx) * DAMPING
            vy[i] = (vy[i] + gy) * DAMPING
        }
        bucket()
        viscosity()
        for (i in 0 until count) {
            px[i] = x[i]; py[i] = y[i]
            var dx = vx[i]
            var dy = vy[i]
            if (spin != 0f) {
                dx += spin * (y[i] - cy)
                dy -= spin * (x[i] - cx)
            }
            val sp = sqrt(dx * dx + dy * dy)
            if (sp > MAX_MOVE) { dx *= MAX_MOVE / sp; dy *= MAX_MOVE / sp }
            x[i] += dx
            y[i] += dy
        }
        bucket()
        relax()
        for (i in 0 until count) {
            // each particle stops at its own distance from a wall, so a hard shake can't stack
            // several on the very same spot (exactly overlapping ones never push apart)
            val wall = WALL + (i % 16) * 0.01f
            x[i] = x[i].coerceIn(wall, width - wall)
            y[i] = y[i].coerceIn(wall, height - wall)
            vx[i] = x[i] - px[i]
            vy[i] = y[i] - py[i]
        }
    }

    /** Sorts particles into one-radius grid cells (counting sort). */
    private fun bucket() {
        cellStart.fill(0)
        for (i in 0 until count) {
            val c = (y[i].toInt().coerceIn(0, rows - 1)) * cols + x[i].toInt().coerceIn(0, cols - 1)
            cellOf[i] = c
            cellStart[c + 1]++
        }
        for (c in 1..cols * rows) cellStart[c] += cellStart[c - 1]
        val fill = cellFill
        cellStart.copyInto(fill)
        for (i in 0 until count) cellItems[fill[cellOf[i]]++] = i
    }

    private inline fun neighbours(i: Int, body: (j: Int, dx: Float, dy: Float, r: Float) -> Unit) {
        val c = cellOf[i]
        val cxI = c % cols
        val cyI = c / cols
        for (ny in maxOf(0, cyI - 1)..minOf(rows - 1, cyI + 1)) {
            for (nx in maxOf(0, cxI - 1)..minOf(cols - 1, cxI + 1)) {
                val cell = ny * cols + nx
                for (k in cellStart[cell] until cellStart[cell + 1]) {
                    val j = cellItems[k]
                    if (j <= i) continue
                    val dx = x[j] - x[i]
                    val dy = y[j] - y[i]
                    val r2 = dx * dx + dy * dy
                    if (r2 >= 1f || r2 < 1e-8f) continue
                    body(j, dx, dy, sqrt(r2))
                }
            }
        }
    }

    /** Pairs moving towards each other lose some of that speed (thickens the liquid). */
    private fun viscosity() {
        for (i in 0 until count) {
            neighbours(i) { j, dx, dy, r ->
                val ux = dx / r
                val uy = dy / r
                val u = (vx[i] - vx[j]) * ux + (vy[i] - vy[j]) * uy
                if (u > 0f) {
                    val imp = (1f - r / 1f) * (SIGMA * u + BETA * u * u) * 0.5f
                    vx[i] -= imp * ux; vy[i] -= imp * uy
                    vx[j] += imp * ux; vy[j] += imp * uy
                }
            }
        }
    }

    private val density = FloatArray(count)
    private val nearDensity = FloatArray(count)

    /** Double density relaxation: pushes crowded particles apart, pulls sparse ones together. */
    private fun relax() {
        density.fill(0f)
        nearDensity.fill(0f)
        for (i in 0 until count) {
            neighbours(i) { j, _, _, r ->
                val q = 1f - r
                val q2 = q * q
                density[i] += q2; density[j] += q2
                nearDensity[i] += q2 * q; nearDensity[j] += q2 * q
            }
        }
        for (i in 0 until count) {
            val p = STIFFNESS * (density[i] - REST_DENSITY)
            val pn = NEAR_STIFFNESS * nearDensity[i]
            neighbours(i) { j, dx, dy, r ->
                val q = 1f - r
                val pj = STIFFNESS * (density[j] - REST_DENSITY)
                val pnj = NEAR_STIFFNESS * nearDensity[j]
                val d = ((p + pj) * 0.5f * q + (pn + pnj) * 0.5f * q * q) * 0.5f
                val ux = dx / r * d
                val uy = dy / r * d
                x[i] -= ux; y[i] -= uy
                x[j] += ux; y[j] += uy
            }
        }
    }

    private fun jitter(seed: Int): Float = ((seed * 1103515245 + 12345) ushr 16 and 0xFF) / 255f * 0.1f - 0.05f

    companion object {
        /** Starting gap between particles, in radii. */
        const val SPACING = 0.5f
        const val REST_DENSITY = 2.0f
        const val STIFFNESS = 0.05f
        const val NEAR_STIFFNESS = 0.1f
        const val SIGMA = 0.08f
        const val BETA = 0.05f
        const val DAMPING = 0.995f
        const val MAX_MOVE = 0.4f
        const val WALL = 0.15f
    }
}
