package io.github.voidqubex.wifi_fan.ui.home

import android.graphics.Color as AndroidColor
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import io.github.voidqubex.wifi_fan.SettingsStore
import io.github.voidqubex.wifi_fan.led.LedColor
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.abs

/**
 * A saved LED state, applied with one tap: the mode, its colour (hue/saturation or a colour
 * temperature) and the brightness. Only modes the board runs by itself are saved (Solid,
 * Rainbow, Candle and the board effects); Music, Visualizer and Screen sync need the phone's
 * microphone or a capture consent each time, so they can't be scenes.
 */
internal data class Scene(
    val id: Long,
    val name: String,
    val mode: Int,
    val hue: Float = 0f,
    val sat: Float = 0f,
    val kelvinMode: Boolean = false,
    val kelvin: Float = 4000f,
    val bri: Float = 1f,
    /** Candle flame hue picked in the colour controls; null = the Settings candle colour. */
    val candleHue: Int? = null
) {
    fun toJson(): JSONObject = JSONObject()
        .put("id", id).put("name", name).put("mode", mode)
        .put("hue", hue.toDouble()).put("sat", sat.toDouble())
        .put("kelvinMode", kelvinMode).put("kelvin", kelvin.toDouble())
        .put("bri", bri.toDouble())
        .apply { if (candleHue != null) put("candleHue", candleHue) }

    /** Whether the LED shows this scene right now (so its chip can look selected). */
    fun matches(mode: Int, hue: Float, sat: Float, kelvinMode: Boolean, kelvin: Float, bri: Float): Boolean {
        if (mode != this.mode || abs(bri - this.bri) > 0.015f) return false
        return when (mode) {
            LED_MODE_SOLID, LED_MODE_BREATHE ->
                if (this.kelvinMode) kelvinMode && abs(kelvin - this.kelvin) < 60f
                else !kelvinMode && hueClose(hue, this.hue) && abs(sat - this.sat) < 0.03f
            LED_MODE_RAINBOW -> abs(sat - this.sat) < 0.03f
            else -> true
        }
    }

    companion object {
        fun fromJson(o: JSONObject) = Scene(
            id = o.optLong("id"),
            name = o.optString("name", "Scene"),
            mode = o.optInt("mode", LED_MODE_SOLID),
            hue = o.optDouble("hue", 0.0).toFloat(),
            sat = o.optDouble("sat", 0.0).toFloat(),
            kelvinMode = o.optBoolean("kelvinMode", false),
            kelvin = o.optDouble("kelvin", 4000.0).toFloat(),
            bri = o.optDouble("bri", 1.0).toFloat(),
            candleHue = if (o.has("candleHue")) o.optInt("candleHue") else null
        )

        /** The modes a scene can hold. */
        fun canSave(mode: Int) = mode != LED_MODE_MUSIC && mode != LED_MODE_VISUALIZER && mode != LED_MODE_SCREEN

        private fun hueClose(a: Float, b: Float): Boolean {
            val d = abs(a - b) % 360f
            return minOf(d, 360f - d) < 2f
        }
    }
}

/** Seeded on first run. */
internal val DefaultScenes = listOf(
    Scene(id = 1, name = "Night", mode = LED_MODE_CANDLE, hue = 19f, sat = 0.94f, bri = 0.15f),
    Scene(id = 2, name = "Read", mode = LED_MODE_SOLID, kelvinMode = true, kelvin = 4000f, bri = 0.8f)
)

internal fun scenesToJson(list: List<Scene>): String =
    JSONArray().apply { list.forEach { put(it.toJson()) } }.toString()

internal fun scenesFromJson(json: String): List<Scene> = runCatching {
    val a = JSONArray(json)
    (0 until a.length()).map { Scene.fromJson(a.getJSONObject(it)) }
}.getOrDefault(emptyList())

/** The saved scenes; the first call seeds the defaults. */
internal fun SettingsStore.loadScenes(): List<Scene> {
    val json = scenesJson
    if (json == null) {
        scenesJson = scenesToJson(DefaultScenes)
        return DefaultScenes
    }
    return scenesFromJson(json)
}

internal fun SettingsStore.saveScenes(list: List<Scene>) {
    scenesJson = scenesToJson(list)
}

/** What a scene chip's dot shows: roughly the colour the LED will have. */
internal fun Scene.swatch(settingsCandleHue: Int): Brush {
    fun hsv(h: Float, s: Float) = Color(AndroidColor.HSVToColor(floatArrayOf(((h % 360f) + 360f) % 360f, s, 1f)))
    return when (mode) {
        LED_MODE_RAINBOW, LED_MODE_PARTY ->
            Brush.sweepGradient((0..6).map { hsv(it * 60f, sat.coerceAtLeast(0.6f)) })
        LED_MODE_CANDLE -> Brush.linearGradient(
            listOf(hsv((candleHue ?: settingsCandleHue).toFloat() + 12f, 0.8f), hsv((candleHue ?: settingsCandleHue).toFloat(), 0.95f))
        )
        LED_MODE_OCEAN -> Brush.linearGradient(listOf(hsv(185f, 0.85f), hsv(225f, 0.9f)))
        LED_MODE_AURORA -> Brush.linearGradient(listOf(hsv(150f, 0.8f), hsv(280f, 0.75f)))
        else -> solid(if (kelvinMode) LedColor.kelvinScreenColor(kelvin) else hsv(hue, sat))
    }
}

private fun solid(c: Color): Brush = androidx.compose.ui.graphics.SolidColor(c)
