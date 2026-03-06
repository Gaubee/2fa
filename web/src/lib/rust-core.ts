import initRustWasm, {
  wasm_decrypt_text,
  wasm_derive_identity,
  wasm_encrypt_text,
  wasm_generate_totp,
  wasm_normalize_secret,
  wasm_sign_challenge,
  wasm_validate_secret,
} from "@gaubee/2fa-wasm-web";

export type RustCoreStatus = "idle" | "loading" | "ready" | "fallback";

export interface IdentityMaterial {
  mnemonic: string;
  publicKeyHex: string;
}

export interface SignedChallenge {
  publicKeyHex: string;
  signatureHex: string;
  timestampMs: number;
  deviceId: string;
  nonce: string;
}

export interface EncryptedTextEnvelope {
  nonceHex: string;
  ciphertextBase64: string;
}

let rustCoreStatus: RustCoreStatus = "idle";
let initPromise: Promise<void> | null = null;

export async function initRustCore(): Promise<void> {
  if (rustCoreStatus === "ready" || rustCoreStatus === "fallback") {
    return;
  }
  if (!initPromise) {
    rustCoreStatus = "loading";
    initPromise = initRustWasm()
      .then(() => {
        rustCoreStatus = "ready";
      })
      .catch((error) => {
        console.warn("Rust core init failed, falling back to JS core.", error);
        rustCoreStatus = "fallback";
      })
      .finally(() => {
        initPromise = null;
      });
  }

  await initPromise;
}

export function getRustCoreStatus(): RustCoreStatus {
  return rustCoreStatus;
}

export function normalizeSecretWithRust(secret: string): string {
  if (rustCoreStatus === "ready") {
    return wasm_normalize_secret(secret);
  }
  return secret.replace(/[\s-]/g, "").toUpperCase();
}

export function validateSecretWithRust(secret: string): string {
  try {
    if (rustCoreStatus === "ready") {
      wasm_validate_secret(secret);
      return "";
    }
  } catch (error) {
    return error instanceof Error ? error.message : "密钥格式无效，请检查是否是完整 Base32 密钥。";
  }

  return "";
}

export async function generateTotpWithRust(secret: string, counter: number): Promise<string> {
  await initRustCore();
  if (rustCoreStatus === "ready") {
    return wasm_generate_totp(secret, BigInt(counter * 30));
  }
  throw new Error("RUST_CORE_UNAVAILABLE");
}

export async function deriveIdentityWithRust(secretInput: string): Promise<IdentityMaterial> {
  await ensureRustCryptoReady();
  const value: unknown = wasm_derive_identity(secretInput);
  return parseIdentityMaterial(value);
}

export async function signChallengeWithRust(
  secretInput: string,
  nonce: string,
  timestampMs: number,
  deviceId: string,
): Promise<SignedChallenge> {
  await ensureRustCryptoReady();
  const value: unknown = wasm_sign_challenge(secretInput, nonce, BigInt(timestampMs), deviceId);
  return parseSignedChallenge(value);
}

export async function encryptTextWithRust(
  secretInput: string,
  plaintext: string,
  aadText: string,
): Promise<EncryptedTextEnvelope> {
  await ensureRustCryptoReady();
  const value: unknown = wasm_encrypt_text(secretInput, plaintext, aadText);
  return parseEncryptedEnvelope(value);
}

export async function decryptTextWithRust(
  secretInput: string,
  envelope: EncryptedTextEnvelope,
  aadText: string,
): Promise<string> {
  await ensureRustCryptoReady();
  return wasm_decrypt_text(secretInput, envelope.nonceHex, envelope.ciphertextBase64, aadText);
}

async function ensureRustCryptoReady(): Promise<void> {
  await initRustCore();
  if (rustCoreStatus !== "ready") {
    throw new Error("RUST_CRYPTO_UNAVAILABLE");
  }
}

function parseIdentityMaterial(value: unknown): IdentityMaterial {
  const record = expectRecord(value);
  return {
    mnemonic: expectString(record, "mnemonic"),
    publicKeyHex: expectString(record, "publicKeyHex"),
  };
}

function parseSignedChallenge(value: unknown): SignedChallenge {
  const record = expectRecord(value);
  return {
    publicKeyHex: expectString(record, "publicKeyHex"),
    signatureHex: expectString(record, "signatureHex"),
    timestampMs: expectNumeric(record, "timestampMs"),
    deviceId: expectString(record, "deviceId"),
    nonce: expectString(record, "nonce"),
  };
}

function parseEncryptedEnvelope(value: unknown): EncryptedTextEnvelope {
  const record = expectRecord(value);
  return {
    nonceHex: expectString(record, "nonceHex"),
    ciphertextBase64: expectString(record, "ciphertextBase64"),
  };
}

function expectRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    throw new Error("RUST_CRYPTO_INVALID_RESPONSE");
  }
  return value as Record<string, unknown>;
}

function expectString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string") {
    throw new Error(`RUST_CRYPTO_INVALID_${key.toUpperCase()}`);
  }
  return value;
}

function expectNumeric(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  throw new Error(`RUST_CRYPTO_INVALID_${key.toUpperCase()}`);
}
