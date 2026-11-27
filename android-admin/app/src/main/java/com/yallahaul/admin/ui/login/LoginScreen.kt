package com.yallahaul.admin.ui.login

import androidx.core.net.toUri
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.automirrored.outlined.OpenInNew
import androidx.compose.material.icons.outlined.ShieldMoon
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentType
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.yallahaul.admin.BuildConfig
import com.yallahaul.admin.core.session.SignOutReason
import com.yallahaul.admin.ui.components.InlineError
import com.yallahaul.admin.ui.theme.Brand

@Composable
fun LoginScreen(reason: SignOutReason?, vm: LoginViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        // A soft brand glow behind the card.
        Canvas(Modifier.fillMaxWidth().height(340.dp)) {
            drawRect(Brush.verticalGradient(listOf(Brand.Red.copy(alpha = 0.16f), Color.Transparent)))
        }
        Column(
            Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing).imePadding().verticalScroll(rememberScrollState()).padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(40.dp))
            BrandMark()
            Spacer(Modifier.height(18.dp))
            Row(verticalAlignment = Alignment.Bottom) {
                Text("YALLA", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Black, letterSpacing = 1.sp)
                Spacer(Modifier.width(6.dp))
                Text("HAUL", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Black, color = MaterialTheme.colorScheme.primary, letterSpacing = 1.sp)
            }
            Text("Store admin", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(32.dp))

            Surface(
                modifier = Modifier.widthIn(max = 460.dp).fillMaxWidth(),
                shape = MaterialTheme.shapes.extraLarge,
                color = MaterialTheme.colorScheme.surface,
                border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                shadowElevation = 2.dp,
            ) {
                Column(Modifier.padding(24.dp)) {
                    if (reason == SignOutReason.Expired && state.step == LoginViewModel.Step.Credentials && state.error == null) {
                        InlineError("Your session ended. Staff sign in again after each 12-hour shift, the same as on the website.")
                        Spacer(Modifier.height(16.dp))
                    }
                    AnimatedContent(
                        targetState = state.step,
                        transitionSpec = { (fadeIn() + slideInHorizontally { it / 6 }) togetherWith fadeOut() },
                        label = "login-step",
                    ) { step ->
                        when (step) {
                            LoginViewModel.Step.Credentials -> CredentialsStep(state, vm)
                            LoginViewModel.Step.Code -> CodeStep(state, vm)
                        }
                    }
                }
            }
            Spacer(Modifier.height(24.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.ShieldMoon, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp))
                Text("Staff accounts only · protected by 2-step login", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(BuildConfig.API_BASE_URL.toUri().host ?: "", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f), modifier = Modifier.padding(top = 4.dp))
        }
    }
}

@Composable
private fun CredentialsStep(state: LoginViewModel.UiState, vm: LoginViewModel) {
    var showPassword by remember { mutableStateOf(false) }
    val context = LocalContext.current
    Column {
        Text("Sign in", style = MaterialTheme.typography.headlineSmall)
        Text("Use your Yalla Haul admin email and password.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(20.dp))
        OutlinedTextField(
            value = state.email,
            onValueChange = vm::setEmail,
            label = { Text("Email") },
            leadingIcon = { Icon(Icons.Outlined.Email, null) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().semantics { contentType = ContentType.EmailAddress },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
            shape = RoundedCornerShape(14.dp),
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = state.password,
            onValueChange = vm::setPassword,
            label = { Text("Password") },
            leadingIcon = { Icon(Icons.Outlined.Lock, null) },
            trailingIcon = {
                IconButton(onClick = { showPassword = !showPassword }) {
                    Icon(if (showPassword) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility, if (showPassword) "Hide password" else "Show password")
                }
            },
            visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
            singleLine = true,
            modifier = Modifier.fillMaxWidth().semantics { contentType = ContentType.Password },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Go),
            keyboardActions = KeyboardActions(onGo = { vm.submitCredentials() }),
            shape = RoundedCornerShape(14.dp),
        )
        if (state.error != null) {
            Spacer(Modifier.height(14.dp))
            Text(state.error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
        }
        if (state.enrollRequired) {
            Spacer(Modifier.height(8.dp))
            TextButton(onClick = {
                CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(context, (BuildConfig.API_BASE_URL + "/admin/login").toUri())
            }) {
                Icon(Icons.AutoMirrored.Outlined.OpenInNew, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)); Text("Set up 2-step login on the website")
            }
        }
        Spacer(Modifier.height(20.dp))
        PrimaryAction("Continue", state.loading, enabled = state.email.isNotBlank() && state.password.isNotEmpty(), onClick = vm::submitCredentials)
    }
}

@Composable
private fun CodeStep(state: LoginViewModel.UiState, vm: LoginViewModel) {
    val focus = remember { FocusRequester() }
    LaunchedEffect(state.useBackup) { runCatching { focus.requestFocus() } }
    Column {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = vm::backToCredentials) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") }
            Text("2-step login", style = MaterialTheme.typography.headlineSmall)
        }
        Text(
            if (state.useBackup) "Type one of the backup codes you saved when you set up 2-step login."
            else "Open your authenticator app and type the 6-digit code for Yalla Haul.",
            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(20.dp))
        if (state.useBackup) {
            OutlinedTextField(
                value = state.code,
                onValueChange = vm::setCode,
                label = { Text("Backup code") },
                placeholder = { Text("abcd-efgh") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().focusRequester(focus),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii, imeAction = ImeAction.Go),
                keyboardActions = KeyboardActions(onGo = { vm.submitCode() }),
                shape = RoundedCornerShape(14.dp),
            )
        } else {
            CodeBoxes(state.code, onChange = { value ->
                vm.setCode(value)
                if (value.length == 6) vm.submitCode()
            }, modifier = Modifier.focusRequester(focus))
        }
        if (state.error != null) {
            Spacer(Modifier.height(14.dp))
            Text(state.error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
        }
        Spacer(Modifier.height(20.dp))
        PrimaryAction("Sign in", state.loading, enabled = state.code.length >= 6, onClick = vm::submitCode)
        TextButton(onClick = vm::toggleBackup, modifier = Modifier.align(Alignment.CenterHorizontally)) {
            Text(if (state.useBackup) "Use the code from my app" else "Lost your phone? Use a backup code")
        }
    }
}

@Composable
private fun CodeBoxes(value: String, onChange: (String) -> Unit, modifier: Modifier = Modifier) {
    BasicTextField(
        value = value,
        onValueChange = { onChange(it.filter(Char::isDigit).take(6)) },
        modifier = modifier.semantics { contentType = ContentType.SmsOtpCode },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword, imeAction = ImeAction.Done),
        singleLine = true,
        decorationBox = {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                repeat(6) { index ->
                    val char = value.getOrNull(index)
                    val active = index == value.length
                    Box(
                        Modifier.weight(1f).height(56.dp).clip(RoundedCornerShape(14.dp))
                            .background(MaterialTheme.colorScheme.surfaceContainerHigh)
                            .border(if (active) 2.dp else 1.dp, if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(14.dp)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(char?.toString() ?: "", style = MaterialTheme.typography.headlineSmall, textAlign = TextAlign.Center)
                    }
                }
            }
        },
    )
}

@Composable
private fun PrimaryAction(label: String, loading: Boolean, enabled: Boolean, onClick: () -> Unit) {
    Button(onClick = onClick, enabled = enabled && !loading, modifier = Modifier.fillMaxWidth().height(54.dp), shape = RoundedCornerShape(16.dp)) {
        if (loading) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.5.dp, color = MaterialTheme.colorScheme.onPrimary)
        else Text(label, style = MaterialTheme.typography.titleMedium)
    }
}

/** The Yalla Haul bag with its speed lines (from the store logo), drawn in code. */
@Composable
fun BrandMark(size: androidx.compose.ui.unit.Dp = 84.dp) {
    Box(Modifier.size(size).clip(RoundedCornerShape(26)).background(Brush.linearGradient(listOf(Color(0xFFE8352C), Brand.RedDeep))), contentAlignment = Alignment.Center) {
        Canvas(Modifier.size(size * 0.62f)) {
            val w = this.size.width; val h = this.size.height
            val handle = Path().apply {
                moveTo(w * 0.34f, h * 0.36f)
                cubicTo(w * 0.34f, h * 0.05f, w * 0.72f, h * 0.05f, w * 0.72f, h * 0.36f)
            }
            drawPath(handle, Color.White, style = Stroke(width = w * 0.075f, cap = StrokeCap.Round))
            val bag = Path().apply {
                moveTo(w * 0.2f, h * 0.36f)
                lineTo(w * 0.86f, h * 0.36f)
                lineTo(w * 0.93f, h * 0.88f)
                quadraticTo(w * 0.94f, h * 0.98f, w * 0.84f, h * 0.98f)
                lineTo(w * 0.22f, h * 0.98f)
                quadraticTo(w * 0.12f, h * 0.98f, w * 0.13f, h * 0.88f)
                close()
            }
            drawPath(bag, Color.White)
            drawCircle(Brand.Red, radius = w * 0.045f, center = Offset(w * 0.53f, h * 0.66f))
            listOf(0.46f to 0.12f, 0.6f to 0.18f, 0.74f to 0.12f).forEach { (y, len) ->
                drawLine(Color(0xFFFFC199), Offset(-w * 0.06f, h * y), Offset(-w * 0.06f + w * len, h * y), strokeWidth = w * 0.04f, cap = StrokeCap.Round)
            }
        }
    }
}
