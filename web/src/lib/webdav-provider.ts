import type { Entry } from "@/lib/otp";
import { buildWebDavSnapshot, parseWebDavSnapshot, type WebDavManifest } from "@/lib/webdav-snapshot";

const COLLECTION_NAME = ".gaubee-2fa";
const MANIFEST_FILE = "manifest.json";
const SNAPSHOT_FILE = "vault.ndjson";

export interface WebDavConfig {
  baseUrl: string;
  username: string;
  password: string;
  vaultSecret: string;
  revision: string;
}

export interface WebDavPullResult {
  entries: Entry[];
  manifest: WebDavManifest | null;
}

export async function verifyWebDavConfig(config: WebDavConfig): Promise<{ manifest: WebDavManifest | null }> {
  const normalized = normalizeWebDavBaseUrl(config.baseUrl);
  const manifest = await fetchManifest({ ...config, baseUrl: normalized });
  return { manifest };
}

export async function pullWebDavVault(config: WebDavConfig): Promise<WebDavPullResult> {
  const normalized = normalizeWebDavBaseUrl(config.baseUrl);
  const manifest = await fetchManifest({ ...config, baseUrl: normalized });
  if (!manifest) {
    return { entries: [], manifest: null };
  }
  const ndjsonText = await fetchText(joinPath(normalized, COLLECTION_NAME, SNAPSHOT_FILE), buildHeaders(config));
  return {
    entries: await parseWebDavSnapshot(config.vaultSecret, ndjsonText),
    manifest,
  };
}

export async function pushWebDavVault(config: WebDavConfig, entries: Entry[], updatedAtMs: number): Promise<WebDavManifest> {
  const normalized = normalizeWebDavBaseUrl(config.baseUrl);
  const remoteManifest = await fetchManifest({ ...config, baseUrl: normalized });
  if (remoteManifest && remoteManifest.revision !== config.revision) {
    throw new Error("WEBDAV_REVISION_CONFLICT");
  }
  if (!remoteManifest && config.revision) {
    throw new Error("WEBDAV_REVISION_CONFLICT");
  }

  const snapshot = await buildWebDavSnapshot(config.vaultSecret, entries, updatedAtMs);
  await ensureCollection(normalized, config);
  await writeText(joinPath(normalized, COLLECTION_NAME, SNAPSHOT_FILE), snapshot.ndjsonText, buildHeaders(config));
  await writeText(
    joinPath(normalized, COLLECTION_NAME, MANIFEST_FILE),
    JSON.stringify(snapshot.manifest, null, 2),
    buildHeaders(config, { "content-type": "application/json" }),
  );
  return snapshot.manifest;
}

export function normalizeWebDavBaseUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/+$/, "");
  }
  if (/^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\])(?::\d+)?(?:\/.*)?$/i.test(trimmed)) {
    return `http://${trimmed}`.replace(/\/+$/, "");
  }
  if (/^[a-z0-9.-]+(?::\d+)?(?:\/.*)?$/i.test(trimmed)) {
    return `https://${trimmed}`.replace(/\/+$/, "");
  }
  return new URL(trimmed, window.location.href).toString().replace(/\/+$/, "");
}

async function ensureCollection(baseUrl: string, config: WebDavConfig): Promise<void> {
  const response = await fetch(joinPath(baseUrl, COLLECTION_NAME), {
    method: "MKCOL",
    headers: buildHeaders(config),
  });
  if (response.ok || response.status === 405 || response.status === 409) {
    return;
  }
  throw new Error(await readError(response, "WEBDAV_MKCOL_FAILED"));
}

async function fetchManifest(config: WebDavConfig): Promise<WebDavManifest | null> {
  const response = await fetch(joinPath(config.baseUrl, COLLECTION_NAME, MANIFEST_FILE), {
    method: "GET",
    headers: buildHeaders(config),
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(await readError(response, "WEBDAV_MANIFEST_REQUEST_FAILED"));
  }
  const value = (await response.json()) as unknown;
  return parseManifest(value);
}

async function fetchText(url: string, headers: HeadersInit): Promise<string> {
  const response = await fetch(url, { method: "GET", headers });
  if (!response.ok) {
    throw new Error(await readError(response, "WEBDAV_READ_FAILED"));
  }
  return response.text();
}

async function writeText(url: string, text: string, headers: HeadersInit): Promise<void> {
  const response = await fetch(url, {
    method: "PUT",
    headers,
    body: text,
  });
  if (!response.ok) {
    throw new Error(await readError(response, "WEBDAV_WRITE_FAILED"));
  }
}

function buildHeaders(config: Pick<WebDavConfig, "username" | "password">, extra: Record<string, string> = {}): HeadersInit {
  return {
    authorization: `Basic ${btoa(`${config.username}:${config.password}`)}`,
    ...extra,
  };
}

function joinPath(baseUrl: string, ...segments: string[]): string {
  const trimmed = segments.map((segment) => segment.replace(/^\/+|\/+$/g, "")).filter(Boolean).join("/");
  return `${baseUrl.replace(/\/+$/, "")}/${trimmed}`;
}

function parseManifest(value: unknown): WebDavManifest {
  if (!value || typeof value !== "object") {
    throw new Error("WEBDAV_INVALID_MANIFEST");
  }
  const typed = value as Partial<WebDavManifest>;
  if (
    typed.version !== 1 ||
    typeof typed.revision !== "string" ||
    typeof typed.entryCount !== "number" ||
    typeof typed.updatedAtMs !== "number" ||
    typeof typed.hashHex !== "string" ||
    typed.format !== "gaubee-2fa-v1-ndjson"
  ) {
    throw new Error("WEBDAV_INVALID_MANIFEST");
  }
  return {
    version: 1,
    revision: typed.revision,
    entryCount: typed.entryCount,
    updatedAtMs: typed.updatedAtMs,
    hashHex: typed.hashHex,
    format: "gaubee-2fa-v1-ndjson",
  };
}

async function readError(response: Response, fallback: string): Promise<string> {
  const text = await response.text();
  return text.trim() || fallback;
}
