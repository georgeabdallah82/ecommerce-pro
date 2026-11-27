package com.yallahaul.admin

import android.app.Application
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import coil3.ImageLoader
import coil3.PlatformContext
import coil3.SingletonImageLoader
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
import coil3.request.crossfade
import com.yallahaul.admin.core.notifications.AlertNotifier
import dagger.hilt.android.HiltAndroidApp
import okhttp3.OkHttpClient
import javax.inject.Inject

@HiltAndroidApp
class YallaHaulApp : Application(), Configuration.Provider, SingletonImageLoader.Factory {
    @Inject lateinit var workerFactory: HiltWorkerFactory
    @Inject lateinit var notifier: AlertNotifier
    @Inject lateinit var okHttp: OkHttpClient

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder().setWorkerFactory(workerFactory).build()

    override fun onCreate() {
        super.onCreate()
        notifier.createChannels()
    }

    // Images load through the app's own HTTP client: payment screenshots need the sign-in, and the
    // client only ever sends it to the store's address (AuthInterceptor).
    override fun newImageLoader(context: PlatformContext): ImageLoader = ImageLoader.Builder(context)
        .components { add(OkHttpNetworkFetcherFactory(callFactory = { okHttp })) }
        .crossfade(true)
        .build()
}
