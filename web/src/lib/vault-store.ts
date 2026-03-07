import { createId, normalizeSecret, validateSecret, type Entry } from "@/lib/otp";

const LEGACY_ENTRIES_KEY = "totp.entries.v2";
const VAULT_STORAGE_KEY = "gaubee-2fa.vault.v3";
const FALLBACK_VAULT_STORAGE_KEYS = ["gaubee-2fa.vault.v2", "gaubee-2fa.vault.v1"];

export type ProviderKind = "local" | "github-gist" | "google-drive" | "webdav";
export type ProviderStatus = "ready" | "planned";

export interface ProviderState {
  id: ProviderKind;
  kind: ProviderKind;
  label: string;
  enabled: boolean;
  status: ProviderStatus;
  lastSyncAtMs: number | null;
}

export interface WebDavState {
  baseUrl: string;
  username: string;
  password: string;
  vaultSecret: string;
  revision: string;
  lastSyncAtMs: number | null;
}

export interface VaultState {
  schemaVersion: 3;
  entries: Entry[];
  providers: ProviderState[];
  updatedAtMs: number;
  webdav: WebDavState;
}

export function loadVaultState(): VaultState {
  const next = readVaultState();
  if (next) {
    return next;
  }

  return {
    schemaVersion: 3,
    entries: readLegacyEntries(),
    providers: defaultProviders(),
    updatedAtMs: Date.now(),
    webdav: defaultWebDavState(),
  };
}

export function saveVaultState(state: VaultState): void {
  localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(state));
  for (const key of FALLBACK_VAULT_STORAGE_KEYS) {
    localStorage.removeItem(key);
  }
  localStorage.removeItem(LEGACY_ENTRIES_KEY);
}

export function defaultWebDavState(): WebDavState {
  return {
    baseUrl: "",
    username: "",
    password: "",
    vaultSecret: "",
    revision: "",
    lastSyncAtMs: null,
  };
}

function readVaultState(): VaultState | null {
  try {
    const raw = localStorage.getItem(VAULT_STORAGE_KEY) ?? readFallbackVaultState();
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const typed = parsed as Partial<VaultState> & { selfHosted?: unknown };
    const webdav = sanitizeWebDav((typed as Record<string, unknown>).webdav);
    return {
      schemaVersion: 3,
      entries: sanitizeEntries(typed.entries),
      providers: sanitizeProviders(typed.providers, webdav.lastSyncAtMs, isConfiguredWebDav(webdav)),
      updatedAtMs: typeof typed.updatedAtMs === "number" ? typed.updatedAtMs : Date.now(),
      webdav,
    };
  } catch {
    return null;
  }
}

function readFallbackVaultState(): string | null {
  for (const key of FALLBACK_VAULT_STORAGE_KEYS) {
    const raw = localStorage.getItem(key);
    if (raw) {
      return raw;
    }
  }
  return null;
}

function readLegacyEntries(): Entry[] {
  try {
    const raw = localStorage.getItem(LEGACY_ENTRIES_KEY);
    if (!raw) {
      return [];
    }
    return sanitizeEntries(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

function sanitizeEntries(value: unknown): Entry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const typed = item as Partial<Entry>;
      const label = typeof typed.label === "string" ? typed.label.trim() : "";
      const secret = typeof typed.secret === "string" ? normalizeSecret(typed.secret) : "";
      const id = typeof typed.id === "string" && typed.id ? typed.id : createId();
      if (!label || !secret || validateSecret(secret)) {
        return null;
      }
      return { id, label, secret };
    })
    .filter((entry): entry is Entry => entry !== null);
}

function sanitizeProviders(value: unknown, webdavLastSyncAtMs: number | null, webdavEnabled: boolean): ProviderState[] {
  const defaults = new Map(defaultProviders().map((provider) => [provider.id, provider]));
  if (!Array.isArray(value)) {
    defaults.set("webdav", {
      ...defaults.get("webdav")!,
      enabled: webdavEnabled,
      lastSyncAtMs: webdavLastSyncAtMs,
    });
    return [...defaults.values()];
  }

  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const typed = item as Partial<ProviderState>;
    const id = typed.id;
    if (!id || !defaults.has(id)) {
      continue;
    }

    defaults.set(id, {
      id,
      kind: id,
      label: typeof typed.label === "string" ? typed.label : defaults.get(id)!.label,
      enabled: typeof typed.enabled === "boolean" ? typed.enabled : defaults.get(id)!.enabled,
      status: id === "local" || id === "webdav" ? "ready" : typed.status === "ready" ? "ready" : "planned",
      lastSyncAtMs: typeof typed.lastSyncAtMs === "number" ? typed.lastSyncAtMs : defaults.get(id)!.lastSyncAtMs,
    });
  }

  defaults.set("webdav", {
    ...defaults.get("webdav")!,
    enabled: webdavEnabled,
    lastSyncAtMs: webdavLastSyncAtMs,
    status: "ready",
  });

  return [...defaults.values()];
}

function sanitizeWebDav(value: unknown): WebDavState {
  if (!value || typeof value !== "object") {
    return defaultWebDavState();
  }
  const typed = value as Partial<WebDavState>;
  return {
    baseUrl: typeof typed.baseUrl === "string" ? typed.baseUrl.trim() : "",
    username: typeof typed.username === "string" ? typed.username.trim() : "",
    password: typeof typed.password === "string" ? typed.password.trim() : "",
    vaultSecret: typeof typed.vaultSecret === "string" ? typed.vaultSecret : "",
    revision: typeof typed.revision === "string" ? typed.revision : "",
    lastSyncAtMs: typeof typed.lastSyncAtMs === "number" ? typed.lastSyncAtMs : null,
  };
}

function defaultProviders(): ProviderState[] {
  return [
    { id: "local", kind: "local", label: "Local Vault", enabled: true, status: "ready", lastSyncAtMs: null },
    { id: "github-gist", kind: "github-gist", label: "GitHub Gist", enabled: false, status: "planned", lastSyncAtMs: null },
    { id: "google-drive", kind: "google-drive", label: "Google Drive", enabled: false, status: "planned", lastSyncAtMs: null },
    { id: "webdav", kind: "webdav", label: "WebDAV", enabled: false, status: "ready", lastSyncAtMs: null },
  ];
}

export function isConfiguredWebDav(state: WebDavState): boolean {
  return Boolean(state.baseUrl && state.username && state.password && state.vaultSecret);
}
