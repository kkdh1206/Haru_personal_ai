package com.poapper.morningcall

import android.Manifest
import android.app.Activity
import android.os.Build
import android.os.Bundle
import android.content.Intent
import android.net.Uri
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.TimePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.poapper.morningcall.model.Alarm
import com.poapper.morningcall.model.CharacterPreference
import com.poapper.morningcall.model.DayPeriod
import com.poapper.morningcall.model.OnboardingStep
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

class MainActivity : ComponentActivity() {
    private val viewModel: MainViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                HaruApp(viewModel)
            }
        }
    }
}

@Composable
private fun HaruApp(viewModel: MainViewModel) {
    val state by viewModel.state.collectAsState()
    val signIn = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        viewModel.handleGoogleResult(it.data)
    }
    val calendarSignIn = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        viewModel.handleCalendarResult(it.data)
    }
    val notificationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}

    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    Surface(Modifier.fillMaxSize(), color = Color(0xFFF7F4ED)) {
        if (!state.isLoggedIn) {
            LoginScreen { signIn.launch(viewModel.googleIntent()) }
            return@Surface
        }

        when (state.onboardingStep) {
            OnboardingStep.Loading -> LoadingScreen(
                error = state.error,
                onRetry = viewModel::bootstrap,
                onLogout = viewModel::signOut,
            )
            OnboardingStep.EnterName -> EnterNameScreen(viewModel::saveName)
            OnboardingStep.RequestLocation -> LocationScreen(viewModel::saveLocation)
            OnboardingStep.Completed -> CommandCenterScreen(
                viewModel = viewModel,
                onConnectCalendar = { calendarSignIn.launch(viewModel.calendarIntent()) },
                onRequestNotificationPermission = {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
                    }
                },
            )
        }
    }
}

@Composable
private fun LoadingScreen(
    error: String?,
    onRetry: () -> Unit,
    onLogout: () -> Unit,
) {
    Column(
        Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("불러오는 중...", fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
        if (!error.isNullOrBlank()) {
            Spacer(Modifier.height(14.dp))
            Text(error, color = Color(0xFFB3261E), textAlign = TextAlign.Center)
            Spacer(Modifier.height(16.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(onClick = onRetry) { Text("다시 시도") }
                TextButton(onClick = onLogout) { Text("로그아웃") }
            }
        }
    }
}

@Composable
private fun LoginScreen(onGoogle: () -> Unit) {
    Box(Modifier.fillMaxSize()) {
        Image(painterResource(R.drawable.background_morning), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        Column(
            Modifier.fillMaxSize().padding(24.dp),
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Column(Modifier.padding(top = 72.dp)) {
                Text("하루", fontSize = 44.sp, fontWeight = FontWeight.Bold)
                Text("따뜻한 아침을 함께 준비해요.", color = Color.Black.copy(alpha = 0.62f), fontSize = 17.sp)
            }
            Button(onClick = onGoogle, modifier = Modifier.fillMaxWidth().height(54.dp)) {
                Text("Google로 계속하기", fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

@Composable
private fun EnterNameScreen(onSave: (String) -> Unit) {
    var name by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center) {
        Text("뭐라고 불러드릴까요?", fontSize = 28.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(18.dp))
        OutlinedTextField(name, { name = it }, label = { Text("이름") }, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(18.dp))
        Button(onClick = { if (name.isNotBlank()) onSave(name.trim()) }, modifier = Modifier.fillMaxWidth()) {
            Text("다음")
        }
    }
}

@Composable
private fun LocationScreen(onSave: (String) -> Unit) {
    var location by remember { mutableStateOf("서울특별시") }
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center) {
        Text("오늘 날씨를 알려드릴게요", fontSize = 28.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(18.dp))
        OutlinedTextField(location, { location = it }, label = { Text("위치") }, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(18.dp))
        Button(onClick = { if (location.isNotBlank()) onSave(location.trim()) }, modifier = Modifier.fillMaxWidth()) {
            Text("시작하기")
        }
    }
}

@Composable
private fun HomeScreen(viewModel: MainViewModel, onConnectCalendar: () -> Unit) {
    val context = LocalContext.current
    var showSettings by remember { mutableStateOf(false) }
    var showSubscriptionPaywall by remember { mutableStateOf(false) }
    var dismissedRequiredPaywall by remember { mutableStateOf(false) }
    var editAlarm by remember { mutableStateOf<Pair<Int, Alarm?>?>(null) }
    val state by viewModel.state.collectAsState()
    val subscription by viewModel.subscriptionState.collectAsState()
    val period = viewModel.currentDayPeriod()
    val next = viewModel.nextAlarmSummary()

    LaunchedEffect(
        subscription.entitlement?.enforcementEnabled,
        subscription.isActive,
    ) {
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

    Box(Modifier.fillMaxSize()) {
        Image(painterResource(backgroundFor(period)), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        Column(Modifier.fillMaxSize().padding(22.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                IconButton(onClick = { showSettings = true }) {
                    Icon(Icons.Filled.Settings, contentDescription = "설정")
                }
            }
            Text(LocalDate.now().format(DateTimeFormatter.ofPattern("M월 d일 EEEE", Locale.KOREAN)), color = Color.Black.copy(alpha = 0.56f), fontWeight = FontWeight.Medium)
            Spacer(Modifier.height(14.dp))
            Text("다음 모닝콜까지", fontSize = 21.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(8.dp))
            if (next != null) {
                Text(viewModel.countdownText(next.second), fontSize = 36.sp, fontWeight = FontWeight.Bold)
                Text("${next.second.toLocalDate()} ${next.first.time}에 깨워드릴게요.", color = Color.Black.copy(alpha = 0.58f))
            } else {
                Text("알람 없음", fontSize = 42.sp, fontWeight = FontWeight.Bold)
                Text("이번 주 알람을 추가해서 아침 루틴을 준비해보세요.", color = Color.Black.copy(alpha = 0.58f))
            }
            Spacer(Modifier.weight(1f))
            Image(painterResource(characterFor(state.selectedCharacter, period)), null, Modifier.size(230.dp).align(Alignment.CenterHorizontally))
            Spacer(Modifier.weight(1f))
            WeeklySection(state.alarms) { day, alarm -> editAlarm = day to alarm }
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

    if (showSettings) {
        SettingsDialog(
            viewModel = viewModel,
            onConnectCalendar = onConnectCalendar,
            onOpenPaywall = { showSubscriptionPaywall = true },
            onDismiss = { showSettings = false },
        )
    }

    if (showSubscriptionPaywall) {
        SubscriptionPaywallDialog(
            price = subscription.localizedMonthlyPrice,
            isLoading = subscription.isLoading,
            error = subscription.error,
            onPurchase = { viewModel.purchaseMonthly(context as Activity) },
            onRestore = viewModel::restorePurchases,
            onDismiss = {
                dismissedRequiredPaywall = true
                showSubscriptionPaywall = false
            },
        )
    }
}

@Composable
internal fun WeeklySection(alarms: List<Alarm>, onClick: (Int, Alarm?) -> Unit) {
    val order = listOf(1, 2, 3, 4, 5, 6, 0)
    val labels = mapOf(0 to "일", 1 to "월", 2 to "화", 3 to "수", 4 to "목", 5 to "금", 6 to "토")
    Card(colors = CardDefaults.cardColors(containerColor = Color.White.copy(alpha = 0.9f)), shape = RoundedCornerShape(22.dp)) {
        Row(Modifier.fillMaxWidth().padding(10.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            order.forEach { day ->
                val alarm = alarms.firstOrNull { it.targetDate.isNullOrBlank() && it.repeatDays.contains(day) }
                Column(
                    Modifier.width(45.dp).clickable { onClick(day, alarm) }.padding(vertical = 8.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(labels[day].orEmpty(), fontWeight = FontWeight.Bold, color = if (alarm != null) Color.Black else Color.Black.copy(alpha = 0.35f))
                    Text(alarm?.time ?: "OFF", fontSize = 12.sp, color = Color.Black.copy(alpha = if (alarm != null) 0.82f else 0.35f))
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun AlarmEditorDialog(
    day: Int,
    alarm: Alarm?,
    onDismiss: () -> Unit,
    onSave: (String, String) -> Unit,
    onDelete: () -> Unit,
) {
    val initial = alarm?.time?.split(":")?.mapNotNull { it.toIntOrNull() } ?: listOf(7, 30)
    val timeState: TimePickerState = rememberTimePickerState(initialHour = initial.getOrElse(0) { 7 }, initialMinute = initial.getOrElse(1) { 30 }, is24Hour = true)
    var style by remember {
        mutableStateOf(
            when (alarm?.wakeIntensity) {
                "firm" -> "aggressive"
                else -> "gentle"
            },
        )
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("${listOf("일", "월", "화", "수", "목", "금", "토")[day]}요일 알람") },
        text = {
            Column {
                TimePicker(timeState)
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    WakeStyleButton("부드럽게", style == "gentle") { style = "gentle" }
                    WakeStyleButton("강하게", style == "aggressive") { style = "aggressive" }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { onSave("%02d:%02d".format(timeState.hour, timeState.minute), style) }) { Text("저장") }
        },
        dismissButton = {
            Row {
                if (alarm != null) TextButton(onClick = onDelete) { Text("삭제", color = Color(0xFFB3261E)) }
                TextButton(onClick = onDismiss) { Text("취소") }
            }
        },
    )
}

@Composable
private fun WakeStyleButton(text: String, selected: Boolean, onClick: () -> Unit) {
    Button(onClick = onClick, enabled = !selected) { Text(text) }
}

@Composable
private fun SettingsDialog(
    viewModel: MainViewModel,
    onConnectCalendar: () -> Unit,
    onOpenPaywall: () -> Unit,
    onDismiss: () -> Unit,
) {
    val state by viewModel.state.collectAsState()
    val subscription by viewModel.subscriptionState.collectAsState()
    val context = LocalContext.current
    var languageExpanded by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("설정") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Card(
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF7E8)),
                    shape = RoundedCornerShape(18.dp),
                ) {
                    Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text(
                            when {
                                subscription.isTrial -> "무료 체험 이용 중"
                                subscription.isActive -> "하루 플러스 이용 중"
                                else -> "하루 플러스"
                            },
                            fontWeight = FontWeight.Bold,
                            fontSize = 18.sp,
                        )
                        Text(
                            if (subscription.isActive) "매일 AI 모닝콜을 이용할 수 있어요."
                            else "3일 무료 체험 후 월간 구독으로 이어져요.",
                            color = Color.Black.copy(alpha = 0.62f),
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
                        ) {
                            Text(if (subscription.isActive) "구독 관리" else "구독 시작하기")
                        }
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Phone, null)
                    Spacer(Modifier.width(8.dp))
                    Text("테스트 전화")
                    Spacer(Modifier.weight(1f))
                    TextButton(onClick = { viewModel.testCall("gentle") }) { Text("걸기") }
                }
                Box {
                    Button(onClick = { languageExpanded = true }) { Text("언어: ${state.selectedLanguage}") }
                    DropdownMenu(expanded = languageExpanded, onDismissRequest = { languageExpanded = false }) {
                        listOf("한국어", "English", "日本語").forEach { lang ->
                            DropdownMenuItem(text = { Text(lang) }, onClick = {
                                languageExpanded = false
                                viewModel.saveLanguage(lang)
                            })
                        }
                    }
                }
                CharacterPreference.entries.forEach { character ->
                    Row(
                        Modifier.fillMaxWidth().clickable { viewModel.selectCharacter(character) }.padding(vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Image(painterResource(characterFor(character, DayPeriod.Morning)), null, Modifier.size(44.dp))
                        Spacer(Modifier.width(12.dp))
                        Text(character.displayName)
                        Spacer(Modifier.weight(1f))
                        if (state.selectedCharacter == character) Icon(Icons.Filled.CheckCircle, null, tint = Color(0xFF789CEB))
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.CalendarMonth, null)
                    Spacer(Modifier.width(8.dp))
                    Text(if (state.calendarConnected) "캘린더 연동됨" else "캘린더 연동 안 됨")
                    Spacer(Modifier.weight(1f))
                    TextButton(onClick = { if (state.calendarConnected) viewModel.disconnectCalendar() else onConnectCalendar() }) {
                        Text(if (state.calendarConnected) "해제" else "연동")
                    }
                }
                state.error?.let { Text(it, color = Color(0xFFB3261E), fontSize = 13.sp) }
                TextButton(onClick = { viewModel.signOut(); onDismiss() }, modifier = Modifier.fillMaxWidth()) {
                    Text("로그아웃", color = Color(0xFFB3261E), textAlign = TextAlign.Center)
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("닫기") } },
    )
}

@Composable
internal fun SubscriptionPaywallDialog(
    price: String,
    isLoading: Boolean,
    error: String?,
    onPurchase: () -> Unit,
    onRestore: () -> Unit,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    AlertDialog(
        onDismissRequest = { if (!isLoading) onDismiss() },
        title = { Text("하루 플러스", fontWeight = FontWeight.Bold) },
        text = {
            Column(
                Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text("매일 아침, AI가 직접 전화해 깨워드려요.")
                Text("✓ 매일 개인화된 AI 모닝콜")
                Text("✓ 필요할 때 최대 2회 재통화")
                Text("✓ 날씨와 오늘 일정 브리핑")
                Spacer(Modifier.height(4.dp))
                Text("신규 이용자 3일 무료 체험", fontWeight = FontWeight.Bold, fontSize = 20.sp)
                Text("$price/월", fontWeight = FontWeight.Bold, fontSize = 24.sp)
                Text(
                    "신규 이용자는 무료 체험 종료 후 자동으로 갱신돼요. 언제든 취소할 수 있어요.",
                    color = Color.Black.copy(alpha = 0.62f),
                    fontSize = 13.sp,
                )
                Text(
                    "구독에는 매일 1회의 모닝콜과 필요할 때 재통화가 포함됩니다.",
                    color = Color.Black.copy(alpha = 0.52f),
                    fontSize = 12.sp,
                )
                error?.let { Text(it, color = Color(0xFFB3261E), fontSize = 13.sp) }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(onClick = {
                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://morningcall.poapper.com/terms")))
                    }) { Text("이용약관") }
                    TextButton(onClick = {
                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://morningcall.poapper.com/privacy")))
                    }) { Text("개인정보 처리방침") }
                }
            }
        },
        confirmButton = {
            Button(onClick = onPurchase, enabled = !isLoading) {
                Text(if (isLoading) "처리 중..." else "구독 시작하기")
            }
        },
        dismissButton = {
            Row {
                TextButton(onClick = onRestore, enabled = !isLoading) { Text("구매 복원") }
                TextButton(onClick = onDismiss, enabled = !isLoading) { Text("닫기") }
            }
        },
    )
}

@Composable
private fun CenterText(text: String) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text(text) }
}

private fun backgroundFor(period: DayPeriod): Int = when (period) {
    DayPeriod.Morning -> R.drawable.background_morning
    DayPeriod.Afternoon -> R.drawable.background_afternoon
    DayPeriod.Night -> R.drawable.background_night
}

internal fun characterFor(character: CharacterPreference, period: DayPeriod): Int = when (character to period) {
    CharacterPreference.Hari to DayPeriod.Morning -> R.drawable.hari_morning
    CharacterPreference.Hari to DayPeriod.Afternoon -> R.drawable.hari_afternoon
    CharacterPreference.Hari to DayPeriod.Night -> R.drawable.hari_night
    CharacterPreference.Haru to DayPeriod.Afternoon -> R.drawable.haru_afternoon
    CharacterPreference.Haru to DayPeriod.Night -> R.drawable.haru_night
    else -> R.drawable.haru_morning
}
