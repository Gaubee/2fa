import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Copy } from "lucide-react";
import { toast } from "sonner";

import { DataTable } from "@/components/data-table";
import { StatsGrid, type MetricCardItem } from "@/components/stats-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { adminAuditOptions } from "@/lib/admin-api";
import type { AdminAuditLog } from "@/lib/admin-types";
import { formatCount, formatDateTime, formatFullDateTime } from "@/lib/format";

const auditColumns: ColumnDef<AdminAuditLog>[] = [
  { accessorKey: "id", header: "ID" },
  {
    accessorKey: "level",
    header: "Level",
    cell: ({ row }) => {
      const level = row.original.level;
      return <Badge variant={level === "critical" ? "danger" : level === "warning" ? "warning" : "secondary"}>{level}</Badge>;
    },
  },
  { accessorKey: "actor", header: "Actor" },
  { accessorKey: "action", header: "Action" },
  { accessorKey: "target", header: "Target" },
  {
    accessorKey: "createdAtMs",
    header: "At",
    cell: ({ row }) => formatDateTime(row.original.createdAtMs),
  },
];

const loadingMetrics: MetricCardItem[] = [
  { label: "日志总量", value: "--", detail: "正在读取 audit_logs" },
  { label: "关键告警", value: "--", detail: "按 critical 级别聚合" },
  { label: "普通告警", value: "--", detail: "按 warning 级别聚合" },
  { label: "信息日志", value: "--", detail: "按 info 级别聚合" },
];

export function AuditPage() {
  const auditQuery = useQuery(adminAuditOptions);
  const metrics = useMemo<MetricCardItem[]>(() => {
    if (!auditQuery.data) {
      return loadingMetrics;
    }
    const criticalCount = auditQuery.data.logs.filter((log) => log.level === "critical").length;
    const warningCount = auditQuery.data.logs.filter((log) => log.level === "warning").length;
    const infoCount = auditQuery.data.logs.filter((log) => log.level === "info").length;
    return [
      { label: "日志总量", value: formatCount(auditQuery.data.totalLogs), detail: "审计表中的总记录数" },
      { label: "关键告警", value: formatCount(criticalCount), detail: "最近 50 条中的 critical 事件" },
      { label: "普通告警", value: formatCount(warningCount), detail: "最近 50 条中的 warning 事件" },
      { label: "信息日志", value: formatCount(infoCount), detail: "最近 50 条中的 info 事件" },
    ];
  }, [auditQuery.data]);

  const exportText = useMemo(() => {
    if (!auditQuery.data) {
      return "";
    }
    return auditQuery.data.logs.map((log) => JSON.stringify(log)).join("\n");
  }, [auditQuery.data]);

  const handleCopyExport = async () => {
    if (!exportText) {
      toast.error("当前没有可导出的审计记录。");
      return;
    }
    await navigator.clipboard.writeText(exportText);
    toast.success("审计 JSONL 已复制到剪贴板。");
  };

  return (
    <div className="grid gap-4">
      <section className="grid gap-2">
        <p className="text-sm font-medium text-teal-700">Audit</p>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-950">把关键写操作保存在只追加的审计轨迹里</h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          {auditQuery.data
            ? `最近一次读取时间为 ${formatFullDateTime(auditQuery.data.generatedAtMs)}，当前展示最近 50 条日志。`
            : "这部分是排查支付争议、写锁切换和备份任务时最重要的落点之一。"}
        </p>
      </section>

      <StatsGrid metrics={metrics} />

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Audit Timeline</CardTitle>
            <CardDescription>重点覆盖价格变更、复制失败、写锁切换和备份任务等高价值事件。</CardDescription>
          </CardHeader>
          <CardContent>
            {auditQuery.isPending ? (
              <Skeleton className="h-72 w-full" />
            ) : auditQuery.isError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-700">无法读取审计日志：{auditQuery.error.message}</div>
            ) : (
              <DataTable columns={auditColumns} data={auditQuery.data.logs} emptyMessage="当前还没有审计日志。" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Retention & Export</CardTitle>
            <CardDescription>保留策略和导出入口应该先可用，再逐步接数据库备份与支付争议排查。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm leading-6 text-muted-foreground">
            <div className="rounded-2xl border border-border/80 bg-background/75 p-4">
              <div className="font-semibold text-slate-900">保留策略</div>
              <p className="mt-2">关键审计日志建议保留至少 400 天；敏感操作写入只追加表，禁止覆盖。</p>
            </div>
            <div className="rounded-2xl border border-border/80 bg-background/75 p-4">
              <div className="font-semibold text-slate-900">导出格式</div>
              <p className="mt-2">当前导出为 JSONL，便于二次检索和接入下游日志系统。</p>
            </div>
            <Button type="button" variant="secondary" onClick={() => void handleCopyExport()}>
              <Copy className="size-4" />
              复制 JSONL
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
