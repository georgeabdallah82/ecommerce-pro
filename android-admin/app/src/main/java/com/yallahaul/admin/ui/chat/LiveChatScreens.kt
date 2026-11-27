package com.yallahaul.admin.ui.chat

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.outlined.Forum
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.yallahaul.admin.core.data.ChatRepository
import com.yallahaul.admin.core.model.LiveInboxResponse
import com.yallahaul.admin.core.model.LiveThread
import com.yallahaul.admin.core.network.ApiResult
import com.yallahaul.admin.core.network.AppError
import com.yallahaul.admin.ui.components.Avatar
import com.yallahaul.admin.ui.components.ConstrainedColumn
import com.yallahaul.admin.ui.components.EmptyView
import com.yallahaul.admin.ui.components.ErrorView
import com.yallahaul.admin.ui.components.InlineError
import com.yallahaul.admin.ui.components.LoadingView
import com.yallahaul.admin.ui.components.LocalSnackbar
import com.yallahaul.admin.ui.components.Pill
import com.yallahaul.admin.ui.components.SectionCard
import com.yallahaul.admin.ui.components.Tone
import com.yallahaul.admin.ui.navigation.Routes
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Live chat inbox (the web's Admin › Online store › Live chat): the "I'm online" switch and the chats. */
@HiltViewModel
class LiveInboxViewModel @Inject constructor(private val repo: ChatRepository) : ViewModel() {
    private val _data = MutableStateFlow<LiveInboxResponse?>(null)
    val data: StateFlow<LiveInboxResponse?> = _data.asStateFlow()
    private val _error = MutableStateFlow<AppError?>(null)
    val error: StateFlow<AppError?> = _error.asStateFlow()
    private val _messages = Channel<String>(Channel.BUFFERED)
    val messages = _messages.receiveAsFlow()

    suspend fun refresh() {
        when (val r = repo.liveInbox()) {
            is ApiResult.Success -> { _data.value = r.data; _error.value = null }
            is ApiResult.Failure -> _error.value = r.error
        }
    }

    fun setOnline(online: Boolean) = viewModelScope.launch {
        when (val r = repo.setOnline(online)) {
            is ApiResult.Success -> { _data.value = _data.value?.copy(presence = r.data); _messages.send(if (online) "You're online: shoppers' messages come to you" else "You're offline: the AI assistant answers") }
            is ApiResult.Failure -> _messages.send(r.error.message)
        }
    }
}

@Composable
fun LiveInboxScreen(onBack: () -> Unit, open: (String) -> Unit, vm: LiveInboxViewModel = hiltViewModel()) {
    val data by vm.data.collectAsStateWithLifecycle()
    val error by vm.error.collectAsStateWithLifecycle()
    val snackbar = LocalSnackbar.current
    LaunchedEffect(Unit) { vm.messages.collect { snackbar.showSnackbar(it) } }
    PollWhileVisible(8_000) { vm.refresh() }
    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("Live chat") },
            navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
        )
        val d = data
        when {
            d == null && error != null -> ErrorView(error!!, onRetry = null)
            d == null -> LoadingView()
            else -> LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp)) {
                item {
                    ConstrainedColumn {
                        SectionCard {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Text(if (d.presence.online) "You're online" else "Offline", style = MaterialTheme.typography.titleMedium)
                                    Text(
                                        when {
                                            !d.available -> "Live chat only works on the live store."
                                            d.presence.online -> "Shoppers' messages come to the team${d.presence.name.takeIf { it.isNotBlank() }?.let { " ($it)" } ?: ""}. If nobody answers in 3 minutes, the AI steps in."
                                            else -> "The AI assistant answers shoppers. Turn on to answer them yourself."
                                        },
                                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                Switch(checked = d.presence.online, onCheckedChange = vm::setOnline, enabled = d.available)
                            }
                        }
                    }
                }
                if (error != null) item { InlineError(error!!.message) }
                if (d.inbox.isEmpty()) item { EmptyView("No chats right now", "Shoppers' chats from the shop appear here.", Icons.Outlined.Forum) }
                items(d.inbox, key = { it.id }) { chat ->
                    ConstrainedColumn {
                        Row(Modifier.fillMaxWidth().clickable { open(Routes.liveThread(chat.id)) }.padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Avatar(chat.customer ?: "Shopper")
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(chat.customer ?: "Shopper", style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                                    Text(chatTime(chat.last?.at ?: chat.updatedAt), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                Text(chat.last?.text ?: "", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                if (chat.waitingSince != null) Pill("Waiting since ${chatTime(chat.waitingSince).lowercase()}", Tone.Warning, Modifier.padding(top = 4.dp))
                            }
                        }
                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    }
                }
            }
        }
    }
}

@HiltViewModel
class LiveThreadViewModel @Inject constructor(private val repo: ChatRepository, saved: SavedStateHandle) : ViewModel() {
    private val id: String = checkNotNull(saved["id"])
    private val _thread = MutableStateFlow<LiveThread?>(null)
    val thread: StateFlow<LiveThread?> = _thread.asStateFlow()
    private val _error = MutableStateFlow<AppError?>(null)
    val error: StateFlow<AppError?> = _error.asStateFlow()
    private val _sending = MutableStateFlow(false)
    val sending: StateFlow<Boolean> = _sending.asStateFlow()
    private val _messages = Channel<String>(Channel.BUFFERED)
    val messages = _messages.receiveAsFlow()

    suspend fun refresh() {
        when (val r = repo.liveThread(id)) {
            is ApiResult.Success -> { _thread.value = r.data; _error.value = null }
            is ApiResult.Failure -> _error.value = r.error
        }
    }

    fun reply(text: String, done: () -> Unit) = viewModelScope.launch {
        _sending.value = true
        when (val r = repo.liveReply(id, text)) {
            is ApiResult.Success -> { done(); refresh() }
            is ApiResult.Failure -> _messages.send(r.error.message)
        }
        _sending.value = false
    }
}

@Composable
fun LiveThreadScreen(onBack: () -> Unit, vm: LiveThreadViewModel = hiltViewModel()) {
    val thread by vm.thread.collectAsStateWithLifecycle()
    val error by vm.error.collectAsStateWithLifecycle()
    val sending by vm.sending.collectAsStateWithLifecycle()
    val snackbar = LocalSnackbar.current
    var draft by remember { mutableStateOf("") }
    val list = rememberLazyListState()
    LaunchedEffect(Unit) { vm.messages.collect { snackbar.showSnackbar(it) } }
    PollWhileVisible(5_000) { vm.refresh() }
    LaunchedEffect(thread?.messages?.size) { thread?.messages?.size?.takeIf { it > 0 }?.let { list.animateScrollToItem(it - 1) } }
    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text(thread?.customer?.name ?: "Shopper") },
            navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
        )
        val t = thread
        when {
            t == null && error != null -> Column(Modifier.weight(1f)) { ErrorView(error!!, onRetry = null) }
            t == null -> Column(Modifier.weight(1f)) { LoadingView() }
            else -> LazyColumn(Modifier.weight(1f), state = list, contentPadding = PaddingValues(12.dp)) {
                items(t.messages, key = { it.id }) { m ->
                    val who = when (m.role) { "agent" -> m.author ?: "Team"; "assistant" -> "AI assistant"; else -> "Shopper" }
                    ChatBubble(m.text, mine = m.role != "user", meta = "$who · ${chatTime(m.at)}", tone = if (m.role == "assistant") MaterialTheme.colorScheme.secondaryContainer else null)
                }
            }
        }
        Composer(draft, { draft = it.take(2000) }, { vm.reply(draft) { draft = "" } }, enabled = !sending && thread != null, placeholder = "Reply to the shopper")
    }
}
