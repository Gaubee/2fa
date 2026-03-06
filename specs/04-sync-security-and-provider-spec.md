# Sync Security And Provider Spec

## 文档状态

- Status: Active
- Scope: 同步、安全、Provider 抽象与商业边界

## 核心原则

### 1. 服务端不可信

默认前提：

- 服务器可能故障
- 服务器可能被替换
- 服务器不应该被设计为能直接读取明文密钥

### 2. 用户密钥即身份

优先模型：

- 用户输入任意主密钥材料
- 由本地派生助记词、密钥对、公钥身份
- 远端围绕公钥身份进行会话与存储

### 3. 同步数据默认加密

- Snapshot 默认加密
- 操作日志默认加密或最小暴露
- 服务端持久层默认只能看到密文、元数据与计费边界

## Provider 规划

### Local Provider

状态：`Implemented`

职责：

- 使用浏览器 / 设备本地存储
- 不依赖网络
- 作为所有平台的默认兜底模式

### Self-hosted Provider

状态：`Implemented / In Progress`

职责：

- 使用用户主密钥派生身份
- 使用 challenge + signature 建立短期 session
- 使用加密 snapshot / operation 进行 push / pull
- 支持私有部署免官方认证成本

### GitHub Gist Provider

状态：`Planned`

目标：

- 使用 GitHub OAuth
- 尽量利用 Gist 作为用户自己的远端存储
- 支持轮询拉取
- 提供手动 `sync` 按钮
- 默认轮询窗口以 15 分钟为起点

### Google Drive Provider

状态：`Planned`

目标：

- 使用 Google 账户授权
- 使用 Google Drive 作为用户自己的远端存储
- 通过轮询与手动同步配合
- 尽量减少对官方自建服务器的依赖

## Self-hosted 同步流程

### 建立身份

1. 输入主密钥材料
2. 派生助记词与公钥
3. 生成设备标识

### 建立会话

1. 客户端请求 challenge
2. 本地对 `nonce + timestamp + deviceId + publicKey` 签名
3. 服务端校验签名
4. 服务端返回短期 session token

### 拉取数据

1. 客户端携带 session 与 revision 请求 pull
2. 服务端返回增量操作或最新快照
3. 客户端本地解密并合并状态

### 推送数据

1. 客户端构建新 snapshot / op
2. 客户端本地加密
3. 服务端写入密文与 revision

## 计费与权限边界

状态：`In Progress`

当前商业语义：

- 每 1000 个 2FA 密钥每年约 $1 / 7 RMB
- 停止支付后转为只读
- 归档保留 1 年
- 私有部署可跳过官方认证与限制

产品要求：

- 计费逻辑不能污染本地模式
- 只读与归档边界必须对用户可见
- 用户应始终可以导出自己的加密数据

## 风险与开放问题

状态：`Exploration`

- WebSocket 是否始终优于轮询仍需根据 Provider 类型分别判断
- Cloudflare + 自有服务器的分布式同步方案尚需进一步设计
- 多 Provider 冲突合并规则需要比当前更正式的规范
