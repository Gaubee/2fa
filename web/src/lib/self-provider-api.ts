import { deriveIdentityWithRust, signChallengeWithRust } from "@/lib/rust-core";

export interface SelfProviderEntitlement {
  plan: string;
  status: string;
  writeEnabledUntilMs: number;
  archiveUntilMs: number;
}

export interface SelfProviderHlc {
  wallMs: number;
  counter: number;
  nodeId: string;
}

export interface SelfProviderSyncOp {
  opId: string;
  entityId: string;
  kind: string;
  hlc: SelfProviderHlc;
  cipherBase64: string;
  aadBase64: string;
  hashHex: string;
  deleted: boolean;
}

export interface SelfProviderSession {
  baseUrl: string;
  deviceId: string;
  publicKeyHex: string;
  sessionToken: string;
  sessionExpiresAtMs: number;
  vaultId: string;
  revision: string;
  entitlement: SelfProviderEntitlement | null;
}

export interface PullOpsResult {
  ops: SelfProviderSyncOp[];
  newRevision: string;
  cursor: string;
}

export interface PushOpsResult {
  acceptedOpIds: string[];
  rejectedOpIds: string[];
  newRevision: string;
}

interface ChallengeResponse {
  nonce: string;
  serverTimeMs: number;
  expiresAtMs: number;
}

interface SessionResponse {
  token: string;
  expiresAtMs: number;
  vaultId: string;
  entitlement: SelfProviderEntitlement | null;
}

export async function loginSelfProvider(input: {
  baseUrl: string;
  deviceId: string;
  secretInput: string;
}): Promise<SelfProviderSession> {
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const identity = await deriveIdentityWithRust(input.secretInput);
  const challenge = await postJson(`${baseUrl}/api/v1/auth/challenge`, {
    publicKeyHint: identity.publicKeyHex,
  }, parseChallengeResponse);
  const signed = await signChallengeWithRust(
    input.secretInput,
    challenge.nonce,
    Date.now(),
    input.deviceId,
  );
  const session = await postJson(
    `${baseUrl}/api/v1/auth/session`,
    {
      publicKeyHex: signed.publicKeyHex,
      signatureHex: signed.signatureHex,
      deviceId: signed.deviceId,
      timestampMs: signed.timestampMs,
      nonce: signed.nonce,
    },
    parseSessionResponse,
  );
  const revision = await getSelfProviderRevision({
    baseUrl,
    deviceId: input.deviceId,
    publicKeyHex: identity.publicKeyHex,
    sessionToken: session.token,
    sessionExpiresAtMs: session.expiresAtMs,
    vaultId: session.vaultId,
    revision: "0:0",
    entitlement: session.entitlement,
  });

  return {
    baseUrl,
    deviceId: input.deviceId,
    publicKeyHex: identity.publicKeyHex,
    sessionToken: session.token,
    sessionExpiresAtMs: session.expiresAtMs,
    vaultId: session.vaultId,
    revision: revision.revision,
    entitlement: session.entitlement,
  };
}

export async function pullSelfProviderOps(session: SelfProviderSession, baseRevision = ""): Promise<PullOpsResult> {
  const url = new URL(`${session.baseUrl}/api/v1/sync/pull`);
  url.searchParams.set("sessionToken", session.sessionToken);
  url.searchParams.set("vaultId", session.vaultId);
  if (baseRevision) {
    url.searchParams.set("baseRevision", baseRevision);
  }
  return fetchJson(url.toString(), { method: "GET" }, parsePullOpsResponse);
}

export async function pushSelfProviderOps(
  session: SelfProviderSession,
  ops: SelfProviderSyncOp[],
  baseRevision = "",
): Promise<PushOpsResult> {
  return postJson(
    `${session.baseUrl}/api/v1/sync/push`,
    {
      sessionToken: session.sessionToken,
      vaultId: session.vaultId,
      baseRevision,
      ops,
    },
    parsePushOpsResponse,
  );
}

export async function getSelfProviderRevision(session: SelfProviderSession): Promise<{ revision: string }> {
  const url = new URL(`${session.baseUrl}/api/v1/sync/revision`);
  url.searchParams.set("sessionToken", session.sessionToken);
  url.searchParams.set("vaultId", session.vaultId);
  return fetchJson(url.toString(), { method: "GET" }, parseRevisionResponse);
}

export async function getSelfProviderEntitlement(
  session: SelfProviderSession,
): Promise<SelfProviderEntitlement | null> {
  const url = new URL(`${session.baseUrl}/api/v1/billing/entitlement`);
  url.searchParams.set("sessionToken", session.sessionToken);
  const response = await fetchJson(url.toString(), { method: "GET" }, parseEntitlementResponse);
  return response.entitlement;
}

export function normalizeBaseUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/$/, "");
  }

  if (/^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\])(?::\d+)?(?:\/.*)?$/i.test(trimmed)) {
    return `http://${trimmed}`.replace(/\/$/, "");
  }

  if (/^[a-z0-9.-]+(?::\d+)?(?:\/.*)?$/i.test(trimmed)) {
    return `https://${trimmed}`.replace(/\/$/, "");
  }

  return new URL(trimmed, window.location.href).toString().replace(/\/$/, "");
}

export function createDeviceId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function postJson<T>(
  url: string,
  body: Record<string, unknown>,
  parser: (value: unknown) => T,
): Promise<T> {
  return fetchJson(
    url,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
    parser,
  );
}

async function fetchJson<T>(
  url: string,
  init: RequestInit,
  parser: (value: unknown) => T,
): Promise<T> {
  const response = await fetch(url, init);
  const value = (await response.json()) as unknown;

  if (!response.ok) {
    throw new Error(readApiError(value, response.statusText));
  }

  return parser(value);
}

function readApiError(value: unknown, fallback: string): string {
  const record = asRecord(value);
  const error = record?.error;
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  return fallback || "请求失败";
}

function parseChallengeResponse(value: unknown): ChallengeResponse {
  const record = expectRecord(value);
  return {
    nonce: expectString(record, "nonce"),
    serverTimeMs: expectNumber(record, "serverTimeMs"),
    expiresAtMs: expectNumber(record, "expiresAtMs"),
  };
}

function parseSessionResponse(value: unknown): SessionResponse {
  const record = expectRecord(value);
  return {
    token: expectString(record, "token"),
    expiresAtMs: expectNumber(record, "expiresAtMs"),
    vaultId: expectString(record, "vaultId"),
    entitlement: parseOptionalEntitlement(record.entitlement),
  };
}

function parsePullOpsResponse(value: unknown): PullOpsResult {
  const record = expectRecord(value);
  const ops = record.ops;
  if (!Array.isArray(ops)) {
    throw new Error("SELF_PROVIDER_INVALID_PULL_RESPONSE");
  }

  return {
    ops: ops.map(parseSyncOp),
    newRevision: expectString(record, "newRevision"),
    cursor: expectString(record, "cursor"),
  };
}

function parsePushOpsResponse(value: unknown): PushOpsResult {
  const record = expectRecord(value);
  return {
    acceptedOpIds: expectStringArray(record, "acceptedOpIds"),
    rejectedOpIds: expectStringArray(record, "rejectedOpIds"),
    newRevision: expectString(record, "newRevision"),
  };
}

function parseRevisionResponse(value: unknown): { revision: string } {
  const record = expectRecord(value);
  return { revision: expectString(record, "revision") };
}

function parseEntitlementResponse(value: unknown): { entitlement: SelfProviderEntitlement | null } {
  const record = expectRecord(value);
  return {
    entitlement: parseOptionalEntitlement(record.entitlement),
  };
}

function parseSyncOp(value: unknown): SelfProviderSyncOp {
  const record = expectRecord(value);
  return {
    opId: expectString(record, "opId"),
    entityId: expectString(record, "entityId"),
    kind: expectString(record, "kind"),
    hlc: parseHlc(record.hlc),
    cipherBase64: expectString(record, "cipherBase64"),
    aadBase64: expectString(record, "aadBase64"),
    hashHex: expectString(record, "hashHex"),
    deleted: expectBoolean(record, "deleted"),
  };
}

function parseHlc(value: unknown): SelfProviderHlc {
  const record = expectRecord(value);
  return {
    wallMs: expectNumber(record, "wallMs"),
    counter: expectNumber(record, "counter"),
    nodeId: expectString(record, "nodeId"),
  };
}

function parseOptionalEntitlement(value: unknown): SelfProviderEntitlement | null {
  if (value == null) {
    return null;
  }
  const record = expectRecord(value);
  return {
    plan: expectString(record, "plan"),
    status: expectString(record, "status"),
    writeEnabledUntilMs: expectNumber(record, "writeEnabledUntilMs"),
    archiveUntilMs: expectNumber(record, "archiveUntilMs"),
  };
}

function expectRecord(value: unknown): Record<string, unknown> {
  const record = asRecord(value);
  if (!record) {
    throw new Error("SELF_PROVIDER_INVALID_RESPONSE");
  }
  return record;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as Record<string, unknown>;
}

function expectString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string") {
    throw new Error(`SELF_PROVIDER_INVALID_${key.toUpperCase()}`);
  }
  return value;
}

function expectNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== "number") {
    throw new Error(`SELF_PROVIDER_INVALID_${key.toUpperCase()}`);
  }
  return value;
}

function expectBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  if (typeof value !== "boolean") {
    throw new Error(`SELF_PROVIDER_INVALID_${key.toUpperCase()}`);
  }
  return value;
}

function expectStringArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`SELF_PROVIDER_INVALID_${key.toUpperCase()}`);
  }
  return [...value];
}
