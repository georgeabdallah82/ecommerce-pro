package com.yallahaul.admin.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import com.yallahaul.admin.core.util.Dates
import kotlinx.coroutines.delay

/** Calls [refresh] every [everyMs] while the screen is on and the app is in front (the chats have no live connection on the phone). */
@Composable
fun PollWhileVisible(everyMs: Long, refresh: suspend () -> Unit) {
    val owner = LocalLifecycleOwner.current
    val current = rememberUpdatedState(refresh)
    LaunchedEffect(owner) {
        owner.lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            while (true) { current.value(); delay(everyMs) }
        }
    }
}

@Composable
fun ChatBubble(text: String, mine: Boolean, meta: String, tone: Color? = null) {
    Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start) {
        Column(horizontalAlignment = if (mine) Alignment.End else Alignment.Start) {
            Text(
                text,
                modifier = Modifier.widthIn(max = 300.dp)
                    .clip(RoundedCornerShape(topStart = 18.dp, topEnd = 18.dp, bottomStart = if (mine) 18.dp else 4.dp, bottomEnd = if (mine) 4.dp else 18.dp))
                    .background(tone ?: if (mine) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceContainerHigh)
                    .padding(horizontal = 14.dp, vertical = 9.dp),
                color = if (tone != null) MaterialTheme.colorScheme.onSecondaryContainer else if (mine) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
                style = MaterialTheme.typography.bodyMedium,
            )
            Text(meta, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp))
        }
    }
}

@Composable
fun Composer(value: String, onChange: (String) -> Unit, onSend: () -> Unit, enabled: Boolean, placeholder: String) {
    Surface(color = MaterialTheme.colorScheme.surface, tonalElevation = 2.dp) {
        Row(Modifier.fillMaxWidth().imePadding().navigationBarsPadding().padding(10.dp), verticalAlignment = Alignment.Bottom) {
            OutlinedTextField(value, onChange, placeholder = { Text(placeholder) }, modifier = Modifier.weight(1f), maxLines = 5, shape = RoundedCornerShape(22.dp))
            Spacer(Modifier.width(8.dp))
            FilledIconButton(onClick = onSend, enabled = enabled && value.isNotBlank()) { Icon(Icons.AutoMirrored.Rounded.Send, "Send") }
        }
    }
}

fun chatTime(iso: String) = Dates.relative(iso)
