package io.github.voidqubex.wifi_fan.ui.settings

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import io.github.voidqubex.wifi_fan.SecretStore
import io.github.voidqubex.wifi_fan.SettingsStore
import io.github.voidqubex.wifi_fan.solar.FoxEssClient
import io.github.voidqubex.wifi_fan.ui.components.GradientBar
import io.github.voidqubex.wifi_fan.ui.components.SegmentedPill
import io.github.voidqubex.wifi_fan.ui.components.glass
import io.github.voidqubex.wifi_fan.ui.theme.rounded
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.math.roundToInt

/** Settings > Solar: the FoxESS API key, the inverter, how often to ask, when the battery counts as low. */
@Composable
internal fun SolarSettings(store: SettingsStore) {
    val context = LocalContext.current
    val onBg = MaterialTheme.colorScheme.onBackground
    val secrets = remember { SecretStore(context) }
    var key by remember { mutableStateOf(secrets.foxApiKey) }
    var serial by remember { mutableStateOf(store.foxSerial) }
    var poll by remember { mutableIntStateOf(store.foxPollMinutes) }
    var lowPercent by remember { mutableIntStateOf(store.solarLowPercent) }
    var demo by remember { mutableStateOf(store.solarDemo) }
    var status by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    SettingHeading("API key", "Create one in FoxESS Cloud: user centre, API management")
    SecretField(key) { key = it; secrets.foxApiKey = it }
    Spacer(Modifier.height(12.dp))
    PillButton(
        if (busy) "Checking…" else "Find my inverter",
        highlighted = false,
        enabled = !busy && key.isNotBlank()
    ) {
        busy = true
        status = null
        scope.launch {
            val result = withContext(Dispatchers.IO) { runCatching { FoxEssClient.devices(key.trim()) } }
            busy = false
            result.onSuccess { list ->
                val pick = list.firstOrNull { it.serial == serial } ?: list.firstOrNull()
                if (pick == null) {
                    status = "No inverter found on this account."
                } else {
                    serial = pick.serial
                    store.foxSerial = pick.serial
                    status = "Found ${pick.name.ifBlank { "your inverter" }} (${pick.serial})" +
                        if (list.size > 1) ": ${list.size} inverters, using the first" else ""
                }
            }.onFailure { status = it.message ?: "Couldn't reach FoxESS" }
        }
    }
    Spacer(Modifier.height(8.dp))
    Text(
        status ?: if (serial.isNotBlank()) "Inverter: $serial" else "No inverter picked yet.",
        style = MaterialTheme.typography.bodySmall,
        color = onBg.copy(alpha = 0.6f)
    )

    SettingGap()
    val polls = listOf(1, 2, 5)
    SettingHeading("How often", "The inverter allows 1,440 questions a day; 2 minutes is plenty")
    SegmentedPill(listOf("1 min", "2 min", "5 min"), polls.indexOf(poll).coerceAtLeast(0)) {
        poll = polls[it]
        store.foxPollMinutes = polls[it]
    }

    SettingGap()
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            "Battery low below",
            style = MaterialTheme.typography.labelMedium,
            color = onBg.copy(alpha = 0.6f),
            modifier = Modifier.weight(1f)
        )
        Text("$lowPercent %", style = MaterialTheme.typography.labelLarge, color = onBg)
    }
    Spacer(Modifier.height(4.dp))
    GradientBar(
        fraction = (lowPercent - 5) / 45f,
        stops = listOf(onBg.copy(alpha = 0.12f), onBg.copy(alpha = 0.55f)),
        thumbColor = MaterialTheme.colorScheme.primary,
        onFraction = { lowPercent = (5 + it * 45f).roundToInt() },
        onFinished = { store.solarLowPercent = lowPercent }
    )

    SwitchGap()
    SettingSwitch(
        "Demo values", "Made-up numbers, to see how the LEDs react without the inverter",
        demo
    ) { demo = it; store.solarDemo = it }

    Spacer(Modifier.height(16.dp))
    Text(
        "LED1 shows the grid (green exporting, amber to red importing), LED2 the battery (red empty, " +
            "green full). Two red blinks a minute for a low battery or an inverter fault, green when the " +
            "battery is full and the sun still exports. Pick Solar in the mode menu to start.",
        style = MaterialTheme.typography.bodySmall,
        color = onBg.copy(alpha = 0.45f)
    )
}

/** A text field that hides what is typed (the API key). */
@Composable
private fun SecretField(value: String, onChange: (String) -> Unit) {
    val onBg = MaterialTheme.colorScheme.onBackground
    BasicTextField(
        value = value,
        onValueChange = onChange,
        singleLine = true,
        visualTransformation = PasswordVisualTransformation(),
        textStyle = MaterialTheme.typography.bodyLarge.copy(color = onBg),
        cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
        modifier = Modifier.fillMaxWidth(),
        decorationBox = { field ->
            Box(
                Modifier
                    .fillMaxWidth()
                    .glass(rounded(16.dp), onBg.copy(alpha = 0.07f), 16.dp)
                    .padding(horizontal = 16.dp, vertical = 14.dp)
            ) {
                if (value.isEmpty()) {
                    Text(
                        "Paste your API key",
                        style = MaterialTheme.typography.bodyLarge,
                        color = onBg.copy(alpha = 0.35f)
                    )
                }
                field()
            }
        }
    )
}
