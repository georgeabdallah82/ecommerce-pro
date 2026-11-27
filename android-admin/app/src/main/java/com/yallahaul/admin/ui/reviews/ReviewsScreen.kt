package com.yallahaul.admin.ui.reviews

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.outlined.QuestionAnswer
import androidx.compose.material.icons.outlined.RateReview
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Switch
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.yallahaul.admin.core.data.ReviewsRepository
import com.yallahaul.admin.core.model.AppUser
import com.yallahaul.admin.core.model.QuestionRow
import com.yallahaul.admin.core.model.QuestionsResponse
import com.yallahaul.admin.core.model.ReviewRow
import com.yallahaul.admin.core.model.ReviewsResponse
import com.yallahaul.admin.core.network.ApiResult
import com.yallahaul.admin.core.util.Dates
import com.yallahaul.admin.ui.components.ConfirmDialog
import com.yallahaul.admin.ui.components.ConstrainedColumn
import com.yallahaul.admin.ui.components.EmptyView
import com.yallahaul.admin.ui.components.ErrorView
import com.yallahaul.admin.ui.components.LoadState
import com.yallahaul.admin.ui.components.LoadingView
import com.yallahaul.admin.ui.components.LocalSnackbar
import com.yallahaul.admin.ui.components.Pill
import com.yallahaul.admin.ui.components.RemoteImage
import com.yallahaul.admin.ui.components.SectionCard
import com.yallahaul.admin.ui.components.Tone
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Reviews waiting for approval and shoppers' product questions (the web's Content › Reviews and Questions). */
@HiltViewModel
class ReviewsViewModel @Inject constructor(private val repo: ReviewsRepository) : ViewModel() {
    private val _reviews = MutableStateFlow<LoadState<ReviewsResponse>>(LoadState.Loading)
    val reviews: StateFlow<LoadState<ReviewsResponse>> = _reviews.asStateFlow()
    private val _questions = MutableStateFlow<LoadState<QuestionsResponse>>(LoadState.Loading)
    val questions: StateFlow<LoadState<QuestionsResponse>> = _questions.asStateFlow()
    private val _allReviews = MutableStateFlow(false)
    val allReviews: StateFlow<Boolean> = _allReviews.asStateFlow()
    private val _allQuestions = MutableStateFlow(false)
    val allQuestions: StateFlow<Boolean> = _allQuestions.asStateFlow()
    private val _messages = Channel<String>(Channel.BUFFERED)
    val messages = _messages.receiveAsFlow()

    init { loadReviews(); loadQuestions() }

    fun setAllReviews(all: Boolean) { _allReviews.value = all; loadReviews() }
    fun setAllQuestions(all: Boolean) { _allQuestions.value = all; loadQuestions() }

    fun loadReviews() = viewModelScope.launch {
        (_reviews.value as? LoadState.Ready)?.let { _reviews.value = it.copy(refreshing = true) }
        _reviews.value = when (val r = repo.reviews(_allReviews.value)) { is ApiResult.Success -> LoadState.Ready(r.data); is ApiResult.Failure -> LoadState.Failed(r.error) }
    }

    fun loadQuestions() = viewModelScope.launch {
        (_questions.value as? LoadState.Ready)?.let { _questions.value = it.copy(refreshing = true) }
        _questions.value = when (val r = repo.questions(_allQuestions.value)) { is ApiResult.Success -> LoadState.Ready(r.data); is ApiResult.Failure -> LoadState.Failed(r.error) }
    }

    fun approve(r: ReviewRow, approved: Boolean) = act(if (approved) "Review shown on the product" else "Review hidden") { repo.setApproved(r.id, approved) }
    fun feature(r: ReviewRow, featured: Boolean) = act(if (featured) "Review featured" else "No longer featured") { repo.setFeatured(r.id, featured) }
    fun answer(q: QuestionRow, text: String, publish: Boolean) = act(if (publish) "Answer saved and shown on the product" else "Answer saved") { repo.answer(q.id, text, publish) }
    fun publish(q: QuestionRow, published: Boolean) = act(if (published) "Shown on the product page" else "Hidden from the product page") { repo.setPublished(q.id, published) }
    fun delete(q: QuestionRow) = act("Question deleted") { repo.deleteQuestion(q.id) }

    private fun act(success: String, call: suspend () -> ApiResult<*>) = viewModelScope.launch {
        when (val r = call()) {
            is ApiResult.Success -> { _messages.send(success); loadReviews(); loadQuestions() }
            is ApiResult.Failure -> _messages.send(r.error.message)
        }
    }
}

@Composable
fun ReviewsScreen(user: AppUser, onBack: () -> Unit, vm: ReviewsViewModel = hiltViewModel()) {
    val snackbar = LocalSnackbar.current
    var tab by rememberSaveable { mutableIntStateOf(0) }
    val reviews by vm.reviews.collectAsStateWithLifecycle()
    val questions by vm.questions.collectAsStateWithLifecycle()
    val canManage = user.can("reviews.manage")
    LaunchedEffect(Unit) { vm.messages.collect { snackbar.showSnackbar(it) } }
    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("Reviews & questions") },
            navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
        )
        PrimaryTabRow(selectedTabIndex = tab, containerColor = MaterialTheme.colorScheme.background) {
            val waiting = (reviews as? LoadState.Ready)?.data?.waiting
            val open = (questions as? LoadState.Ready)?.data?.open
            Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("Reviews" + (waiting?.takeIf { it > 0 }?.let { " · $it" } ?: "")) })
            Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("Questions" + (open?.takeIf { it > 0 }?.let { " · $it" } ?: "")) })
        }
        if (tab == 0) ReviewsTab(reviews, vm, canManage) else QuestionsTab(questions, vm, canManage)
    }
}

@Composable
private fun ReviewsTab(state: LoadState<ReviewsResponse>, vm: ReviewsViewModel, canManage: Boolean) {
    val all by vm.allReviews.collectAsStateWithLifecycle()
    Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        FilterChip(selected = !all, onClick = { vm.setAllReviews(false) }, label = { Text("Waiting") })
        FilterChip(selected = all, onClick = { vm.setAllReviews(true) }, label = { Text("All") })
    }
    when (state) {
        is LoadState.Loading -> LoadingView()
        is LoadState.Failed -> ErrorView(state.error, { vm.loadReviews() })
        is LoadState.Ready -> PullToRefreshBox(isRefreshing = state.refreshing, onRefresh = { vm.loadReviews() }, modifier = Modifier.fillMaxSize()) {
            LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (state.data.reviews.isEmpty()) item { EmptyView(if (all) "No reviews yet" else "No reviews waiting", "New reviews from customers wait here for your approval.", Icons.Outlined.RateReview) }
                items(state.data.reviews, key = { it.id }) { r ->
                    ConstrainedColumn {
                        SectionCard {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                RemoteImage(r.product.imageUrl, r.product.name, size = 40.dp)
                                Spacer(Modifier.width(10.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(r.product.name, style = MaterialTheme.typography.titleSmall, maxLines = 1)
                                    Text("${r.author} · ${Dates.relative(r.createdAt)}" + (r.orderNumber?.let { " · order #$it" } ?: ""), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                            Row(Modifier.padding(top = 8.dp)) { repeat(5) { i -> Icon(Icons.Rounded.Star, null, tint = if (i < r.rating) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.outlineVariant, modifier = Modifier.size(18.dp)) } }
                            r.title?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 6.dp)) }
                            r.body?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 2.dp)) }
                            if (r.photos.isNotEmpty()) Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) { r.photos.take(3).forEach { RemoteImage(it, "Customer photo", size = 72.dp) } }
                            Spacer(Modifier.height(10.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                                Pill(if (r.approved) "Shown" else "Waiting", if (r.approved) Tone.Success else Tone.Warning)
                                if (r.featured) Pill("Featured", Tone.Brand)
                                Spacer(Modifier.weight(1f))
                                if (canManage) {
                                    if (r.approved) TextButton(onClick = { vm.feature(r, !r.featured) }) { Text(if (r.featured) "Unfeature" else "Feature") }
                                    if (r.approved) OutlinedButton(onClick = { vm.approve(r, false) }, shape = RoundedCornerShape(12.dp)) { Text("Hide") }
                                    else Button(onClick = { vm.approve(r, true) }, shape = RoundedCornerShape(12.dp)) { Text("Approve") }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun QuestionsTab(state: LoadState<QuestionsResponse>, vm: ReviewsViewModel, canManage: Boolean) {
    val all by vm.allQuestions.collectAsStateWithLifecycle()
    var answering by remember { mutableStateOf<QuestionRow?>(null) }
    var deleting by remember { mutableStateOf<QuestionRow?>(null) }
    Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        FilterChip(selected = !all, onClick = { vm.setAllQuestions(false) }, label = { Text("Unanswered") })
        FilterChip(selected = all, onClick = { vm.setAllQuestions(true) }, label = { Text("All") })
    }
    when (state) {
        is LoadState.Loading -> LoadingView()
        is LoadState.Failed -> ErrorView(state.error, { vm.loadQuestions() })
        is LoadState.Ready -> PullToRefreshBox(isRefreshing = state.refreshing, onRefresh = { vm.loadQuestions() }, modifier = Modifier.fillMaxSize()) {
            LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (state.data.questions.isEmpty()) item { EmptyView(if (all) "No questions yet" else "All questions answered", "Shoppers' questions on product pages appear here.", Icons.Outlined.QuestionAnswer) }
                items(state.data.questions, key = { it.id }) { q ->
                    ConstrainedColumn {
                        SectionCard {
                            Text(q.product.name, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(q.question, style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 4.dp))
                            Text("${q.name} · ${Dates.relative(q.createdAt)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            q.answer?.let { Text("Answer: $it", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 6.dp)) }
                            Spacer(Modifier.height(8.dp))
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Pill(if (q.answer == null) "Not answered" else if (q.published) "On the product page" else "Hidden", if (q.answer == null) Tone.Warning else if (q.published) Tone.Success else Tone.Neutral)
                                Spacer(Modifier.weight(1f))
                                if (canManage) {
                                    TextButton(onClick = { deleting = q }) { Text("Delete") }
                                    if (q.answer != null) TextButton(onClick = { vm.publish(q, !q.published) }) { Text(if (q.published) "Hide" else "Show") }
                                    Button(onClick = { answering = q }, shape = RoundedCornerShape(12.dp)) { Text(if (q.answer == null) "Answer" else "Edit") }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    answering?.let { q ->
        var text by remember { mutableStateOf(q.answer ?: "") }
        var publish by remember { mutableStateOf(q.answer == null || q.published) }
        AlertDialog(
            onDismissRequest = { answering = null },
            title = { Text("Answer") },
            text = {
                Column {
                    Text(q.question, style = MaterialTheme.typography.bodyMedium)
                    OutlinedTextField(text, { text = it.take(2000) }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp), minLines = 3)
                    Row(Modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("Show on the product page", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                        Switch(checked = publish, onCheckedChange = { publish = it })
                    }
                }
            },
            confirmButton = { Button(onClick = { vm.answer(q, text, publish); answering = null }, enabled = text.isNotBlank()) { Text("Save") } },
            dismissButton = { TextButton(onClick = { answering = null }) { Text("Cancel") } },
        )
    }
    deleting?.let { q -> ConfirmDialog("Delete this question?", "It's removed for good, with its answer.", "Delete", destructive = true, onConfirm = { vm.delete(q) }, onDismiss = { deleting = null }) }
}
