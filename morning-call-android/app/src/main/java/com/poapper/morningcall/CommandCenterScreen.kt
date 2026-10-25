package com.poapper.morningcall

import android.app.Activity
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
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
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Cloud
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Today
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import com.poapper.morningcall.alarm.LocalFallbackScheduler
import com.poapper.morningcall.model.AssistantTask
import com.poapper.morningcall.model.BriefingItem
import com.poapper.morningcall.model.BriefingSection
import com.poapper.morningcall.model.CharacterPreference
import com.poapper.morningcall.model.DayPeriod
import java.text.DateFormat
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Date
import java.util.Locale

private enum class CommandCenterTab(val label: String) {
    Today("오늘"),
    Chat("대화"),
    Settings("설정"),
}

@Composable
internal fun CommandCenterScreen(
    viewModel: MainViewModel,
    onConnectCalendar: () -> Unit,
    onRequestNotificationPermission: () -> Unit,
) {
    var selectedTab by rememberSaveable { mutableStateOf(CommandCenterTab.Today) }
    var showSubscriptionPaywall by rememberSaveable { mutableStateOf(false) }
    var dismissedRequiredPaywall by rememberSaveable { mutableStateOf(false) }
    val subscription by viewModel.subscriptionState.collectAsState()
    val context = androidx.compose.ui.platform.LocalContext.current

    LifecycleEventEffect(Lifecycle.Event.ON_START) {
        viewModel.onCommandCenterStarted()
    }

    LaunchedEffect(subscription.entitlement?.enforcementEnabled, subscription.isActive) {
        if (subscription.isActive) {
            showSubscriptionPaywall = false
            dismissedRequiredPaywall = false
        } else if (
            subscription.entitlement?.enforcementEnabled == true &&
            !dismissedRequiredPaywall
        ) {
            showSubscriptionPaywall = true
        }
    }

    Scaffold(
        containerColor = Color(0xFFF7F4ED),
        bottomBar = {
            NavigationBar(containerColor = Color(0xFFFFFBF4)) {
                CommandCenterTab.entries.forEach { tab ->
                    NavigationBarItem(
                        selected = selectedTab == tab,
                        onClick = { selectedTab = tab },
                        icon = {
                            Icon(
                                when (tab) {
                                    CommandCenterTab.Today -> Icons.Filled.Today
                                    CommandCenterTab.Chat -> Icons.AutoMirrored.Filled.Chat
                                    CommandCenterTab.Settings -> Icons.Filled.Settings
                                },
                                contentDescription = tab.label,
                            )
                        },
                        label = { Text(tab.label) },
                    )
                }
            }
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            when (selectedTab) {
                CommandCenterTab.Today -> TodayTab(
                    viewModel = viewModel,
                    onOpenSettings = { selectedTab = CommandCenterTab.Settings },
                )
                CommandCenterTab.Chat -> ChatTab(viewModel)
                CommandCenterTab.Settings -> SettingsTab(
                    viewModel = viewModel,
                    onConnectCalendar = onConnectCalendar,
                    onRequestNotificationPermission = onRequestNotificationPermission,
                    onOpenPaywall = { showSubscriptionPaywall = true },
                )
            }
        }
    }

    if (showSubscriptionPaywall) {
        SubscriptionPaywallDialog(
            price = subscription.localizedMonthlyPrice,
            isLoading = subscription.isLoading,
            error = subscription.error,
            onPurchase = { (context as? Activity)?.let(viewModel::purchaseMonthly) },
            onRestore = viewModel::restorePurchases,
            onDismiss = {
                dismissedRequiredPaywall = true
                showSubscriptionPaywall = false
            },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TodayTab(viewModel: MainViewModel, onOpenSettings: () -> Unit) {
    val state by viewModel.assistantState.collectAsState()
    val appState by viewModel.state.collectAsState()
    var showAddTask by rememberSaveable { mutableStateOf(false) }
    val briefing = state.briefing
    val scheduleSection = briefing?.sections?.firstOrNull { it.type == "schedule" }
    val otherSections = briefing?.sections.orEmpty().filterNot {
        it.type == "schedule" || it.type == "tasks"
    }

    PullToRefreshBox(
        isRefreshing = state.isRefreshing,
        onRefresh = viewModel::refreshAssistant,
        modifier = Modifier.fillMaxSize(),
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            briefing?.greeting?.takeIf { it.isNotBlank() }
                                ?: "${appState.user?.name ?: "오늘"}님, 좋은 하루예요.",
                            fontSize = 28.sp,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            briefingDateText(briefing?.date),
                            color = Color.Black.copy(alpha = 0.56f),
                            fontWeight = FontWeight.Medium,
                        )
                    }
                    IconButton(onClick = viewModel::refreshAssistant, enabled = !state.isRefreshing) {
                        Icon(Icons.Filled.Refresh, contentDescription = "새로고침")
                    }
                }
            }

            if (state.isStale) {
                item {
                    StatusBanner(
                        text = "저장된 정보이며 최신이 아닐 수 있어요. 아래로 당기면 다시 확인해요.",
                        background = Color(0xFFFFF1D6),
                    )
                }
            }
            state.error?.let { error ->
                item {
                    StatusBanner(text = error, background = Color(0xFFFFE5E2))
                }
            }

            if (state.isLoading && briefing == null) {
                item {
                    Box(
                        Modifier.fillMaxWidth().height(180.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator()
                    }
                }
            } else {
                item {
                    SummaryCard(
                        summary = briefing?.summary,
                        provider = briefing?.ai?.provider
                            ?.takeIf { it.isNotBlank() }
                            ?: state.providerStatus?.provider,
                        model = briefing?.ai?.model
                            ?.takeIf { it.isNotBlank() }
                            ?: state.providerStatus?.model,
                        fallback = briefing?.ai?.fallback == true,
                        configured = state.providerStatus?.configured,
                        onOpenSettings = onOpenSettings,
                    )
                }

                item {
                    BriefingSectionCard(
                        icon = Icons.Filled.CalendarMonth,
                        defaultTitle = "오늘 일정",
                        section = scheduleSection,
                        emptyMessage = if (appState.calendarConnected) {
                            "오늘 예정된 일정이 없어요."
                        } else {
                            "캘린더를 연결하면 오늘 일정을 모아서 보여드려요."
                        },
                        onUnavailable = onOpenSettings,
                    )
                }

                item {
                    TasksCard(
                        tasks = state.tasks,
                        mutatingIds = state.mutatingTaskIds,
                        onAdd = { showAddTask = true },
                        onComplete = viewModel::setTaskCompleted,
                        onDelete = viewModel::deleteTask,
                    )
                }

                items(otherSections, key = { "${it.type}:${it.title}" }) { section ->
                    BriefingSectionCard(
                        icon = Icons.Filled.Cloud,
                        defaultTitle = section.title.ifBlank { "참고할 정보" },
                        section = section,
                        emptyMessage = "지금 표시할 항목이 없어요.",
                    )
                }
            }

            state.updatedAtMillis?.let { updated ->
                item {
                    Text(
                        "마지막 업데이트 ${formatUpdatedAt(updated)}",
                        modifier = Modifier.fillMaxWidth(),
                        color = Color.Black.copy(alpha = 0.45f),
                        fontSize = 12.sp,
                        textAlign = TextAlign.Center,
                    )
                }
            }
        }
    }

    if (showAddTask) {
        AddTaskDialog(
            isSaving = MainViewModel.NEW_TASK_ID in state.mutatingTaskIds,
            onDismiss = { showAddTask = false },
            onSave = { title, highPriority ->
                viewModel.createTask(title, highPriority)
                showAddTask = false
            },
        )
    }
}

@Composable
private fun SummaryCard(
    summary: String?,
    provider: String?,
    model: String?,
    fallback: Boolean,
    configured: Boolean?,
    onOpenSettings: () -> Unit,
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Color(0xFF20262E)),
        shape = RoundedCornerShape(24.dp),
    ) {
        Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("지금 중요한 것", color = Color.White.copy(alpha = 0.72f), fontWeight = FontWeight.Bold)
                Surface(
                    color = if (configured == false || fallback) Color(0xFF704C35) else Color(0xFF35485E),
                    shape = RoundedCornerShape(50),
                ) {
                    Text(
                        providerLabel(provider, model, fallback),
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                        color = Color.White,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
            Text(
                summary?.takeIf { it.isNotBlank() }
                    ?: "일정과 할 일을 새로고침하면 오늘의 우선순위를 정리해 드릴게요.",
                color = Color.White,
                fontSize = 19.sp,
                lineHeight = 28.sp,
                fontWeight = FontWeight.Medium,
            )
            if (configured == false) {
                TextButton(onClick = onOpenSettings) {
                    Text("서버의 Claude 설정 확인", color = Color(0xFFB8D4FF))
                }
            }
        }
    }
}

@Composable
private fun BriefingSectionCard(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    defaultTitle: String,
    section: BriefingSection?,
    emptyMessage: String,
    onUnavailable: (() -> Unit)? = null,
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Color.White.copy(alpha = 0.94f)),
        shape = RoundedCornerShape(22.dp),
    ) {
        Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(icon, contentDescription = null, tint = Color(0xFF526D82))
                Spacer(Modifier.width(10.dp))
                Text(section?.title?.ifBlank { defaultTitle } ?: defaultTitle, fontSize = 19.sp, fontWeight = FontWeight.Bold)
            }
            when {
                section == null || section.status == "unavailable" -> {
                    Text(
                        if (section == null) emptyMessage else "이 정보를 지금 불러오지 못했어요.",
                        color = Color.Black.copy(alpha = 0.58f),
                    )
                    if (onUnavailable != null) {
                        TextButton(onClick = onUnavailable) { Text("설정 확인") }
                    }
                }
                section.status == "empty" || section.items.isEmpty() -> {
                    Text(emptyMessage, color = Color.Black.copy(alpha = 0.58f))
                }
                else -> section.items.forEachIndexed { index, item ->
                    BriefingItemRow(item)
                    if (index != section.items.lastIndex) HorizontalDivider(color = Color.Black.copy(alpha = 0.08f))
                }
            }
        }
    }
}

@Composable
private fun BriefingItemRow(item: BriefingItem) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
        Icon(
            Icons.Filled.Schedule,
            contentDescription = null,
            modifier = Modifier.size(18.dp).padding(top = 2.dp),
            tint = Color(0xFF789CEB),
        )
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(item.title.ifBlank { "제목 없는 항목" }, fontWeight = FontWeight.SemiBold)
            item.subtitle?.takeIf { it.isNotBlank() }?.let {
                Text(it, color = Color.Black.copy(alpha = 0.55f), fontSize = 13.sp)
            }
            val time = formatScheduleRange(item.startAt, item.endAt)
                ?: item.dueAt?.let { "마감 ${formatDateTime(it)}" }
            time?.let { Text(it, color = Color.Black.copy(alpha = 0.55f), fontSize = 13.sp) }
        }
    }
}

@Composable
private fun TasksCard(
    tasks: List<AssistantTask>,
    mutatingIds: Set<String>,
    onAdd: () -> Unit,
    onComplete: (AssistantTask, Boolean) -> Unit,
    onDelete: (AssistantTask) -> Unit,
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Color.White.copy(alpha = 0.94f)),
        shape = RoundedCornerShape(22.dp),
    ) {
        Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = Color(0xFF4D7A62))
                    Spacer(Modifier.width(10.dp))
                    Text("해야 할 일", fontSize = 19.sp, fontWeight = FontWeight.Bold)
                }
                FilledTonalButton(onClick = onAdd, enabled = MainViewModel.NEW_TASK_ID !in mutatingIds) {
                    Icon(Icons.Filled.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("추가")
                }
            }
            if (tasks.isEmpty()) {
                Text("남아 있는 할 일이 없어요.", color = Color.Black.copy(alpha = 0.58f))
            } else {
                tasks.forEachIndexed { index, task ->
                    val busy = task.id in mutatingIds
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        if (busy) {
                            Box(Modifier.size(48.dp), contentAlignment = Alignment.Center) {
                                CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                            }
                        } else {
                            Checkbox(
                                checked = task.completed,
                                onCheckedChange = { onComplete(task, it) },
                            )
                        }
                        Column(Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    task.title,
                                    modifier = Modifier.weight(1f, fill = false),
                                    fontWeight = FontWeight.Medium,
                                    maxLines = 2,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                if (task.priority == "high") {
                                    Text(
                                        "중요",
                                        modifier = Modifier.padding(start = 8.dp),
                                        color = Color(0xFFB34B36),
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Bold,
                                    )
                                }
                            }
                            task.dueAt?.let {
                                Text("마감 ${formatDateTime(it)}", color = Color.Black.copy(alpha = 0.5f), fontSize = 12.sp)
                            }
                        }
                        IconButton(onClick = { onDelete(task) }, enabled = !busy) {
                            Icon(Icons.Filled.Delete, contentDescription = "삭제", tint = Color.Black.copy(alpha = 0.45f))
                        }
                    }
                    if (index != tasks.lastIndex) HorizontalDivider(color = Color.Black.copy(alpha = 0.08f))
                }
            }
        }
    }
}

@Composable
private fun AddTaskDialog(
    isSaving: Boolean,
    onDismiss: () -> Unit,
    onSave: (String, Boolean) -> Unit,
) {
    var title by rememberSaveable { mutableStateOf("") }
    var highPriority by rememberSaveable { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = { if (!isSaving) onDismiss() },
        title = { Text("할 일 추가") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it },
                    label = { Text("해야 할 일") },
                    modifier = Modifier.fillMaxWidth(),
                    maxLines = 3,
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("중요한 일로 표시")
                    Switch(checked = highPriority, onCheckedChange = { highPriority = it })
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { onSave(title.trim(), highPriority) },
                enabled = title.isNotBlank() && !isSaving,
            ) {
                Text(if (isSaving) "저장 중" else "저장")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !isSaving) { Text("취소") } },
    )
}

@Composable
private fun ChatTab(viewModel: MainViewModel) {
    val state by viewModel.chatState.collectAsState()
    val dashboard by viewModel.assistantState.collectAsState()
    var input by rememberSaveable { mutableStateOf("") }
    val listState = rememberLazyListState()
    val suggestions = listOf(
        "오늘 가장 먼저 해야 할 일은 뭐야?",
        "이번 주 중요한 마감이 있어?",
        "내 일정과 할 일을 짧게 정리해줘.",
    )

    LaunchedEffect(state.messages.size) {
        if (state.messages.isNotEmpty()) listState.animateScrollToItem(state.messages.lastIndex)
    }

    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 12.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text("어시스턴트", fontSize = 28.sp, fontWeight = FontWeight.Bold)
                Text(
                    providerLabel(
                        dashboard.providerStatus?.provider,
                        dashboard.providerStatus?.model,
                        fallback = false,
                    ),
                    color = Color.Black.copy(alpha = 0.5f),
                    fontSize = 12.sp,
                )
            }
        }

        LazyColumn(
            state = listState,
            modifier = Modifier.weight(1f).fillMaxWidth(),
            contentPadding = PaddingValues(vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (state.messages.isEmpty()) {
                item {
                    Card(
                        colors = CardDefaults.cardColors(containerColor = Color.White.copy(alpha = 0.9f)),
                        shape = RoundedCornerShape(22.dp),
                    ) {
                        Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            Text("무엇이든 물어보세요", fontSize = 19.sp, fontWeight = FontWeight.Bold)
                            Text(
                                "서버에 저장된 일정, 할 일, 최근 메모리를 바탕으로 답해요.",
                                color = Color.Black.copy(alpha = 0.58f),
                            )
                            suggestions.forEach { suggestion ->
                                OutlinedButton(
                                    onClick = { viewModel.sendChat(suggestion) },
                                    modifier = Modifier.fillMaxWidth(),
                                    enabled = !state.isSending,
                                ) {
                                    Text(suggestion, textAlign = TextAlign.Start, modifier = Modifier.fillMaxWidth())
                                }
                            }
                        }
                    }
                }
            }
            items(state.messages, key = { it.id }) { message ->
                ChatBubble(message)
            }
            if (state.isSending) {
                item {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                        Spacer(Modifier.width(10.dp))
                        Text("답변을 정리하고 있어요…", color = Color.Black.copy(alpha = 0.55f))
                    }
                }
            }
            state.error?.let { error ->
                item { StatusBanner(error, Color(0xFFFFE5E2)) }
            }
        }

        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
            OutlinedTextField(
                value = input,
                onValueChange = { input = it },
                modifier = Modifier.weight(1f),
                placeholder = { Text("오늘 무엇을 확인할까요?") },
                maxLines = 4,
                enabled = !state.isSending,
            )
            Spacer(Modifier.width(8.dp))
            IconButton(
                onClick = {
                    val message = input
                    input = ""
                    viewModel.sendChat(message)
                },
                enabled = input.isNotBlank() && !state.isSending,
            ) {
                Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "보내기")
            }
        }
    }
}

@Composable
private fun ChatBubble(message: ChatUiMessage) {
    val isUser = message.role == "user"
    Box(
        modifier = Modifier.fillMaxWidth(),
        contentAlignment = if (isUser) Alignment.CenterEnd else Alignment.CenterStart,
    ) {
        Card(
            modifier = Modifier.fillMaxWidth(if (isUser) 0.84f else 0.92f),
            colors = CardDefaults.cardColors(
                containerColor = if (isUser) Color(0xFF526D82) else Color.White,
            ),
            shape = RoundedCornerShape(20.dp),
        ) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Text(
                    message.content,
                    color = if (isUser) Color.White else Color(0xFF202124),
                    lineHeight = 22.sp,
                )
                if (!isUser && (!message.provider.isNullOrBlank() || message.fallback)) {
                    Text(
                        providerLabel(message.provider, null, message.fallback),
                        color = Color.Black.copy(alpha = 0.42f),
                        fontSize = 10.sp,
                    )
                }
            }
        }
    }
}

@Composable
private fun SettingsTab(
    viewModel: MainViewModel,
    onConnectCalendar: () -> Unit,
    onRequestNotificationPermission: () -> Unit,
    onOpenPaywall: () -> Unit,
) {
    val appState by viewModel.state.collectAsState()
    val dashboard by viewModel.assistantState.collectAsState()
    val settings by viewModel.assistantSettings.collectAsState()
    val subscription by viewModel.subscriptionState.collectAsState()
    val context = androidx.compose.ui.platform.LocalContext.current
    var backendDraft by remember(settings.backendUrl) { mutableStateOf(settings.backendUrl) }
    var languageExpanded by remember { mutableStateOf(false) }
    var editAlarm by remember { mutableStateOf<Pair<Int, com.poapper.morningcall.model.Alarm?>?>(null) }
    val exactAlarmIntent = LocalFallbackScheduler.exactAlarmSettingsIntent(context)

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Text("설정", fontSize = 28.sp, fontWeight = FontWeight.Bold)
            Text("서버 연결과 기존 모닝콜 기능을 관리해요.", color = Color.Black.copy(alpha = 0.55f))
        }

        item {
            SettingsSection("어시스턴트 서버", Icons.Filled.Cloud) {
                OutlinedTextField(
                    value = backendDraft,
                    onValueChange = { backendDraft = it },
                    label = { Text("Backend URL") },
                    supportingText = { Text("Claude API 키는 서버에만 저장되며 앱에는 노출되지 않아요.") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Button(
                    onClick = { viewModel.saveBackendUrl(backendDraft) },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("서버 주소 저장 및 확인") }
                HorizontalDivider()
                val provider = dashboard.providerStatus
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("AI provider", fontWeight = FontWeight.SemiBold)
                        Text(
                            providerLabel(provider?.provider, provider?.model, fallback = false),
                            color = Color.Black.copy(alpha = 0.55f),
                            fontSize = 13.sp,
                        )
                    }
                    Text(
                        when (provider?.configured) {
                            true -> "키 설정됨"
                            false -> "설정 필요"
                            null -> "확인 중"
                        },
                        color = if (provider?.configured == true) Color(0xFF3E7653) else Color(0xFFB05E39),
                        fontWeight = FontWeight.Bold,
                    )
                }
                TextButton(onClick = viewModel::refreshAssistantStatus) { Text("상태 다시 확인") }
                settings.error?.let { Text(it, color = Color(0xFFB3261E), fontSize = 13.sp) }
            }
        }

        item {
            SettingsSection("Calendar", Icons.Filled.CalendarMonth) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(if (appState.calendarConnected) "Google Calendar 연결됨" else "캘린더 연결 안 됨", fontWeight = FontWeight.SemiBold)
                        Text(
                            "오늘 일정은 서버에서 읽어 브리핑에 포함해요.",
                            color = Color.Black.copy(alpha = 0.55f),
                            fontSize = 13.sp,
                        )
                    }
                    TextButton(
                        onClick = { if (appState.calendarConnected) viewModel.disconnectCalendar() else onConnectCalendar() },
                    ) { Text(if (appState.calendarConnected) "연결 해제" else "연결") }
                }
            }
        }

        item {
            SettingsSection("Refresh & notifications", Icons.Filled.Notifications) {
                PreferenceSwitch(
                    title = "앱을 열 때 자동 새로고침",
                    subtitle = "끄면 저장된 브리핑을 먼저 보여줘요.",
                    checked = settings.refreshOnOpen,
                    onCheckedChange = viewModel::setRefreshOnOpen,
                )
                HorizontalDivider()
                PreferenceSwitch(
                    title = "Assistant 알림",
                    subtitle = "마감, 일정, 중요한 브리핑 알림을 받아요.",
                    checked = settings.assistantNotificationsEnabled,
                    onCheckedChange = { enabled ->
                        viewModel.setAssistantNotificationsEnabled(enabled)
                        if (enabled) onRequestNotificationPermission()
                    },
                )
            }
        }

        item {
            SettingsSection("Alarms & calls", Icons.Filled.Phone) {
                val next = viewModel.nextAlarmSummary()
                Text(
                    if (next == null) "예약된 모닝콜이 없어요."
                    else "다음 모닝콜: ${next.second.toLocalDate()} ${next.first.time}",
                    color = Color.Black.copy(alpha = 0.62f),
                )
                WeeklySection(appState.alarms) { day, alarm -> editAlarm = day to alarm }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { viewModel.testCall("gentle") }, modifier = Modifier.weight(1f)) {
                        Text("테스트 전화")
                    }
                    OutlinedButton(
                        onClick = { exactAlarmIntent?.let(context::startActivity) },
                        modifier = Modifier.weight(1f),
                        enabled = exactAlarmIntent != null,
                    ) {
                        Text(if (exactAlarmIntent == null) "정확한 알람 허용됨" else "알람 권한")
                    }
                }
            }
        }

        item {
            SettingsSection("Personalization", Icons.Filled.Settings) {
                Box {
                    OutlinedButton(onClick = { languageExpanded = true }) {
                        Text("언어: ${appState.selectedLanguage}")
                    }
                    DropdownMenu(expanded = languageExpanded, onDismissRequest = { languageExpanded = false }) {
                        listOf("한국어", "English", "日本語").forEach { language ->
                            DropdownMenuItem(
                                text = { Text(language) },
                                onClick = {
                                    languageExpanded = false
                                    viewModel.saveLanguage(language)
                                },
                            )
                        }
                    }
                }
                CharacterPreference.entries.forEach { character ->
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Image(
                            painterResource(characterFor(character, DayPeriod.Morning)),
                            contentDescription = null,
                            modifier = Modifier.size(48.dp),
                        )
                        Spacer(Modifier.width(10.dp))
                        Text(character.displayName, modifier = Modifier.weight(1f))
                        if (appState.selectedCharacter == character) {
                            Icon(Icons.Filled.CheckCircle, contentDescription = "선택됨", tint = Color(0xFF789CEB))
                        } else {
                            TextButton(onClick = { viewModel.selectCharacter(character) }) { Text("선택") }
                        }
                    }
                }
            }
        }

        item {
            SettingsSection("Haru Plus", Icons.Filled.CheckCircle) {
                Text(
                    when {
                        subscription.isTrial -> "무료 체험 이용 중"
                        subscription.isActive -> "구독 이용 중"
                        else -> "구독하지 않음"
                    },
                    fontWeight = FontWeight.Bold,
                )
                Button(
                    onClick = {
                        if (subscription.isActive) {
                            context.startActivity(
                                Intent(
                                    Intent.ACTION_VIEW,
                                    Uri.parse("https://play.google.com/store/account/subscriptions?package=${context.packageName}"),
                                ),
                            )
                        } else {
                            onOpenPaywall()
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(if (subscription.isActive) "구독 관리" else "구독 보기") }
            }
        }

        appState.error?.let { error -> item { StatusBanner(error, Color(0xFFFFE5E2)) } }
        item {
            TextButton(onClick = viewModel::signOut, modifier = Modifier.fillMaxWidth()) {
                Text("로그아웃", color = Color(0xFFB3261E))
            }
        }
    }

    editAlarm?.let { (day, alarm) ->
        AlarmEditorDialog(
            day = day,
            alarm = alarm,
            onDismiss = { editAlarm = null },
            onSave = { time, style ->
                viewModel.saveWeekdayAlarm(day, alarm, time, style)
                editAlarm = null
            },
            onDelete = {
                alarm?.let(viewModel::deleteAlarm)
                editAlarm = null
            },
        )
    }
}

@Composable
private fun SettingsSection(
    title: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    content: @Composable ColumnScope.() -> Unit,
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Color.White.copy(alpha = 0.94f)),
        shape = RoundedCornerShape(22.dp),
    ) {
        Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(icon, contentDescription = null, tint = Color(0xFF526D82))
                Spacer(Modifier.width(10.dp))
                Text(title, fontSize = 18.sp, fontWeight = FontWeight.Bold)
            }
            content()
        }
    }
}

@Composable
private fun PreferenceSwitch(
    title: String,
    subtitle: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, fontWeight = FontWeight.SemiBold)
            Text(subtitle, color = Color.Black.copy(alpha = 0.55f), fontSize = 13.sp)
        }
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}

@Composable
private fun StatusBanner(text: String, background: Color) {
    Surface(color = background, shape = RoundedCornerShape(16.dp)) {
        Text(text, Modifier.fillMaxWidth().padding(14.dp), fontSize = 13.sp)
    }
}

private fun providerLabel(provider: String?, model: String?, fallback: Boolean): String {
    val name = when (provider?.lowercase()) {
        "claude", "anthropic" -> "Claude"
        "gemini", "google" -> "Gemini"
        null, "", "unknown" -> "AI 상태 미확인"
        else -> provider.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
    }
    val modelLabel = model?.takeIf { it.isNotBlank() }?.let { " · $it" }.orEmpty()
    val fallbackLabel = if (fallback) " · fallback" else ""
    return name + modelLabel + fallbackLabel
}

private fun briefingDateText(rawDate: String?): String {
    val date = rawDate?.let { runCatching { LocalDate.parse(it) }.getOrNull() } ?: LocalDate.now()
    return date.format(DateTimeFormatter.ofPattern("M월 d일 EEEE", Locale.KOREAN))
}

private fun formatScheduleRange(start: String?, end: String?): String? {
    if (start.isNullOrBlank()) return null
    if (!start.contains('T')) return "종일"
    val startText = formatDateTime(start)
    val endText = end?.takeIf { it.isNotBlank() }?.let(::formatTimeOnly)
    return if (endText.isNullOrBlank()) startText else "$startText–$endText"
}

private fun formatDateTime(value: String): String {
    if (!value.contains('T')) {
        return runCatching {
            LocalDate.parse(value).format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(Locale.KOREAN))
        }.getOrDefault(value)
    }
    val zoned = parseDateTime(value) ?: return value
    return zoned.format(DateTimeFormatter.ofPattern("M월 d일 HH:mm", Locale.KOREAN))
}

private fun formatTimeOnly(value: String): String {
    val zoned = parseDateTime(value) ?: return value
    return zoned.format(DateTimeFormatter.ofPattern("HH:mm", Locale.KOREAN))
}

private fun parseDateTime(value: String): ZonedDateTime? {
    val zone = ZoneId.systemDefault()
    return runCatching { OffsetDateTime.parse(value).atZoneSameInstant(zone) }.getOrNull()
        ?: runCatching { ZonedDateTime.parse(value).withZoneSameInstant(zone) }.getOrNull()
        ?: runCatching { Instant.parse(value).atZone(zone) }.getOrNull()
        ?: runCatching { LocalDateTime.parse(value).atZone(zone) }.getOrNull()
}

private fun formatUpdatedAt(value: Long): String =
    DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT, Locale.KOREAN).format(Date(value))
