import { createId, normalizeSecret, validateSecret, type Entry } from "@/lib/otp";

const LEGACY_ENTRIES_KEY = "totp.entries.v2";
const VAULT_STORAGE_KEY = "gaubee-2fa.vault.v2";
const FALLBACK_VAULT_STORAGE_KEY = "gaubee-2fa.vault.v1";

export type ProviderKind = "local" | "github-gist" | "google-drive" | "self-hosted";
export type ProviderStatus = "ready" | "planned";

export interface ProviderState {
  id: ProviderKind;
  kind: ProviderKind;
  label: string;
  enabled: boolean;
  status: ProviderStatus;
  lastSyncAtMs: number | null;
}

export interface VaultEntitlement {
  plan: string;
  status: string;
  writeEnabledUntilMs: number;
  archiveUntilMs: number;
}

export interface SelfHostedState {
  baseUrl: string;
  deviceId: string;
  publicKeyHex: string;
  vaultId: string;
  sessionToken: string;
  sessionExpiresAtMs: number | null;
  revision: string;
  lastSyncAtMs: number | null;
  entitlement: VaultEntitlement | null;
}

export interface VaultState {
  schemaVersion: 2;
  entries: Entry[];
  providers: ProviderState[];
  updatedAtMs: number;
  selfHosted: SelfHostedState;
}

export function loadVaultState(): VaultState {
  const next = readVaultState();
  if (next) {
    return next;
  }

  return {
    schemaVersion: 2,
    entries: readLegacyEntries(),
    providers: defaultProviders(),
    updatedAtMs: Date.now(),
    selfHosted: defaultSelfHostedState(),
  };
}

export function saveVaultState(state: VaultState): void {
  localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(state));
  localStorage.removeItem(FALLBACK_VAULT_STORAGE_KEY);
  localStorage.removeItem(LEGACY_ENTRIES_KEY);
}

export function defaultSelfHostedState(): SelfHostedState {
  return {
    baseUrl: "",
    deviceId: "",
    publicKeyHex: "",
    vaultId: "",
    sessionToken: "",
    sessionExpiresAtMs: null,
    revision: "0:0",
    lastSyncAtMs: null,
    entitlement: null,
  };
}

function readVaultState(): VaultState | null {
  try {
    const raw = localStorage.getItem(VAULT_STORAGE_KEY) ?? localStorage.getItem(FALLBACK_VAULT_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const typed = parsed as Partial<VaultState>;
    const selfHosted = sanitizeSelfHosted((typed as Record<string, unknown>).selfHosted);
    return {
      schemaVersion: 2,
      entries: sanitizeEntries(typed.entries),
      providers: sanitizeProviders(typed.providers, selfHosted.lastSyncAtMs, Boolean(selfHosted.sessionToken)),
      updatedAtMs: typeof typed.updatedAtMs === "number" ? typed.updatedAtMs : Date.now(),
      selfHosted,
    };
  } catch {
    return null;
  }
}

function readLegacyEntries(): Entry[] {
  try {
    const raw = localStorage.getItem(LEGACY_ENTRIES_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    return sanitizeEntries(parsed);
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

function sanitizeProviders(
  value: unknown,
  selfHostedLastSyncAtMs: number | null,
  selfHostedEnabled: boolean,
): ProviderState[] {
  const defaults = new Map(defaultProviders().map((provider) => [provider.id, provider]));
  if (!Array.isArray(value)) {
    defaults.set("self-hosted", {
      ...defaults.get("self-hosted")!,
      enabled: selfHostedEnabled,
      lastSyncAtMs: selfHostedLastSyncAtMs,
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
      status: id === "local" || id === "self-hosted" ? "ready" : typed.status === "ready" ? "ready" : "planned",
      lastSyncAtMs: typeof typed.lastSyncAtMs === "number" ? typed.lastSyncAtMs : defaults.get(id)!.lastSyncAtMs,
    });
  }

  defaults.set("self-hosted", {
    ...defaults.get("self-hosted")!,
    enabled: selfHostedEnabled,
    lastSyncAtMs: selfHostedLastSyncAtMs,
    status: "ready",
  });

  return [...defaults.values()];
}

function sanitizeSelfHosted(value: unknown): SelfHostedState {
  if (!value || typeof value !== "object") {
    return defaultSelfHostedState();
  }

  const typed = value as Partial<SelfHostedState>;
  return {
    baseUrl: typeof typed.baseUrl === "string" ? typed.baseUrl.trim() : "",
    deviceId: typeof typed.deviceId === "string" ? typed.deviceId : "",
    publicKeyHex: typeof typed.publicKeyHex === "string" ? typed.publicKeyHex : "",
    vaultId: typeof typed.vaultId === "string" ? typed.vaultId : "",
    sessionToken: typeof typed.sessionToken === "string" ? typed.sessionToken : "",
    sessionExpiresAtMs: typeof typed.sessionExpiresAtMs === "number" ? typed.sessionExpiresAtMs : null,
    revision: typeof typed.revision === "string" && typed.revision ? typed.revision : "0:0",
    lastSyncAtMs: typeof typed.lastSyncAtMs === "number" ? typed.lastSyncAtMs : null,
    entitlement: sanitizeEntitlement(typed.entitlement),
  };
}

function sanitizeEntitlement(value: unknown): VaultEntitlement | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const typed = value as Partial<VaultEntitlement>;
  if (
    typeof typed.plan !== "string" ||
    typeof typed.status !== "string" ||
    typeof typed.writeEnabledUntilMs !== "number" ||
    typeof typed.archiveUntilMs !== "number"
  ) {
    return null;
  }

  return {
    plan: typed.plan,
    status: typed.status,
    writeEnabledUntilMs: typed.writeEnabledUntilMs,
    archiveUntilMs: typed.archiveUntilMs,
  };
}

function defaultProviders(): ProviderState[] {
  return [
    { id: "local", kind: "local", label: "Local Vault", enabled: true, status: "ready", lastSyncAtMs: null },
    { id: "github-gist", kind: "github-gist", label: "GitHub Gist", enabled: false, status: "planned", lastSyncAtMs: null },
    { id: "google-drive", kind: "google-drive", label: "Google Drive", enabled: false, status: "planned", lastSyncAtMs: null },
    { id: "self-hosted", kind: "self-hosted", label: "Self Provider", enabled: false, status: "ready", lastSyncAtMs: null },
  ];
}
