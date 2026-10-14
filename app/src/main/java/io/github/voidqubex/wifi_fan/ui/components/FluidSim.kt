package io.github.voidqubex.wifi_fan.ui.components

import kotlin.math.sqrt

/**
 * A water-like particle liquid: Position Based Fluids (Macklin & Müller 2013, "Position Based
 * Fluids") in a box [width] x [height], measured in interaction radii (h = 1). Each step predicts
 * where the particles go, then solves a constant-density constraint a few times, so the liquid
 * barely compresses (water is nearly incompressible) instead of springing back like the earlier
 * solver; XSPH viscosity keeps the flow coherent without making it gloopy. Only overfull regions
 * are pushed apart, so it splits into drops freely. Time is measured in steps (the caller runs
 * [step] at a fixed rate), so velocities are radii per step.
 *
 * Gravity comes from the phone's sensors (see FluidBackground). The desktop app's FluidSim.ts
 * is the same solver.
 */
internal class FluidSim(val width: Float, val height: Float, val count: Int) {
    val x = FloatArray(count)
    val y = FloatArray(count)
    private val vx = FloatArray(count)
    private val vy = FloatArray(count)
    private val px = FloatArray(count)
    private val py = FloatArray(count)
    private val lambda = FloatArray(count)
    private val rho = FloatArray(count)
    private val ddx = FloatArray(count)
    private val ddy = FloatArray(count)
    private val nbr = IntArray(count * MAX_NEIGHBOURS)
    private val nbrCount = IntArray(count)

    private val cols = width.toInt() + 1
    private val rows = height.toInt() + 1
    private val cellStart = IntArray(cols * rows + 1)
    private val cellItems = IntArray(count)
    private val cellOf = IntArray(count)
    private val cellFill = IntArray(cols * rows + 1)

    /** Rest density: what a particle inside the starting lattice feels. */
    private val rho0: Float

    init {
        var r0 = 0f
        for (a in -2..2) for (b in -2..2) {
            val r2 = (a * SPACING) * (a * SPACING) + (b * SPACING) * (b * SPACING)
            if (r2 < 1f) { val q = 1f - r2; r0 += POLY6 * q * q * q }
        }
        rho0 = r0
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
            var u = vx[i] + gx
            var v = vy[i] + gy
            if (spin != 0f) {
                u += spin * (y[i] - cy)
                v -= spin * (x[i] - cx)
            }
            val sp = sqrt(u * u + v * v)
            if (sp > MAX_MOVE) { u *= MAX_MOVE / sp; v *= MAX_MOVE / sp }
            vx[i] = u; vy[i] = v
            px[i] = x[i]; py[i] = y[i]
            x[i] = clampX(x[i] + u, i)
            y[i] = clampY(y[i] + v, i)
        }
        findNeighbours()
        repeat(ITERATIONS) { solveDensity() }
        for (i in 0 until count) {
            vx[i] = x[i] - px[i]
            vy[i] = y[i] - py[i]
        }
        xsph()
    }

    // each particle stops at its own distance from a wall, so a hard shake can't stack several
    // on the very same spot (exactly overlapping ones never push apart)
    private fun clampX(v: Float, i: Int): Float {
        val wall = WALL + (i % 16) * 0.005f
        return v.coerceIn(wall, width - wall)
    }

    private fun clampY(v: Float, i: Int): Float {
        val wall = WALL + (i % 16) * 0.005f
        return v.coerceIn(wall, height - wall)
    }

    /** Grid bucketing (counting sort), then a neighbour list per particle within one radius. */
    private fun findNeighbours() {
        cellStart.fill(0)
        for (i in 0 until count) {
            val c = (y[i].toInt().coerceIn(0, rows - 1)) * cols + x[i].toInt().coerceIn(0, cols - 1)
            cellOf[i] = c
            cellStart[c + 1]++
        }
        for (c in 1..cols * rows) cellStart[c] += cellStart[c - 1]
        cellStart.copyInto(cellFill)
        for (i in 0 until count) cellItems[cellFill[cellOf[i]]++] = i
        for (i in 0 until count) {
            val c = cellOf[i]
            val cxI = c % cols
            val cyI = c / cols
            var n = 0
            val base = i * MAX_NEIGHBOURS
            loop@ for (ny in maxOf(0, cyI - 1)..minOf(rows - 1, cyI + 1)) {
                for (nx in maxOf(0, cxI - 1)..minOf(cols - 1, cxI + 1)) {
                    val cell = ny * cols + nx
                    for (k in cellStart[cell] until cellStart[cell + 1]) {
                        if (n >= MAX_NEIGHBOURS) break@loop
                        val j = cellItems[k]
                        if (j == i) continue
                        val dx = x[j] - x[i]
                        val dy = y[j] - y[i]
                        if (dx * dx + dy * dy < 1f) nbr[base + n++] = j
                    }
                }
            }
            nbrCount[i] = n
        }
    }

    /** One Jacobi pass of the density constraint C = rho / rho0 - 1 (only where C > 0). */
    private fun solveDensity() {
        val inv = 1f / rho0
        for (i in 0 until count) {
            var density = POLY6           // itself
            var gix = 0f
            var giy = 0f
            var sum2 = 0f
            val base = i * MAX_NEIGHBOURS
            for (k in 0 until nbrCount[i]) {
                val j = nbr[base + k]
                val dx = x[i] - x[j]
                val dy = y[i] - y[j]
                val r2 = dx * dx + dy * dy
                if (r2 >= 1f) continue
                val q = 1f - r2
                density += POLY6 * q * q * q
                if (r2 > 1e-9f) {
                    val r = sqrt(r2)
                    val g = SPIKY * (1f - r) * (1f - r) / r * inv
                    val gx = g * dx
                    val gy = g * dy
                    gix += gx; giy += gy
                    sum2 += gx * gx + gy * gy
                }
            }
            rho[i] = density
            val c = density * inv - 1f
            lambda[i] = if (c > 0f) -c / (sum2 + gix * gix + giy * giy + RELAXATION) else 0f
        }
        for (i in 0 until count) {
            var sx = 0f
            var sy = 0f
            val base = i * MAX_NEIGHBOURS
            val li = lambda[i]
            for (k in 0 until nbrCount[i]) {
                val j = nbr[base + k]
                val s = li + lambda[j]
                if (s == 0f) continue
                val dx = x[i] - x[j]
                val dy = y[i] - y[j]
                val r2 = dx * dx + dy * dy
                if (r2 >= 1f || r2 < 1e-9f) continue
                val r = sqrt(r2)
                val g = SPIKY * (1f - r) * (1f - r) / r * inv * s
                sx += g * dx; sy += g * dy
            }
            ddx[i] = sx; ddy[i] = sy
        }
        for (i in 0 until count) {
            x[i] = clampX(x[i] + ddx[i], i)
            y[i] = clampY(y[i] + ddy[i], i)
        }
    }

    /** XSPH: each particle takes on a little of its neighbours' average velocity. */
    private fun xsph() {
        for (i in 0 until count) {
            var sx = 0f
            var sy = 0f
            val base = i * MAX_NEIGHBOURS
            for (k in 0 until nbrCount[i]) {
                val j = nbr[base + k]
                val dx = x[i] - x[j]
                val dy = y[i] - y[j]
                val r2 = dx * dx + dy * dy
                if (r2 >= 1f) continue
                val q = 1f - r2
                val w = POLY6 * q * q * q / maxOf(rho[j], 1e-3f)
                sx += (vx[j] - vx[i]) * w
                sy += (vy[j] - vy[i]) * w
            }
            ddx[i] = sx; ddy[i] = sy
        }
        for (i in 0 until count) { vx[i] += XSPH * ddx[i]; vy[i] += XSPH * ddy[i] }
    }

    private fun jitter(seed: Int): Float = ((seed * 1103515245 + 12345) ushr 16 and 0xFF) / 255f * 0.1f - 0.05f

    companion object {
        /** Starting gap between particles, in radii. */
        const val SPACING = 0.5f
        /** Constraint iterations per step: more = stiffer (less compressible). */
        const val ITERATIONS = 3
        /** Constraint softening (PBF's epsilon): keeps the solve stable where particles are few. */
        const val RELAXATION = 0.6f
        /** XSPH viscosity: how much each particle takes on its neighbours' velocity. */
        const val XSPH = 0.04f
        const val MAX_MOVE = 0.35f
        const val WALL = 0.15f
        const val MAX_NEIGHBOURS = 48
        /** 2D poly6 normalisation for h = 1: W = POLY6 (1 - r²)³. */
        const val POLY6 = 1.2732395f        // 4 / pi
        /** 2D spiky gradient for h = 1: |∇W| = SPIKY (1 - r)². */
        const val SPIKY = -9.549297f        // -30 / pi
    }
}
