# Sync Security And Provider Spec

## 文档状态

- Status: Active
- Scope: 同步、安全、Provider 抽象与外部服务边界

## 核心原则

### 1. 本地优先

- 本地模式不依赖任何服务端
- 免费可用的最小闭环必须始终成立

### 2. 服务端不可信

- 远端存储不能被假定为可信明文仓库
- 用户密钥不应以明文形式依赖服务端保存
- 同步格式默认以密文快照为主

### 3. Provider 标准化

- 2FA 客户端不应与单一专有后端强耦合
- 优先依赖标准 Provider 能力
- 当前第一阶段标准接口为 `WebDAV`

## Provider 规划

### Local Provider

状态：`Implemented`

职责：

- 使用浏览器或设备本地存储
- 不依赖网络
- 作为所有平台的默认兜底模式

### WebDAV Provider

状态：`Implemented`

职责：

- 使用标准 WebDAV 访问远端私有空间
- 把 2FA 数据保存为 `manifest + encrypted ndjson`
- 允许接入 dwebCloud 或任意兼容服务

当前要求：

- `baseUrl / username / password / vaultSecret` 本地保存
- 拉取与推送使用 revision 做并发保护
- 远端目录固定为 `/.gaubee-2fa/`

### GitHub Gist Provider

状态：`Planned`

目标：

- 使用 GitHub OAuth
- 使用用户自己的 Gist 作为远端存储
- 以轮询 + 手动 sync 作为第一阶段同步策略

### Google Drive Provider

状态：`Planned`

目标：

- 使用 Google 授权
- 使用用户自己的 Drive 作为远端存储
- 以轮询 + 手动 sync 作为第一阶段同步策略

## 当前快照格式

- `manifest.json`：明文元数据
- `vault.ndjson`：逐行加密条目

格式要求：

- 每一行代表一条条目
- 行级别可以独立解析
- `revision` 基于内容 hash 与更新时间生成

## dwebCloud 边界

状态：`In Progress`

- dwebCloud 是独立项目，不在本仓库实现
- dwebCloud 负责提供 WebDAV、授权、计费与存储能力
- 2FA 只负责消费它给出的 WebDAV 访问信息

这意味着：

- 2FA 前端可以完全免费化和静态化部署
- 是否使用 dwebCloud，由用户自行决定
- 2FA 也可以接入其它兼容 WebDAV 的后端
