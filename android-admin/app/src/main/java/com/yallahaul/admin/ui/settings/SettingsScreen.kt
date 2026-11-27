package com.yallahaul.admin.ui.settings

import com.yallahaul.admin.ui.components.openSafely
import androidx.core.net.toUri
import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.biometric.BiometricManager
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.yallahaul.admin.BuildConfig
import com.yallahaul.admin.core.model.AppUser
import com.yallahaul.admin.core.prefs.ThemeMode
import com.yallahaul.admin.core.util.Labels
import com.yallahaul.admin.ui.components.ConfirmDialog
import com.yallahaul.admin.ui.components.ConstrainedColumn
import com.yallahaul.admin.ui.components.LabeledValue
import com.yallahaul.admin.ui.components.LocalSnackbar
import com.yallahaul.admin.ui.components.Pill
import com.yallahaul.admin.ui.components.SectionCard
import com.yallahaul.admin.ui.components.SegmentedChoice
import com.yallahaul.admin.ui.components.Tone

@Composable
fun SettingsScreen(user: AppUser, onBack: () -> Unit, vm: SettingsViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val ui by vm.uiPrefs.collectAsStateWithLifecycle()
    val snackbar = LocalSnackbar.current
    val context = LocalContext.current
    var confirmSignOut by remember { mutableStateOf(false) }
    var confirmEverywhere by remember { mutableStateOf(false) }
    var renaming by remember { mutableStateOf(false) }
    val notifyPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { vm.refreshPermission() }
    LaunchedEffect(Unit) { vm.messages.collect { snackbar.showSnackbar(it) } }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { vm.refreshPermission() }
    val canLock = remember { BiometricManager.from(context).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.DEVICE_CREDENTIAL) == BiometricManager.BIOMETRIC_SUCCESS }

    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("Settings") },
            navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
        )
        Column(Modifier.verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            ConstrainedColumn {
                SectionCard(title = "Account", action = { TextButton(onClick = { renaming = true }) { Text("Edit name") } }) {
                    LabeledValue("Name", user.name)
                    LabeledValue("Email", user.email)
                    LabeledValue("Role", Labels.role(user.role))
                    Row(Modifier.fillMaxWidth().padding(vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("2-step login", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                        Pill(if (user.twoStepOn) "On" else "Off", if (user.twoStepOn) Tone.Success else Tone.Danger)
                    }
                    Text("Password and 2-step login are changed on the website (Admin › My profile).", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp))
                }
            }

            ConstrainedColumn {
                SectionCard(title = "Notifications") {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(if (state.instantPush) "Instant alerts" else "Alerts every 15 minutes", style = MaterialTheme.typography.titleSmall)
                            Text(
                                if (state.instantPush) "The store pushes alerts to this phone the moment they happen."
                                else "Firebase push isn't set up for this app yet, so the phone checks for new alerts every 15 minutes.",
                                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    if (!state.systemAllowed) {
                        Spacer(Modifier.height(10.dp))
                        Button(onClick = {
                            if (Build.VERSION.SDK_INT >= 33) notifyPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
                            else context.openSafely(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName))
                        }, modifier = Modifier.fillMaxWidth()) { Text("Allow notifications") }
                    }
                    HorizontalDivider(Modifier.padding(vertical = 10.dp), color = MaterialTheme.colorScheme.outlineVariant)
                    val p = state.prefs
                    PrefRow("New orders and order updates", "New orders, cancellations, payment screenshots, deliveries", p.orders, state.prefsLoaded) { vm.setPrefs(p.copy(orders = it)) }
                    PrefRow("Low stock", "When a product is running low or sold out", p.lowStock, state.prefsLoaded) { vm.setPrefs(p.copy(lowStock = it)) }
                    PrefRow("Messages", "Reviews, questions, live chat and team chat", p.messages, state.prefsLoaded) { vm.setPrefs(p.copy(messages = it)) }
                    PrefRow("Security", "Sign-ins from new devices, locked accounts", p.security, state.prefsLoaded) { vm.setPrefs(p.copy(security = it)) }
                    PrefRow("Morning summary", "Yesterday's sales, every morning", p.summary, state.prefsLoaded) { vm.setPrefs(p.copy(summary = it)) }
                    Text("The store-wide switches in the web admin (Settings › Notifications) still decide what is sent at all.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
                    Spacer(Modifier.height(12.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        OutlinedButton(onClick = vm::sendTest, enabled = !state.testing, modifier = Modifier.weight(1f), shape = RoundedCornerShape(14.dp)) {
                            if (state.testing) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp) else Text("Send a test")
                        }
                        OutlinedButton(onClick = {
                            context.openSafely(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName))
                        }, modifier = Modifier.weight(1f), shape = RoundedCornerShape(14.dp)) { Text("Sounds & channels") }
                    }
                }
            }

            ConstrainedColumn {
                SectionCard(title = "Appearance") {
                    SegmentedChoice(listOf(ThemeMode.System.name to "System", ThemeMode.Light.name to "Light", ThemeMode.Dark.name to "Dark"), ui.theme.name, { vm.setTheme(ThemeMode.valueOf(it)) })
                }
            }

            ConstrainedColumn {
                SectionCard(title = "Security") {
                    PrefRow("App lock", if (canLock) "Ask for fingerprint, face or screen lock when opening the app" else "Set a screen lock on this phone to use this", ui.appLock, canLock) { vm.setAppLock(it) }
                    PrefRow("Hide content in recent apps", "Blocks screenshots and blurs the app in the app switcher", ui.secureScreen, true) { vm.setSecureScreen(it) }
                    Text("Your sign-in is encrypted on this phone and lasts one 12-hour shift, the same as on the website.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = 6.dp))
                    OutlinedButton(onClick = { confirmEverywhere = true }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp), colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error)) {
                        Text("Sign out everywhere")
                    }
                }
            }

            ConstrainedColumn {
                SectionCard(title = "About") {
                    LabeledValue("Version", BuildConfig.VERSION_NAME)
                    LabeledValue("Store", BuildConfig.API_BASE_URL.toUri().host ?: BuildConfig.API_BASE_URL)
                }
            }

            ConstrainedColumn {
                Button(
                    onClick = { confirmSignOut = true }, enabled = !state.signingOut,
                    modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(16.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHighest, contentColor = MaterialTheme.colorScheme.error),
                ) { Text("Sign out", style = MaterialTheme.typography.titleSmall) }
            }
        }
    }

    if (confirmSignOut) ConfirmDialog("Sign out?", "This phone stops getting alerts until you sign in again.", "Sign out", destructive = true, onConfirm = { vm.signOut(false) }, onDismiss = { confirmSignOut = false })
    if (confirmEverywhere) ConfirmDialog(
        "Sign out everywhere?",
        "Every session of your account ends: this phone, your other phones and every browser where you're signed in to the admin. You'll need your password and 2-step code again.",
        "Sign out everywhere", destructive = true, onConfirm = { vm.signOut(true) }, onDismiss = { confirmEverywhere = false },
    )
    if (renaming) {
        var name by rememberSaveable { mutableStateOf(user.name) }
        AlertDialog(
            onDismissRequest = { renaming = false },
            title = { Text("Your name") },
            text = { OutlinedTextField(name, { name = it.take(80) }, singleLine = true, modifier = Modifier.fillMaxWidth()) },
            confirmButton = { Button(onClick = { vm.rename(name); renaming = false }, enabled = name.isNotBlank()) { Text("Save") } },
            dismissButton = { TextButton(onClick = { renaming = false }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun PrefRow(title: String, subtitle: String, checked: Boolean, enabled: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f).padding(end = 12.dp)) {
            Text(title, style = MaterialTheme.typography.bodyLarge)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Switch(checked = checked, onCheckedChange = onChange, enabled = enabled)
    }
}

