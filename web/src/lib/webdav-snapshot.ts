import { createId, normalizeSecret, validateSecret, type Entry } from "@/lib/otp";
import { decryptTextWithRust, encryptTextWithRust, type EncryptedTextEnvelope } from "@/lib/rust-core";

export interface WebDavManifest {
  version: 1;
  revision: string;
  entryCount: number;
  updatedAtMs: number;
  hashHex: string;
  format: "gaubee-2fa-v1-ndjson";
}

interface WebDavSnapshotLine {
  version: 1;
  id: string;
  aadText: string;
  nonceHex: string;
  ciphertextBase64: string;
}

export async function buildWebDavSnapshot(
  secretInput: string,
  entries: Entry[],
  updatedAtMs: number,
): Promise<{ manifest: WebDavManifest; ndjsonText: string }> {
  const lines = await Promise.all(
    entries.map(async (entry) => {
      const aadText = JSON.stringify({ schema: "gaubee-2fa-entry", version: 1, id: entry.id });
      const encrypted = await encryptTextWithRust(secretInput, JSON.stringify(entry), aadText);
      const line: WebDavSnapshotLine = {
        version: 1,
        id: entry.id,
        aadText,
        nonceHex: encrypted.nonceHex,
        ciphertextBase64: encrypted.ciphertextBase64,
      };
      return JSON.stringify(line);
    }),
  );

  const ndjsonText = lines.join("\n");
  const hashHex = await sha256Hex(ndjsonText);
  const revision = `${updatedAtMs}:${hashHex.slice(0, 16)}`;
  return {
    ndjsonText,
    manifest: {
      version: 1,
      revision,
      entryCount: entries.length,
      updatedAtMs,
      hashHex,
      format: "gaubee-2fa-v1-ndjson",
    },
  };
}

export async function parseWebDavSnapshot(secretInput: string, ndjsonText: string): Promise<Entry[]> {
  const lines = ndjsonText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const entries = await Promise.all(lines.map((line) => decryptEntry(secretInput, line)));
  return entries.filter((entry): entry is Entry => entry !== null);
}

async function decryptEntry(secretInput: string, rawLine: string): Promise<Entry | null> {
  const parsed = JSON.parse(rawLine) as unknown;
  const line = expectSnapshotLine(parsed);
  const envelope: EncryptedTextEnvelope = {
    nonceHex: line.nonceHex,
    ciphertextBase64: line.ciphertextBase64,
  };
  const plaintext = await decryptTextWithRust(secretInput, envelope, line.aadText);
  const value = JSON.parse(plaintext) as unknown;
  if (!value || typeof value !== "object") {
    return null;
  }
  const typed = value as Partial<Entry>;
  const label = typeof typed.label === "string" ? typed.label.trim() : "";
  const secret = typeof typed.secret === "string" ? normalizeSecret(typed.secret) : "";
  const id = typeof typed.id === "string" && typed.id ? typed.id : createId();
  if (!label || !secret || validateSecret(secret)) {
    return null;
  }
  return { id, label, secret };
}

function expectSnapshotLine(value: unknown): WebDavSnapshotLine {
  if (!value || typeof value !== "object") {
    throw new Error("WEBDAV_INVALID_SNAPSHOT_LINE");
  }
  const typed = value as Partial<WebDavSnapshotLine>;
  if (
    typed.version !== 1 ||
    typeof typed.id !== "string" ||
    typeof typed.aadText !== "string" ||
    typeof typed.nonceHex !== "string" ||
    typeof typed.ciphertextBase64 !== "string"
  ) {
    throw new Error("WEBDAV_INVALID_SNAPSHOT_LINE");
  }
  return {
    version: 1,
    id: typed.id,
    aadText: typed.aadText,
    nonceHex: typed.nonceHex,
    ciphertextBase64: typed.ciphertextBase64,
  };
}

async function sha256Hex(text: string): Promise<string> {
  if (!crypto?.subtle) {
    throw new Error("WEBDAV_HASH_UNAVAILABLE");
  }
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}
