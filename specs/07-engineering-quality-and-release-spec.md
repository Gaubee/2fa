# Engineering Quality And Release Spec

## 文档状态

- Status: Active
- Scope: 工程质量、测试、发布、文档对齐要求

## Monorepo 结构

当前目标结构：

- `web/`: Web 前端
- `crates/`: Rust 共享核心
- `packages/wasm-web/`: Web/WASM 打包产物
- `mobile/`: 移动端工程
- `extension/`: 浏览器扩展
- `scripts/`: 构建与部署脚本
- `specs/`: 产品与模块规格
- `AGENTS.md`: 开发元规则与工作流
- `CHAT.md`: 用户原始需求留档

说明：

- `server` / `server-admin` / `sync-spec` 已从本仓库移出
- 自有同步与后台能力迁移到独立项目 `dwebCloud`

## 工程原则

### KISS

- 优先做当前闭环最短路径
- 不把 2FA 客户端和专有后端继续绑在一个仓库里

### YAGNI

- 当前仓库只保留实际在用的客户端能力
- 未明确落地的专有服务端能力不继续内置

### DRY

- OTP、加密、同步基础逻辑优先放进 Rust 共享 crate
- 文档规范统一收敛到 `specs/` 与 `AGENTS.md`

### SOLID

- 客户端、Provider、外部服务职责分层
- UI、状态、本地存储、远端 Provider 尽量解耦

## 测试要求

用户偏好：

- TypeScript: `vitest + jsdom`
- E2E: `storybook + playwright`
- Rust: `cargo test`

当前最低执行要求：

- 改动 Web 时至少跑 `pnpm build:web`
- 改动 Rust 核心时至少跑 `cargo test --workspace`
- 缺环境无法验证时，必须在交付里明确说明

## 发布要求

当前已存在：

- GitHub Pages 发布 Web
- GitHub Release 发布静态站点产物
- `install-www.sh` 一键下载静态站点
- `setup-auto-update.sh` 自动更新静态站点

后续要求：

- 保持 README 与 release 资产的下载命令一致
- 为 dwebCloud 形成独立的发布链路
- 在新机器恢复移动端构建环境后，再补移动端正式发布

## 文档对齐要求

硬规则：

1. 开发前先读 `specs/`
2. 基于 `AGENTS.md` 设计施工计划
3. 用户确认后再实施
4. 实施后必须测试
5. 交付前回写对应 spec
6. 用户确认后再提交代码
