package com.gaubee.twofa.core

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

data class VaultEntry(
  val id: String,
  val label: String,
  val secret: String,
)

class VaultStore(context: Context) {
  private val prefs = context.applicationContext.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

  fun loadEntries(): List<VaultEntry> {
    val raw = prefs.getString(ENTRIES_KEY, null) ?: return emptyList()
    return try {
      val array = JSONArray(raw)
      buildList {
        for (index in 0 until array.length()) {
          val item = array.optJSONObject(index) ?: continue
          val id = item.optString("id").trim().ifEmpty { createEntryId() }
          val label = item.optString("label").trim()
          val secret = item.optString("secret").trim()
          if (label.isNotEmpty() && secret.isNotEmpty()) {
            add(VaultEntry(id = id, label = label, secret = secret))
          }
        }
      }
    } catch (_: Throwable) {
      emptyList()
    }
  }

  fun saveEntries(entries: List<VaultEntry>) {
    val array = JSONArray()
    entries.forEach { entry ->
      array.put(
        JSONObject()
          .put("id", entry.id)
          .put("label", entry.label)
          .put("secret", entry.secret),
      )
    }

    prefs.edit().putString(ENTRIES_KEY, array.toString()).apply()
  }

  fun demoEntry(): VaultEntry {
    return VaultEntry(
      id = "demo-rfc6238",
      label = "RFC Demo",
      secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
    )
  }

  companion object {
    private const val PREFERENCES_NAME = "gaubee-2fa.mobile"
    private const val ENTRIES_KEY = "vault.entries"
  }
}

fun createEntryId(): String {
  return "entry-${System.currentTimeMillis()}-${(1000..9999).random()}"
}
