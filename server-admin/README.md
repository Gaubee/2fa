# Server Admin

管理后台前端，独立部署。

约束：

- 必须遵守 `shadcn/ui` 官方 `llms.txt`：<https://ui.shadcn.com/llms.txt>
- 以 `Vite + React 19 + Tailwind CSS v4 + shadcn/ui open code` 为默认实现方式
- 优先使用官方推荐的 `Form`、`Toast`、`Sidebar`、`Dialog`、`Data Table`、`Registry` 模式

当前状态：

- 已接通 `/api/v1/admin/overview|billing|storage|audit|backup/template` 真实接口
- 已接入 `@tanstack/react-query + zod`，用于强类型读取与运行时校验
- 已支持通过 `X-Admin-Token` 调用 `PUT /api/v1/admin/billing/policy` 保存计费策略
- 已提供独立 Docker 镜像构建入口：`server-admin/Dockerfile`
- 在 `infra/docker/docker-compose.sqlite.yml` 与 `infra/docker/docker-compose.postgres.yml` 中，`server-admin` 默认与 `server` 配套部署，并通过 Nginx 反向代理访问后端

首批能力目标：

- 系统配置
- 支付配置
- 数据库可视化运维
- 密文备份与恢复
- 审计日志查看
