import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, CheckCircle2, CircleAlert } from "lucide-react";

import { StatsGrid, type MetricCardItem } from "@/components/stats-grid";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { adminOverviewOptions } from "@/lib/admin-api";
import { formatCount, formatDatabaseKind, formatFullDateTime } from "@/lib/format";

const loadingMetrics: MetricCardItem[] = [
  { label: "活跃 Vault", value: "--", detail: "正在读取过去 24 小时的写入统计" },
  { label: "付费账户", value: "--", detail: "正在读取 billing_accounts 聚合结果" },
  { label: "在线会话", value: "--", detail: "正在读取未过期会话数量" },
  { label: "最近写操作", value: "--", detail: "正在读取过去 24 小时的操作数量" },
];

export function OverviewPage() {
  const overviewQuery = useQuery(adminOverviewOptions);
  const metrics = useMemo<MetricCardItem[]>(() => {
    if (!overviewQuery.data) {
      return loadingMetrics;
    }
    return [
      { label: "活跃 Vault", value: formatCount(overviewQuery.data.activeVaults24h), detail: "过去 24 小时内发生过更新" },
      { label: "付费账户", value: formatCount(overviewQuery.data.paidAccounts), detail: "计划不等于 self-provider 的账户" },
      { label: "在线会话", value: formatCount(overviewQuery.data.activeSessions), detail: "当前尚未过期的 session token" },
      { label: "最近写操作", value: formatCount(overviewQuery.data.recentOps24h), detail: "过去 24 小时内写入 vault_ops 的记录数" },
    ];
  }, [overviewQuery.data]);

  return (
    <div className="grid gap-4">
      <section className="grid gap-2">
        <p className="text-sm font-medium text-teal-700">Overview</p>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-950">优先盯住订阅写锁、复制延迟和加密快照出口</h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          {overviewQuery.data
            ? `当前正在读取 ${formatDatabaseKind(overviewQuery.data.databaseKind)} 后端，统计生成时间为 ${formatFullDateTime(overviewQuery.data.generatedAtMs)}。`
            : "这版后台优先聚焦三个关键面：是否允许写入、同步链路是否稳定、以及灾备快照是否可导出。"}
        </p>
      </section>

      <StatsGrid metrics={metrics} />

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <Card>
          <CardHeader>
            <CardTitle>Deployment Topology</CardTitle>
            <CardDescription>实时展示当前 server 暴露的网关、主存储与审计链路状态。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {overviewQuery.isPending ? (
              Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-24 w-full" />)
            ) : overviewQuery.isError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-700">
                无法读取概览数据：{overviewQuery.error.message}
              </div>
            ) : (
              overviewQuery.data.topology.map((node) => (
                <div key={node.name} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/80 bg-background/80 p-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-900">{node.name}</h3>
                      <Badge variant={node.status === "healthy" ? "success" : "warning"}>
                        {node.status === "healthy" ? "Healthy" : "Watch"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{node.role}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{node.detail}</p>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <span>{node.region}</span>
                    <ArrowUpRight className="size-4 text-muted-foreground" />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Launch Checklist</CardTitle>
            <CardDescription>这些检查项来自当前服务端观测，不再依赖本地 mock。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {overviewQuery.isPending ? (
              Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-16 w-full" />)
            ) : overviewQuery.isError ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-700">
                暂时无法生成上线检查清单，请先确认 `/api/v1/admin/overview` 是否可访问。
              </div>
            ) : (
              overviewQuery.data.checklist.map((item) => (
                <div key={item.label} className="flex items-center gap-3 rounded-2xl border border-border/80 bg-background/75 p-4 text-sm">
                  {item.done ? <CheckCircle2 className="size-4 text-emerald-600" /> : <CircleAlert className="size-4 text-amber-600" />}
                  <span className="font-medium text-slate-800">{item.label}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
