# External Sync Service Boundary Spec

## 文档状态

- Status: Active
- Scope: 2FA 与外部同步服务的职责边界

## 结论

当前 `2fa` 仓库不再内置：

- `server`
- `server-admin`
- 专有同步协议
- 内置数据库与计费实现

这些能力已经从本仓库移出，后续由独立项目 `dwebCloud` 承担。

## 2FA 负责什么

- 本地明文密钥管理
- OTP 生成与展示
- 分享与导入导出
- WebDAV Provider 配置与同步
- Rust 共享核心与客户端工程

## 外部同步服务负责什么

例如 `dwebCloud`：

- 提供标准 WebDAV 存储能力
- 提供授权与 token 颁发
- 提供支付、限额、只读策略等商业边界
- 提供后台管理与存储运维能力

## 边界要求

- 2FA 不依赖外部服务的私有 UI 才能使用
- 2FA 不依赖外部服务的专有 SDK 才能同步
- 外部服务至少需要暴露标准 Provider 能力
- 当前第一阶段最小接口是 `WebDAV`

## Admin 规则

如果未来继续开发管理后台，应在外部服务仓库中进行，并遵守：

- `shadcn/ui` 官方最佳实践
- `https://ui.shadcn.com/llms.txt`
- 独立部署、独立构建、独立权限边界

## 当前状态

状态：`Implemented / In Progress`

已完成：

- 2FA 仓库移除内置 server 与 admin 资产
- 2FA Web 端切换到 WebDAV Provider

待完成：

- dwebCloud 提供可用的本地 WebDAV 验证环境
- 输出完整的接入与部署手册
