# Product Model

## 文档状态

- Status: Active
- Scope: 核心对象、Provider 模型、同步数据边界

## 核心对象

### Entry

表示一条 2FA 密钥：

- `id`
- `label`
- `secret`

要求：

- `secret` 输入后要做规范化
- 验证码展示默认连续数字，不插空格
- `label` 作为用户备注名长期保留

### VaultState

当前 Web 端本地持久化状态至少包含：

- `schemaVersion`
- `entries`
- `providers`
- `updatedAtMs`
- `webdav`

### ProviderState

Provider 是 UI 层的能力描述，当前包含：

- `local`
- `github-gist`
- `google-drive`
- `webdav`

状态要求：

- `local` 永远可用
- `webdav` 当前为已实现 Provider
- `github-gist` / `google-drive` 当前保留为计划能力

### WebDavState

当前 WebDAV 本地状态：

- `baseUrl`
- `username`
- `password`
- `vaultSecret`
- `revision`
- `lastSyncAtMs`

语义要求：

- `password` 仅作为远端 Provider 访问凭据
- `vaultSecret` 仅作为本地快照加解密密钥
- 两者不能混为一个字段

## 同步数据模型

当前远端布局固定为：

- `/.gaubee-2fa/manifest.json`
- `/.gaubee-2fa/vault.ndjson`

### manifest.json

职责：

- 保存 `revision`
- 保存 `entryCount`
- 保存 `updatedAtMs`
- 保存 `hashHex`
- 标识快照格式版本

### vault.ndjson

职责：

- 逐行保存单条密钥的加密快照
- 每行可以独立解密与校验
- 以换行作为条目边界，保持存储结构简单

## 数据安全边界

- 本地明文密钥只存在于用户设备
- 远端默认只看到 manifest 和密文 NDJSON
- 远端不能被假定为可信明文仓库
- 版本迁移必须尽量兼容旧的本地状态
