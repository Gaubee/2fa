# Server And Admin Spec

## 文档状态

- Status: Active
- Scope: Rust 服务端、后台管理、数据库与部署要求

## Server 目标

Server 是 Self Provider 与未来官方托管模式的服务端基础设施。

## Server 职责

状态：`Implemented / In Progress`

- 提供 challenge / session 能力
- 提供 revision / pull / push 能力
- 提供 entitlement / billing 读写边界
- 提供 admin 只读与最小写入接口
- 支持 SQLite / PostgreSQL
- 支持 Docker 部署

## 当前接口族

### Sync 接口

职责：

- 认证设备
- 读写 revision
- 拉取增量
- 推送变更

### Admin 接口

职责：

- 总览系统状态
- 查看 billing policy
- 修改 billing policy
- 查看存储状态
- 查看审计信息
- 生成备份模板

## Server 技术方向

状态：`Implemented`

当前采用：

- Rust 作为核心实现语言
- 数据库：SQLite / PostgreSQL
- 对外传输：HTTP JSON、gRPC、gRPC-Web、WebSocket

## 数据存储要求

- 服务端数据库不能被假定为可信明文仓库
- 业务数据优先以密文形式存放
- 管理后台主要处理元数据、策略、存储状态与备份边界

## server-admin 目标

server-admin 是和 server 配套的独立部署后台。

职责：

- 管理 billing policy
- 查看存储状态
- 查看审计信息
- 生成或下载备份模板
- 提供后续支付配置入口

## server-admin 约束

状态：`Implemented / Active`

- 必须独立部署
- 必须遵守 `shadcn/ui` 官方最佳实践
- 必须将 `https://ui.shadcn.com/llms.txt` 视为必读技能文档
- 当前采用最小 `X-Admin-Token` 作为写入鉴权

## 部署要求

状态：`Implemented`

- 提供 SQLite / PostgreSQL 两套 Docker Compose
- server-admin 通过 Nginx 提供静态资源并反代 server API
- 私有部署不依赖官方云环境

## 后续规划

状态：`Planned`

- 更完整的支付配置
- 更完整的管理身份体系
- 备份与恢复任务执行闭环
- 更细的租户、账号、审计维度
