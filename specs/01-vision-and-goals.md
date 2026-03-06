# Vision And Goals

## 文档状态

- Status: Active
- Scope: 全项目愿景、阶段目标、非目标

## 项目愿景

Gaubee 2FA 的目标不是做一个单纯的验证码网页，而是构建一个：

- 以隐私和可迁移性为核心的 2FA 管理产品
- 以 Rust 共享核心驱动的跨平台产品族
- 既支持浏览器本地离线使用，也支持多 Provider 跨设备同步
- 既支持官方托管，也支持用户私有化部署
- 既可开源自部署，也可以形成低成本商业化运营

## 核心价值观

### 1. Local-first

默认能力必须在本地可用：

- 本地保存密钥
- 本地生成 TOTP
- 本地导入与分享
- 本地离线查看与复制验证码

### 2. Privacy-first

服务端不是信任前提：

- 不能要求用户把明文密钥交给服务端
- 同步数据必须优先采用端到端加密模型
- 自建 Provider 与官方托管 Provider 都必须以“服务器不可直接读取明文”为原则

### 3. Portability-first

用户的数据和使用习惯不能被某个平台锁死：

- 支持导入导出 `otpauth://...`
- 支持通过 GitHub / Google / 自托管等多 Provider 同步
- 支持浏览器、移动端、扩展、CLI、AI 自动化等多个入口

### 4. Open deployment

项目既要适合个人离线使用，也要适合团队、社区和私有部署：

- Web 可静态部署
- Server / Admin 可 Docker 化部署
- 移动端与扩展可独立分发
- 核心能力可以复用到不同平台

## 阶段目标

### Phase 1: Web 本地产品闭环

状态：`Implemented`

目标：

- 支持多条 2FA 密钥管理
- 支持备注名
- 支持倒计时与自动刷新
- 支持扫码导入、图片二维码导入、分享与点击复制
- 支持本地持久化

### Phase 2: Self Provider 同步闭环

状态：`Implemented / In Progress`

目标：

- 通过用户密钥派生身份
- 通过 challenge + signature 建立会话
- 通过加密 snapshot / ops 完成同步
- 引入 entitlement / billing 的读写边界
- 提供 server-admin 做运营配置

### Phase 3: 多 Provider 同步

状态：`Planned`

目标：

- GitHub Gist Provider
- Google Drive Provider
- 自有密钥 Provider
- 统一 Provider 抽象与切换体验

### Phase 4: 多端产品族

状态：`In Progress / Planned`

目标：

- Android 原生应用
- iOS 原生应用
- 浏览器扩展
- CLI
- AI Skills / 自动化集成

## 商业目标

商业化不是第一目标，但产品需要具备可持续运营能力：

- 免费用户可以完全本地使用
- 付费能力主要针对同步与托管服务
- 私有部署可以跳过官方认证与计费逻辑
- 官方服务应保持低成本、透明和可迁移

## 非目标

以下事项当前不是优先目标：

- 为商业化而牺牲开源与自部署能力
- 为了“云同步”而让服务端持有明文密钥
- 过早引入复杂社交、团队协作、营销漏斗系统
- 为所有平台一次性做完全部高级能力

## 当前产品判断

当前最重要的路线不是继续扩散需求，而是：

1. 把文档、规格和工作流沉淀为稳定真源
2. 把 Web、Server、Admin、Mobile 的边界讲清楚
3. 在新机器上恢复稳定的开发节奏
