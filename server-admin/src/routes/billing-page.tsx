import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";

import { BillingPolicyForm } from "@/components/billing-policy-form";
import { DataTable } from "@/components/data-table";
import { StatsGrid, type MetricCardItem } from "@/components/stats-grid";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { adminBillingOptions } from "@/lib/admin-api";
import type { AdminBillingPlan } from "@/lib/admin-types";
import { formatCount, formatFullDateTime } from "@/lib/format";

const billingColumns: ColumnDef<AdminBillingPlan>[] = [
  { accessorKey: "name", header: "Plan" },
  { accessorKey: "quota", header: "Quota" },
  { accessorKey: "cycle", header: "Cycle" },
  { accessorKey: "writeAccess", header: "Write Access" },
  {
    accessorKey: "accountCount",
    header: "Accounts",
    cell: ({ row }) => formatCount(row.original.accountCount),
  },
  {
    accessorKey: "activeCount",
    header: "Active",
    cell: ({ row }) => <Badge variant="outline">{formatCount(row.original.activeCount)}</Badge>,
  },
  {
    accessorKey: "archive",
    header: "Archive",
    cell: ({ row }) => <Badge variant="secondary">{row.original.archive}</Badge>,
  },
];

const loadingMetrics: MetricCardItem[] = [
  { label: "总账户", value: "--", detail: "正在读取 billing_accounts" },
  { label: "付费账户", value: "--", detail: "计划不是 self-provider" },
  { label: "可写账户", value: "--", detail: "ACTIVE 且未过写入截止" },
  { label: "只读账户", value: "--", detail: "已停写或状态非 ACTIVE" },
];

export function BillingPage() {
  const billingQuery = useQuery(adminBillingOptions);
  const metrics = useMemo<MetricCardItem[]>(() => {
    if (!billingQuery.data) {
      return loadingMetrics;
    }
    return [
      { label: "总账户", value: formatCount(billingQuery.data.summary.totalAccounts), detail: "billing_accounts 表中的全部记录" },
      { label: "付费账户", value: formatCount(billingQuery.data.summary.paidAccounts), detail: "计划不等于 self-provider" },
      { label: "可写账户", value: formatCount(billingQuery.data.summary.activeAccounts), detail: "仍然允许写入同步数据" },
      { label: "只读账户", value: formatCount(billingQuery.data.summary.readOnlyAccounts), detail: "进入只读或已过写入窗口" },
    ];
  }, [billingQuery.data]);

  return (
    <div className="grid gap-4">
      <section className="grid gap-2">
        <p className="text-sm font-medium text-teal-700">Billing</p>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-950">把当前的 entitlement 结构、套餐占用和计费策略都落到服务端</h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          {billingQuery.data
            ? `最新统计生成于 ${formatFullDateTime(billingQuery.data.generatedAtMs)}，${billingQuery.data.adminTokenConfigured ? "当前已启用 token 写入。" : "当前仍是服务端只读模式。"}`
            : "这部分先把真实的计费策略和占用状态打通，再决定后续支付回调与 entitlement 切换。"}
        </p>
      </section>

      <StatsGrid metrics={metrics} />

      <div className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
        <Card>
          <CardHeader>
            <CardTitle>Pricing Policy</CardTitle>
            <CardDescription>读取和保存的都是服务端持久化的 billing policy。</CardDescription>
          </CardHeader>
          <CardContent>
            {billingQuery.isPending ? (
              <Skeleton className="h-96 w-full" />
            ) : billingQuery.isError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-rose-700">{billingQuery.error.message}</div>
            ) : (
              <BillingPolicyForm key={billingQuery.data.generatedAtMs} billing={billingQuery.data} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Plan Occupancy</CardTitle>
            <CardDescription>计划矩阵与实际账户数量来自 `/api/v1/admin/billing`。</CardDescription>
          </CardHeader>
          <CardContent>
            {billingQuery.isPending ? (
              <Skeleton className="h-72 w-full" />
            ) : billingQuery.isError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-700">无法读取套餐矩阵：{billingQuery.error.message}</div>
            ) : (
              <DataTable columns={billingColumns} data={billingQuery.data.plans} emptyMessage="当前还没有计费账户记录。" />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
