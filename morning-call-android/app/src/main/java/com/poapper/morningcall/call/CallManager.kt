package com.poapper.morningcall.call

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.telecom.DisconnectCause
import androidx.core.content.ContextCompat
import androidx.core.telecom.CallAttributesCompat
import androidx.core.telecom.CallControlScope
import androidx.core.telecom.CallsManager
import com.poapper.morningcall.notification.HaruNotifications
import io.livekit.android.LiveKit
import io.livekit.android.events.RoomEvent
import io.livekit.android.events.collect
import io.livekit.android.room.Room
import kotlinx.coroutines.Job
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class CallState(
    val caller: String = "Haru",
    val alarmId: String? = null,
    val isRinging: Boolean = false,
    val isConnected: Boolean = false,
    val error: String? = null,
    val fallbackOnly: Boolean = false,
)

object CallManager {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val _state = MutableStateFlow(CallState())
    val state: StateFlow<CallState> = _state.asStateFlow()

    private var livekitUrl: String? = null
    private var livekitToken: String? = null
    private var room: Room? = null
    private var roomEventJob: Job? = null
    private var callControl: CallControlScope? = null

    fun prepareIncoming(
        context: Context,
        url: String,
        token: String,
        alarmId: String?,
        caller: String,
    ) {
        livekitUrl = url
        livekitToken = token
        _state.value = CallState(caller = caller, alarmId = alarmId, isRinging = true)
        addTelecomCall(context.applicationContext, caller, incoming = true)
    }

    fun startOutgoing(context: Context, url: String, token: String, caller: String) {
        livekitUrl = url
        livekitToken = token
        _state.value = CallState(caller = caller, isRinging = false)
        addTelecomCall(context.applicationContext, caller, incoming = false)
        answer(context)
    }

    fun showFallbackOnly(caller: String = "Haru") {
        _state.value = CallState(caller = caller, isRinging = true, fallbackOnly = true)
    }

    fun answer(context: Context) {
        if (_state.value.fallbackOnly) {
            _state.value = _state.value.copy(isRinging = false, isConnected = false)
            return
        }
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            _state.value = _state.value.copy(error = "마이크 권한이 필요해요.")
            return
        }
        scope.launch {
            runCatching {
                callControl?.answer(CallAttributesCompat.CALL_TYPE_AUDIO_CALL)
                connectLiveKit(context.applicationContext)
            }.onFailure { error ->
                _state.value = _state.value.copy(error = error.message ?: "통화 연결 실패")
                hangup(context, DisconnectCause.ERROR)
            }
        }
    }

    fun reject(context: Context) {
        hangup(context, DisconnectCause.REJECTED)
    }

    fun hangup(context: Context, cause: Int = DisconnectCause.LOCAL) {
        scope.launch {
            runCatching { callControl?.disconnect(DisconnectCause(cause)) }
            roomEventJob?.cancel()
            roomEventJob = null
            runCatching { room?.disconnect() }
            room = null
            callControl = null
            livekitUrl = null
            livekitToken = null
            HaruNotifications.clearCall(context)
            _state.value = CallState()
        }
    }

    private fun addTelecomCall(context: Context, caller: String, incoming: Boolean) {
        scope.launch {
            runCatching {
                val callsManager = CallsManager(context)
                callsManager.registerAppWithTelecom(33) // CallsManager.CAPABILITY_BASELINE,
                callsManager.addCall(
                    callAttributes = CallAttributesCompat(
                        displayName = caller,
                        address = Uri.parse("sip:$caller"),
                        direction = if (incoming) CallAttributesCompat.DIRECTION_INCOMING else CallAttributesCompat.DIRECTION_OUTGOING,
                        callType = CallAttributesCompat.CALL_TYPE_AUDIO_CALL,
                        callCapabilities = 0,
                    ),
                    onAnswer = {
                        connectLiveKit(context)
                    },
                    onDisconnect = {
                        roomEventJob?.cancel()
                        roomEventJob = null
                        runCatching { room?.disconnect() }
                        room = null
                        callControl = null
                        _state.value = CallState()
                    },
                    onSetActive = {},
                    onSetInactive = {},
                ) {
                    callControl = this
                }
            }.onFailure {
                // Full-screen notification still provides a working fallback when Telecom rejects the call.
            }
        }
    }

    private suspend fun connectLiveKit(context: Context) {
        if (_state.value.isConnected) return
        val url = livekitUrl ?: error("LiveKit URL is missing.")
        val token = livekitToken ?: error("LiveKit token is missing.")
        val newRoom = LiveKit.create(context)
        room = newRoom
        observeRoomEvents(context, newRoom)
        newRoom.connect(url, token)
        newRoom.localParticipant.setMicrophoneEnabled(true)
        callControl?.setActive()
        HaruNotifications.clearCall(context)
        _state.value = _state.value.copy(isRinging = false, isConnected = true, error = null)
    }

    private fun observeRoomEvents(context: Context, observedRoom: Room) {
        roomEventJob?.cancel()
        roomEventJob = scope.launch {
            observedRoom.events.collect { event ->
                when (event) {
                    is RoomEvent.Disconnected -> {
                        if (_state.value.isConnected || _state.value.isRinging) {
                            hangup(context, DisconnectCause.REMOTE)
                        }
                    }

                    is RoomEvent.ParticipantDisconnected -> {
                        if (observedRoom.remoteParticipants.isEmpty()) {
                            hangup(context, DisconnectCause.REMOTE)
                        }
                    }

                    else -> Unit
                }
            }
        }
    }
}
