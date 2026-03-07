# Roadmap

`ROADMAP.md` 负责集中记录本仓库的愿景、阶段状态、待验收事项与当前优先级。

如果内容冲突，优先级为：

1. 用户最新明确要求
2. 对应 `specs/`
3. `ROADMAP.md`
4. `AGENTS.md`
5. 当前实现

## 1. 愿景摘要

Gaubee 2FA 的长期目标是构建一个：

- `Local-first` 的 2FA 产品
- `Privacy-first` 的同步体系
- `Rust-core` 驱动的多端产品族
- 支持开源自部署、但不强绑定官方后端的工具体系

当前阶段的关键决策：

- 2FA 仓库只保留客户端和共享核心。
- 同步能力统一通过标准 Provider 接入。
- 自有托管能力迁移到独立项目 `dwebCloud`，以 `WebDAV` 作为第一阶段集成接口。

## 2. 阶段总览

| 阶段 | 主题 | 状态 | 验收目标 |
| --- | --- | --- | --- |
| Phase 1 | Web 本地产品闭环 | `Implemented` | 静态部署可直接日常使用 |
| Phase 2 | WebDAV Provider 闭环 | `Implemented / Ready for Acceptance` | 能对接 dwebCloud 或任意兼容 WebDAV 服务 |
| Phase 3 | dwebCloud 外部集成 | `In Progress` | 独立服务完成 token + WebDAV 验证 |
| Phase 4 | 多端客户端 | `In Progress / Planned` | Android / iOS / Extension 继续复用 Rust 核心 |
| Phase 5 | 发布与私有化部署 | `In Progress` | Pages / Release / install / auto-update 可稳定使用 |
| Phase 6 | 文档与流程治理 | `Ready for Acceptance` | 新机器可按文档冷启动开发 |

## 3. 当前优先级

### P0. 文档与开发流程

状态：`Ready for Acceptance`

目标：

- 新机器接手后可以快速恢复开发节奏
- 文档和代码边界一致，不再混杂已经废弃的内置后端路线

待验收：

- [x] 建立 `README / ROADMAP / specs / AGENTS / CHAT` 的分层
- [x] 明确 2FA 与 dwebCloud 的职责边界
- [ ] 在新机器按文档完成一次冷启动演练
- [ ] 验证“读 spec -> 出计划 -> 用户确认 -> 开发测试 -> 回写 spec -> 再提交”的闭环

### P1. Web 本地产品闭环

状态：`Implemented / Ready for Acceptance`

已完成：

- [x] 多条 2FA 条目管理
- [x] Base32 密钥录入与验证码生成
- [x] 倒计时与自动刷新
- [x] 相机扫码导入
- [x] 图片二维码导入
- [x] 多选分享
- [x] 原始 `otpauth://...` 列表复制
- [x] `?import=BASE64CONTENT` 域名分享导入
- [x] 点击复制且验证码不插空格
- [x] GitHub 仓库入口与基础品牌元素

待验收：

- [ ] 验证多种 Base32 非标准输入的兼容性
- [ ] 验证无效密钥提示与恢复流程
- [ ] 验证分享 round-trip 的稳定性
- [ ] 验证扫码导入在移动端浏览器的真实体验

### P2. WebDAV Provider 闭环

状态：`Implemented / Ready for Acceptance`

已完成：

- [x] 用 `webdav` 替代旧 `self-hosted` Provider
- [x] 本地保存 `baseUrl / username / password / vaultSecret / revision`
- [x] 加密 NDJSON 快照格式
- [x] `manifest.json + vault.ndjson` 远端布局
- [x] 验证 / 拉取 / 推送 / 刷新 / 清空操作
- [x] 2FA 仓库移除内置 `server / server-admin / sync-spec / server-core`

待验收：

- [ ] 与 `dwebCloud` 本地服务做手工联调
- [ ] 验证 revision 冲突提示是否清晰
- [ ] 验证跨浏览器 / 双设备的拉取覆盖行为
- [ ] 补充 WebDAV 错误分级与更多 UI 提示

### P3. dwebCloud 外部集成

状态：`In Progress`

目标：

- 将 2FA 之外的存储、授权、计费能力迁移到独立项目
- 让 2FA 只依赖标准 WebDAV Provider，不依赖专有 API

待推进：

- [ ] 完成 `~/Dev/GitHub/dweb_cloud` 的文档真源
- [ ] 完成 challenge + signature -> token -> WebDAV 的本地闭环
- [ ] 输出 2FA 对接 dwebCloud 的最小手册

### P4. 多端客户端

状态：`In Progress / Planned`

目标：

- Android / iOS / Extension 继续共享 Rust 核心
- 多端优先完成本地模式，再接入 Provider 同步

待推进：

- [ ] 在新机器恢复 Android / iOS 开发环境
- [ ] 真机或模拟器验收移动端构建
- [ ] 浏览器扩展的页面选择器与自动填充原型
- [ ] 重新定义 2FA CLI 的职责，不再绑定旧内置后端

### P5. 发布与私有化部署

状态：`In Progress`

已完成：

- [x] GitHub Pages 发布 Web
- [x] GitHub Release 发布静态产物
- [x] `install-www.sh` 一键下载站点
- [x] `setup-auto-update.sh` 自动更新静态站点

待推进：

- [ ] 验证 install / auto-update 脚本在干净环境的体验
- [ ] 为 dwebCloud 形成独立的部署文档与发布链路
- [ ] 保持 2FA release 资产与 README 命令长期一致

## 4. 当前阶段定义

当前这轮完成标准：

1. 2FA 仓库不再包含内置后端实现。
2. Web 端 WebDAV 同步链路构建通过。
3. Rust workspace 与 Web build 均通过。
4. 文档改写到与真实架构一致。
5. dwebCloud 作为下一阶段外部依赖继续推进。
