# Specs Index

`specs/` 是本仓库的产品与模块规格真源，负责回答“这个项目要做什么”。

## 阅读顺序

1. [01-vision-and-goals.md](./01-vision-and-goals.md)
2. [02-product-model.md](./02-product-model.md)
3. 按需阅读模块规格：
   - [03-web-product-spec.md](./03-web-product-spec.md)
   - [04-sync-security-and-provider-spec.md](./04-sync-security-and-provider-spec.md)
   - [05-server-and-admin-spec.md](./05-server-and-admin-spec.md)
   - [06-client-platform-spec.md](./06-client-platform-spec.md)
   - [07-engineering-quality-and-release-spec.md](./07-engineering-quality-and-release-spec.md)

## 使用原则

- `specs/` 记录目标、边界、职责、约束和验收条件。
- `AGENTS.md` 记录开发元规则、工作流和最佳实践。
- 代码实现与 `specs/` 不一致时，必须显式标注是：
  - `Spec 已过期`
  - `代码未完成`
  - `实现偏离设计`
- 新功能开发完成后，必须回写对应 spec，确保未来机器迁移或换人接手时不会丢失上下文。

## 当前状态标记

文档中统一使用以下状态：

- `Implemented`: 已有代码落地。
- `In Progress`: 已开始实现但未闭环。
- `Planned`: 已明确进入路线图，但尚未开发。
- `Exploration`: 仍在调研或需要进一步决策。
