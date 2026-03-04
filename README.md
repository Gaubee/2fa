# 2FA Web Authenticator

基于 `Vite + React + TypeScript + Tailwind + shadcn 风格组件` 的单页 2FA 工具。

仓库地址：<https://github.com/Gaubee/2fa>

## 功能

- TOTP 6 位验证码实时倒计时与自动刷新
- 多密钥管理（新增、编辑、删除、本地持久化）
- 支持文本导入、二维码图片导入、摄像头扫码导入
- 支持 `otpauth://totp/...`、`otpauth-migration://offline?...`
- 多选分享：
  - 原始 `otpauth` 列表
  - 当前站点链接分享（`?import=BASE64CONTENT`）
  - 可选口令加密分享（`otpauth-secure://v1#...`）
- 点击验证码直接复制（无空格）

## 本地开发

```bash
pnpm install
pnpm dev
```

## 构建

```bash
pnpm build
pnpm preview
```

## GitHub Pages

仓库包含 `.github/workflows/deploy-pages.yml`，推送 `main` 分支会自动发布到 Pages。

项目部署路径配置为：

- `vite.config.ts` -> `base: "/2fa/"`

## 私有化部署

1. 下载源码（GitHub 页面右上角 `Code -> Download ZIP`，或 `git clone`）。
2. 安装依赖并构建：

```bash
pnpm install
pnpm build
```

3. 将 `dist/` 内容部署到你自己的静态服务器（Nginx、GitHub Pages、Cloudflare Pages、Vercel 等）。

### 一键下载到指定目录（github raw 脚本）

可直接执行仓库里的 `sh` 脚本，把最新 Release 的 `dist` 内容部署到 `--www=./mydir`：

```bash
curl -fsSL https://raw.githubusercontent.com/Gaubee/2fa/main/scripts/install-www.sh | sh -s -- --www=./mydir
```

可选参数：

- `--repo=owner/name` 指定仓库（默认 `Gaubee/2fa`）
- `--state=/path/state` 指定版本状态文件路径
- `--force` 强制覆盖部署

## GitHub Release 发布脚本

项目内置 `release:github` 脚本，会执行以下步骤：

1. 构建 `dist/`
2. 打包为 `.release/<name>-<tag>-dist.tar.gz`
3. 推送对应 git tag
4. 创建或更新 GitHub Release，并上传构建包资产

用法：

```bash
# 默认使用 package.json 版本号生成 tag，例如 v0.0.0
pnpm release:github

# 指定 tag
pnpm release:github -- --tag v0.1.0

# 跳过构建（已提前 build 时）
pnpm release:github -- --tag v0.1.0 --skip-build
```

可选参数：

- `--repo owner/name` 指定仓库（默认读取 `origin`）
- `--notes \"发布说明\"` 覆盖默认 release notes

## 自动更新（轮询 + 开机启动）

可通过 github raw 脚本一键部署并注册自动更新服务：

```bash
curl -fsSL https://raw.githubusercontent.com/Gaubee/2fa/main/scripts/setup-auto-update.sh | sh -s -- --www=./mydir --interval=600
```

此命令会：

1. 下载并执行部署脚本（先部署一次最新版本）
2. 写入配置文件：`~/.config/gaubee-2fa/updater.conf`
3. 自动注册启动服务：
   - Linux: `systemd --user`
   - macOS: `launchd`
   - 其他环境：退化为后台进程

默认每 `600` 秒检查一次更新。可在配置文件中修改：

- `WWW_DIR` 部署目录
- `REPO` 目标仓库
- `POLL_SECONDS` 轮询间隔秒数
