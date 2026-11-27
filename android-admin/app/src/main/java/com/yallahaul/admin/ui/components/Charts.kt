package com.yallahaul.admin.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.background
import kotlin.math.max

data class ChartPoint(val label: String, val value: Float, val secondary: Float = 0f)

/**
 * A smooth area chart for sales over time. Touch and drag to read each day: [onSelect] receives
 * the touched point (null when released), so the caller shows the figures in its own header.
 */
@Composable
fun AreaChart(
    points: List<ChartPoint>,
    modifier: Modifier = Modifier,
    height: Dp = 180.dp,
    color: Color = MaterialTheme.colorScheme.primary,
    onSelect: (Int?) -> Unit = {},
    description: String = "Sales chart",
) {
    val progress = remember { Animatable(0f) }
    LaunchedEffect(points) { progress.snapTo(0f); progress.animateTo(1f, tween(700, easing = FastOutSlowInEasing)) }
    var selected by remember { mutableStateOf<Int?>(null) }
    val grid = MaterialTheme.colorScheme.outlineVariant
    val surface = MaterialTheme.colorScheme.surface
    Canvas(
        modifier.fillMaxWidth().height(height)
            .semantics { contentDescription = description }
            .pointerInput(points) {
                fun indexAt(x: Float) = if (points.size < 2) 0 else ((x / size.width) * (points.size - 1)).toInt().coerceIn(0, points.size - 1)
                detectDragGestures(
                    onDragStart = { selected = indexAt(it.x); onSelect(selected) },
                    onDragEnd = { selected = null; onSelect(null) },
                    onDragCancel = { selected = null; onSelect(null) },
                    onDrag = { change, _ -> selected = indexAt(change.position.x); onSelect(selected) },
                )
            }
            .pointerInput(points) {
                detectTapGestures(onPress = {
                    val i = if (points.size < 2) 0 else ((it.x / size.width) * (points.size - 1)).toInt().coerceIn(0, points.size - 1)
                    selected = i; onSelect(i)
                    tryAwaitRelease()
                    selected = null; onSelect(null)
                })
            },
    ) {
        if (points.isEmpty()) return@Canvas
        val top = 8.dp.toPx()
        val bottom = size.height - 4.dp.toPx()
        val maxValue = max(points.maxOf { it.value }, 1f) * 1.12f
        val stepX = if (points.size > 1) size.width / (points.size - 1) else size.width
        fun y(v: Float) = bottom - (v / maxValue) * (bottom - top) * progress.value

        repeat(4) { i ->
            val gy = top + (bottom - top) * i / 3f
            drawLine(grid, Offset(0f, gy), Offset(size.width, gy), strokeWidth = 1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 8f)))
        }

        val coords = points.mapIndexed { i, p -> Offset(i * stepX, y(p.value)) }
        val line = Path().apply {
            moveTo(coords.first().x, coords.first().y)
            for (i in 1 until coords.size) {
                val prev = coords[i - 1]; val cur = coords[i]
                val midX = (prev.x + cur.x) / 2
                cubicTo(midX, prev.y, midX, cur.y, cur.x, cur.y)
            }
        }
        val area = Path().apply {
            addPath(line)
            lineTo(coords.last().x, bottom)
            lineTo(coords.first().x, bottom)
            close()
        }
        drawPath(area, Brush.verticalGradient(listOf(color.copy(alpha = 0.28f), color.copy(alpha = 0.02f)), startY = top, endY = bottom))
        drawPath(line, color, style = Stroke(width = 2.5.dp.toPx(), cap = StrokeCap.Round))

        val sel = selected
        if (sel != null && sel in coords.indices) {
            val c = coords[sel]
            drawLine(color.copy(alpha = 0.4f), Offset(c.x, top), Offset(c.x, bottom), strokeWidth = 1.dp.toPx())
            drawCircle(surface, radius = 7.dp.toPx(), center = c)
            drawCircle(color, radius = 5.dp.toPx(), center = c)
        } else if (coords.isNotEmpty()) {
            drawCircle(surface, radius = 5.dp.toPx(), center = coords.last())
            drawCircle(color, radius = 3.5.dp.toPx(), center = coords.last())
        }
    }
}

/** Small bars (orders per day), with the touched bar highlighted. */
@Composable
fun BarChart(points: List<ChartPoint>, modifier: Modifier = Modifier, height: Dp = 64.dp, color: Color = MaterialTheme.colorScheme.tertiary, highlight: Int? = null) {
    val muted = color.copy(alpha = 0.35f)
    Canvas(modifier.fillMaxWidth().height(height).semantics { contentDescription = "Orders per day" }) {
        if (points.isEmpty()) return@Canvas
        val maxValue = max(points.maxOf { it.value }, 1f)
        val gap = 3.dp.toPx()
        val barWidth = ((size.width - gap * (points.size - 1)) / points.size).coerceAtLeast(1f)
        points.forEachIndexed { i, p ->
            val h = (p.value / maxValue) * size.height
            val x = i * (barWidth + gap)
            val barHeight = max(h, 2.dp.toPx())
            drawRoundRect(
                color = if (highlight == null || highlight == i) color else muted,
                topLeft = Offset(x, size.height - barHeight),
                size = Size(barWidth, barHeight),
                cornerRadius = CornerRadius(barWidth / 2.5f, barWidth / 2.5f),
            )
        }
    }
}

data class DonutSlice(val label: String, val value: Int, val color: Color)

@Composable
fun DonutChart(slices: List<DonutSlice>, centerTop: String, centerBottom: String, modifier: Modifier = Modifier, size: Dp = 148.dp) {
    val progress = remember { Animatable(0f) }
    LaunchedEffect(slices) { progress.snapTo(0f); progress.animateTo(1f, tween(800, easing = FastOutSlowInEasing)) }
    val track = MaterialTheme.colorScheme.surfaceContainerHigh
    val total = slices.sumOf { it.value }.coerceAtLeast(0)
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(size), contentAlignment = Alignment.Center) {
            Canvas(Modifier.size(size).semantics { contentDescription = slices.joinToString { "${it.label} ${it.value}" } }) {
                val stroke = 18.dp.toPx()
                val inset = stroke / 2
                val arcSize = Size(this.size.width - stroke, this.size.height - stroke)
                drawArc(track, 0f, 360f, false, Offset(inset, inset), arcSize, style = Stroke(stroke))
                if (total > 0) {
                    var start = -90f
                    val gapDeg = if (slices.count { it.value > 0 } > 1) 2.5f else 0f
                    slices.filter { it.value > 0 }.forEach { slice ->
                        val sweep = 360f * slice.value / total * progress.value
                        drawArc(slice.color, start + gapDeg / 2, (sweep - gapDeg).coerceAtLeast(0.5f), false, Offset(inset, inset), arcSize, style = Stroke(stroke, cap = StrokeCap.Butt))
                        start += sweep
                    }
                }
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(centerTop, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text(centerBottom, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Spacer(Modifier.width(20.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            slices.forEach { slice ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(10.dp).clip(CircleShape).background(slice.color))
                    Spacer(Modifier.width(10.dp))
                    Text(slice.label, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                    Text(slice.value.toString(), style = MaterialTheme.typography.titleSmall)
                }
            }
        }
    }
}

/** A tiny trend line for a KPI card. */
@Composable
fun Sparkline(values: List<Float>, modifier: Modifier = Modifier, color: Color = MaterialTheme.colorScheme.primary) {
    Canvas(modifier) {
        if (values.size < 2) return@Canvas
        val maxV = max(values.max(), 1f)
        val minV = values.min()
        val range = (maxV - minV).takeIf { it > 0f } ?: 1f
        val step = size.width / (values.size - 1)
        val path = Path()
        values.forEachIndexed { i, v ->
            val x = i * step
            val y = size.height - ((v - minV) / range) * size.height * 0.9f - size.height * 0.05f
            if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
        }
        drawPath(path, color, style = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round))
    }
}

/** A horizontal share bar (e.g. units sold of the top product). */
@Composable
fun ShareBar(fraction: Float, modifier: Modifier = Modifier, color: Color = MaterialTheme.colorScheme.primary) {
    val track = MaterialTheme.colorScheme.surfaceContainerHigh
    Box(modifier.fillMaxWidth().height(6.dp).clip(CircleShape).background(track)) {
        Box(Modifier.fillMaxWidth(fraction.coerceIn(0f, 1f)).height(6.dp).clip(CircleShape).background(color))
    }
}

@Composable
fun ChartLegendDot(color: Color, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(end = 12.dp)) {
        Box(Modifier.size(8.dp).clip(CircleShape).background(color))
        Spacer(Modifier.width(6.dp))
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
