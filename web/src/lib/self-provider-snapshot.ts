import { createId, normalizeSecret, validateSecret, type Entry } from "@/lib/otp";
import { decryptTextWithRust, encryptTextWithRust, type EncryptedTextEnvelope } from "@/lib/rust-core";
import type { SelfProviderSession, SelfProviderSyncOp } from "@/lib/self-provider-api";

const SNAPSHOT_ENTITY_ID = "vault-root";
const SNAPSHOT_KIND = "SNAPSHOT_V1";
const SNAPSHOT_VERSION = 1;

export interface VaultSnapshot {
  version: 1;
  entries: Entry[];
  updatedAtMs: number;
}

export async function buildSnapshotOp(
  secretInput: string,
  session: Pick<SelfProviderSession, "deviceId" | "vaultId">,
  snapshot: VaultSnapshot,
): Promise<SelfProviderSyncOp> {
  const aadText = JSON.stringify({
    schema: SNAPSHOT_KIND,
    version: SNAPSHOT_VERSION,
    entityId: SNAPSHOT_ENTITY_ID,
    vaultId: session.vaultId,
  });
  const encrypted = await encryptTextWithRust(secretInput, JSON.stringify(snapshot), aadText);
  const cipherText = JSON.stringify(encrypted);

  return {
    opId: createId(),
    entityId: SNAPSHOT_ENTITY_ID,
    kind: SNAPSHOT_KIND,
    hlc: {
      wallMs: snapshot.updatedAtMs,
      counter: 0,
      nodeId: session.deviceId,
    },
    cipherBase64: textToBase64(cipherText),
    aadBase64: textToBase64(aadText),
    hashHex: await sha256Hex(cipherText),
    deleted: false,
  };
}

export async function extractLatestSnapshot(
  secretInput: string,
  ops: SelfProviderSyncOp[],
): Promise<VaultSnapshot | null> {
  const snapshotOps = ops.filter((op) => !op.deleted && op.kind === SNAPSHOT_KIND && op.entityId === SNAPSHOT_ENTITY_ID);
  if (snapshotOps.length === 0) {
    return null;
  }

  const latest = snapshotOps.reduce((best, current) => (compareOp(current, best) > 0 ? current : best));
  return decryptSnapshot(secretInput, latest);
}

async function decryptSnapshot(secretInput: string, op: SelfProviderSyncOp): Promise<VaultSnapshot> {
  const aadText = base64ToText(op.aadBase64);
  const envelope = parseEncryptedEnvelope(base64ToText(op.cipherBase64));
  const plaintext = await decryptTextWithRust(secretInput, envelope, aadText);
  return parseSnapshot(plaintext);
}

function parseSnapshot(jsonText: string): VaultSnapshot {
  const value = JSON.parse(jsonText) as unknown;
  const record = expectRecord(value);
  const version = record.version;
  const updatedAtMs = record.updatedAtMs;
  const entries = record.entries;

  if (version !== SNAPSHOT_VERSION || typeof updatedAtMs !== "number" || !Array.isArray(entries)) {
    throw new Error("SELF_PROVIDER_INVALID_SNAPSHOT");
  }

  return {
    version: SNAPSHOT_VERSION,
    updatedAtMs,
    entries: entries
      .map(parseEntry)
      .filter((entry): entry is Entry => entry !== null),
  };
}

function parseEntry(value: unknown): Entry | null {
  const record = expectRecord(value);
  const label = typeof record.label === "string" ? record.label.trim() : "";
  const secret = typeof record.secret === "string" ? normalizeSecret(record.secret) : "";
  const id = typeof record.id === "string" && record.id ? record.id : createId();

  if (!label || !secret || validateSecret(secret)) {
    return null;
  }

  return { id, label, secret };
}

function parseEncryptedEnvelope(jsonText: string): EncryptedTextEnvelope {
  const value = JSON.parse(jsonText) as unknown;
  const record = expectRecord(value);
  const nonceHex = record.nonceHex;
  const ciphertextBase64 = record.ciphertextBase64;
  if (typeof nonceHex !== "string" || typeof ciphertextBase64 !== "string") {
    throw new Error("SELF_PROVIDER_INVALID_ENVELOPE");
  }
  return { nonceHex, ciphertextBase64 };
}

function compareOp(left: SelfProviderSyncOp, right: SelfProviderSyncOp): number {
  if (left.hlc.wallMs !== right.hlc.wallMs) {
    return left.hlc.wallMs - right.hlc.wallMs;
  }
  if (left.hlc.counter !== right.hlc.counter) {
    return left.hlc.counter - right.hlc.counter;
  }
  if (left.hlc.nodeId !== right.hlc.nodeId) {
    return left.hlc.nodeId.localeCompare(right.hlc.nodeId);
  }
  return left.opId.localeCompare(right.opId);
}

async function sha256Hex(text: string): Promise<string> {
  if (!crypto?.subtle) {
    throw new Error("SELF_PROVIDER_HASH_UNAVAILABLE");
  }
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

function textToBase64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text));
}

function base64ToText(base64Text: string): string {
  return new TextDecoder().decode(base64ToBytes(base64Text));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(base64Text: string): Uint8Array {
  const binary = atob(base64Text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function expectRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    throw new Error("SELF_PROVIDER_INVALID_RECORD");
  }
  return value as Record<string, unknown>;
}
