package com.yallahaul.admin.ui.chat

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Box
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
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Badge
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import com.yallahaul.admin.core.model.TeamHome
import com.yallahaul.admin.core.model.TeamMessage
import com.yallahaul.admin.core.network.ApiResult
import com.yallahaul.admin.core.network.AppError
import com.yallahaul.admin.ui.components.Avatar
import com.yallahaul.admin.ui.components.ConfirmDialog
import com.yallahaul.admin.ui.components.ConstrainedColumn
import com.yallahaul.admin.ui.components.ErrorView
import com.yallahaul.admin.ui.components.LoadingView
import com.yallahaul.admin.ui.components.LocalSnackbar
import com.yallahaul.admin.ui.navigation.Routes
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Team chat (the web's Admin › Team chat): the team room and direct chats between staff. */
@HiltViewModel
class TeamHomeViewModel @Inject constructor(private val repo: ChatRepository) : ViewModel() {
    private val _home = MutableStateFlow<TeamHome?>(null)
    val home: StateFlow<TeamHome?> = _home.asStateFlow()
    private val _error = MutableStateFlow<AppError?>(null)
    val error: StateFlow<AppError?> = _error.asStateFlow()
    private val _open = Channel<String>(Channel.BUFFERED)
    val open = _open.receiveAsFlow()

    suspend fun refresh() {
        when (val r = repo.teamHome()) {
            is ApiResult.Success -> { _home.value = r.data; _error.value = null }
            is ApiResult.Failure -> _error.value = r.error
        }
    }

    fun direct(userId: String) = viewModelScope.launch {
        (repo.teamDirect(userId) as? ApiResult.Success)?.data?.channelId?.let { _open.send(it) }
    }
}

@Composable
fun TeamHomeScreen(onBack: () -> Unit, open: (String) -> Unit, vm: TeamHomeViewModel = hiltViewModel()) {
    val home by vm.home.collectAsStateWithLifecycle()
    val error by vm.error.collectAsStateWithLifecycle()
    var picking by remember { mutableStateOf(false) }
    PollWhileVisible(10_000) { vm.refresh() }
    LaunchedEffect(Unit) { vm.open.collect { open(Routes.teamThread(it)) } }
    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            TopAppBar(
                title = { Text("Team chat") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
            val h = home
            when {
                h == null && error != null -> ErrorView(error!!, onRetry = null)
                h == null -> LoadingView()
                else -> LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 96.dp)) {
                    items(h.channels, key = { it.id }) { c ->
                        ConstrainedColumn {
                            Row(Modifier.fillMaxWidth().clickable { open(Routes.teamThread(c.id)) }.padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                                if (c.kind == "team") Icon(Icons.Outlined.Groups, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(8.dp)) else Avatar(c.title)
                                Spacer(Modifier.width(12.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(c.title, style = MaterialTheme.typography.titleSmall)
                                    Text(c.last ?: "No messages yet", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }
                                Column(horizontalAlignment = Alignment.End) {
                                    c.lastAt?.let { Text(chatTime(it), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                                    if (c.unread > 0) Badge { Text("${c.unread}") }
                                }
                            }
                            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                        }
                    }
                }
            }
        }
        if (home?.staff?.isNotEmpty() == true) ExtendedFloatingActionButton(
            onClick = { picking = true }, icon = { Icon(Icons.Rounded.Add, null) }, text = { Text("New chat") },
            modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp),
            containerColor = MaterialTheme.colorScheme.primary, contentColor = MaterialTheme.colorScheme.onPrimary,
        )
    }
    if (picking) AlertDialog(
        onDismissRequest = { picking = false },
        title = { Text("Message a colleague") },
        text = {
            Column {
                home?.staff?.forEach { p ->
                    Row(Modifier.fillMaxWidth().clickable { vm.direct(p.id); picking = false }.padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Avatar(p.name); Spacer(Modifier.width(12.dp)); Text(p.name, style = MaterialTheme.typography.bodyLarge)
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = { picking = false }) { Text("Cancel") } },
    )
}

@HiltViewModel
class TeamThreadViewModel @Inject constructor(private val repo: ChatRepository, saved: SavedStateHandle) : ViewModel() {
    val channelId: String = checkNotNull(saved["id"])
    private val _messagesList = MutableStateFlow<List<TeamMessage>?>(null)
    val list: StateFlow<List<TeamMessage>?> = _messagesList.asStateFlow()
    private val _error = MutableStateFlow<AppError?>(null)
    val error: StateFlow<AppError?> = _error.asStateFlow()
    private val _me = MutableStateFlow<Pair<String, String>?>(null)
    /** My id and the chat's title. */
    val me: StateFlow<Pair<String, String>?> = _me.asStateFlow()
    private val _isOwner = MutableStateFlow(false)
    val isOwner: StateFlow<Boolean> = _isOwner.asStateFlow()
    private val _sending = MutableStateFlow(false)
    val sending: StateFlow<Boolean> = _sending.asStateFlow()
    private val _toasts = Channel<String>(Channel.BUFFERED)
    val toasts = _toasts.receiveAsFlow()

    init {
        viewModelScope.launch {
            (repo.teamHome() as? ApiResult.Success)?.data?.let { h ->
                _me.value = h.me.id to (h.channels.firstOrNull { it.id == channelId }?.title ?: "Team chat")
                _isOwner.value = h.me.isOwner
            }
        }
    }

    suspend fun refresh() {
        when (val r = repo.teamMessages(channelId)) {
            is ApiResult.Success -> { _messagesList.value = r.data; _error.value = null }
            is ApiResult.Failure -> _error.value = r.error
        }
    }

    fun send(text: String, done: () -> Unit) = viewModelScope.launch {
        _sending.value = true
        when (val r = repo.teamSend(channelId, text)) {
            is ApiResult.Success -> { done(); refresh() }
            is ApiResult.Failure -> _toasts.send(r.error.message)
        }
        _sending.value = false
    }

    fun delete(id: String) = viewModelScope.launch {
        when (val r = repo.teamDelete(id)) {
            is ApiResult.Success -> refresh()
            is ApiResult.Failure -> _toasts.send(r.error.message)
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun TeamThreadScreen(onBack: () -> Unit, vm: TeamThreadViewModel = hiltViewModel()) {
    val messages by vm.list.collectAsStateWithLifecycle()
    val error by vm.error.collectAsStateWithLifecycle()
    val me by vm.me.collectAsStateWithLifecycle()
    val isOwner by vm.isOwner.collectAsStateWithLifecycle()
    val sending by vm.sending.collectAsStateWithLifecycle()
    val snackbar = LocalSnackbar.current
    var draft by remember { mutableStateOf("") }
    var deleting by remember { mutableStateOf<TeamMessage?>(null) }
    val list = rememberLazyListState()
    LaunchedEffect(Unit) { vm.toasts.collect { snackbar.showSnackbar(it) } }
    PollWhileVisible(5_000) { vm.refresh() }
    LaunchedEffect(messages?.size) { messages?.size?.takeIf { it > 0 }?.let { list.animateScrollToItem(it - 1) } }
    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text(me?.second ?: "Team chat") },
            navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
        )
        val m = messages
        when {
            m == null && error != null -> Column(Modifier.weight(1f)) { ErrorView(error!!, onRetry = null) }
            m == null -> Column(Modifier.weight(1f)) { LoadingView() }
            else -> LazyColumn(Modifier.weight(1f), state = list, contentPadding = PaddingValues(12.dp)) {
                if (m.isEmpty()) item { Text("No messages yet. Say hello!", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(16.dp)) }
                items(m, key = { it.id }) { msg ->
                    val mine = msg.authorId == me?.first
                    Box(Modifier.combinedClickable(onClick = {}, onLongClick = { if (!msg.deleted && (mine || isOwner)) deleting = msg })) {
                        ChatBubble(if (msg.deleted) "Message deleted" else msg.text, mine = mine, meta = (if (mine) "" else msg.authorName + " · ") + chatTime(msg.at))
                    }
                }
            }
        }
        Composer(draft, { draft = it.take(2000) }, { vm.send(draft) { draft = "" } }, enabled = !sending, placeholder = "Message")
    }
    deleting?.let { msg ->
        ConfirmDialog("Delete this message?", "It's removed for everyone in this chat.", "Delete", destructive = true, onConfirm = { vm.delete(msg.id) }, onDismiss = { deleting = null })
    }
}
