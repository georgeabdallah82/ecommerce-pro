package com.yallahaul.admin.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil3.compose.SubcomposeAsyncImage
import com.yallahaul.admin.BuildConfig
import com.yallahaul.admin.core.util.absoluteUrl

/** A product photo or payment screenshot. Store paths ("/api/media/...") are resolved against the store's address. */
@Composable
fun RemoteImage(
    url: String?,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    size: Dp? = null,
    shape: Shape = MaterialTheme.shapes.small,
    contentScale: ContentScale = ContentScale.Crop,
) {
    val sized = if (size != null) modifier.size(size) else modifier
    val full = absoluteUrl(BuildConfig.API_BASE_URL, url)
    val placeholder: @Composable () -> Unit = {
        Box(sized.clip(shape).background(MaterialTheme.colorScheme.surfaceContainerHigh), contentAlignment = Alignment.Center) {
            Icon(Icons.Outlined.Image, null, tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f), modifier = Modifier.size(20.dp))
        }
    }
    if (full == null) { placeholder(); return }
    SubcomposeAsyncImage(
        model = full,
        contentDescription = contentDescription,
        modifier = sized.clip(shape).background(MaterialTheme.colorScheme.surfaceContainerHigh),
        contentScale = contentScale,
        loading = { placeholder() },
        error = { placeholder() },
    )
}
