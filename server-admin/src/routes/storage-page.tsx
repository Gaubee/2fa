import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/data-table";
import { StatsGrid, type MetricCardItem } from "@/components/stats-grid";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { adminStorageOptions } from "@/lib/admin-api";
import type { AdminStorageNode } from "@/lib/admin-types";
import { formatCount, formatDatabaseKind, formatFullDateTime, formatOptionalDateTime } from "@/lib/format";

const storageColumns: ColumnDef<AdminStorageNode>[] = [
  { accessorKey: "provider", header: "Provider" },
  { accessorKey: "region", header: "Region" },
  { accessorKey: "engine", header: "Engine" },
  { accessorKey: "websocket", header: "WebSocket" },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <Badge variant={row.original.status === "online" ? "success" : "warning"}>{row.original.status}</Badge>,
  },
  {
    accessorKey: "records",
    header: "Records",
    cell: ({ row }) => formatCount(row.original.records),
  },
  {
    accessorKey: "lastEventAtMs",
    header: "Last Event",
    cell: ({ row }) => formatOptionalDateTime(row.original.lastEventAtMs),
  },
];

const loadingMetrics: MetricCardItem[] = [
  { label: "Vault 总量", value: "--", detail: "正在读取 vaults" },
  { label: "Op 总量", value: "--", detail: "正在读取 vault_ops" },
  { label: "在线会话", value: "--", detail: "正在读取 sessions" },
  { label: "审计日志", value: "--", detail: "正在读取 audit_logs" },
];

export function StoragePage() {
  const storageQuery = useQuery(adminStorageOptions);
  const metrics = useMemo<MetricCardItem[]>(() => {
    if (!storageQuery.data) {
      return loadingMetrics;
    }
    return [
      { label: "Vault 总量", value: formatCount(storageQuery.data.summary.totalVaults), detail: "当前已建档的 vault 数量" },
      { label: "Op 总量", value: formatCount(storageQuery.data.summary.totalOps), detail: "vault_ops 表中累计的加密操作" },
      { label: "在线会话", value: formatCount(storageQuery.data.summary.activeSessions), detail: "仍处于有效期内的 session" },
      { label: "审计日志", value: formatCount(storageQuery.data.summary.totalAuditLogs), detail: "只追加审计表中的总记录数" },
    ];
  }, [storageQuery.data]);

  return (
    <div className="grid gap-4">
      <section className="grid gap-2">
        <p className="text-sm font-medium text-teal-700">Storage</p>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-950">把主存储、实时 relay 和审计链路分开观察</h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          {storageQuery.data
            ? `${formatDatabaseKind(storageQuery.data.databaseKind)} 后端的实时视图生成于 ${formatFullDateTime(storageQuery.data.generatedAtMs)}。`
            : "这里优先解决一个问题：当用户说同步失败时，你能不能第一时间定位是主存储、会话层还是审计链路出了问题。"}
        </p>
      </section>

      <StatsGrid metrics={metrics} />

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle>Storage & Relay Matrix</CardTitle>
            <CardDescription>主存储、实时 relay 和审计节点都来自真实后端统计。</CardDescription>
          </CardHeader>
          <CardContent>
            {storageQuery.isPending ? (
              <Skeleton className="h-72 w-full" />
            ) : storageQuery.isError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-700">无法读取存储视图：{storageQuery.error.message}</div>
            ) : (
              <DataTable columns={storageColumns} data={storageQuery.data.nodes} emptyMessage="当前还没有可展示的存储节点数据。" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Provider Strategy</CardTitle>
            <CardDescription>多 Provider 模式仍然建议保持“浏览器本地可用”作为第一优先级。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm leading-6 text-muted-foreground">
            <div className="rounded-2xl border border-border/80 bg-background/70 p-4">
              <div className="flex items-center gap-2">
                <Badge variant="success">Now</Badge>
                <span className="font-semibold text-slate-900">Self Provider</span>
              </div>
              <p className="mt-2">浏览器本地仍然是可用性的兜底，用户即使离线也能读取与生成 OTP。</p>
            </div>
            <div className="rounded-2xl border border-border/80 bg-background/70 p-4">
              <div className="flex items-center gap-2">
                <Badge variant="warning">Next</Badge>
                <span className="font-semibold text-slate-900">GitHub Gist / Google Drive</span>
              </div>
              <p className="mt-2">优先复用第三方账号的存储能力，减轻自建服务的运维与合规成本。</p>
            </div>
            <div className="rounded-2xl border border-border/80 bg-background/70 p-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline">Later</Badge>
                <span className="font-semibold text-slate-900">增量 op-log / CRDT</span>
              </div>
              <p className="mt-2">当多端并发写入成为真实场景后，再升级到更细粒度的冲突合并模型。</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
