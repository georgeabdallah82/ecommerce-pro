package com.yallahaul.admin.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Inbox
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.yallahaul.admin.core.network.AppError
import com.yallahaul.admin.ui.theme.AppTheme
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter

/** The store's basics (name, currency, time zone), provided once signed in. */
val LocalStore = staticCompositionLocalOf { com.yallahaul.admin.core.model.StoreInfo() }

/** The app-wide snackbar, provided by the root scaffold. */
val LocalSnackbar = staticCompositionLocalOf { SnackbarHostState() }

/** Content is never wider than this on tablets and unfolded phones, so lines stay readable. */
val ContentMaxWidth = 840.dp

@Composable
fun ConstrainedColumn(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Box(modifier.fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
        Column(Modifier.widthIn(max = ContentMaxWidth).fillMaxWidth(), content = content)
    }
}

@Composable
fun SectionCard(
    modifier: Modifier = Modifier,
    title: String? = null,
    action: (@Composable () -> Unit)? = null,
    contentPadding: PaddingValues = PaddingValues(16.dp),
    content: @Composable ColumnScope.() -> Unit,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.large,
        color = MaterialTheme.colorScheme.surface,
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Column(Modifier.padding(contentPadding)) {
            if (title != null || action != null) {
                Row(Modifier.fillMaxWidth().padding(bottom = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    if (title != null) Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                    action?.invoke()
                }
            }
            content()
        }
    }
}

@Composable
fun LoadingView(modifier: Modifier = Modifier, label: String? = null) {
    Column(modifier.fillMaxSize().padding(32.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        CircularProgressIndicator(strokeWidth = 3.dp)
        if (label != null) {
            Spacer(Modifier.height(16.dp))
            Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
fun MessageView(
    icon: ImageVector,
    title: String,
    body: String? = null,
    modifier: Modifier = Modifier,
    tint: Color = MaterialTheme.colorScheme.onSurfaceVariant,
    action: (@Composable () -> Unit)? = null,
) {
    Column(modifier.fillMaxWidth().padding(horizontal = 32.dp, vertical = 48.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.size(72.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceContainerHigh), contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = tint, modifier = Modifier.size(32.dp))
        }
        Spacer(Modifier.height(20.dp))
        Text(title, style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center)
        if (body != null) {
            Spacer(Modifier.height(8.dp))
            Text(body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
        }
        if (action != null) {
            Spacer(Modifier.height(20.dp))
            action()
        }
    }
}

@Composable
fun EmptyView(title: String, body: String? = null, icon: ImageVector = Icons.Outlined.Inbox, modifier: Modifier = Modifier, action: (@Composable () -> Unit)? = null) =
    MessageView(icon, title, body, modifier, action = action)

@Composable
fun ErrorView(error: AppError, onRetry: (() -> Unit)?, modifier: Modifier = Modifier) {
    val icon = when (error.kind) {
        AppError.Kind.Offline, AppError.Kind.Timeout -> Icons.Outlined.CloudOff
        AppError.Kind.Forbidden -> Icons.Outlined.Lock
        else -> Icons.Outlined.ErrorOutline
    }
    val title = when (error.kind) {
        AppError.Kind.Offline -> "You're offline"
        AppError.Kind.Timeout -> "The store is slow to answer"
        AppError.Kind.Forbidden -> "Not available for your account"
        AppError.Kind.NotFound -> "Not found"
        else -> "Couldn't load this"
    }
    MessageView(icon, title, error.message, modifier, tint = if (error.kind == AppError.Kind.Offline) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.error) {
        if (onRetry != null && error.kind != AppError.Kind.Forbidden) Button(onClick = onRetry) { Text("Try again") }
    }
}

/** A thin banner shown above content that is still on screen when a refresh fails. */
@Composable
fun InlineError(message: String, onRetry: (() -> Unit)? = null, modifier: Modifier = Modifier) {
    Surface(modifier.fillMaxWidth(), shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.errorContainer) {
        Row(Modifier.padding(horizontal = 14.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.CloudOff, null, tint = MaterialTheme.colorScheme.onErrorContainer, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(10.dp))
            Text(message, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onErrorContainer, modifier = Modifier.weight(1f))
            if (onRetry != null) TextButton(onClick = onRetry) { Text("Retry") }
        }
    }
}

enum class Tone { Success, Warning, Danger, Info, Neutral, Brand }

@Composable
fun toneColors(tone: Tone): Pair<Color, Color> {
    val s = AppTheme.status
    return when (tone) {
        Tone.Success -> s.successContainer to s.success
        Tone.Warning -> s.warningContainer to s.warning
        Tone.Danger -> s.dangerContainer to s.danger
        Tone.Info -> s.infoContainer to s.info
        Tone.Neutral -> s.neutralContainer to s.neutral
        Tone.Brand -> MaterialTheme.colorScheme.primaryContainer to MaterialTheme.colorScheme.primary
    }
}

@Composable
fun Pill(text: String, tone: Tone, modifier: Modifier = Modifier, icon: ImageVector? = null) {
    val (bg, fg) = toneColors(tone)
    Row(
        modifier.clip(RoundedCornerShape(50)).background(bg).padding(horizontal = 10.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) {
            Icon(icon, null, tint = fg, modifier = Modifier.size(13.dp))
            Spacer(Modifier.width(4.dp))
        } else {
            Box(Modifier.size(6.dp).clip(CircleShape).background(fg))
            Spacer(Modifier.width(6.dp))
        }
        Text(text, style = MaterialTheme.typography.labelMedium, color = fg, maxLines = 1, fontWeight = FontWeight.SemiBold)
    }
}

fun orderTone(status: String) = when (status) {
    "PENDING" -> Tone.Warning
    "CONFIRMED", "PROCESSING" -> Tone.Info
    "SHIPPED" -> Tone.Brand
    "DELIVERED" -> Tone.Success
    "CANCELLED", "REFUNDED" -> Tone.Neutral
    else -> Tone.Neutral
}

fun paymentTone(status: String) = when (status) {
    "PAID" -> Tone.Success
    "FAILED" -> Tone.Danger
    "PENDING" -> Tone.Warning
    "REFUNDED", "PARTIALLY_REFUNDED" -> Tone.Neutral
    else -> Tone.Warning
}

fun productTone(status: String) = when (status) {
    "ACTIVE" -> Tone.Success
    "DRAFT" -> Tone.Neutral
    else -> Tone.Warning
}

fun stockTone(state: String) = when (state) {
    "out" -> Tone.Danger
    "low" -> Tone.Warning
    else -> Tone.Success
}

@Composable
fun Avatar(name: String, modifier: Modifier = Modifier, size: Dp = 44.dp) {
    val palette = AppTheme.status.chart
    val color = palette[(name.hashCode() and Int.MAX_VALUE) % palette.size]
    Box(modifier.size(size).clip(CircleShape).background(color.copy(alpha = 0.16f)), contentAlignment = Alignment.Center) {
        Text(com.yallahaul.admin.core.util.Labels.initials(name), color = color, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
    }
}

@Composable
fun SearchField(value: String, onChange: (String) -> Unit, placeholder: String, modifier: Modifier = Modifier, onSearch: () -> Unit = {}) {
    TextField(
        value = value,
        onValueChange = onChange,
        modifier = modifier.fillMaxWidth(),
        placeholder = { Text(placeholder) },
        leadingIcon = { Icon(Icons.Rounded.Search, null) },
        trailingIcon = { if (value.isNotEmpty()) IconButton(onClick = { onChange("") }) { Icon(Icons.Rounded.Close, "Clear search") } },
        singleLine = true,
        shape = RoundedCornerShape(50),
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
        keyboardActions = KeyboardActions(onSearch = { onSearch() }),
        colors = TextFieldDefaults.colors(
            focusedIndicatorColor = Color.Transparent,
            unfocusedIndicatorColor = Color.Transparent,
            disabledIndicatorColor = Color.Transparent,
            focusedContainerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
            unfocusedContainerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
        ),
    )
}

/** Asks before anything that can't be undone easily. */
@Composable
fun ConfirmDialog(
    title: String,
    body: String,
    confirmLabel: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
    destructive: Boolean = false,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(body, style = MaterialTheme.typography.bodyMedium) },
        confirmButton = {
            Button(
                onClick = { onConfirm(); onDismiss() },
                colors = if (destructive) ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error, contentColor = MaterialTheme.colorScheme.onError) else ButtonDefaults.buttonColors(),
            ) { Text(confirmLabel) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Keep it") } },
    )
}

@Composable
fun LabeledValue(label: String, value: String, modifier: Modifier = Modifier, emphasize: Boolean = false) {
    Row(modifier.fillMaxWidth().padding(vertical = 5.dp), verticalAlignment = Alignment.Top) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
        Spacer(Modifier.width(12.dp))
        Text(value, style = if (emphasize) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyMedium, fontWeight = if (emphasize) FontWeight.Bold else FontWeight.Medium, textAlign = TextAlign.End)
    }
}

@Composable
fun ListRow(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    leading: (@Composable () -> Unit)? = null,
    trailing: (@Composable RowScope.() -> Unit)? = null,
    onClick: (() -> Unit)? = null,
) {
    Row(
        modifier.fillMaxWidth().then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier).padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (leading != null) { leading(); Spacer(Modifier.width(14.dp)) }
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        if (trailing != null) { Spacer(Modifier.width(12.dp)); trailing() }
    }
}

@Composable
fun SkeletonBlock(modifier: Modifier = Modifier, shape: RoundedCornerShape = RoundedCornerShape(12.dp)) {
    val transition = rememberInfiniteTransition(label = "skeleton")
    val alpha by transition.animateFloat(0.45f, 0.9f, infiniteRepeatable(tween(900), RepeatMode.Reverse), label = "alpha")
    Box(modifier.clip(shape).background(MaterialTheme.colorScheme.surfaceContainerHighest.copy(alpha = alpha)))
}

/** Calls [onLoadMore] when the list is scrolled near its end. */
@Composable
fun LoadMoreEffect(state: LazyListState, enabled: Boolean, onLoadMore: () -> Unit) {
    val callback by rememberUpdatedState(onLoadMore)
    val nearEnd by remember {
        derivedStateOf {
            val info = state.layoutInfo
            val last = info.visibleItemsInfo.lastOrNull()?.index ?: 0
            info.totalItemsCount > 0 && last >= info.totalItemsCount - 4
        }
    }
    LaunchedEffect(state, enabled) {
        snapshotFlow { nearEnd }.distinctUntilChanged().filter { it && enabled }.collect { callback() }
    }
}

@Composable
fun SegmentedChoice(options: List<Pair<String, String>>, selected: String, onSelect: (String) -> Unit, modifier: Modifier = Modifier) {
    Row(
        modifier.clip(RoundedCornerShape(50)).background(MaterialTheme.colorScheme.surfaceContainerHigh).padding(3.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        options.forEach { (value, label) ->
            val active = value == selected
            Box(
                Modifier.clip(RoundedCornerShape(50))
                    .background(if (active) MaterialTheme.colorScheme.surface else Color.Transparent)
                    .then(if (active) Modifier.border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(50)) else Modifier)
                    .clickable { onSelect(value) }
                    .padding(horizontal = 14.dp, vertical = 7.dp),
            ) {
                Text(label, style = MaterialTheme.typography.labelLarge, color = if (active) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
fun FadeVisibility(visible: Boolean, content: @Composable () -> Unit) {
    AnimatedVisibility(visible, enter = fadeIn(), exit = fadeOut()) { content() }
}

@Composable
fun SecondaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, icon: ImageVector? = null, enabled: Boolean = true) {
    OutlinedButton(onClick = onClick, modifier = modifier, enabled = enabled, shape = RoundedCornerShape(14.dp)) {
        if (icon != null) { Icon(icon, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)) }
        Text(text)
    }
}

@Composable
fun IconBadge(icon: ImageVector, tone: Tone, modifier: Modifier = Modifier, size: Dp = 40.dp) {
    val (bg, fg) = toneColors(tone)
    Box(modifier.size(size).clip(RoundedCornerShape(12.dp)).background(bg), contentAlignment = Alignment.Center) {
        Icon(icon, null, tint = fg, modifier = Modifier.size(size * 0.5f))
    }
}

@Composable
fun MutedText(text: String, modifier: Modifier = Modifier) {
    Text(text, modifier = modifier, style = MaterialTheme.typography.bodySmall, color = LocalContentColor.current.copy(alpha = 0.7f))
}

/** Opens another app (dialer, WhatsApp, maps, mail, browser); does nothing if the phone has none for it. */
fun android.content.Context.openSafely(intent: android.content.Intent) {
    try { startActivity(intent) } catch (_: android.content.ActivityNotFoundException) {
        android.widget.Toast.makeText(this, "No app on this phone can open that.", android.widget.Toast.LENGTH_SHORT).show()
    }
}
