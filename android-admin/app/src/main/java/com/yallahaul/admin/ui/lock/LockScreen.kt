package com.yallahaul.admin.ui.lock

import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.biometric.BiometricPrompt
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Fingerprint
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
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
import androidx.activity.compose.LocalActivity
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.yallahaul.admin.ui.login.BrandMark

/** The app lock (Settings > Security): fingerprint, face or the phone's screen lock. */
@Composable
fun LockScreen(onUnlocked: () -> Unit) {
    val activity = LocalActivity.current as? FragmentActivity ?: return
    var message by remember { mutableStateOf<String?>(null) }
    val prompt = remember {
        BiometricPrompt(activity, ContextCompat.getMainExecutor(activity), object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) = onUnlocked()
            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) { message = errString.toString() }
        })
    }
    val canAuthenticate = remember { BiometricManager.from(activity).canAuthenticate(BIOMETRIC_STRONG or DEVICE_CREDENTIAL) == BiometricManager.BIOMETRIC_SUCCESS }
    val ask = {
        if (!canAuthenticate) onUnlocked()
        else prompt.authenticate(
            BiometricPrompt.PromptInfo.Builder()
                .setTitle("Unlock Yalla Haul Admin")
                .setSubtitle("Confirm it's you to see the store")
                .setAllowedAuthenticators(BIOMETRIC_STRONG or DEVICE_CREDENTIAL)
                .build(),
        )
    }
    LaunchedEffect(Unit) { ask() }
    Column(Modifier.fillMaxSize().padding(32.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        BrandMark()
        Spacer(Modifier.height(28.dp))
        Text("Yalla Haul Admin is locked", style = MaterialTheme.typography.headlineSmall, textAlign = TextAlign.Center)
        Spacer(Modifier.height(8.dp))
        Text(message ?: "Unlock with your fingerprint, face or screen lock.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
        Spacer(Modifier.height(28.dp))
        Button(onClick = { message = null; ask() }) {
            Icon(Icons.Outlined.Fingerprint, null)
            Spacer(Modifier.padding(4.dp))
            Text("Unlock")
        }
    }
}
