# Vision And Goals

## 文档状态

- Status: Active
- Scope: 产品愿景、长期方向、阶段目标

## 核心愿景

Gaubee 2FA 的目标是做一个：

- `Local-first`：默认不依赖账号与服务端即可使用
- `Privacy-first`：远端同步不以明文托管为前提
- `Portability-first`：用户随时可以导出、迁移、自部署
- `Rust-core-first`：Web / Mobile / Extension 复用同一套核心逻辑

## 当前阶段的关键决策

为了降低复杂度并提高可维护性，当前版本采用：

- 2FA 仓库只保留客户端与共享核心
- 不再内嵌专有同步服务与后台管理
- 远端同步统一通过标准 Provider 接入
- 自有同步能力迁移到独立项目 `dwebCloud`

这个决策的目的：

- 遵循 `KISS`：2FA 只聚焦验证码产品本身
- 遵循 `YAGNI`：不在当前仓库继续维护高度耦合的后端体系
- 遵循 `DRY`：把通用存储服务沉淀到可复用的独立项目
- 遵循 `SOLID`：让客户端与存储服务通过清晰接口解耦

## 阶段目标

### Phase 1. Web 本地产品闭环

状态：`Implemented`

目标：

- 用户无需账号即可完成录入、导入、生成、复制、分享
- 静态部署后可直接投入日常使用

### Phase 2. WebDAV Provider 闭环

状态：`Implemented / Ready for Acceptance`

目标：

- 让 2FA 通过标准 WebDAV 接入远端同步
- 不要求 2FA 内置专有后端
- 可对接 dwebCloud 或任意兼容服务

### Phase 3. dwebCloud 外部集成

状态：`In Progress`

目标：

- 把自有托管、授权、计费与 WebDAV 能力迁移到独立项目
- 让 2FA 保持纯客户端产品属性

### Phase 4. 多端产品族

状态：`In Progress / Planned`

目标：

- Android / iOS / Extension / CLI 继续复用 Rust 共享核心
- 优先完成本地模式，再逐步接入 Provider 同步

## 非目标

当前阶段明确不在本仓库内继续推进：

- 内置数据库驱动的专有同步服务
- 内置 `server-admin` 管理后台
- 绑定专有会话协议的 2FA 内部后端接口

这些能力如果需要继续推进，应在 `dwebCloud` 或其配套仓库中实现。
