# Client Platform Spec

## 文档状态

- Status: Active
- Scope: Android、iOS、扩展、CLI、AI 集成

## 共享原则

所有客户端优先遵循：

- 原生 UI，避免强耦合跨端 UI 框架
- Rust 共享核心复用安全、OTP、同步基础能力
- 本地模式先可用，再接同步能力

## Android

状态：`In Progress`

当前：

- Kotlin + Compose 骨架已建立
- UniFFI bridge 已接入
- 本地条目、倒计时、点击复制已具备
- Gradle wrapper 与 Android Rust 打包脚本已具备

后续：

- 真机 / 模拟器构建验收
- 相机扫码与图片导入
- Provider 同步接入

## iOS

状态：`In Progress`

当前：

- SwiftUI 源码骨架已建立
- UniFFI Swift 绑定已生成
- XcodeGen 工程规格与 XCFramework 打包脚本已具备

后续：

- 在完整 Xcode 环境生成工程
- 完成 XCFramework 打包验收
- 接入扫码、同步、自动填充扩展

## 浏览器扩展

状态：`Planned`

目标：

- 点击复制验证码
- 自动查找或绑定页面中的 OTP 输入框
- 提供选择器模式让用户选择目标输入组件
- 记录站点级自动填充规则
- 后续可考虑汇总匿名规则，形成社区自动填充能力

## CLI

状态：`Implemented / Planned`

当前：

- 已有基础 CLI，用于登录、自检、拉取 revision / ops

后续：

- 增加更完整的导入、导出、同步和调试命令
- 增加给 AI / 自动化调用的稳定接口

## AI Skills

状态：`Planned`

目标：

- 提供适合 AI 自动化使用的 CLI / SDK / 文档入口
- 让 AI 可以安全调用 `f2a` 相关能力进行自动化

## 设计要求

- 各客户端不重复实现 OTP / 身份派生 / 加密核心逻辑
- 客户端本地存储应遵循各平台原生最佳实践
- 能力下沉顺序应为：
  1. 本地 Vault
  2. 导入导出
  3. 同步
  4. 自动填充或高级集成
