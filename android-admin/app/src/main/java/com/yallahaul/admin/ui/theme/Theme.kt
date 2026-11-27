package com.yallahaul.admin.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.yallahaul.admin.core.prefs.ThemeMode

// Yalla Haul's own palette (lib/storefront-market.ts MARKET_COLORS and the logo): the signal red,
// the delivery orange and near-black ink on a warm off-white.
object Brand {
    val Red = Color(0xFFD7261E)
    val RedDeep = Color(0xFFB51C15)
    val RedSoft = Color(0xFFFDECEA)
    val Orange = Color(0xFFFF7A1A)
    val Ink = Color(0xFF121212)
    val Paper = Color(0xFFF6F6F4)
}

/** Colours for meaning (statuses, stock, trends) that Material's scheme doesn't name. */
@Immutable
data class StatusColors(
    val success: Color, val onSuccess: Color, val successContainer: Color,
    val warning: Color, val onWarning: Color, val warningContainer: Color,
    val info: Color, val infoContainer: Color,
    val neutral: Color, val neutralContainer: Color,
    val danger: Color, val dangerContainer: Color,
    val chart: List<Color>,
)

private val LightStatus = StatusColors(
    success = Color(0xFF15803D), onSuccess = Color.White, successContainer = Color(0xFFE3F4E8),
    warning = Color(0xFFA15C07), onWarning = Color.White, warningContainer = Color(0xFFFFF1DC),
    info = Color(0xFF1D5FD1), infoContainer = Color(0xFFE6EEFD),
    neutral = Color(0xFF5B616B), neutralContainer = Color(0xFFEDEDEA),
    danger = Color(0xFFC4211A), dangerContainer = Color(0xFFFDE7E5),
    chart = listOf(Brand.Red, Brand.Orange, Color(0xFF1D5FD1), Color(0xFF15803D), Color(0xFF7C3AED), Color(0xFF5B616B)),
)

private val DarkStatus = StatusColors(
    success = Color(0xFF5BD28A), onSuccess = Color(0xFF00391A), successContainer = Color(0xFF16321F),
    warning = Color(0xFFF5B45A), onWarning = Color(0xFF3F2400), warningContainer = Color(0xFF3A2A12),
    info = Color(0xFF8DB4FF), infoContainer = Color(0xFF1B2A45),
    neutral = Color(0xFFA9AEB6), neutralContainer = Color(0xFF26282C),
    danger = Color(0xFFFF8A80), dangerContainer = Color(0xFF3D1A18),
    chart = listOf(Color(0xFFFF6B5E), Color(0xFFFFA05C), Color(0xFF8DB4FF), Color(0xFF5BD28A), Color(0xFFB794F6), Color(0xFFA9AEB6)),
)

val LocalStatusColors = staticCompositionLocalOf { LightStatus }

private val LightColors = lightColorScheme(
    primary = Brand.Red,
    onPrimary = Color.White,
    primaryContainer = Brand.RedSoft,
    onPrimaryContainer = Color(0xFF5C0D09),
    secondary = Brand.Ink,
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFECECE8),
    onSecondaryContainer = Brand.Ink,
    tertiary = Color(0xFFC75A0C),
    onTertiary = Color.White,
    tertiaryContainer = Color(0xFFFFE7D6),
    onTertiaryContainer = Color(0xFF4A1F00),
    background = Brand.Paper,
    onBackground = Brand.Ink,
    surface = Color.White,
    onSurface = Brand.Ink,
    surfaceVariant = Color(0xFFF1F1EC),
    onSurfaceVariant = Color(0xFF5B616B),
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = Color(0xFFFBFBF9),
    surfaceContainer = Color(0xFFF4F4F1),
    surfaceContainerHigh = Color(0xFFEEEEEA),
    surfaceContainerHighest = Color(0xFFE8E8E3),
    outline = Color(0xFFD6D6D0),
    outlineVariant = Color(0xFFE8E8E3),
    error = Color(0xFFBA1A1A),
    onError = Color.White,
    errorContainer = Color(0xFFFFDAD6),
    onErrorContainer = Color(0xFF410002),
    inverseSurface = Brand.Ink,
    inverseOnSurface = Color(0xFFF2F2EF),
    inversePrimary = Color(0xFFFF8A80),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFFFF6B5E),
    onPrimary = Color(0xFF4A0905),
    primaryContainer = Color(0xFF7A1611),
    onPrimaryContainer = Color(0xFFFFDAD5),
    secondary = Color(0xFFE6E6E3),
    onSecondary = Color(0xFF1B1B1D),
    secondaryContainer = Color(0xFF2E2F33),
    onSecondaryContainer = Color(0xFFE6E6E3),
    tertiary = Color(0xFFFFA05C),
    onTertiary = Color(0xFF4A1F00),
    tertiaryContainer = Color(0xFF5E2D06),
    onTertiaryContainer = Color(0xFFFFDCC3),
    background = Color(0xFF0E0E10),
    onBackground = Color(0xFFEDEDEA),
    surface = Color(0xFF16171A),
    onSurface = Color(0xFFEDEDEA),
    surfaceVariant = Color(0xFF23252A),
    onSurfaceVariant = Color(0xFFB4B8BF),
    surfaceContainerLowest = Color(0xFF0B0B0D),
    surfaceContainerLow = Color(0xFF141518),
    surfaceContainer = Color(0xFF1A1B1F),
    surfaceContainerHigh = Color(0xFF212328),
    surfaceContainerHighest = Color(0xFF2A2C31),
    outline = Color(0xFF3C3F45),
    outlineVariant = Color(0xFF2C2E33),
    error = Color(0xFFFFB4AB),
    onError = Color(0xFF690005),
    errorContainer = Color(0xFF93000A),
    onErrorContainer = Color(0xFFFFDAD6),
    inverseSurface = Color(0xFFEDEDEA),
    inverseOnSurface = Color(0xFF1B1B1D),
    inversePrimary = Brand.Red,
)

private val Sans = FontFamily.SansSerif

val AppTypography = Typography(
    displaySmall = TextStyle(fontFamily = Sans, fontWeight = FontWeight.Bold, fontSize = 34.sp, lineHeight = 40.sp, letterSpacing = (-0.8).sp),
    headlineLarge = TextStyle(fontFamily = Sans, fontWeight = FontWeight.Bold, fontSize = 30.sp, lineHeight = 36.sp, letterSpacing = (-0.6).sp),
    headlineMedium = TextStyle(fontFamily = Sans, fontWeight = FontWeight.Bold, fontSize = 26.sp, lineHeight = 32.sp, letterSpacing = (-0.5).sp),
    headlineSmall = TextStyle(fontFamily = Sans, fontWeight = FontWeight.Bold, fontSize = 22.sp, lineHeight = 28.sp, letterSpacing = (-0.3).sp),
    titleLarge = TextStyle(fontFamily = Sans, fontWeight = FontWeight.SemiBold, fontSize = 20.sp, lineHeight = 26.sp, letterSpacing = (-0.2).sp),
    titleMedium = TextStyle(fontFamily = Sans, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, lineHeight = 22.sp, letterSpacing = (-0.1).sp),
    titleSmall = TextStyle(fontFamily = Sans, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 20.sp),
    bodyLarge = TextStyle(fontFamily = Sans, fontWeight = FontWeight.Normal, fontSize = 16.sp, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontFamily = Sans, fontWeight = FontWeight.Normal, fontSize = 14.sp, lineHeight = 20.sp),
    bodySmall = TextStyle(fontFamily = Sans, fontWeight = FontWeight.Normal, fontSize = 12.sp, lineHeight = 16.sp),
    labelLarge = TextStyle(fontFamily = Sans, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 20.sp),
    labelMedium = TextStyle(fontFamily = Sans, fontWeight = FontWeight.Medium, fontSize = 12.sp, lineHeight = 16.sp, letterSpacing = 0.2.sp),
    labelSmall = TextStyle(fontFamily = Sans, fontWeight = FontWeight.SemiBold, fontSize = 11.sp, lineHeight = 14.sp, letterSpacing = 0.4.sp),
)

val AppShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(22.dp),
    extraLarge = RoundedCornerShape(28.dp),
)

@Composable
fun YallaHaulTheme(mode: ThemeMode = ThemeMode.System, content: @Composable () -> Unit) {
    val dark = when (mode) {
        ThemeMode.System -> isSystemInDarkTheme()
        ThemeMode.Light -> false
        ThemeMode.Dark -> true
    }
    CompositionLocalProvider(LocalStatusColors provides if (dark) DarkStatus else LightStatus) {
        MaterialTheme(colorScheme = if (dark) DarkColors else LightColors, typography = AppTypography, shapes = AppShapes, content = content)
    }
}

object AppTheme {
    val status: StatusColors @Composable get() = LocalStatusColors.current
}
