import type { ReactNode } from "react";

import { CloudDownload, CloudUpload, FolderSync, KeyRound, Link2, LoaderCircle, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface WebDavProviderCardProps {
  baseUrl: string;
  username: string;
  password: string;
  vaultSecret: string;
  configured: boolean;
  busyLabel: string | null;
  revision: string;
  connectionLabel: string;
  lastSyncLabel: string;
  onBaseUrlChange: (value: string) => void;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onVaultSecretChange: (value: string) => void;
  onVerify: () => void;
  onPull: () => void;
  onPush: () => void;
  onRefresh: () => void;
  onClear: () => void;
}

export function WebDavProviderCard(props: WebDavProviderCardProps) {
  const busy = props.busyLabel !== null;

  return (
    <Card className="liquid-card reveal-up">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>WebDAV 同步</CardTitle>
            <p className="mt-1 text-sm text-slate-500">使用任意兼容 WebDAV 的私有空间同步加密后的密钥快照，当前可直接对接 dwebCloud。</p>
          </div>
          <div className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-800">{props.connectionLabel}</div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-sm">
            WebDAV Host
            <Input value={props.baseUrl} onChange={(event) => props.onBaseUrlChange(event.target.value)} placeholder="http://127.0.0.1:9080/dav/gaubee-2fa" spellCheck={false} />
          </label>
          <label className="grid gap-1 text-sm">
            WebDAV Account
            <Input value={props.username} onChange={(event) => props.onUsernameChange(event.target.value)} placeholder="public_key_hex" spellCheck={false} />
          </label>
          <label className="grid gap-1 text-sm">
            WebDAV Password
            <Input type="password" value={props.password} onChange={(event) => props.onPasswordChange(event.target.value)} placeholder="app-scoped token" autoComplete="off" spellCheck={false} />
          </label>
          <label className="grid gap-1 text-sm">
            Vault Secret
            <Input type="password" value={props.vaultSecret} onChange={(event) => props.onVaultSecretChange(event.target.value)} placeholder="本地加密/解密快照所使用的密钥" autoComplete="off" spellCheck={false} />
          </label>
        </div>

        <div className="grid gap-2 rounded-2xl border border-slate-200/80 bg-white/80 p-4 text-sm text-slate-600 md:grid-cols-2">
          <Metric label="远端版本" value={props.revision || "尚未同步"} />
          <Metric label="最近同步" value={props.lastSyncLabel} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={props.onVerify} disabled={busy}>
            {busyLabelIcon(props.busyLabel, "验证")}
            验证配置
          </Button>
          <Button type="button" variant="secondary" onClick={props.onPull} disabled={busy || !props.configured}>
            <CloudDownload className="size-4" />
            拉取覆盖本地
          </Button>
          <Button type="button" variant="secondary" onClick={props.onPush} disabled={busy || !props.configured}>
            <CloudUpload className="size-4" />
            推送当前快照
          </Button>
          <Button type="button" variant="outline" onClick={props.onRefresh} disabled={busy || !props.configured}>
            <RefreshCw className="size-4" />
            刷新远端
          </Button>
          <Button type="button" variant="outline" onClick={props.onClear} disabled={busy}>
            <Trash2 className="size-4" />
            清空配置
          </Button>
        </div>

        <div className="grid gap-2 text-xs text-slate-500 md:grid-cols-3">
          <Tip icon={<KeyRound className="size-4" />} text="WebDAV 密码只用于访问 app 私有空间；Vault Secret 只用于本地加密与解密。" />
          <Tip icon={<CloudDownload className="size-4" />} text="拉取会使用远端快照覆盖当前本地列表，适合换设备或恢复数据。" />
          <Tip icon={<Link2 className="size-4" />} text="dwebCloud 会提供 WebDAV host/account/password，2FA 只需要手动填入即可同步。" />
        </div>
      </CardContent>
    </Card>
  );
}

function busyLabelIcon(busyLabel: string | null, target: string) {
  if (busyLabel === target) {
    return <LoaderCircle className="size-4 animate-spin" />;
  }
  return <FolderSync className="size-4" />;
}

function Metric(props: { label: string; value: string }) {
  return (
    <div className="grid gap-1 rounded-xl border border-slate-200/80 bg-slate-50/80 p-3">
      <span className="text-xs uppercase tracking-[0.12em] text-slate-400">{props.label}</span>
      <span className="text-sm font-medium text-slate-800">{props.value}</span>
    </div>
  );
}

function Tip(props: { icon: ReactNode; text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-slate-200/80 bg-white/70 p-3">
      <span className="mt-0.5 text-sky-700">{props.icon}</span>
      <span>{props.text}</span>
    </div>
  );
}
