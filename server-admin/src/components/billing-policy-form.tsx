import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound, RotateCcw, Save, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { adminBillingOptions, adminQueryKey, updateAdminBillingPolicy } from "@/lib/admin-api";
import { clearAdminToken, loadAdminToken, saveAdminToken } from "@/lib/admin-auth";
import { adminBillingPolicySchema, type AdminBillingPolicy, type AdminBillingResponse } from "@/lib/admin-types";

interface BillingPolicyFormState {
  cloud1kAnnualUsd: string;
  cloud1kAnnualCny: string;
  graceDays: string;
  readonlyDays: string;
}

export function BillingPolicyForm({ billing }: { billing: AdminBillingResponse }) {
  const queryClient = useQueryClient();
  const [formState, setFormState] = useState(() => toFormState(billing.policy));
  const [adminToken, setAdminToken] = useState(() => loadAdminToken());
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: (policy: AdminBillingPolicy) => updateAdminBillingPolicy(policy, adminToken.trim()),
    onSuccess: (nextBilling) => {
      queryClient.setQueryData(adminBillingOptions.queryKey, nextBilling);
      void queryClient.invalidateQueries({ queryKey: adminQueryKey });
      saveAdminToken(adminToken);
      toast.success("计费策略已保存到服务端。");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const formPolicy = useMemo(() => parseFormState(formState), [formState]);
  const isDirty = useMemo(() => {
    const next = formPolicy.success ? formPolicy.data : null;
    if (next === null) {
      return true;
    }
    return JSON.stringify(next) !== JSON.stringify(billing.policy);
  }, [billing.policy, formPolicy]);

  const currentPolicyJson = useMemo(() => JSON.stringify(billing.policy, null, 2), [billing.policy]);
  const tokenReady = adminToken.trim().length > 0;

  const handleSave = () => {
    if (!billing.adminTokenConfigured) {
      toast.error("服务端尚未配置 GAUBEE_2FA_ADMIN_TOKEN。", {
        description: "先在 server 环境变量中设置 token，再通过后台提交写入。",
      });
      return;
    }
    if (!tokenReady) {
      setTokenDialogOpen(true);
      toast.error("请先配置 Admin Token。", {
        description: "Token 会保存在当前浏览器的 localStorage 中，仅用于写入接口。",
      });
      return;
    }
    if (!formPolicy.success) {
      const issue = formPolicy.error.issues[0];
      toast.error(issue?.message ?? "计费策略格式无效。");
      return;
    }
    mutation.mutate(formPolicy.data);
  };

  const handleCopyPolicy = async () => {
    await navigator.clipboard.writeText(currentPolicyJson);
    toast.success("当前已保存的策略 JSON 已复制。");
  };

  const handleTokenSave = () => {
    saveAdminToken(adminToken);
    setAdminToken(loadAdminToken());
    setTokenDialogOpen(false);
    toast.success("Admin Token 已保存在当前浏览器。", {
      description: "后续写入 `/api/v1/admin/billing/policy` 会自动带上这个 token。",
    });
  };

  const handleTokenClear = () => {
    clearAdminToken();
    setAdminToken("");
    toast.success("本地保存的 Admin Token 已清除。");
  };

  return (
    <div className="grid gap-4 text-sm leading-6 text-muted-foreground">
      {!billing.adminTokenConfigured ? (
        <div className="rounded-2xl border border-amber-300/70 bg-amber-50/90 p-4 text-amber-800">
          <div className="flex items-center gap-2 font-semibold">
            <ShieldAlert className="size-4" />
            服务端写入尚未启用
          </div>
          <p className="mt-2">请先为 `server` 配置 `GAUBEE_2FA_ADMIN_TOKEN`，然后再通过后台保存计费策略。</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={billing.adminTokenConfigured ? "success" : "warning"}>
          {billing.adminTokenConfigured ? "Server Write Enabled" : "Server Read-only"}
        </Badge>
        <Badge variant={tokenReady ? "success" : "outline"}>
          {tokenReady ? "Browser Token Ready" : "Browser Token Missing"}
        </Badge>
        <Dialog open={tokenDialogOpen} onOpenChange={setTokenDialogOpen}>
          <DialogTrigger asChild>
            <Button type="button" variant="outline">
              <KeyRound className="size-4" />
              管理 Token
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>配置 Admin Token</DialogTitle>
              <DialogDescription>这个 token 只保存在当前浏览器，用于调用带写权限的 admin API。</DialogDescription>
            </DialogHeader>
            <Input value={adminToken} onChange={(event) => setAdminToken(event.target.value)} placeholder="输入 GAUBEE_2FA_ADMIN_TOKEN" autoComplete="off" />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleTokenClear}>
                <Trash2 className="size-4" />
                清除本地 Token
              </Button>
              <Button type="button" onClick={handleTokenSave}>
                <ShieldCheck className="size-4" />
                保存 Token
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1">
          Cloud 1K 年费 USD
          <Input value={formState.cloud1kAnnualUsd} onChange={(event) => setFormState((prev) => ({ ...prev, cloud1kAnnualUsd: event.target.value }))} inputMode="numeric" />
        </label>
        <label className="grid gap-1">
          Cloud 1K 年费 CNY
          <Input value={formState.cloud1kAnnualCny} onChange={(event) => setFormState((prev) => ({ ...prev, cloud1kAnnualCny: event.target.value }))} inputMode="numeric" />
        </label>
        <label className="grid gap-1">
          停付后的写入宽限天数
          <Input value={formState.graceDays} onChange={(event) => setFormState((prev) => ({ ...prev, graceDays: event.target.value }))} inputMode="numeric" />
        </label>
        <label className="grid gap-1">
          只读保档天数
          <Input value={formState.readonlyDays} onChange={(event) => setFormState((prev) => ({ ...prev, readonlyDays: event.target.value }))} inputMode="numeric" />
        </label>
      </div>

      <div className="rounded-2xl border border-border/80 bg-background/75 p-4 font-[IBM_Plex_Mono] text-xs text-slate-700">
        <Textarea value={currentPolicyJson} readOnly className="min-h-36 border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => setFormState(toFormState(billing.policy))} disabled={!isDirty || mutation.isPending}>
          <RotateCcw className="size-4" />
          重置
        </Button>
        <Button type="button" variant="outline" onClick={() => void handleCopyPolicy()}>
          <Copy className="size-4" />
          复制已保存 JSON
        </Button>
        <Button type="button" onClick={handleSave} disabled={!isDirty || mutation.isPending}>
          <Save className="size-4" />
          {mutation.isPending ? "保存中..." : "保存到服务端"}
        </Button>
      </div>
    </div>
  );
}

function toFormState(policy: AdminBillingPolicy): BillingPolicyFormState {
  return {
    cloud1kAnnualUsd: String(policy.cloud1kAnnualUsd),
    cloud1kAnnualCny: String(policy.cloud1kAnnualCny),
    graceDays: String(policy.graceDays),
    readonlyDays: String(policy.readonlyDays),
  };
}

function parseFormState(formState: BillingPolicyFormState) {
  return adminBillingPolicySchema.safeParse({
    cloud1kAnnualUsd: Number.parseInt(formState.cloud1kAnnualUsd, 10),
    cloud1kAnnualCny: Number.parseInt(formState.cloud1kAnnualCny, 10),
    graceDays: Number.parseInt(formState.graceDays, 10),
    readonlyDays: Number.parseInt(formState.readonlyDays, 10),
  });
}
