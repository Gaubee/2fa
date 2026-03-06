import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowUpRight, Github } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { adminNavItems, repositoryUrl } from "@/lib/admin-shell";
import { cn } from "@/lib/utils";

export function AdminSidebar() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <aside className="sticky top-0 flex h-dvh flex-col border-r border-sidebar-border bg-sidebar/92 px-4 py-5 text-sidebar-foreground backdrop-blur-xl">
      <div className="rounded-3xl border border-white/50 bg-white/70 p-4 shadow-[0_12px_40px_-28px_rgba(15,23,42,0.45)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-700">Gaubee 2FA</p>
            <h1 className="mt-1 text-xl font-extrabold tracking-tight text-slate-900">Server Admin</h1>
          </div>
          <Badge variant="success">Alpha</Badge>
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-600">面向自托管与商业运营的后台控制台，实时读取服务端关于支付、拓扑、同步与审计的信息。</p>
      </div>

      <nav className="mt-6 grid gap-2">
        {adminNavItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "group rounded-2xl border px-3 py-3 transition-colors",
                active
                  ? "border-teal-500/20 bg-teal-500/10 text-slate-900"
                  : "border-transparent bg-white/55 text-slate-600 hover:border-sidebar-border hover:bg-white/80 hover:text-slate-900",
              )}
            >
              <div className="flex items-center gap-3">
                <span className={cn("rounded-xl p-2", active ? "bg-teal-600 text-white" : "bg-slate-900/5 text-slate-700 group-hover:bg-slate-900/8")}>
                  <Icon className="size-4" />
                </span>
                <div>
                  <div className="text-sm font-semibold">{item.label}</div>
                  <div className="text-xs text-muted-foreground">{item.hint}</div>
                </div>
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-3xl border border-white/50 bg-white/70 p-4 shadow-[0_12px_40px_-28px_rgba(15,23,42,0.4)]">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Deploy</p>
        <div className="mt-2 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">GitHub Repository</p>
            <p className="text-xs text-muted-foreground">查看发布脚本、容器配置与自部署文档</p>
          </div>
          <a
            href={repositoryUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 transition hover:border-slate-300 hover:bg-slate-50"
          >
            <Github className="size-3.5" />
            Repo
            <ArrowUpRight className="size-3.5" />
          </a>
        </div>
      </div>
    </aside>
  );
}
