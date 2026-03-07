# 2FA Workspace

本仓库是 `Gaubee 2FA` 的客户端工作区，聚焦于：

- `web/` 单页 2FA 应用
- Rust 共享核心
- 移动端与扩展的客户端基础工程
- 静态部署、GitHub Pages 与 Release 产物

仓库地址：<https://github.com/Gaubee/2fa>
关联仓库：<https://github.com/Gaubee/dweb_cloud>

## 当前架构

当前版本采用更简单的边界：

- `2fa` 仓库只负责客户端与共享核心。
- 自托管同步不再内嵌在本仓库中。
- 远端同步统一通过标准 Provider 接入，当前已落地 `WebDAV`。
- `dwebCloud` 作为独立项目承载 WebDAV / 存储 / 授权 / 计费能力，2FA 只消费它暴露出来的 Provider 接口。

这符合当前的 `KISS / YAGNI` 目标：2FA 产品先保持“前端可独立部署、后端可替换”的最小闭环。

## 文档

- [ROADMAP.md](./ROADMAP.md)：愿景、阶段状态、待验收事项。
- [specs/README.md](./specs/README.md)：产品与模块规格真源。
- [AGENTS.md](./AGENTS.md)：开发工作流、最佳实践、元规则。
- [CHAT.md](./CHAT.md)：用户原始需求输入轨迹。

## 目录

- `web/`：当前可用的单页 2FA 应用，支持本地离线保存、扫码导入、分享、点击复制、WebDAV 同步。
- `crates/`：跨端复用的 Rust 核心，当前包含 OTP、加密、同步、Provider 抽象、WASM 与 Mobile Bridge。
- `packages/wasm-web/`：Web 侧使用的 WASM 打包产物。
- `mobile/`：Android / iOS 原生客户端工程骨架。
- `extension/`：浏览器扩展目录。
- `scripts/`：WASM 构建、移动端绑定、静态发布与自动更新脚本。
- `specs/`：产品规格与工程约束。

## 当前已落地

- Web 端多条目管理
- Base32 密钥录入与验证码生成
- 倒计时与自动刷新
- 相机扫码与图片二维码导入
- 多选分享与当前域名 `?import=` 导入
- 验证码点击复制且默认无空格
- 本地持久化与版本迁移
- WebDAV 配置、验证、拉取、推送、刷新与清空
- Rust/WASM OTP 与加密能力接入 Web
- GitHub Pages 与 GitHub Release 静态发布脚本

## 本地开发

```bash
pnpm install
pnpm dev:web
```

说明：

- `pnpm dev:web` 会先自动构建 `packages/wasm-web/pkg`，再启动 Vite。
- 当前根工作区不再包含内置 `server` / `server-admin` / `cli`。
- 如需验证远端同步，请单独启动 `dwebCloud` 或任意兼容 WebDAV 的服务。

## 构建与验证

```bash
pnpm build:web
cargo test --workspace
```

或直接：

```bash
pnpm build
```

## WebDAV 同步

Web 端当前远端同步格式固定为：

- `/.gaubee-2fa/manifest.json`
- `/.gaubee-2fa/vault.ndjson`

其中：

- `manifest.json` 保存 revision、hash、条目数、更新时间等元数据。
- `vault.ndjson` 保存逐行加密后的条目快照。
- `Vault Secret` 只用于本地加解密，不应依赖服务端保存明文。

当前推荐接入方式：

1. 启动 `dwebCloud` 或其它兼容 WebDAV 的服务。
2. 在 2FA 页面填写 `WebDAV Host / Account / Password / Vault Secret`。
3. 先点击“验证配置”，再按需拉取或推送。

## 静态部署

一键下载到指定目录：

```bash
curl -fsSL https://raw.githubusercontent.com/Gaubee/2fa/main/scripts/install-www.sh | sh -s -- --www=./mydir
```

配置自动更新：

```bash
curl -fsSL https://raw.githubusercontent.com/Gaubee/2fa/main/scripts/setup-auto-update.sh | sh -s -- --www=./mydir --interval=600
```

说明：

- 自动更新会注册后台轮询脚本。
- 部署配置会落到本地配置文件，后续可无参数继续运行。
- 用户数据仍保存在浏览器本地存储中，不会因为静态资源更新而被覆盖。

## GitHub Pages

仓库包含 `.github/workflows/deploy-pages.yml`，推送 `main` 分支后会自动发布 `web/dist` 到 GitHub Pages。

前端部署基路径位于 `web/vite.config.ts`：

- `base: "/2fa/"`

## GitHub Release

```bash
pnpm release:github
pnpm release:github -- --tag v0.1.0
pnpm release:github -- --tag v0.1.0 --skip-build
```

当前 Release 产物以静态站点为主，方便：

- 直接下载 `web/dist`
- 配合 `install-www.sh` 做私有化部署
- 在 GitHub Pages、Nginx、对象存储静态托管中使用

## 移动端

当前仓库仍保留移动端骨架与 Rust 绑定脚本：

```bash
pnpm mobile:bindings
pnpm mobile:android:rust
pnpm mobile:android:assemble
pnpm mobile:ios:rust
pnpm mobile:ios:project
```

说明：

- 当前机器如果缺少 Android / iOS 环境，可以先只维护 Rust 核心与文档。
- 等迁移到新的开发机器后，再继续原生客户端实现与验收。

## 相关项目

- [`dwebCloud`](https://github.com/Gaubee/dweb_cloud)：独立的 WebDAV / 存储服务项目，用于承载自托管同步、授权与计费边界。
- `dwebCloud` 的部署与 2FA 接入手册：<https://github.com/Gaubee/dweb_cloud/blob/main/infra/2fa-webdav.md>
- 2FA 当前只消费标准 Provider，不再直接内嵌后端实现。
