package io.github.voidqubex.wifi_fan.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import io.github.voidqubex.wifi_fan.ui.settings.PillButton
import io.github.voidqubex.wifi_fan.ui.theme.rounded

/** The card every dialog sits on: the surface colour, a hairline rim, the app's corners. */
@Composable
internal fun DialogCard(
    title: String,
    subtitle: String? = null,
    content: @Composable ColumnScope.() -> Unit
) {
    val onBg = MaterialTheme.colorScheme.onBackground
    val shape = rounded(28.dp)
    Column(
        Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, onBg.copy(alpha = 0.08f), shape)
            .padding(24.dp)
    ) {
        Text(
            title,
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
            color = onBg
        )
        if (subtitle != null) {
            Spacer(Modifier.height(4.dp))
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = onBg.copy(alpha = 0.55f))
        }
        Spacer(Modifier.height(16.dp))
        content()
    }
}

/** Two buttons side by side at the bottom of a dialog. */
@Composable
internal fun DialogButtons(
    dismiss: String,
    confirm: String,
    confirmEnabled: Boolean = true,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit
) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        PillButton(dismiss, highlighted = false, modifier = Modifier.weight(1f), onClick = onDismiss)
        PillButton(
            confirm, highlighted = true, enabled = confirmEnabled,
            modifier = Modifier.weight(1f), onClick = onConfirm
        )
    }
}

/**
 * Asks for a name (a board, a scene). Saving an empty name is allowed only when [allowEmpty]
 * (it then means "back to the default").
 */
@Composable
internal fun NameDialog(
    title: String,
    subtitle: String?,
    initial: String,
    placeholder: String,
    allowEmpty: Boolean = false,
    onDismiss: () -> Unit,
    onSave: (String) -> Unit
) {
    val focus = remember { FocusRequester() }
    Dialog(onDismissRequest = onDismiss) {
        NameDialogCard(title, subtitle, initial, placeholder, allowEmpty, focus, onDismiss, onSave)
    }
    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
}

/** The name dialog's card; stateless apart from the text, so screenshot tests can draw it. */
@Composable
internal fun NameDialogCard(
    title: String,
    subtitle: String?,
    initial: String,
    placeholder: String,
    allowEmpty: Boolean = false,
    focusRequester: FocusRequester? = null,
    onDismiss: () -> Unit,
    onSave: (String) -> Unit
) {
    val onBg = MaterialTheme.colorScheme.onBackground
    var value by remember { mutableStateOf(TextFieldValue(initial, TextRange(initial.length))) }
    val name = value.text.trim()
    val canSave = allowEmpty || name.isNotEmpty()
    val haptics = rememberHaptics()
    DialogCard(title, subtitle) {
        BasicTextField(
            value = value,
            onValueChange = { if (it.text.length <= MAX_NAME) value = it },
            singleLine = true,
            textStyle = MaterialTheme.typography.bodyLarge.copy(color = onBg),
            cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
            keyboardOptions = KeyboardOptions(
                capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Done
            ),
            keyboardActions = KeyboardActions(onDone = { if (canSave) { haptics.confirm(); onSave(name) } }),
            modifier = Modifier
                .fillMaxWidth()
                .let { m -> focusRequester?.let { m.focusRequester(it) } ?: m },
            decorationBox = { field ->
                Box(
                    Modifier
                        .fillMaxWidth()
                        .clip(rounded(16.dp))
                        .background(onBg.copy(alpha = 0.07f))
                        .padding(horizontal = 16.dp, vertical = 14.dp)
                ) {
                    if (value.text.isEmpty()) {
                        Text(placeholder, style = MaterialTheme.typography.bodyLarge, color = onBg.copy(alpha = 0.35f))
                    }
                    field()
                }
            }
        )
        Spacer(Modifier.height(24.dp))
        DialogButtons(
            dismiss = "Cancel", confirm = "Save", confirmEnabled = canSave,
            onDismiss = onDismiss, onConfirm = { haptics.confirm(); onSave(name) }
        )
    }
}

/** A short list of actions (one per row), with Cancel at the bottom. */
@Composable
internal fun ActionsDialog(
    title: String,
    subtitle: String?,
    actions: List<Pair<String, () -> Unit>>,
    onDismiss: () -> Unit
) {
    Dialog(onDismissRequest = onDismiss) { ActionsDialogCard(title, subtitle, actions, onDismiss) }
}

@Composable
internal fun ActionsDialogCard(
    title: String,
    subtitle: String?,
    actions: List<Pair<String, () -> Unit>>,
    onDismiss: () -> Unit
) {
    DialogCard(title, subtitle) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            actions.forEach { (label, run) -> PillButton(label, highlighted = false, onClick = run) }
            Spacer(Modifier.height(4.dp))
            PillButton("Cancel", highlighted = false, onClick = onDismiss)
        }
    }
}

private const val MAX_NAME = 32
