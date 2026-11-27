package com.yallahaul.admin

import android.content.Intent
import android.os.Bundle
import android.os.SystemClock
import android.view.WindowManager
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.yallahaul.admin.core.notifications.AlertNotifier
import com.yallahaul.admin.core.session.SessionState
import com.yallahaul.admin.ui.AppRoot
import com.yallahaul.admin.ui.RootViewModel
import com.yallahaul.admin.ui.theme.YallaHaulTheme
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : FragmentActivity() {
    private val root: RootViewModel by viewModels()
    private var backgroundedAt = 0L

    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        super.onCreate(savedInstanceState)
        splash.setKeepOnScreenCondition { root.session.value is SessionState.Loading }
        enableEdgeToEdge()
        handleIntent(intent)

        // The app lock asks again after the phone was away from the app for a minute.
        ProcessLifecycleOwner.get().lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onStop(owner: LifecycleOwner) { backgroundedAt = SystemClock.elapsedRealtime() }
            override fun onStart(owner: LifecycleOwner) {
                if (backgroundedAt > 0 && SystemClock.elapsedRealtime() - backgroundedAt > LOCK_AFTER_MS) root.lockIfEnabled()
            }
        })

        setContent {
            val prefs by root.uiPrefs.collectAsStateWithLifecycle()
            LaunchedEffect(prefs.secureScreen) {
                // Hides the app's content from screenshots and the recent-apps preview when turned on (Settings > Security).
                if (prefs.secureScreen) window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
                else window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
            }
            YallaHaulTheme(prefs.theme) { AppRoot(root) }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        intent?.getStringExtra(AlertNotifier.EXTRA_PATH)?.let { root.openPath(it) }
        intent?.removeExtra(AlertNotifier.EXTRA_PATH)
    }

    private companion object { const val LOCK_AFTER_MS = 60_000L }
}
