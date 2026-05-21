package com.poapper.morningcall.call

import android.Manifest
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.poapper.morningcall.R

class IncomingCallActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
        )
        if (intent.getBooleanExtra(EXTRA_FALLBACK_ONLY, false)) {
            CallManager.showFallbackOnly()
        }

        setContent {
            MaterialTheme {
                IncomingCallScreen(
                    onAnswer = { CallManager.answer(this) },
                    onReject = {
                        CallManager.reject(this)
                        finish()
                    },
                    onDone = { finish() },
                )
            }
        }
    }

    companion object {
        const val EXTRA_FALLBACK_ONLY = "fallbackOnly"
    }
}

@Composable
private fun IncomingCallScreen(
    onAnswer: () -> Unit,
    onReject: () -> Unit,
    onDone: () -> Unit,
) {
    val state by CallManager.state.collectAsState()
    val micPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) onAnswer()
    }

    LaunchedEffect(state.isConnected, state.isRinging) {
        if (!state.isConnected && !state.isRinging && !state.fallbackOnly) onDone()
    }

    Box(Modifier.fillMaxSize()) {
        Image(
            painter = painterResource(R.drawable.background_morning),
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
        )
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.White.copy(alpha = 0.18f))
                .padding(horizontal = 28.dp, vertical = 56.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = if (state.fallbackOnly) "${state.caller} 알람" else "${state.caller} 모닝콜",
                fontSize = 32.sp,
                fontWeight = FontWeight.Bold,
                color = Color.Black.copy(alpha = 0.9f),
            )
            Spacer(Modifier.height(18.dp))
            Text(
                text = if (state.isConnected) "통화 중" else "일어날 시간이에요.",
                fontSize = 18.sp,
                color = Color.Black.copy(alpha = 0.62f),
            )
            state.error?.let {
                Spacer(Modifier.height(12.dp))
                Text(it, color = Color(0xFFB3261E))
            }
            Spacer(Modifier.weight(1f))
            Image(
                painter = painterResource(R.drawable.haru_morning),
                contentDescription = null,
                modifier = Modifier.size(220.dp),
            )
            Spacer(Modifier.weight(1f))
            if (state.isConnected) {
                EndButton(onReject)
            } else {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    EndButton(onReject)
                    IconButton(
                        onClick = {
                            if (state.fallbackOnly) onReject() else micPermission.launch(Manifest.permission.RECORD_AUDIO)
                        },
                        colors = IconButtonDefaults.iconButtonColors(containerColor = Color(0xFF258A45)),
                        modifier = Modifier.size(78.dp),
                    ) {
                        Icon(Icons.Filled.Call, contentDescription = "받기", tint = Color.White, modifier = Modifier.size(34.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun EndButton(onClick: () -> Unit) {
    IconButton(
        onClick = onClick,
        colors = IconButtonDefaults.iconButtonColors(containerColor = Color(0xFFD92D20)),
        modifier = Modifier.size(78.dp).background(Color.Transparent, CircleShape),
    ) {
        Icon(Icons.Filled.CallEnd, contentDescription = "끊기", tint = Color.White, modifier = Modifier.size(34.dp))
    }
}
