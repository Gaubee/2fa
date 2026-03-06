# Engineering Quality And Release Spec

## 文档状态

- Status: Active
- Scope: 工程质量、测试、发布、文档对齐要求

## Monorepo 结构

目标结构：

- `web/`: Web 前端
- `server/`: Rust 服务端
- `server-admin/`: 后台前端
- `cli/`: Rust CLI
- `mobile/`: 移动端工程
- `extension/`: 浏览器扩展
- `crates/`: Rust 共享核心
- `packages/`: 协议与 Web/WASM 包
- `infra/`: 部署基础设施
- `specs/`: 产品与模块规格
- `AGENTS.md`: 开发元规则与工作流
- `CHAT.md`: 用户原始需求输入留档

## 工程原则

### KISS

- 优先做当前闭环最短路径
- 不为未来十种可能性预留复杂抽象

### YAGNI

- 新模块上线前必须能回答“当前谁在用”
- 如果只是可能用到，不进入本轮实现

### DRY

- 安全、OTP、身份派生、同步基础逻辑优先放进共享 Rust crate
- 文档规范统一收敛到 `specs/` 与 `AGENTS.md`

### SOLID

- 功能边界按平台、模块、职责分层
- 前端 UI、状态、API、领域逻辑尽量解耦

## 测试要求

用户偏好要求：

- TypeScript: `vitest + jsdom`
- E2E: `storybook + playwright`
- Rust: `cargo test`

实际执行要求：

- 改动 Rust 核心时至少跑相关 crate 测试
- 改动前端时至少跑 lint / build / 相关单测
- 如果缺环境无法验证，必须明确说明未验证项

## 文档对齐要求

这是本项目迁移开发环境后的硬规则：

1. 开发前先读 `specs/`
2. 基于 `AGENTS.md` 设计施工计划
3. 经过用户确认后再实施
4. 实施后必须测试
5. 交付前回写对应 spec
6. 用户确认后再提交代码

## 发布要求

当前已存在：

- GitHub Pages 发布 Web
- GitHub Release 发布静态产物
- Docker Compose 部署 server + server-admin

后续要求：

- 补齐 server / cli 多平台二进制发布
- 补齐移动端构建产物发布链路
- 保持自部署脚本与 release 资产一致

## 文档变更准则

以下情况必须更新 `specs/`：

- 新增功能
- 改变行为边界
- 改变数据模型
- 改变部署方式
- 改变测试与发布流程

如果实现尚未完成但方向已确定，可以在 spec 中标记 `Planned` 或 `Exploration`，不允许只把信息留在聊天记录里。
