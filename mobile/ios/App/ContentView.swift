import SwiftUI
import UIKit

struct ContentView: View {
  private let bridgeRuntime = loadRustMobileBridge()
  private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

  @State private var entries: [VaultEntry] = VaultStore.loadEntries()
  @State private var labelInput = ""
  @State private var secretInput = ""
  @State private var now = Date()
  @State private var bannerMessage: String?

  private var remainingSeconds: Int {
    let total = defaultOtpPeriodSeconds
    let elapsed = Int(now.timeIntervalSince1970) % total
    return max(1, total - elapsed)
  }

  private var progress: Double {
    Double(remainingSeconds) / Double(defaultOtpPeriodSeconds)
  }

  var body: some View {
    ZStack {
      LinearGradient(
        colors: [Color(red: 0.97, green: 0.95, blue: 0.90), Color(red: 0.91, green: 0.95, blue: 0.92), Color(red: 0.87, green: 0.91, blue: 0.97)],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
      )
      .ignoresSafeArea()

      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          overviewCard
          addEntryCard

          if entries.isEmpty {
            emptyStateCard
          } else {
            ForEach(entries) { entry in
              vaultEntryCard(entry)
            }
          }
        }
        .padding(20)
      }
    }
    .onReceive(timer) { value in
      now = value
    }
    .overlay(alignment: .bottom) {
      if let bannerMessage {
        Text(bannerMessage)
          .font(.system(size: 14, weight: .semibold, design: .rounded))
          .padding(.horizontal, 16)
          .padding(.vertical, 12)
          .background(.ultraThinMaterial, in: Capsule())
          .padding(.bottom, 20)
          .transition(.move(edge: .bottom).combined(with: .opacity))
      }
    }
  }

  private var overviewCard: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("Gaubee 2FA Mobile")
        .font(.system(size: 34, weight: .black, design: .rounded))
      Text("SwiftUI + Rust Core。验证码自动刷新，点击即可复制。")
        .foregroundStyle(.secondary)
      Text("下次刷新: \(remainingSeconds)s")
        .font(.system(size: 18, weight: .semibold, design: .rounded))
      ProgressView(value: progress)
        .tint(Color(red: 0.18, green: 0.47, blue: 0.52))
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(20)
    .background(Color.white.opacity(0.82), in: RoundedRectangle(cornerRadius: 28, style: .continuous))
  }

  private var addEntryCard: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("新增密钥")
        .font(.system(size: 24, weight: .bold, design: .rounded))
      TextField("备注名称", text: $labelInput)
        .textFieldStyle(.roundedBorder)
      TextField("Base32 密钥", text: $secretInput)
        .textFieldStyle(.roundedBorder)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
      HStack(spacing: 12) {
        Button("保存", action: addEntry)
          .buttonStyle(.borderedProminent)
        Button("加入 Demo", action: addDemo)
          .buttonStyle(.bordered)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(20)
    .background(Color.white.opacity(0.88), in: RoundedRectangle(cornerRadius: 28, style: .continuous))
  }

  private var emptyStateCard: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("还没有保存任何密钥")
        .font(.system(size: 22, weight: .bold, design: .rounded))
      Text("你可以手动加入一条，或者先加入 RFC Demo 检查 Rust bridge 是否正常工作。")
        .foregroundStyle(.secondary)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(20)
    .background(Color.white.opacity(0.84), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
  }

  private func vaultEntryCard(_ entry: VaultEntry) -> some View {
    let previewState = preview(for: entry)

    return VStack(alignment: .leading, spacing: 12) {
      HStack(alignment: .top) {
        VStack(alignment: .leading, spacing: 4) {
          Text(entry.label)
            .font(.system(size: 24, weight: .bold, design: .rounded))
          Text(entry.secret)
            .font(.system(size: 12, weight: .medium, design: .monospaced))
            .foregroundStyle(.secondary)
            .textSelection(.enabled)
        }

        Spacer()

        Button("删除") {
          entries.removeAll { $0.id == entry.id }
          persistEntries()
          showBanner("已删除 \(entry.label)。")
        }
        .buttonStyle(.bordered)
      }

      switch previewState {
      case .ready(let preview):
        Text(preview.code)
          .font(.system(size: 42, weight: .black, design: .rounded))
        Text("有效期剩余 \(preview.validForSeconds)s")
          .foregroundStyle(.secondary)
        Text("归一化密钥: \(preview.normalizedSecret)")
          .font(.system(size: 12, weight: .medium, design: .monospaced))
          .foregroundStyle(.secondary)
          .textSelection(.enabled)
        Button("复制") {
          UIPasteboard.general.string = preview.code
          showBanner("已复制 \(entry.label) 验证码。")
        }
        .buttonStyle(.borderedProminent)
      case .failed(let message):
        Text(message)
          .foregroundStyle(Color(red: 0.72, green: 0.16, blue: 0.10))
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(20)
    .background(Color.white.opacity(0.9), in: RoundedRectangle(cornerRadius: 26, style: .continuous))
  }

  private func addEntry() {
    let label = labelInput.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !label.isEmpty else {
      showBanner("请输入备注名称。")
      return
    }

    do {
      let normalizedSecret = try bridgeRuntime.bridge.validateSecret(secretInput)
      let entry = VaultEntry(id: VaultStore.createId(), label: label, secret: normalizedSecret)
      entries.insert(entry, at: 0)
      persistEntries()
      labelInput = ""
      secretInput = ""
      showBanner("已保存 \(label)。")
    } catch {
      showBanner(error.localizedDescription)
    }
  }

  private func addDemo() {
    let demo = VaultStore.demoEntry()
    guard !entries.contains(where: { $0.secret == demo.secret }) else {
      showBanner("RFC Demo 已存在。")
      return
    }

    entries.insert(demo, at: 0)
    persistEntries()
    showBanner("已加入 RFC Demo。")
  }

  private func preview(for entry: VaultEntry) -> PreviewState {
    do {
      let preview = try bridgeRuntime.bridge.previewCode(secret: entry.secret, unixTimeSeconds: Int(now.timeIntervalSince1970))
      return .ready(preview)
    } catch {
      return .failed(error.localizedDescription)
    }
  }

  private func persistEntries() {
    VaultStore.saveEntries(entries)
  }

  private func showBanner(_ text: String) {
    withAnimation(.spring(response: 0.32, dampingFraction: 0.88)) {
      bannerMessage = text
    }

    DispatchQueue.main.asyncAfter(deadline: .now() + 2.4) {
      withAnimation(.spring(response: 0.32, dampingFraction: 0.88)) {
        if bannerMessage == text {
          bannerMessage = nil
        }
      }
    }
  }
}

private enum PreviewState {
  case ready(OtpPreview)
  case failed(String)
}
