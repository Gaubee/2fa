# 2FA Workspace

基于 `Vite + React + TypeScript` 的多包工作区，包含可直接使用的 2FA Web 前端、Rust 跨端核心、自托管同步服务和独立部署的管理后台。

仓库地址：<https://github.com/Gaubee/2fa>

## 文档

- [specs/README.md](./specs/README.md): 产品与模块规格真源。
- [AGENTS.md](./AGENTS.md): 开发元规则、最佳实践与标准工作流。
- [CHAT.md](./CHAT.md): 用户原始需求输入轨迹。

## 目录

- `web/`: 当前可用的单页 2FA 应用，支持本地离线保存、扫码导入、分享、点击复制、Self Provider 同步。
- `server/`: Rust 自托管同步服务，提供 `HTTP JSON + gRPC + gRPC-Web + WebSocket`。
- `server-admin/`: 独立部署的后台前端，负责支付配置、存储拓扑、审计与备份视图。
- `cli/`: Rust CLI，用于登录、自检、拉取远端 revision/ops。
- `crates/`: 跨端复用的 Rust 核心：`otp-core`、`crypto-core`、`sync-core`、`provider-core`、`wasm-core`、`server-core`。
- `packages/sync-spec/`: 同步协议单一真源，保存 `.proto`。
- `extension/`, `mobile/`: 后续子项目目录。
- `infra/docker/`: Docker Compose 与部署辅助配置。

## 当前状态

已完成：

- `web/` 已迁移完成，并接入 Rust/WASM OTP core。
- `web/` 已打通 Self Provider 浏览器同步链路。
- `server/` 已提供 challenge/session、revision、pull/push、billing entitlement 以及 `/api/v1/admin/*` 的 JSON API。
- `server-admin/` 已接通真实 admin API，使用 `@tanstack/react-query + zod` 做强类型读取，并支持通过 `X-Admin-Token` 保存 billing policy。
- `crates/mobile-bridge/` 已通过 `UniFFI` 导出移动端共享 Rust facade，`mobile/android` 与 `mobile/ios` 已补齐本地存储、多项 OTP 列表、倒计时刷新与点击复制的原生源码。
- 已提供 `SQLite` / `PostgreSQL` 两套 Docker Compose 栈，默认包含 `server + server-admin`。

仍在推进：

- GitHub Gist / Google Drive Provider。
- admin 写入鉴权的进一步细化、配置编辑扩展与备份任务执行。
- 浏览器插件、移动端、CLI 技能与自动化接入。

## 本地开发

```bash
pnpm install
pnpm dev:web
pnpm dev:admin
```

说明：

- `pnpm dev:web` 会先自动生成 `packages/wasm-web/pkg`，再启动 Vite。
- `pnpm dev:admin` 会启动独立的 `server-admin` 控制台，并默认把 `/api` 与 `/ws` 代理到 `http://127.0.0.1:8080`。

## Mobile

```bash
pnpm mobile:bindings
pnpm mobile:android:rust
pnpm mobile:android:assemble
pnpm mobile:ios:rust
pnpm mobile:ios:project
```

说明：

- `pnpm mobile:bindings` 会生成 Kotlin / Swift UniFFI 绑定文件。
- `pnpm mobile:android:rust` 会通过 `cargo ndk` 生成 Android `.so` 到 `mobile/android/app/src/main/jniLibs`。
- `pnpm mobile:android:assemble` 会调用仓库内置的 Gradle Wrapper 组装 Android Debug 包。
- `pnpm mobile:ios:rust` 会生成 iOS `XCFramework`，输出到 `mobile/ios/Rust/`。
- `pnpm mobile:ios:project` 会基于 `mobile/ios/project.yml` 生成 Xcode 工程，依赖 `xcodegen`。

## 构建

```bash
pnpm build:wasm
pnpm build:web
pnpm build:admin
cargo build --workspace
```

## 运行自托管服务

```bash
GAUBEE_2FA_ADMIN_TOKEN=change-me cargo run -p gaubee-2fa-server -- --http 127.0.0.1:8080 --grpc [::1]:50051 --db sqlite
```

可选数据库：

- `--db sqlite`
- `--db postgres --database-url postgres://gaubee:gaubee@127.0.0.1:5432/gaubee_2fa`

服务也支持环境变量：

- `GAUBEE_2FA_HTTP`
- `GAUBEE_2FA_GRPC`
- `GAUBEE_2FA_DB`
- `GAUBEE_2FA_DATABASE_URL`
- `GAUBEE_2FA_ADMIN_TOKEN`

## CLI 示例

```bash
cargo run -p gaubee-2fa-cli -- --server http://127.0.0.1:50051 login --secret "your secret"
cargo run -p gaubee-2fa-cli -- --server http://127.0.0.1:50051 revision --token <token> --vault-id <vault-id>
```

## GitHub Pages

仓库包含 `.github/workflows/deploy-pages.yml`，推送 `main` 分支会自动发布 `web/dist` 到 Pages。

前端部署路径配置在 `web/vite.config.ts`：

- `base: "/2fa/"`

## 私有化部署

### 静态前端

```bash
curl -fsSL https://raw.githubusercontent.com/Gaubee/2fa/main/scripts/install-www.sh | sh -s -- --www=./mydir
```

### Docker 一键部署

先复制环境变量模板：

```bash
cp infra/docker/.env.example infra/docker/.env
```

SQLite 栈：

```bash
pnpm docker:up:sqlite
```

PostgreSQL 栈：

```bash
pnpm docker:up:postgres
```

对应关闭命令：

```bash
pnpm docker:down:sqlite
pnpm docker:down:postgres
```

默认暴露端口：

- `server HTTP`: `8080`
- `server gRPC`: `50051`
- `server-admin`: `4173`

更多细节见：`infra/docker/README.md`

## Docker 文件

- `server/Dockerfile`: Rust 自托管服务镜像。
- `server-admin/Dockerfile`: 独立后台前端镜像，运行时使用 `nginx` 提供 SPA 服务，并把 `/api`、`/ws` 反向代理到 `server`。
- `infra/docker/server-admin.nginx.conf`: 管理后台的 Nginx 模板，负责 SPA fallback 与 `/api`、`/ws` 反向代理。

## GitHub Release 发布脚本

```bash
pnpm release:github
pnpm release:github -- --tag v0.1.0
pnpm release:github -- --tag v0.1.0 --skip-build
```

当前 release 产物仍以静态 `web/dist` 为主，后续会补上 `server/cli` 多平台二进制打包和容器镜像发布。

## 自动更新

静态站点自动更新脚本保持不变：

```bash
curl -fsSL https://raw.githubusercontent.com/Gaubee/2fa/main/scripts/setup-auto-update.sh | sh -s -- --www=./mydir --interval=600
```
