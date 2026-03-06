import { Outlet } from "@tanstack/react-router";

import { AdminSidebar } from "@/components/admin-sidebar";
import { HeaderActions } from "@/components/header-actions";

export function AppShell() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="admin-grid mx-auto min-h-dvh max-w-[1680px]">
        <AdminSidebar />
        <main className="min-w-0 px-4 py-4 md:px-6 md:py-5">
          <header className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-border/70 bg-white/72 px-5 py-4 shadow-[0_18px_48px_-34px_rgba(15,23,42,0.4)] backdrop-blur">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-700">Operations Console</p>
              <h2 className="mt-1 text-xl font-extrabold tracking-tight text-slate-950">支付、同步、备份与审计都集中在这里</h2>
            </div>
            <HeaderActions />
          </header>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
