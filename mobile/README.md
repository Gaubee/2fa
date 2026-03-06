# Mobile

移动端采用“原生 UI + Rust 共享核心”的路线。

## 决策

- Android: Kotlin + Jetpack Compose
- iOS: SwiftUI
- Shared core: Rust
- Bridge strategy: 使用 `UniFFI` 导出 `crates/mobile-bridge`

## 当前状态

- `crates/mobile-bridge/` 已通过 `UniFFI` 导出 OTP 预览、密钥归一化、密钥校验与身份派生接口。
- `mobile/android/` 已切到真实 Rust bridge，具备本地密钥存储、多项列表、倒计时刷新与点击复制。
- `mobile/android/` 已补齐 Gradle Wrapper，并在构建前检查 `jniLibs` 下的 Rust `.so` 是否存在。
- `mobile/ios/` 已补齐 SwiftUI 源码骨架、Rust bridge、XcodeGen 工程规格和 XCFramework 打包脚本。
- 绑定生成脚本已落地到根目录：`pnpm mobile:bindings`。

## 常用命令

```bash
pnpm mobile:bindings
pnpm mobile:android:rust
pnpm mobile:android:assemble
pnpm mobile:ios:rust
pnpm mobile:ios:project
cargo test --workspace
```

说明：

- `pnpm mobile:bindings` 会先构建 host 侧 `gaubee-2fa-mobile-bridge`，再把 Kotlin/Swift 绑定写入移动端源码目录。
- `pnpm mobile:android:rust` 会调用 `cargo ndk`，把 Android `.so` 产物输出到 `mobile/android/app/src/main/jniLibs`。
- `pnpm mobile:android:assemble` 会调用仓库内置的 `./gradlew assembleDebug`，但依赖 Java 与 Android SDK。
- `pnpm mobile:ios:rust` 会构建 iOS 静态库并产出 `mobile/ios/Rust/gaubee_2fa_mobile_bridge.xcframework`。
- `pnpm mobile:ios:project` 会基于 `mobile/ios/project.yml` 生成 Xcode 工程，依赖 `xcodegen`。

## 当前限制

- 当前机器没有 Java，因此没有在本机实际执行 Android Gradle 构建。
- 当前机器只有 Command Line Tools，没有完整 Xcode，因此 iOS 侧无法在本机生成 XCFramework 或完成 App target 构建验收。
- 扫码导入、分享导入、云同步 provider 还没有下沉到移动端。

## 下一步

1. 在具备 Java/Android SDK 的环境里完成 Android `assembleDebug` 与真机验收。
2. 在具备完整 Xcode 的环境里执行 `pnpm mobile:ios:rust` + `pnpm mobile:ios:project`，完成 iOS 工程验证。
3. 继续把二维码导入、Provider 同步和自动填充能力下沉到移动端。
