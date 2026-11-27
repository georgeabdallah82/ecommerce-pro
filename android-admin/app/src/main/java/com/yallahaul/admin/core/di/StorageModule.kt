package com.yallahaul.admin.core.di

import com.yallahaul.admin.core.cache.EncryptedResponseCache
import com.yallahaul.admin.core.cache.ResponseCache
import com.yallahaul.admin.core.session.KeystoreTokenVault
import com.yallahaul.admin.core.session.TokenVault
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

@Module
@InstallIn(SingletonComponent::class)
abstract class StorageModule {
    @Binds abstract fun tokenVault(impl: KeystoreTokenVault): TokenVault
    @Binds abstract fun responseCache(impl: EncryptedResponseCache): ResponseCache
}
