# 2FA Web Authenticator

基于 `Vite + React + TypeScript + Tailwind + shadcn 风格组件` 的单页 2FA 工具。

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

