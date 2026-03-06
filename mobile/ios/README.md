# iOS

原生 iOS 客户端使用 SwiftUI，调用 Rust core。

## 当前状态

- 已生成 Swift UniFFI 绑定，路径在 `Core/Generated/`。
- 已实现 `UserDefaults` 本地存储、密钥新增、RFC Demo 注入、多项 OTP 列表、倒计时刷新与点击复制的 SwiftUI 源码骨架。
- 已提供 `project.yml`，可通过 `xcodegen` 生成 `GaubeeTwoFA.xcodeproj`。
- 已提供 `pnpm mobile:ios:rust`，用于生成 `Rust/gaubee_2fa_mobile_bridge.xcframework`。

## 生成绑定

```bash
pnpm mobile:bindings
```

## 生成 iOS Rust XCFramework

前置条件：

- 已安装完整 Xcode
- 已安装 Rust iOS targets
- 已执行 `sudo xcode-select -s /Applications/Xcode.app`

```bash
rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios
pnpm mobile:ios:rust
```

输出目录：

- `mobile/ios/Rust/gaubee_2fa_mobile_bridge.xcframework`

## 生成 Xcode 工程

前置条件：

- 已安装 `xcodegen`

```bash
brew install xcodegen
pnpm mobile:ios:project
```

生成后打开：

- `mobile/ios/GaubeeTwoFA.xcodeproj`

## 当前限制

- 当前机器没有完整 Xcode，因此没有完成 XCFramework 与 App target 构建验收。
- 自动填充扩展、二维码导入与同步 provider 仍未接入。

## 下一步

1. 在完整 Xcode 环境里执行 `pnpm mobile:ios:rust`。
2. 生成并验收 `GaubeeTwoFA.xcodeproj`。
3. 开发自动填充扩展与同步 provider。
