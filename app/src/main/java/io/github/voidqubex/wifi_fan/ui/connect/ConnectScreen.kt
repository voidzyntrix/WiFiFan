package io.github.voidqubex.wifi_fan.ui.connect

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothProfile
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.voidqubex.wifi_fan.R
import io.github.voidqubex.wifi_fan.led.LedPreview
import io.github.voidqubex.wifi_fan.ui.components.AppButton
import io.github.voidqubex.wifi_fan.ui.components.ScanDots
import io.github.voidqubex.wifi_fan.ui.components.bounceClickable
import io.github.voidqubex.wifi_fan.ui.components.bounceCombinedClickable
import io.github.voidqubex.wifi_fan.ui.components.rememberHaptics
import io.github.voidqubex.wifi_fan.ui.components.monoFill
import io.github.voidqubex.wifi_fan.ui.components.pressScaleModifier
import io.github.voidqubex.wifi_fan.ui.theme.circle
import io.github.voidqubex.wifi_fan.ui.theme.rounded

// ---------------------------------------------------------------------------
// Connect screen — shown while no board is connected: a glowing LED beacon that
// pulses while searching, a status pill, and the nearby devices listed inline.
// ---------------------------------------------------------------------------

/** A board found by the scan: its MAC address and the name it advertises over Bluetooth. */
internal data class DeviceEntry(val address: String, val bleName: String?)

/** The scan results as [DeviceEntry]s (reading a device's name needs BLUETOOTH_CONNECT). */
@SuppressLint("MissingPermission")
internal fun Set<BluetoothDevice>.toEntries(): List<DeviceEntry> =
    map { DeviceEntry(it.address, runCatching { it.name }.getOrNull()) }

@Composable
internal fun ConnectScreen(
    connectionState: Int,
    isScanning: Boolean,
    devices: List<DeviceEntry>,
    picking: Boolean,
    mono: Boolean,
    onScan: () -> Unit,
    onPick: (DeviceEntry) -> Unit,
    onCancel: () -> Unit,
    onSettings: () -> Unit,
    names: Map<String, String> = emptyMap(),
    onRename: (DeviceEntry) -> Unit = {}
) {
    val onBg = MaterialTheme.colorScheme.onBackground
    val connecting = connectionState == BluetoothProfile.STATE_CONNECTING
    val searching = connecting || (picking && isScanning)
    val status = when {
        connecting                                              -> "Connecting…"
        connectionState == BluetoothProfile.STATE_DISCONNECTING -> "Disconnecting…"
        picking && isScanning                                   -> "Searching for LEDs…"
        picking                                                 -> "Pick your board"
        else                                                    -> "Not connected"
    }
    val beaconSize by animateDpAsState(
        if (picking) 170.dp else 240.dp, tween(450), label = "beaconSize"
    )

    Box(modifier = Modifier.fillMaxSize()) {
        // Scrim so the text stays readable over an image wallpaper.
        val bg = MaterialTheme.colorScheme.background
        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .fillMaxHeight(0.6f)
                .background(Brush.verticalGradient(listOf(Color.Transparent, bg.copy(alpha = 0.85f))))
        )
        // Settings gear, top-end
        Box(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .statusBarsPadding()
                .padding(horizontal = 16.dp, vertical = 8.dp)
                .size(40.dp)
                .clip(circle())
                .bounceClickable(onClick = onSettings),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                painter = painterResource(R.drawable.settings),
                contentDescription = "Settings",
                modifier = Modifier.size(20.dp),
                tint = onBg.copy(alpha = 0.35f)
            )
        }
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
                .padding(horizontal = 24.dp, vertical = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(Modifier.weight(1f))
            GlowBeacon(active = searching, modifier = Modifier.size(beaconSize))
            Spacer(Modifier.height(24.dp))
            Text(
                text = "Glow",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Light,
                letterSpacing = 2.sp,
                color = onBg
            )
            Spacer(Modifier.height(12.dp))
            StatusPill(text = status, active = searching)
            Spacer(Modifier.weight(1f))

            AnimatedContent(
                targetState = picking,
                transitionSpec = {
                    (fadeIn(tween(300)) + slideInVertically(tween(300)) { it / 4 })
                        .togetherWith(fadeOut(tween(200)))
                },
                label = "connectBottom"
            ) { showList ->
                if (showList) {
                    DeviceList(
                        devices = devices,
                        names = names,
                        isScanning = isScanning,
                        mono = mono,
                        onPick = onPick,
                        onRename = onRename,
                        onScan = onScan,
                        onCancel = onCancel
                    )
                } else {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = "Power the LED board and keep your phone nearby.",
                            style = MaterialTheme.typography.bodySmall,
                            textAlign = TextAlign.Center,
                            color = onBg.copy(alpha = 0.6f)
                        )
                        Spacer(Modifier.height(16.dp))
                        val connectSrc = remember { MutableInteractionSource() }
                        AppButton(
                            mono = mono,
                            onClick = onScan,
                            shape = circle(),
                            enabled = connectionState == BluetoothProfile.STATE_DISCONNECTED,
                            interactionSource = connectSrc,
                            modifier = pressScaleModifier(connectSrc, pressedScale = 0.96f)
                                .fillMaxWidth()
                                .height(56.dp)
                        ) {
                            Text("Connect", style = MaterialTheme.typography.titleMedium)
                        }
                    }
                }
            }
        }
    }
}

/** The home-screen LED circle, colour-cycling and breathing; it breathes faster while [active]. */
@Composable
private fun GlowBeacon(active: Boolean, modifier: Modifier = Modifier) {
    val t = rememberInfiniteTransition(label = "beacon")
    val hue by t.animateFloat(
        initialValue = 0f, targetValue = 360f,
        animationSpec = infiniteRepeatable(tween(12000, easing = LinearEasing)),
        label = "beaconHue"
    )
    val breath by t.animateFloat(
        initialValue = 0f, targetValue = 1f,
        animationSpec = infiniteRepeatable(
            tween(if (active) 1100 else 2600, easing = FastOutSlowInEasing),
            RepeatMode.Reverse
        ),
        label = "beaconBreath"
    )
    LedPreview(
        hue = hue, sat = 0.8f,
        value = if (active) 0.45f + 0.55f * breath else 0.3f + 0.45f * breath,
        modifier = modifier
    )
}

@Composable
internal fun StatusPill(text: String, active: Boolean) {
    val onBg = MaterialTheme.colorScheme.onBackground
    val blink by rememberInfiniteTransition(label = "statusBlink").animateFloat(
        initialValue = 0.35f, targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(700), RepeatMode.Reverse),
        label = "statusDot"
    )
    Row(
        modifier = Modifier
            .clip(circle())
            .background(MaterialTheme.colorScheme.background.copy(alpha = 0.55f))
            .padding(horizontal = 14.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(7.dp)
                .clip(circle())
                .background(
                    if (active) MaterialTheme.colorScheme.primary.copy(alpha = blink)
                    else onBg.copy(alpha = 0.3f)
                )
        )
        Spacer(Modifier.width(8.dp))
        Text(
            text = text, style = MaterialTheme.typography.labelMedium, color = onBg.copy(alpha = 0.8f),
            maxLines = 1, overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
private fun DeviceList(
    devices: List<DeviceEntry>,
    names: Map<String, String>,
    isScanning: Boolean,
    mono: Boolean,
    onPick: (DeviceEntry) -> Unit,
    onRename: (DeviceEntry) -> Unit,
    onScan: () -> Unit,
    onCancel: () -> Unit
) {
    val cs = MaterialTheme.colorScheme
    val shape = rounded(24.dp)
    val haptics = rememberHaptics()
    // Boards you named first, then named devices; unnamed ones are rarely the board.
    val sorted = remember(devices, names) {
        devices.sortedWith(
            compareBy({ it.address !in names }, { it.bleName == null }, { names[it.address] ?: it.bleName ?: it.address })
        )
    }
    val iconFill = if (mono) monoFill() else cs.primary.copy(alpha = 0.15f)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(cs.surface.copy(alpha = 0.85f))
            .border(1.dp, cs.onBackground.copy(alpha = 0.08f), shape)
            .padding(vertical = 8.dp)
    ) {
        Row(
            modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 12.dp, bottom = 4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "Nearby devices",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = cs.onSurface,
                modifier = Modifier.weight(1f)
            )
            if (isScanning) {
                ScanDots()
            }
        }
        if (sorted.isEmpty()) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 24.dp)
            ) {
                Icon(
                    painter = painterResource(R.drawable.led),
                    contentDescription = null,
                    modifier = Modifier.size(28.dp).alpha(if (isScanning) 0.6f else 0.35f),
                    tint = cs.primary
                )
                Spacer(Modifier.height(12.dp))
                Text(
                    text = if (isScanning) "Looking for LED boards…" else "No boards found",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    color = cs.onSurface.copy(alpha = 0.8f)
                )
                if (!isScanning) {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = "Is the board powered and close by?",
                        style = MaterialTheme.typography.bodySmall,
                        color = cs.onSurface.copy(alpha = 0.45f)
                    )
                }
            }
        } else {
            LazyColumn(Modifier.heightIn(max = 280.dp)) {
                items(sorted, key = { it.address }) { device ->
                    val custom = names[device.address]
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 8.dp)
                            .clip(rounded(16.dp))
                            .bounceCombinedClickable(
                                pressedScale = 0.97f,
                                onLongClick = { haptics.longPress(); onRename(device) }
                            ) { haptics.tap(); onPick(device) }
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            modifier = Modifier
                                .size(40.dp)
                                .clip(circle())
                                .background(iconFill),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                painter = painterResource(R.drawable.led),
                                contentDescription = null,
                                modifier = Modifier.size(22.dp),
                                tint = MaterialTheme.colorScheme.primary
                            )
                        }
                        Spacer(Modifier.width(14.dp))
                        Column(Modifier.weight(1f)) {
                            Text(
                                text = custom ?: device.bleName ?: "Unknown device",
                                style = MaterialTheme.typography.bodyLarge,
                                fontWeight = FontWeight.Medium,
                                color = cs.onSurface,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                            // Your name on top, the board's own Bluetooth name small underneath.
                            Text(
                                text = if (custom != null) listOfNotNull(device.bleName, device.address).joinToString(" · ")
                                else device.address,
                                style = MaterialTheme.typography.bodySmall,
                                color = cs.onSurface.copy(alpha = 0.45f),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                        Icon(
                            painter = painterResource(R.drawable.arrow_back),
                            contentDescription = null,
                            modifier = Modifier
                                .size(18.dp)
                                .rotate(180f),
                            tint = cs.onSurface.copy(alpha = 0.35f)
                        )
                    }
                }
            }
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.End
        ) {
            if (sorted.isNotEmpty()) {
                Text(
                    "Long-press to rename",
                    style = MaterialTheme.typography.labelSmall,
                    color = cs.onSurface.copy(alpha = 0.4f),
                    modifier = Modifier.weight(1f).padding(start = 8.dp)
                )
            }
            if (!isScanning) TextButton(onClick = onScan, shape = circle()) { Text("Scan again") }
            TextButton(onClick = onCancel, shape = circle()) { Text("Cancel") }
        }
    }
}
