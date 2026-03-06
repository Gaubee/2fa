package com.gaubee.twofa

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.gaubee.twofa.ui.GaubeeTwoFaApp

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContent {
      GaubeeTwoFaApp()
    }
  }
}
