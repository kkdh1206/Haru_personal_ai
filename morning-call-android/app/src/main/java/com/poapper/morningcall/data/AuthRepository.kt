package com.poapper.morningcall.data

import android.content.Context
import android.content.Intent
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInClient
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.GoogleAuthProvider
import com.poapper.morningcall.R
import kotlinx.coroutines.tasks.await

class AuthRepository(private val context: Context) {
    private val auth: FirebaseAuth = FirebaseAuth.getInstance()

    val isLoggedIn: Boolean
        get() = auth.currentUser != null

    fun currentUserId(): String? = auth.currentUser?.uid

    fun googleSignInIntent(): Intent = googleClient().signInIntent

    suspend fun finishGoogleSignIn(data: Intent?) {
        val account = GoogleSignIn.getSignedInAccountFromIntent(data).await()
        val idToken = account.idToken ?: error("Google ID token is missing.")
        val credential = GoogleAuthProvider.getCredential(idToken, null)
        auth.signInWithCredential(credential).await()
    }

    suspend fun serverAuthCodeFromIntent(data: Intent?): String {
        val account = GoogleSignIn.getSignedInAccountFromIntent(data).await()
        return account.serverAuthCode ?: error("Google server auth code is missing.")
    }

    suspend fun idToken(forceRefresh: Boolean = false): String {
        val user = auth.currentUser ?: error("No Firebase user.")
        return user.getIdToken(forceRefresh).await().token ?: error("Firebase ID token is missing.")
    }

    fun signOut() {
        auth.signOut()
        googleClient().signOut()
    }

    private fun googleClient(): GoogleSignInClient {
        val options = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestEmail()
            .requestIdToken(context.getString(R.string.default_web_client_id))
            .requestServerAuthCode(context.getString(R.string.default_web_client_id), true)
            .requestScopes(com.google.android.gms.common.api.Scope("https://www.googleapis.com/auth/calendar"))
            .build()
        return GoogleSignIn.getClient(context, options)
    }
}
