# Client Platform Spec

## 文档状态

- Status: Active
- Scope: Android、iOS、扩展、CLI、AI 集成

## 共享原则

所有客户端优先遵循：

- 原生 UI，避免强耦合跨端 UI 框架
- Rust 共享核心复用 OTP、加密、同步基础能力
- 先把本地模式做稳，再接 Provider 同步

## Android

状态：`In Progress`

当前：

- Kotlin + Compose 骨架已建立
- Mobile bridge 已接入
- 本地条目、倒计时、点击复制已具备基础能力

后续：

- 真机 / 模拟器构建验收
- 相机扫码与图片导入
- WebDAV Provider 接入

## iOS

状态：`In Progress`

当前：

- SwiftUI 骨架已建立
- Rust 绑定脚本已具备

后续：

- 在完整 Xcode 环境生成工程
- 完成 XCFramework 打包验收
- 接入扫码、同步、自动填充扩展

## 浏览器扩展

状态：`Planned`

目标：

- 点击复制验证码
- 选择并绑定页面中的 OTP 输入框
- 记录站点级自动填充规则
- 后续再考虑社区化规则汇总

## CLI

状态：`Planned`

说明：

- 旧的内置后端 CLI 已从本仓库移出
- 需要重新定义新的 CLI 边界

后续方向：

- 本地导入 / 导出 / 调试命令
- 面向 AI 自动化的稳定接口
- 如需远端同步，优先围绕标准 Provider 设计，而不是绑定专有后端协议

## AI Skills

状态：`Planned`

目标：

- 提供适合 AI 自动化使用的 CLI / SDK / 文档入口
- 让 AI 可以安全调用 2FA 相关能力进行自动化
