import type { AdminDatabaseKind } from "@/lib/admin-types";

const countFormatter = new Intl.NumberFormat("zh-CN");
const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const fullDateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function formatCount(value: number): string {
  return countFormatter.format(value);
}

export function formatDateTime(value: number): string {
  return dateTimeFormatter.format(value);
}

export function formatFullDateTime(value: number): string {
  return fullDateTimeFormatter.format(value);
}

export function formatOptionalDateTime(value: number | null): string {
  return value === null ? "暂无事件" : formatDateTime(value);
}

export function formatDatabaseKind(value: AdminDatabaseKind): string {
  return value === "sqlite" ? "SQLite" : "PostgreSQL";
}
