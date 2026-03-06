import type { ReactNode } from "react";

import { CloudDownload, CloudUpload, KeyRound, Link2, LoaderCircle, LogOut, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface SelfProviderCardProps {
  baseUrl: string;
  secretInput: string;
  connected: boolean;
  busyLabel: string | null;
  revision: string;
  connectionLabel: string;
  lastSyncLabel: string;
  sessionLabel: string;
  entitlementLabel: string;
  onBaseUrlChange: (value: string) => void;
  onSecretInputChange: (value: string) => void;
  onLogin: () => void;
  onPull: () => void;
  onPush: () => void;
  onRefresh: () => void;
  onLogout: () => void;
}

export function SelfProviderCard(props: SelfProviderCardProps) {
  const busy = props.busyLabel !== null;

  return (
    <Card className="liquid-card reveal-up">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Self Provider 同步</CardTitle>
            <p className="mt-1 text-sm text-slate-500">使用你的助记词或密钥完成挑战签名，本地加密后再推送到自托管服务。</p>
          </div>
          <div className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-800">{props.connectionLabel}</div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 md:grid-cols-[1.1fr_1fr]">
          <label className="grid gap-1 text-sm">
            Server URL
            <Input
              value={props.baseUrl}
              onChange={(event) => props.onBaseUrlChange(event.target.value)}
              placeholder="https://sync.example.com 或 127.0.0.1:8080"
              spellCheck={false}
            />
          </label>
          <label className="grid gap-1 text-sm">
            身份密钥 / 助记词
            <Input
              type="password"
              value={props.secretInput}
              onChange={(event) => props.onSecretInputChange(event.target.value)}
              placeholder="仅用于本地签名与解密，不会持久化保存"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        </div>

        <div className="grid gap-2 rounded-2xl border border-slate-200/80 bg-white/80 p-4 text-sm text-slate-600 md:grid-cols-4">
          <Metric label="版本号" value={props.revision} />
          <Metric label="最近同步" value={props.lastSyncLabel} />
          <Metric label="会话状态" value={props.sessionLabel} />
          <Metric label="授权计划" value={props.entitlementLabel} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={props.onLogin} disabled={busy}>
            {busyLabelIcon(props.busyLabel, "登录")}
            连接并签名
          </Button>
          <Button type="button" variant="secondary" onClick={props.onPull} disabled={busy || !props.connected}>
            <CloudDownload className="size-4" />
            拉取覆盖本地
          </Button>
          <Button type="button" variant="secondary" onClick={props.onPush} disabled={busy || !props.connected}>
            <CloudUpload className="size-4" />
            推送当前快照
          </Button>
          <Button type="button" variant="outline" onClick={props.onRefresh} disabled={busy || !props.connected}>
            <RefreshCw className="size-4" />
            刷新状态
          </Button>
          <Button type="button" variant="outline" onClick={props.onLogout} disabled={busy || !props.connected}>
            <LogOut className="size-4" />
            清除会话
          </Button>
        </div>

        <div className="grid gap-2 text-xs text-slate-500 md:grid-cols-3">
          <Tip icon={<KeyRound className="size-4" />} text="密钥只用于本地签名、加密和解密；刷新页面后需要重新输入。" />
          <Tip icon={<CloudDownload className="size-4" />} text="拉取会用云端最新快照覆盖本地列表，适合换设备或恢复数据。" />
          <Tip icon={<Link2 className="size-4" />} text="服务端仅保存加密后的快照与元数据，浏览器通过 REST 接口完成同步。" />
        </div>
      </CardContent>
    </Card>
  );
}

function busyLabelIcon(busyLabel: string | null, target: string) {
  if (busyLabel === target) {
    return <LoaderCircle className="size-4 animate-spin" />;
  }
  return <KeyRound className="size-4" />;
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
