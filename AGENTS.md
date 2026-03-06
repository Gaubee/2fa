# AGENTS

本文件是本仓库的开发元手册，负责回答“这个项目应该如何被理解、规划、实施和交付”。

## 1. 原始愿景

Gaubee 2FA 的原始目标不是做一个单一网页，而是构建一个：

- 以本地优先、隐私优先、可迁移为核心的 2FA 产品
- 以 Rust 共享核心驱动的多端产品族
- 同时支持本地离线、第三方 Provider 同步、自托管同步和私有部署
- 可以商业化运营，但不以牺牲开源、自部署和数据主权为代价

在任何开发决策中，都优先对齐这个愿景，而不是只对齐当前某个局部功能。

## 2. 真源分层

### 产品真源

先读：

1. `README.md`
2. `specs/README.md`
3. 对应模块 spec
4. 相关代码实现

职责分工：

- `specs/`: 负责产品规格、模块边界、目标状态
- `AGENTS.md`: 负责开发工作流、最佳实践、元规则
- `CHAT.md`: 负责保存用户原始输入轨迹

如果三者冲突，优先顺序为：

1. 用户最新明确要求
2. 相关 `specs/`
3. `AGENTS.md`
4. 当前代码现状

## 3. 开发前必做流程

任何一次正式开发前，都必须执行以下流程：

1. 阅读 `specs/README.md` 和相关 spec
2. 阅读对应模块当前代码
3. 找出当前实现与 spec 的差距
4. 基于差距设计一个明确的施工计划
5. 将施工计划发给用户确认
6. 只有在用户确认后，才进入正式实现

禁止直接跳到编码，除非用户明确授予“无需先确认计划”的权限。

## 4. 标准施工流程

### 阶段 A: 理解

要求：

- 先理解目标模块的职责边界
- 先识别是否存在 KISS / YAGNI / DRY / SOLID 风险
- 先判断当前代码是否和 spec 一致

### 阶段 B: 规划

输出必须包含：

- 本次目标
- 修改范围
- 风险点
- 测试计划
- 哪些 spec 需要回写

### 阶段 C: 实施

要求：

- 优先做最小闭环
- 不做无确认的大范围扩展
- 新增结构必须尽量贴合现有目录规划
- 优先抽离重复逻辑，避免临时复制代码

### 阶段 D: 测试

要求：

- 跑当前改动范围内的必要测试
- 如果缺环境无法跑，必须记录未验证项
- 不能把“理论上可以”当作“已经验证”

### 阶段 E: 交付

交付前必须：

1. 回写对应 `specs/`
2. 说明实现结果与未完成项
3. 等用户确认
4. 用户确认后再提交代码

## 5. 文档回写规则

以下变更完成后，必须更新 `specs/`：

- 新功能落地
- 旧功能行为变化
- 模块职责变化
- 数据模型变化
- 部署流程变化
- 测试流程变化

不要把关键信息只留在聊天里。

## 6. 技术偏好与最佳实践

### 通用原则

- 遵循 `KISS`, `YAGNI`, `DRY`, `SOLID`
- 优先构建职责单一、可替换、可测试的模块
- 优先使用共享 Rust 核心沉淀 OTP / 加密 / 同步基础能力
- 对于常见、稳定、可复用的能力，优先考虑是否沉淀到个人标准库

### TypeScript

- 强类型优先，原则上不使用 `any` / `as any` / `@ts-nocheck`
- 以 type-safe 推动 runtime-safe
- 优先使用 `zod`、`ts-pattern`
- 脚本优先使用 `tsx` 执行的 TypeScript 文件

### Frontend

- React 19+
- 优先使用 `shadcn/ui`、`lucide-react`、`motion/react`
- 优先使用 `@tanstack/react-store`、`@tanstack/react-router`、`@tanstack/react-query`、`@tanstack/react-table`
- 样式基线为 `tailwindcss v4`
- 响应式优先使用 `@container` 与 `grid`
- 默认滚动条风格优先采用 `tailwind-scrollbar`

### Workspace 与构建

- Monorepo 基线：`pnpm + pnpm-workspace + lerna`
- 前端构建基线：`vite`
- 后端或库打包可优先考虑 `rolldown / tsdown`
- 统一使用 `prettier + prettier-plugin-organize-imports + prettier-plugin-tailwindcss`

### 数据与本地存储

- 浏览器本地存储优先考虑 `idb`、`idb-keyval`、`Dexie.js`
- 只有在业务复杂度确实需要时，才引入更重的本地数据库抽象

### 搜索外部依赖文档

- 优先使用 Context7 查询官方文档
- 若文档不足，再读 `node_modules/*`
- 阅读顺序：`README.md` -> `package.json` -> `exports` -> `.js/.d.ts`

### 个人标准库

可优先评估：

- `/Users/kzf/Dev/GitHub/std`
- `@gaubee/util`
- `@gaubee/node`
- `@gaubee/nodekit`

### server-admin 特殊规则

开发 `server-admin/` 时必须遵守：

- `https://ui.shadcn.com/llms.txt`
- 使用 `shadcn/ui` open code 组合方式
- 优先遵循官方关于 `Vite`、`React 19`、`Tailwind CSS v4`、`Sidebar`、`Dialog`、`Data Table`、`Form`、`Toast` 的模式

### Rust

- 新的共享能力优先落进 `crates/`
- 平台桥接优先薄封装，不在平台层重写核心逻辑
- 对外导出的类型和错误模型要保持稳定
- 优先把跨平台能力放在 Rust，而不是在每个平台重复实现

## 7. 文件与注释规则

- 积极维护清晰目录结构
- 单文件通常控制在 200 行左右，超过 300 行要主动考虑拆分
- 如果需要拆分文件，默认先在计划里说明，除非用户已经给予完全授权
- 对外接口、HTTP / RPC 接口、导出 API 需要有必要注释
- 如果实现低于 spec，要留下 `TODO` / `FIXME`
- 注释语言与周围文件保持一致

## 8. 测试与验收规则

优先使用：

- TypeScript: `vitest + jsdom`
- E2E: `storybook + playwright`
- Rust: `cargo test`

每次交付必须说明：

- 已验证内容
- 未验证内容
- 未验证原因

## 9. Git 与提交规则

- 提交前阅读 `/Users/kzf/.codex/git-committer.md`
- 不回滚用户已有改动
- 不使用破坏性 git 命令
- 用户未确认前，不要抢先提交代码

## 10. 迁移开发环境后的默认工作流

由于当前会切换到另一台开发机器，后续开发要严格遵守：

1. 先阅读 `specs/`
2. 再阅读 `AGENTS.md`
3. 基于两者形成施工计划
4. 让用户确认计划
5. 再开始开发与测试
6. 完成后回写 `specs/`
7. 用户确认后再提交代码

这是后续所有开发任务的默认工作流。
