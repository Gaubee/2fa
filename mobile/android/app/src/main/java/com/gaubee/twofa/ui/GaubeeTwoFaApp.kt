package com.gaubee.twofa.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.gaubee.twofa.core.RustMobileBridge
import com.gaubee.twofa.core.VaultEntry
import com.gaubee.twofa.core.VaultStore
import com.gaubee.twofa.core.createEntryId
import com.gaubee.twofa.core.defaultOtpPeriodSeconds
import com.gaubee.twofa.core.loadRustMobileBridge
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun GaubeeTwoFaApp() {
  val context = LocalContext.current
  val clipboard = LocalClipboardManager.current
  val scope = rememberCoroutineScope()
  val snackbarHostState = remember { SnackbarHostState() }
  val vaultStore = remember(context) { VaultStore(context) }
  val bridgeRuntime = remember { loadRustMobileBridge() }
  var entries by remember { mutableStateOf(vaultStore.loadEntries()) }
  var labelInput by remember { mutableStateOf("") }
  var secretInput by remember { mutableStateOf("") }
  var nowMs by remember { mutableLongStateOf(System.currentTimeMillis()) }

  LaunchedEffect(Unit) {
    while (true) {
      nowMs = System.currentTimeMillis()
      delay(1000)
    }
  }

  val remainingSeconds = ((defaultOtpPeriodSeconds * 1000 - (nowMs % (defaultOtpPeriodSeconds * 1000))) / 1000)
    .coerceAtLeast(1)
    .toInt()
  val progress = remainingSeconds / defaultOtpPeriodSeconds.toFloat()

  fun persist(next: List<VaultEntry>) {
    entries = next
    vaultStore.saveEntries(next)
  }

  suspend fun showMessage(text: String) {
    snackbarHostState.showSnackbar(text)
  }

  Surface {
    Scaffold(
      containerColor = Color.Transparent,
      snackbarHost = { SnackbarHost(hostState = snackbarHostState) },
    ) { innerPadding ->
      Box(
        modifier = Modifier
          .fillMaxSize()
          .background(
            brush = Brush.verticalGradient(
              colors = listOf(Color(0xFFF7F3E8), Color(0xFFE8F0EA), Color(0xFFDDE7F8)),
            ),
          ),
      ) {
        LazyColumn(
          modifier = Modifier
            .fillMaxSize()
            .padding(innerPadding)
            .padding(horizontal = 20.dp, vertical = 16.dp),
          verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
          item {
            OverviewCard(remainingSeconds = remainingSeconds, progress = progress)
          }

          bridgeRuntime.loadError?.let { loadError ->
            item {
              BridgeWarningCard(message = loadError)
            }
          }

          item {
            AddEntryCard(
              labelInput = labelInput,
              secretInput = secretInput,
              enabled = bridgeRuntime.bridge != null,
              onLabelChange = { labelInput = it },
              onSecretChange = { secretInput = it },
              onAdd = {
                val bridge = bridgeRuntime.bridge ?: run {
                  scope.launch { showMessage("Rust bridge 尚未加载，当前无法验证密钥。") }
                  return@AddEntryCard
                }
                val label = labelInput.trim()
                if (label.isEmpty()) {
                  scope.launch { showMessage("请输入备注名称。") }
                  return@AddEntryCard
                }

                try {
                  val normalizedSecret = bridge.validateSecret(secretInput)
                  persist(
                    listOf(
                      VaultEntry(id = createEntryId(), label = label, secret = normalizedSecret),
                    ) + entries,
                  )
                  labelInput = ""
                  secretInput = ""
                  scope.launch { showMessage("已保存 ${label}。") }
                } catch (error: Throwable) {
                  scope.launch { showMessage(error.message ?: "保存失败。") }
                }
              },
              onUseDemo = {
                val demo = vaultStore.demoEntry()
                if (entries.none { it.secret == demo.secret }) {
                  persist(listOf(demo) + entries)
                  scope.launch { showMessage("已加入 RFC Demo。") }
                } else {
                  scope.launch { showMessage("RFC Demo 已存在。") }
                }
              },
            )
          }

          if (entries.isEmpty()) {
            item {
              EmptyVaultCard()
            }
          } else {
            items(items = entries, key = { entry -> entry.id }) { entry ->
              VaultEntryCard(
                entry = entry,
                bridge = bridgeRuntime.bridge,
                nowMs = nowMs,
                onCopy = { code ->
                  scope.launch {
                    clipboard.setText(AnnotatedString(code))
                    showMessage("已复制 ${entry.label} 验证码。")
                  }
                },
                onDelete = {
                  persist(entries.filterNot { it.id == entry.id })
                  scope.launch { showMessage("已删除 ${entry.label}。") }
                },
              )
            }
          }
        }
      }
    }
  }
}

@Composable
private fun OverviewCard(remainingSeconds: Int, progress: Float) {
  Card(
    shape = RoundedCornerShape(28.dp),
    colors = CardDefaults.cardColors(containerColor = Color(0xFFF8F9F4)),
  ) {
    Column(
      modifier = Modifier.padding(20.dp),
      verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
      Text(text = "Gaubee 2FA Mobile", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Black)
      Text(text = "原生 UI + Rust Core。验证码每秒刷新，点击即可复制。", color = Color(0xFF425466))
      Text(text = "下次刷新: ${remainingSeconds}s", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
      LinearProgressIndicator(progress = progress, modifier = Modifier.fillMaxWidth())
    }
  }
}

@Composable
private fun BridgeWarningCard(message: String) {
  Card(
    shape = RoundedCornerShape(24.dp),
    colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF1E5)),
  ) {
    Column(
      modifier = Modifier.padding(18.dp),
      verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
      Text(text = "Rust Bridge 未就绪", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
      Text(text = message, color = Color(0xFF7A4B1E))
    }
  }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddEntryCard(
  labelInput: String,
  secretInput: String,
  enabled: Boolean,
  onLabelChange: (String) -> Unit,
  onSecretChange: (String) -> Unit,
  onAdd: () -> Unit,
  onUseDemo: () -> Unit,
) {
  Card(
    shape = RoundedCornerShape(28.dp),
    colors = CardDefaults.cardColors(containerColor = Color(0xFFFDFCF8)),
  ) {
    Column(
      modifier = Modifier.padding(20.dp),
      verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
      Text(text = "新增密钥", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
      OutlinedTextField(
        modifier = Modifier.fillMaxWidth(),
        value = labelInput,
        onValueChange = onLabelChange,
        label = { Text("备注名称") },
        singleLine = true,
      )
      OutlinedTextField(
        modifier = Modifier.fillMaxWidth(),
        value = secretInput,
        onValueChange = onSecretChange,
        label = { Text("Base32 密钥") },
        singleLine = true,
        enabled = enabled,
      )
      Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Button(onClick = onAdd, enabled = enabled) {
          Text("保存")
        }
        TextButton(onClick = onUseDemo) {
          Text("加入 Demo")
        }
      }
    }
  }
}

@Composable
private fun EmptyVaultCard() {
  Card(
    shape = RoundedCornerShape(24.dp),
    colors = CardDefaults.cardColors(containerColor = Color(0xFFF1F5FB)),
  ) {
    Column(
      modifier = Modifier.padding(20.dp),
      verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
      Text(text = "还没有保存任何密钥", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
      Text(text = "你可以先手动加入一条，或者直接点上面的 RFC Demo 验证 Rust bridge 是否工作正常。")
    }
  }
}

@Composable
private fun VaultEntryCard(
  entry: VaultEntry,
  bridge: RustMobileBridge?,
  nowMs: Long,
  onCopy: (String) -> Unit,
  onDelete: () -> Unit,
) {
  val preview = remember(entry.secret, nowMs, bridge) {
    bridge?.let {
      runCatching { it.previewTotp(entry.secret, nowMs / 1000) }
    }
  }

  Card(
    shape = RoundedCornerShape(26.dp),
    colors = CardDefaults.cardColors(containerColor = Color.White.copy(alpha = 0.92f)),
  ) {
    Column(
      modifier = Modifier.padding(20.dp),
      verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
      Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
          Text(text = entry.label, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
          Text(text = entry.secret, color = Color(0xFF6C7A89), style = MaterialTheme.typography.bodySmall)
        }
        TextButton(onClick = onDelete) {
          Text("删除")
        }
      }

      when {
        bridge == null -> {
          Text(text = "Rust bridge 不可用，当前无法生成验证码。", color = Color(0xFFB45309))
        }

        preview == null -> {
          Text(text = "准备中...", color = Color(0xFF6C7A89))
        }

        preview.isFailure -> {
          Text(text = preview.exceptionOrNull()?.message ?: "生成失败。", color = Color(0xFFB42318))
        }

        else -> {
          val value = preview.getOrThrow()
          Text(text = value.code, style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.Black)
          Text(text = "有效期剩余 ${value.validForSeconds}s", color = Color(0xFF475467))
          Text(text = "归一化密钥: ${value.normalizedSecret}", color = Color(0xFF667085), style = MaterialTheme.typography.bodySmall)
          Button(onClick = { onCopy(value.code) }) {
            Text("复制")
          }
        }
      }
    }
  }
}
