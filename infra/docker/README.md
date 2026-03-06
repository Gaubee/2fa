# Docker Deploy

这里放的是一键部署 `server + server-admin` 的 Compose 配置。

## 文件

- `docker-compose.sqlite.yml`: 使用 `SQLite` 持久化，自带 `server-admin`。
- `docker-compose.postgres.yml`: 使用 `PostgreSQL` 持久化，自带 `server-admin`。
- `.env.example`: 环境变量模板。
- `server-admin.nginx.conf`: 管理后台的 Nginx 模板，负责 SPA fallback 与 `/api` 反向代理。

## 快速开始

```bash
cp infra/docker/.env.example infra/docker/.env
pnpm docker:up:sqlite
```

或者：

```bash
cp infra/docker/.env.example infra/docker/.env
pnpm docker:up:postgres
```

## 默认端口

- `GAUBEE_2FA_HTTP_PORT=8080`
- `GAUBEE_2FA_GRPC_PORT=50051`
- `GAUBEE_2FA_ADMIN_PORT=4173`

## 服务说明

- `server`: Rust 自托管同步服务，提供 JSON API、gRPC、gRPC-Web 与 WebSocket。
- `server-admin`: 独立后台前端，通过 `nginx` 提供静态资源、SPA fallback，并把 `/api` 与 `/ws` 代理到 `server`。
- `postgres`: 仅在 PostgreSQL 栈中启用。

## 数据持久化

SQLite：

- 卷：`gaubee_2fa_sqlite`
- 数据库存储位置：`/data/gaubee-2fa.db`

PostgreSQL：

- 卷：`gaubee_2fa_postgres`

## 环境变量

服务端支持：

- `GAUBEE_2FA_HTTP`
- `GAUBEE_2FA_GRPC`
- `GAUBEE_2FA_DB`
- `GAUBEE_2FA_DATABASE_URL`
- `GAUBEE_2FA_ADMIN_TOKEN`

管理后台支持：

- `GAUBEE_2FA_SERVER_UPSTREAM`

PostgreSQL 栈还支持：

- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_DB`

## Admin Token

如果你希望 `server-admin` 可以保存计费策略，需要先给 `server` 设置 `GAUBEE_2FA_ADMIN_TOKEN`。
后台页面会把你输入的 token 保存在当前浏览器的 localStorage 中，并在调用 `PUT /api/v1/admin/billing/policy` 时带上 `X-Admin-Token`。

## 开发代理

本地跑 `pnpm dev:admin` 时，Vite 会把 `/api` 和 `/ws` 自动代理到 `ADMIN_API_TARGET`，默认值为 `http://127.0.0.1:8080`。

## 停止

```bash
pnpm docker:down:sqlite
pnpm docker:down:postgres
```
