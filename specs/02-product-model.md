# Product Model

## 文档状态

- Status: Active
- Scope: 核心领域对象、概念模型、统一术语

## 核心对象

### Vault

Vault 是用户持有的一组 2FA 数据集合。

职责：

- 容纳多个 2FA 条目
- 关联一个或多个同步 Provider
- 记录更新时间、同步状态、授权状态

### Entry

Entry 是单条 2FA 密钥记录。

基础字段：

- `id`
- `label`
- `secret`

扩展字段规划：

- `issuer`
- `accountName`
- `algorithm`
- `digits`
- `periodSeconds`
- `tags`
- `createdAt`
- `updatedAt`

### Provider

Provider 是 Vault 的同步后端。

已确定的 Provider 类型：

- `local`
- `github-gist`
- `google-drive`
- `self-hosted`

设计要求：

- UI 层不能耦合某个具体 Provider 的私有逻辑
- Provider 需要有统一的状态、授权、拉取、推送、冲突处理接口

### Device Session

Device Session 是某个客户端与远端同步服务的短期会话。

职责：

- 标记设备身份
- 约束会话有效期
- 绑定远端读写权限
- 作为 push/pull 请求的认证上下文

### Snapshot

Snapshot 是某个时刻的 Vault 完整加密快照。

职责：

- 用于全量恢复
- 用于新设备冷启动同步
- 用于备份与灾难恢复

### Operation

Operation 是对 Vault 的增量变更记录。

职责：

- 用于多端同步
- 用于冲突合并
- 用于审计与历史追踪

### Entitlement

Entitlement 用于表达账户当前可使用的远端能力边界。

关键语义：

- 是否可写
- 是否进入只读
- 归档保留到何时
- 当前计划类型是什么

## 安全术语

### Secret Input

用户输入的主密钥材料。

来源可能是：

- 助记词
- 任意文本密钥

规则：

- 如果不是合法助记词，可以通过 `sha256` 派生成符合要求的助记词材料
- 由此派生公私钥与对称加密能力

### Public Key Identity

由用户主密钥材料派生出的公开身份标识。

用途：

- 作为远端 Vault 标识的一部分
- 用于 challenge 签名校验
- 避免服务端依赖邮箱密码来识别用户

## 数据层级

从小到大：

1. `Entry`
2. `Vault`
3. `Snapshot / Operations`
4. `Provider State`
5. `Entitlement / Billing / Admin Metadata`

## 产品状态约束

### Local-only 用户

- 必须不依赖服务端可正常使用
- 必须能导入导出基础数据
- 必须能长期稳定查看验证码

### Sync 用户

- 必须明确当前 Provider
- 必须明确当前同步时间与读写状态
- 必须明确本地数据与远端数据的关系

### Self-hosted 用户

- 必须可以跳过官方计费与运营限制
- 必须能保留完整服务端部署控制权

## 当前统一术语要求

在文档、代码、UI 中尽量统一使用：

- `Vault`
- `Entry`
- `Provider`
- `Snapshot`
- `Operation`
- `Entitlement`
- `Self Provider` 或 `Self Hosted`

不要在不同模块里为同一概念创造多个名称。
