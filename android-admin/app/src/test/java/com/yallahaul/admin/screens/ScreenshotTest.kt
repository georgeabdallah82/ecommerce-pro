package com.yallahaul.admin.screens

import android.graphics.Bitmap
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ActivityScenario
import com.yallahaul.admin.MainActivity
import com.yallahaul.admin.core.model.MeResponse
import com.yallahaul.admin.core.prefs.AppPreferences
import com.yallahaul.admin.core.session.SessionManager
import com.yallahaul.admin.core.di.AppModule
import dagger.hilt.android.testing.HiltAndroidRule
import dagger.hilt.android.testing.HiltAndroidTest
import dagger.hilt.android.testing.HiltTestApplication
import kotlinx.coroutines.runBlocking
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import javax.inject.Inject

/**
 * Renders the real app (every screen, its view models and the network layer) against the recorded
 * store answers and saves screenshots to build/screenshots, for a design review without a phone.
 * Sized like a Samsung Galaxy S26 (411 x 900 dp).
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(application = HiltTestApplication::class, sdk = [35], qualifiers = "w411dp-h900dp-xxhdpi")
abstract class ScreenshotBase {
    @get:Rule(order = 0) val hilt = HiltAndroidRule(this)
    @get:Rule(order = 1) val compose = createEmptyComposeRule()
    @Inject lateinit var session: SessionManager
    @Inject lateinit var prefs: AppPreferences
    abstract val theme: String

    @Before fun setUp() { hilt.inject() }

    private fun signIn() = runBlocking {
        val me = AppModule.json().decodeFromString(MeResponse.serializer(), javaClass.classLoader!!.getResource("fixtures/me.json")!!.readText())
        prefs.setNotificationsAsked()
        session.signedIn("test-token-not-real-0123456789", null, me.user, me.store)
    }

    private var current: ActivityScenario<MainActivity>? = null

    private fun launch(block: () -> Unit) {
        ActivityScenario.launch(MainActivity::class.java).use { current = it; settle(); block() }
    }

    /** Lets network answers (on background threads) arrive and the UI settle. */
    private fun settle() {
        repeat(12) {
            Thread.sleep(120)
            org.robolectric.shadows.ShadowLooper.idleMainLooper()
            compose.mainClock.advanceTimeBy(250)
        }
    }

    private fun shot(name: String) {
        settle()
        current!!.onActivity { activity ->
            val view = activity.window.decorView
            val bitmap = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
            view.draw(android.graphics.Canvas(bitmap))
            val dir = File("build/screenshots").apply { mkdirs() }
            File(dir, "$name-$theme.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        }
    }

    private fun tap(text: String) {
        compose.waitUntil(5_000) { compose.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty() }
        compose.onAllNodesWithText(text).onFirst().performClick(); settle()
    }

    /** A bottom-bar tab: the last node with that label (a screen may use the same word in a heading). */
    private fun tab(route: String) {
        compose.onNodeWithTag("tab-$route").performClick(); settle()
    }

    @Test fun signedOutLogin() {
        launch { shot("01-login") }
    }

    @Test fun mainScreens() {
        signIn()
        launch {
            shot("02-dashboard")
            tab("orders"); shot("03-orders")
            tap("#1014"); shot("04-order-detail")
        }
    }

    @Test fun catalogScreens() {
        signIn()
        launch {
            tab("products"); shot("05-products")
            tab("inventory"); shot("06-stock")
            tab("more"); shot("07-more")
            tap("Discounts"); shot("08-discounts")
        }
    }

    @Test fun peopleAndSettings() {
        signIn()
        launch {
            tab("more"); tap("Customers"); shot("09-customers")
        }
        launch {
            tab("more"); tap("Alerts"); shot("10-alerts")
        }
        launch {
            tab("more"); tap("Settings"); shot("11-settings")
        }
    }

    @Test fun productEditor() {
        signIn()
        launch {
            tab("products"); compose.onNodeWithTag("add-product").performClick(); settle(); shot("12-new-product")
        }
    }

    @Test fun newFeatures() {
        signIn()
        launch { tab("more"); tap("Drivers"); shot("13-drivers") }
        launch { tab("more"); tap("Reviews & questions"); shot("14-reviews") }
        launch { tab("more"); tap("Returns"); shot("15-returns") }
        launch { tab("more"); tap("Unfinished checkouts"); shot("16-unfinished") }
        launch { tab("more"); tap("Reports"); shot("17-reports") }
        launch { tab("more"); tap("Live chat"); shot("18-live-chat") }
        launch { tab("more"); tap("Team chat"); shot("19-team-chat") }
    }

    @Test fun newOrder() {
        signIn()
        launch { tab("orders"); compose.onNodeWithTag("new-order").performClick(); settle(); shot("20-new-order") }
    }
}

@HiltAndroidTest
class LightScreenshots : ScreenshotBase() { override val theme = "light" }

@HiltAndroidTest
@Config(qualifiers = "w411dp-h900dp-night-xxhdpi")
class DarkScreenshots : ScreenshotBase() { override val theme = "dark" }

