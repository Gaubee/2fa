import { z } from "zod";

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export const databaseKindSchema = z.enum(["sqlite", "postgres"]);
export type AdminDatabaseKind = z.infer<typeof databaseKindSchema>;

export const adminTopologyNodeSchema = z.object({
  name: z.string(),
  role: z.string(),
  status: z.enum(["healthy", "warning"]),
  region: z.string(),
  detail: z.string(),
});

export const adminChecklistItemSchema = z.object({
  label: z.string(),
  done: z.boolean(),
});

export const adminOverviewResponseSchema = z.object({
  generatedAtMs: z.number().int(),
  databaseKind: databaseKindSchema,
  activeVaults24h: z.number().int().nonnegative(),
  paidAccounts: z.number().int().nonnegative(),
  activeSessions: z.number().int().nonnegative(),
  recentOps24h: z.number().int().nonnegative(),
  topology: z.array(adminTopologyNodeSchema),
  checklist: z.array(adminChecklistItemSchema),
});
export type AdminOverviewResponse = z.infer<typeof adminOverviewResponseSchema>;

export const adminBillingSummarySchema = z.object({
  totalAccounts: z.number().int().nonnegative(),
  paidAccounts: z.number().int().nonnegative(),
  activeAccounts: z.number().int().nonnegative(),
  readOnlyAccounts: z.number().int().nonnegative(),
});

export const adminBillingPolicySchema = z.object({
  cloud1kAnnualUsd: z.number().int().nonnegative(),
  cloud1kAnnualCny: z.number().int().nonnegative(),
  graceDays: z.number().int().nonnegative(),
  readonlyDays: z.number().int().nonnegative(),
});
export type AdminBillingPolicy = z.infer<typeof adminBillingPolicySchema>;

export const adminBillingPlanSchema = z.object({
  planKey: z.string(),
  name: z.string(),
  quota: z.string(),
  cycle: z.string(),
  writeAccess: z.string(),
  archive: z.string(),
  accountCount: z.number().int().nonnegative(),
  activeCount: z.number().int().nonnegative(),
});
export type AdminBillingPlan = z.infer<typeof adminBillingPlanSchema>;

export const adminBillingResponseSchema = z.object({
  generatedAtMs: z.number().int(),
  adminTokenConfigured: z.boolean(),
  summary: adminBillingSummarySchema,
  policy: adminBillingPolicySchema,
  plans: z.array(adminBillingPlanSchema),
});
export type AdminBillingResponse = z.infer<typeof adminBillingResponseSchema>;

export const adminStorageSummarySchema = z.object({
  totalVaults: z.number().int().nonnegative(),
  totalOps: z.number().int().nonnegative(),
  activeSessions: z.number().int().nonnegative(),
  totalAuditLogs: z.number().int().nonnegative(),
});

export const adminStorageNodeSchema = z.object({
  provider: z.string(),
  region: z.string(),
  engine: z.string(),
  websocket: z.string(),
  status: z.enum(["online", "degraded"]),
  records: z.number().int().nonnegative(),
  lastEventAtMs: z.number().int().nullable(),
});
export type AdminStorageNode = z.infer<typeof adminStorageNodeSchema>;

export const adminStorageResponseSchema = z.object({
  generatedAtMs: z.number().int(),
  databaseKind: databaseKindSchema,
  summary: adminStorageSummarySchema,
  nodes: z.array(adminStorageNodeSchema),
});
export type AdminStorageResponse = z.infer<typeof adminStorageResponseSchema>;

export const adminAuditLogSchema = z.object({
  id: z.string(),
  level: z.enum(["info", "warning", "critical"]),
  actor: z.string(),
  action: z.string(),
  target: z.string(),
  createdAtMs: z.number().int(),
});
export type AdminAuditLog = z.infer<typeof adminAuditLogSchema>;

export const adminAuditResponseSchema = z.object({
  generatedAtMs: z.number().int(),
  totalLogs: z.number().int().nonnegative(),
  logs: z.array(adminAuditLogSchema),
});
export type AdminAuditResponse = z.infer<typeof adminAuditResponseSchema>;

export const adminBackupTemplateResponseSchema = z.object({
  generatedAtMs: z.number().int(),
  template: jsonValueSchema,
});
export type AdminBackupTemplateResponse = z.infer<typeof adminBackupTemplateResponseSchema>;
