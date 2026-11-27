package com.yallahaul.admin.ui.components

import com.yallahaul.admin.core.network.AppError

/** A screen's data: loading the first time, loaded (possibly refreshing), or failed with nothing to show. */
sealed interface LoadState<out T> {
    data object Loading : LoadState<Nothing>
    data class Ready<T>(val data: T, val refreshing: Boolean = false, val refreshError: String? = null) : LoadState<T>
    data class Failed(val error: AppError) : LoadState<Nothing>
}

val <T> LoadState<T>.dataOrNull: T? get() = (this as? LoadState.Ready)?.data

/** A paged list: rows so far, whether more can be loaded, and the state of the next page. */
data class Paged<T>(
    val rows: List<T> = emptyList(),
    val page: Int = 0,
    val pages: Int = 1,
    val total: Int = 0,
    val loadingMore: Boolean = false,
    val moreError: String? = null,
) {
    val canLoadMore get() = page < pages && !loadingMore
}
