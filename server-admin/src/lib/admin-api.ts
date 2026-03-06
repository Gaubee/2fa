import { queryOptions } from "@tanstack/react-query";
import type { ZodType } from "zod";

import {
  adminAuditResponseSchema,
  adminBackupTemplateResponseSchema,
  adminBillingPolicySchema,
  adminBillingResponseSchema,
  adminOverviewResponseSchema,
  adminStorageResponseSchema,
  type AdminBillingPolicy,
  type AdminBillingResponse,
} from "@/lib/admin-types";

export const adminQueryKey = ["admin"] as const;

export const adminOverviewOptions = queryOptions({
  queryKey: [...adminQueryKey, "overview"] as const,
  queryFn: () => requestJson("/api/v1/admin/overview", adminOverviewResponseSchema),
  staleTime: 15_000,
});

export const adminBillingOptions = queryOptions({
  queryKey: [...adminQueryKey, "billing"] as const,
  queryFn: () => requestJson("/api/v1/admin/billing", adminBillingResponseSchema),
  staleTime: 15_000,
});

export const adminStorageOptions = queryOptions({
  queryKey: [...adminQueryKey, "storage"] as const,
  queryFn: () => requestJson("/api/v1/admin/storage", adminStorageResponseSchema),
  staleTime: 15_000,
});

export const adminAuditOptions = queryOptions({
  queryKey: [...adminQueryKey, "audit"] as const,
  queryFn: () => requestJson("/api/v1/admin/audit", adminAuditResponseSchema),
  staleTime: 10_000,
});

export const adminBackupTemplateOptions = queryOptions({
  queryKey: [...adminQueryKey, "backup-template"] as const,
  queryFn: () => requestJson("/api/v1/admin/backup/template", adminBackupTemplateResponseSchema),
  staleTime: 15_000,
});

export async function updateAdminBillingPolicy(policy: AdminBillingPolicy, adminToken: string): Promise<AdminBillingResponse> {
  const parsedPolicy = adminBillingPolicySchema.parse(policy);
  return requestJson("/api/v1/admin/billing/policy", adminBillingResponseSchema, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Token": adminToken,
    },
    body: JSON.stringify(parsedPolicy),
  });
}

async function requestJson<T>(path: string, schema: ZodType<T>, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: {
      Accept: "application/json",
      ...init?.headers,
    },
    ...init,
  });

  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(extractErrorMessage(payload, `${response.status} ${response.statusText}`));
  }

  return schema.parse(payload);
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (!isRecord(payload)) {
    return fallback;
  }
  const error = payload.error;
  if (typeof error !== "string" || error.length === 0) {
    return fallback;
  }
  const code = payload.code;
  return typeof code === "string" && code.length > 0 ? `${code}: ${error}` : error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
