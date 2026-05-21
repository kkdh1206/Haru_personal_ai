package com.poapper.morningcall.data

import android.content.Context
import com.poapper.morningcall.model.CharacterPreference

class CharacterStore(context: Context) {
    private val prefs = context.getSharedPreferences("haru_preferences", Context.MODE_PRIVATE)

    var current: CharacterPreference
        get() = when (prefs.getString(KEY, CharacterPreference.Haru.name)) {
            CharacterPreference.Hari.name -> CharacterPreference.Hari
            else -> CharacterPreference.Haru
        }
        set(value) {
            prefs.edit().putString(KEY, value.name).apply()
        }

    companion object {
        private const val KEY = "selected_character"
    }
}
