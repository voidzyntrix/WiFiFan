package io.github.voidqubex.wifi_fan.ui.whatsnew

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import io.github.voidqubex.wifi_fan.ota.AppUpdater
import io.github.voidqubex.wifi_fan.ota.GitHubReleases
import io.github.voidqubex.wifi_fan.ui.settings.PillButton
import io.github.voidqubex.wifi_fan.ui.theme.rounded

/** Notes for the dialog: still loading, loaded text, or a failure message. */
internal sealed interface WhatsNewNotes {
    object Loading : WhatsNewNotes
    data class Loaded(val text: String) : WhatsNewNotes
    data class Failed(val message: String) : WhatsNewNotes
}

/** "What's new" for the installed version, with the notes of its GitHub release. */
@Composable
internal fun WhatsNewDialog(onDismiss: () -> Unit) {
    val context = LocalContext.current
    val version = AppUpdater.installedVersion(context)
    val notes by produceState<WhatsNewNotes>(WhatsNewNotes.Loading, version) {
        value = try {
            GitHubReleases.releaseNotes("app-v$version")
                ?.let { WhatsNewNotes.Loaded(markdownToText(it)) }
                ?: WhatsNewNotes.Failed("No release notes found for v$version.")
        } catch (e: Exception) {
            WhatsNewNotes.Failed("Couldn't load the release notes: ${e.message}")
        }
    }
    Dialog(onDismissRequest = onDismiss) {
        WhatsNewCard(version, notes, onDismiss)
    }
}

/** The dialog's card, in the PanelCard look. Stateless so it can be previewed. */
@Composable
internal fun WhatsNewCard(version: String, notes: WhatsNewNotes, onDismiss: () -> Unit) {
    val onBg = MaterialTheme.colorScheme.onBackground
    val shape = rounded(28.dp)
    val blurred = io.github.voidqubex.wifi_fan.ui.components.rememberWindowBlur()
    Column(
        Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(MaterialTheme.colorScheme.surface.copy(alpha = if (blurred) 0.82f else 1f))
            .border(1.dp, onBg.copy(alpha = 0.1f), shape)
            .padding(20.dp)
    ) {
        Text(
            "What's new",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.SemiBold,
            color = onBg
        )
        Text(
            "Glow v$version",
            style = MaterialTheme.typography.labelLarge,
            color = onBg.copy(alpha = 0.55f)
        )
        Spacer(Modifier.height(14.dp))
        Column(
            Modifier
                .heightIn(max = 420.dp)
                .verticalScroll(rememberScrollState())
        ) {
            Text(
                when (notes) {
                    WhatsNewNotes.Loading -> "Loading the release notes…"
                    is WhatsNewNotes.Loaded -> notes.text
                    is WhatsNewNotes.Failed -> notes.message
                },
                style = MaterialTheme.typography.bodyMedium,
                color = onBg.copy(alpha = if (notes is WhatsNewNotes.Loaded) 0.85f else 0.55f)
            )
        }
        Spacer(Modifier.height(18.dp))
        PillButton("Got it", highlighted = true, onClick = onDismiss)
    }
}

/**
 * GitHub release markdown as plain text: headings lose their #s, bullets become •,
 * links keep their text, emphasis and code marks go, HTML comments are dropped.
 */
internal fun markdownToText(md: String): String = md
    .replace(Regex("<!--.*?-->", RegexOption.DOT_MATCHES_ALL), "")
    .lines()
    .map { line ->
        var l = line.trimEnd()
        l = l.replace(Regex("""!\[([^\]]*)]\([^)]*\)"""), "$1")
            .replace(Regex("""\[([^\]]+)]\([^)]*\)"""), "$1")
            .replace(Regex("""\*\*|__|`"""), "")
        when {
            Regex("""^#{1,6}\s+""").containsMatchIn(l) -> l.replace(Regex("""^#{1,6}\s+"""), "").uppercase()
            Regex("""^\s*[-*+]\s+""").containsMatchIn(l) -> {
                val indent = l.takeWhile { it == ' ' }.length / 2
                "  ".repeat(indent) + "• " + l.replace(Regex("""^\s*[-*+]\s+"""), "")
            }
            else -> l
        }
    }
    .joinToString("\n")
    .replace(Regex("\n{3,}"), "\n\n")
    .trim()
