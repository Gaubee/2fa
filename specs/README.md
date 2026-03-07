# Specs Index

`specs/` 是本仓库的产品与模块规格真源，负责回答“这个项目要做什么”。

配套阅读：

- 根目录 [ROADMAP.md](../ROADMAP.md) 负责回答“当前优先做什么、阶段推进到哪一步”。
- 根目录 [AGENTS.md](../AGENTS.md) 负责回答“应该如何开发与交付”。

如果 `ROADMAP.md` 与具体 spec 冲突，以具体 spec 为准。

## 阅读顺序

1. [01-vision-and-goals.md](./01-vision-and-goals.md)
2. [02-product-model.md](./02-product-model.md)
3. 按需阅读模块规格：
   - [03-web-product-spec.md](./03-web-product-spec.md)
   - [04-sync-security-and-provider-spec.md](./04-sync-security-and-provider-spec.md)
   - [05-server-and-admin-spec.md](./05-server-and-admin-spec.md)
   - [06-client-platform-spec.md](./06-client-platform-spec.md)
   - [07-engineering-quality-and-release-spec.md](./07-engineering-quality-and-release-spec.md)

## 当前结构含义

- `01`：产品愿景与阶段目标
- `02`：核心产品模型与数据边界
- `03`：Web 单页应用的功能规格
- `04`：同步、安全与 Provider 抽象
- `05`：2FA 与外部同步服务的职责边界
- `06`：Android / iOS / Extension / CLI 等客户端规划
- `07`：工程质量、测试、发布与交付规则

## 使用原则

- `specs/` 记录目标、边界、职责、约束和验收条件
- 实现和 spec 不一致时，必须明确指出是：
  - `Spec 已过期`
  - `代码未完成`
  - `实现偏离设计`
- 新功能落地或旧边界变化后，必须回写对应 spec
