import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Download, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { adminBackupTemplateOptions, adminQueryKey } from "@/lib/admin-api";

export function HeaderActions() {
  const queryClient = useQueryClient();
  const backupQuery = useQuery(adminBackupTemplateOptions);
  const backupText = useMemo(() => {
    if (backupQuery.data) {
      return JSON.stringify(backupQuery.data.template, null, 2);
    }
    if (backupQuery.isError) {
      return backupQuery.error.message;
    }
    return "正在从 /api/v1/admin/backup/template 读取当前配置快照...";
  }, [backupQuery.data, backupQuery.error, backupQuery.isError]);

  const handleCopy = async () => {
    if (!backupQuery.data) {
      toast.error("配置快照尚未准备好。");
      return;
    }
    await navigator.clipboard.writeText(backupText);
    toast.success("备份配置已复制到剪贴板。", {
      description: "这份内容可直接作为导出模板或外部备份的输入。",
    });
  };

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: adminQueryKey });
    toast.success("后台数据已请求刷新。");
  };

  const statusLabel = backupQuery.isError
    ? "Admin API Error"
    : backupQuery.isPending
      ? "Admin API Loading"
      : "Admin API Ready";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700">
        <Sparkles className="size-3.5" />
        {statusLabel}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => void handleRefresh()}>
        <RefreshCw className="size-4" />
        刷新后台数据
      </Button>
      <Dialog>
        <DialogTrigger asChild>
          <Button type="button" size="sm">
            <Download className="size-4" />
            查看备份模板
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>导出后台配置快照</DialogTitle>
            <DialogDescription>内容直接来自当前服务端的备份模板接口，可复制到外部系统做归档。</DialogDescription>
          </DialogHeader>
          <Textarea value={backupText} readOnly className="min-h-72 font-[IBM_Plex_Mono] text-xs" />
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => void handleRefresh()}>
              <RefreshCw className="size-4" />
              重新拉取
            </Button>
            <Button type="button" onClick={() => void handleCopy()} disabled={!backupQuery.data}>
              <Copy className="size-4" />
              复制 JSON
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
