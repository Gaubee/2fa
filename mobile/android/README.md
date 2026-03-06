# Android

原生 Android 客户端使用 Kotlin Compose，调用 Rust core。

## 当前状态

- 已接入 `UniFFI` 生成的 Kotlin 绑定，路径在 `app/src/main/java/uniffi/gaubee_2fa_mobile_bridge/`。
- 已实现本地 `SharedPreferences` 存储、密钥新增、RFC Demo 注入、多项 OTP 列表、倒计时刷新与点击复制。
- 已补齐 `gradlew` / `gradlew.bat` 与 `gradle/wrapper/*`。
- `preBuild` 会校验 `src/main/jniLibs/<abi>/libgaubee_2fa_mobile_bridge.so`，缺失时直接失败并提示运行 `pnpm mobile:android:rust`。

## 生成绑定

```bash
pnpm mobile:bindings
```

## 生成 Android Rust 动态库

前置条件：

- 已安装 Java 17+
- 已安装 Android SDK / NDK
- 已安装 `cargo-ndk`

```bash
cargo install cargo-ndk
pnpm mobile:android:rust
```

输出目录：

- `mobile/android/app/src/main/jniLibs/arm64-v8a`
- `mobile/android/app/src/main/jniLibs/armeabi-v7a`
- `mobile/android/app/src/main/jniLibs/x86_64`

## 构建 APK

```bash
pnpm mobile:android:assemble
```

等价命令：

```bash
cd mobile/android
./gradlew assembleDebug
```

## 当前限制

- 当前机器没有 Java，因此没有完成 Gradle 真实构建验收。
- 当前机器也没有 Android SDK / Gradle 联调环境，所以这里交付的是源码、wrapper、绑定与 Rust 产物脚本。

## 下一步

1. 在具备 Java/Android SDK 的环境里完成 `assembleDebug`。
2. 加入二维码扫描 / 相册导入。
3. 接入同步 provider 与账户体系。
