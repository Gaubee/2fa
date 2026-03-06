import type { LucideIcon } from "lucide-react";
import { Activity, Database, LayoutDashboard, WalletCards } from "lucide-react";

export interface AdminNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  hint: string;
}

export const adminNavItems: AdminNavItem[] = [
  { to: "/", label: "概览", icon: LayoutDashboard, hint: "运行态与发布节奏" },
  { to: "/billing", label: "支付配置", icon: WalletCards, hint: "套餐、价格、宽限期" },
  { to: "/storage", label: "存储拓扑", icon: Database, hint: "节点、同步、备份" },
  { to: "/audit", label: "审计日志", icon: Activity, hint: "关键写操作与追踪" },
];

export const repositoryUrl = "https://github.com/Gaubee/2fa";
