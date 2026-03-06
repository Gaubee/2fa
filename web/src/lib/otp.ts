import { generateTotpWithRust, getRustCoreStatus, initRustCore, normalizeSecretWithRust, validateSecretWithRust } from "@/lib/rust-core";

export interface Entry {
  id: string;
  label: string;
  secret: string;
}

export interface EntryDraft {
  label: string;
  secret: string;
}

export interface EntryCode {
  code: string;
  error?: "INVALID_SECRET" | "GENERATE_FAILED";
}

export interface ImportResult {
  entries: EntryDraft[];
  added: number;
  skipped: number;
  failed: number;
}

export const TOTP_PERIOD = 30;
export const TOTP_DIGITS = 6;
export const SECURE_SHARE_PREFIX = "otpauth-secure://v1#";
const SECURE_SHARE_ITERATIONS = 210000;

export function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export function normalizeSecret(secret: string): string {
  return normalizeSecretWithRust(secret);
}

export { getRustCoreStatus as getOtpCoreStatus, initRustCore as initOtpCore };

function isBase32Secret(secret: string): boolean {
  return /^[A-Z2-7]+=*$/.test(secret);
}

export function validateSecret(secret: string): string {
  if (!secret) {
    return "请输入 2FA 密钥。";
  }

  if (!isBase32Secret(secret)) {
    return "密钥格式无效：只支持 Base32 字符（A-Z、2-7）。";
  }

  if (getRustCoreStatus() === "ready") {
    return validateSecretWithRust(secret) ? "密钥格式无效，请检查是否是完整 Base32 密钥。" : "";
  }

  try {
    decodeBase32(secret);
  } catch {
    return "密钥格式无效，请检查是否是完整 Base32 密钥。";
  }

  return "";
}

export function maskSecret(secret: string): string {
  if (secret.length <= 8) {
    return secret;
  }

  return `${secret.slice(0, 4)}••••${secret.slice(-4)}`;
}

export function currentCounter(nowMs = Date.now()): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD);
}

export function remainSeconds(nowMs = Date.now()): number {
  const periodMs = TOTP_PERIOD * 1000;
  const elapsed = nowMs % periodMs;
  return Math.max(1, Math.ceil((periodMs - elapsed) / 1000));
}

export function progressPercent(nowMs = Date.now()): number {
  const periodMs = TOTP_PERIOD * 1000;
  const elapsed = nowMs % periodMs;
  const progress = Math.max(0, 1 - elapsed / periodMs);
  return Math.round(progress * 1000) / 10;
}

export async function generateTotp(secret: string, counter: number, digits = TOTP_DIGITS): Promise<string> {
  if (digits === TOTP_DIGITS) {
    try {
      return await generateTotpWithRust(secret, counter);
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "RUST_CORE_UNAVAILABLE") {
        throw error;
      }
    }
  }

  const keyBytes = decodeBase32(secret);
  const msg = new Uint8Array(8);
  let value = counter;

  for (let i = 7; i >= 0; i -= 1) {
    msg[i] = value & 0xff;
    value = Math.floor(value / 256);
  }

  const digest = await signHmacSha1(keyBytes, msg);
  const offset = digest[digest.length - 1] & 0x0f;

  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  const otp = binary % 10 ** digits;
  return otp.toString().padStart(digits, "0");
}

async function signHmacSha1(keyBytes: Uint8Array, messageBytes: Uint8Array): Promise<Uint8Array> {
  const subtle = typeof crypto !== "undefined" ? crypto.subtle : undefined;

  if (subtle) {
    try {
      const cryptoKey = await subtle.importKey("raw", toArrayBuffer(keyBytes), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
      const digestBuffer = await subtle.sign("HMAC", cryptoKey, toArrayBuffer(messageBytes));
      return new Uint8Array(digestBuffer);
    } catch {
      // fallback to JS
    }
  }

  return hmacSha1(keyBytes, messageBytes);
}

function hmacSha1(keyBytes: Uint8Array, messageBytes: Uint8Array): Uint8Array {
  const blockSize = 64;
  let normalizedKey = keyBytes;

  if (normalizedKey.length > blockSize) {
    normalizedKey = sha1(normalizedKey);
  }

  const paddedKey = new Uint8Array(blockSize);
  paddedKey.set(normalizedKey);

  const outerKey = new Uint8Array(blockSize);
  const innerKey = new Uint8Array(blockSize);
  for (let i = 0; i < blockSize; i += 1) {
    outerKey[i] = paddedKey[i] ^ 0x5c;
    innerKey[i] = paddedKey[i] ^ 0x36;
  }

  const innerHash = sha1(concatBytes(innerKey, messageBytes));
  return sha1(concatBytes(outerKey, innerHash));
}

function sha1(bytes: Uint8Array): Uint8Array {
  const originalLength = bytes.length;
  const withMarkerLength = originalLength + 1;
  let paddedLength = withMarkerLength;

  while (paddedLength % 64 !== 56) {
    paddedLength += 1;
  }

  const totalLength = paddedLength + 8;
  const buffer = new Uint8Array(totalLength);
  buffer.set(bytes, 0);
  buffer[originalLength] = 0x80;

  const bitLength = originalLength * 8;
  const view = new DataView(buffer.buffer);
  view.setUint32(totalLength - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(totalLength - 4, bitLength >>> 0, false);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  const w = new Uint32Array(80);

  for (let chunkOffset = 0; chunkOffset < totalLength; chunkOffset += 64) {
    for (let i = 0; i < 16; i += 1) {
      const base = chunkOffset + i * 4;
      w[i] = ((buffer[base] << 24) | (buffer[base + 1] << 16) | (buffer[base + 2] << 8) | buffer[base + 3]) >>> 0;
    }

    for (let i = 16; i < 80; i += 1) {
      w[i] = leftRotate(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let i = 0; i < 80; i += 1) {
      let f = 0;
      let k = 0;

      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }

      const temp = (leftRotate(a, 5) + f + e + k + w[i]) >>> 0;
      e = d;
      d = c;
      c = leftRotate(b, 30);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const output = new Uint8Array(20);
  const outView = new DataView(output.buffer);
  outView.setUint32(0, h0, false);
  outView.setUint32(4, h1, false);
  outView.setUint32(8, h2, false);
  outView.setUint32(12, h3, false);
  outView.setUint32(16, h4, false);

  return output;
}

function leftRotate(value: number, amount: number): number {
  return ((value << amount) | (value >>> (32 - amount))) >>> 0;
}

function concatBytes(first: Uint8Array, second: Uint8Array): Uint8Array {
  const output = new Uint8Array(first.length + second.length);
  output.set(first, 0);
  output.set(second, first.length);
  return output;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function decodeBase32(secret: string): Uint8Array {
  const clean = secret.replace(/=+$/, "");
  if (!clean || !isBase32Secret(clean)) {
    throw new Error("Invalid Base32 secret");
  }

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (const char of clean) {
    const idx = alphabet.indexOf(char);
    if (idx < 0) {
      throw new Error("Invalid Base32 character");
    }

    value = value * 32 + idx;
    bits += 5;

    while (bits >= 8) {
      bits -= 8;
      const divisor = 2 ** bits;
      const nextByte = Math.floor(value / divisor) & 0xff;
      bytes.push(nextByte);
      value %= divisor;
    }
  }

  if (bytes.length === 0) {
    throw new Error("Empty secret");
  }

  return new Uint8Array(bytes);
}

export function toOtpauthUri(entry: EntryDraft): string {
  const [issuerPart, accountPart] = entry.label.split(" / ");
  const issuer = (issuerPart ?? "").trim();
  const account = (accountPart ?? "").trim();
  const rawLabel = issuer && account ? `${issuer}:${account}` : entry.label;
  const label = encodeURIComponent(rawLabel);
  const issuerParam = issuer ? `&issuer=${encodeURIComponent(issuer)}` : "";
  return `otpauth://totp/${label}?secret=${entry.secret}${issuerParam}`;
}

export async function encryptShareText(plainText: string, passphrase: string): Promise<string> {
  if (!crypto?.subtle || !crypto?.getRandomValues) {
    throw new Error("SECURE_SHARE_UNSUPPORTED");
  }

  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveAesKey(passphrase, salt, ["encrypt"]);
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(utf8ToBytes(plainText)),
  );

  const payload = {
    version: 1,
    iterations: SECURE_SHARE_ITERATIONS,
    salt: bytesToBase64Url(salt),
    iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(new Uint8Array(cipherBuffer)),
  };

  return `${SECURE_SHARE_PREFIX}${bytesToBase64Url(utf8ToBytes(JSON.stringify(payload)))}`;
}

async function decryptShareText(shareText: string, passphrase: string): Promise<string> {
  if (!crypto?.subtle) {
    throw new Error("SECURE_SHARE_UNSUPPORTED");
  }

  const payload = parseSecureSharePayload(shareText);
  const salt = base64UrlToBytes(payload.salt);
  const iv = base64UrlToBytes(payload.iv);
  const ciphertext = base64UrlToBytes(payload.ciphertext);
  const key = await deriveAesKey(passphrase, salt, ["decrypt"], payload.iterations);

  try {
    const plainBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toArrayBuffer(iv) },
      key,
      toArrayBuffer(ciphertext),
    );
    return bytesToUtf8(new Uint8Array(plainBuffer));
  } catch {
    throw new Error("SECURE_IMPORT_BAD_PASSPHRASE");
  }
}

interface SecurePayload {
  version: number;
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

function parseSecureSharePayload(shareText: string): SecurePayload {
  if (!shareText.startsWith(SECURE_SHARE_PREFIX)) {
    throw new Error("SECURE_SHARE_FORMAT_ERROR");
  }

  const encoded = shareText.slice(SECURE_SHARE_PREFIX.length).trim();
  if (!encoded) {
    throw new Error("SECURE_SHARE_FORMAT_ERROR");
  }

  const raw = bytesToUtf8(base64UrlToBytes(encoded));
  const payload = JSON.parse(raw) as Partial<SecurePayload>;

  if (
    payload.version !== 1 ||
    typeof payload.iterations !== "number" ||
    typeof payload.salt !== "string" ||
    typeof payload.iv !== "string" ||
    typeof payload.ciphertext !== "string"
  ) {
    throw new Error("SECURE_SHARE_FORMAT_ERROR");
  }

  return payload as SecurePayload;
}

async function deriveAesKey(
  passphrase: string,
  salt: Uint8Array,
  usages: KeyUsage[],
  iterations = SECURE_SHARE_ITERATIONS,
): Promise<CryptoKey> {
  const sourceKey = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(utf8ToBytes(passphrase)),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: toArrayBuffer(salt),
      iterations,
      hash: "SHA-256",
    },
    sourceKey,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    usages,
  );
}

function randomBytes(length: number): Uint8Array {
  const output = new Uint8Array(length);
  crypto.getRandomValues(output);
  return output;
}

function bytesToUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function utf8ToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(input: string): Uint8Array {
  const normalized = normalizeBase64(input);
  const binary = atob(normalized);
  const output = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    output[i] = binary.charCodeAt(i);
  }
  return output;
}

function normalizeBase64(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const paddingLength = (4 - (base64.length % 4)) % 4;
  return `${base64}${"=".repeat(paddingLength)}`;
}

function bytesToBase32(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      const index = (value >>> (bits - 5)) & 0x1f;
      output += alphabet[index];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += alphabet[(value << (5 - bits)) & 0x1f];
  }

  return output;
}

export async function importEntries(rawText: string, existingSecrets: Set<string>): Promise<ImportResult> {
  const lines = await resolveSecureImportLines(splitImportLines(rawText));

  const entries: EntryDraft[] = [];
  const knownSecretSet = new Set(existingSecrets);
  let skipped = 0;
  let failed = 0;

  for (const line of lines) {
    try {
      const candidates = parseImportLine(line);
      for (const candidate of candidates) {
        if (knownSecretSet.has(candidate.secret)) {
          skipped += 1;
          continue;
        }

        knownSecretSet.add(candidate.secret);
        entries.push(candidate);
      }
    } catch {
      failed += 1;
    }
  }

  return {
    entries,
    added: entries.length,
    skipped,
    failed,
  };
}

function splitImportLines(rawText: string): string[] {
  return rawText
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function resolveSecureImportLines(lines: string[]): Promise<string[]> {
  const expanded: string[] = [];
  let cachedPassphrase = "";

  for (const line of lines) {
    if (!line.startsWith(SECURE_SHARE_PREFIX)) {
      expanded.push(line);
      continue;
    }

    let decrypted = "";
    let decryptedOk = false;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      let passphrase = cachedPassphrase;
      if (!passphrase) {
        passphrase = window.prompt("检测到加密分享内容，请输入口令解密：") ?? "";
      }

      if (!passphrase) {
        throw new Error("SECURE_IMPORT_CANCELLED");
      }

      try {
        decrypted = await decryptShareText(line, passphrase);
        cachedPassphrase = passphrase;
        decryptedOk = true;
        break;
      } catch {
        cachedPassphrase = "";
      }
    }

    if (!decryptedOk) {
      throw new Error("SECURE_IMPORT_BAD_PASSPHRASE");
    }

    expanded.push(...splitImportLines(decrypted));
  }

  return expanded;
}

function parseImportLine(line: string): EntryDraft[] {
  if (line.startsWith("otpauth-migration://")) {
    return parseOtpauthMigrationUri(line);
  }

  if (line.startsWith("otpauth://")) {
    return [parseOtpauthUri(line)];
  }

  const pipeIndex = line.indexOf("|");
  if (pipeIndex > 0) {
    const label = line.slice(0, pipeIndex).trim();
    const secret = normalizeSecret(line.slice(pipeIndex + 1));
    return [parsePlainEntry(label, secret)];
  }

  const commaIndex = line.indexOf(",");
  if (commaIndex > 0) {
    const label = line.slice(0, commaIndex).trim();
    const secret = normalizeSecret(line.slice(commaIndex + 1));
    return [parsePlainEntry(label, secret)];
  }

  throw new Error("UNSUPPORTED_IMPORT_LINE");
}

function parsePlainEntry(label: string, secret: string): EntryDraft {
  if (!label) {
    throw new Error("MISSING_LABEL");
  }

  const secretError = validateSecret(secret);
  if (secretError) {
    throw new Error(secretError);
  }

  return {
    label: label.slice(0, 80),
    secret,
  };
}

function parseOtpauthUri(value: string): EntryDraft {
  const uri = new URL(value);
  if (uri.protocol !== "otpauth:" || uri.hostname.toLowerCase() !== "totp") {
    throw new Error("UNSUPPORTED_OTPAUTH_TYPE");
  }

  const secret = normalizeSecret(uri.searchParams.get("secret") ?? "");
  const secretError = validateSecret(secret);
  if (secretError) {
    throw new Error(secretError);
  }

  const issuerFromParam = (uri.searchParams.get("issuer") ?? "").trim();
  const pathLabel = decodeURIComponent(uri.pathname.replace(/^\//, "")).trim();
  const parts = pathLabel.split(/:(.+)/);
  const issuerFromPath = (parts[0] ?? "").trim();
  const account = (parts[1] ?? pathLabel).trim();
  const issuer = issuerFromParam || issuerFromPath;

  const label = issuer && account ? `${issuer} / ${account}` : account || issuer || "未命名账户";

  return {
    label: label.slice(0, 80),
    secret,
  };
}

function parseOtpauthMigrationUri(value: string): EntryDraft[] {
  const uri = new URL(value);
  if (uri.protocol !== "otpauth-migration:") {
    throw new Error("UNSUPPORTED_MIGRATION_URI");
  }

  const data = (uri.searchParams.get("data") ?? "").trim();
  if (!data) {
    throw new Error("MIGRATION_PAYLOAD_EMPTY");
  }

  const payloadBytes = base64UrlToBytes(data);
  const fields = parseProtoFields(payloadBytes);
  const candidates: EntryDraft[] = [];

  for (const field of fields) {
    if (field.fieldNumber !== 1 || field.wireType !== 2 || !(field.value instanceof Uint8Array)) {
      continue;
    }

    const candidate = parseMigrationOtpParameter(field.value);
    if (candidate) {
      candidates.push(candidate);
    }
  }

  if (candidates.length === 0) {
    throw new Error("MIGRATION_PAYLOAD_EMPTY");
  }

  return candidates;
}

function parseMigrationOtpParameter(rawBytes: Uint8Array): EntryDraft | null {
  const fields = parseProtoFields(rawBytes);
  let secretBytes: Uint8Array | null = null;
  let name = "";
  let issuer = "";
  let type = 2;

  for (const field of fields) {
    if (field.fieldNumber === 1 && field.wireType === 2 && field.value instanceof Uint8Array) {
      secretBytes = field.value;
      continue;
    }

    if (field.fieldNumber === 2 && field.wireType === 2 && field.value instanceof Uint8Array) {
      name = bytesToUtf8(field.value).trim();
      continue;
    }

    if (field.fieldNumber === 3 && field.wireType === 2 && field.value instanceof Uint8Array) {
      issuer = bytesToUtf8(field.value).trim();
      continue;
    }

    if (field.fieldNumber === 6 && field.wireType === 0 && typeof field.value === "number") {
      type = field.value;
    }
  }

  if (!(secretBytes instanceof Uint8Array) || secretBytes.length === 0) {
    return null;
  }

  if (type !== 2) {
    return null;
  }

  const secret = bytesToBase32(secretBytes);
  const secretError = validateSecret(secret);
  if (secretError) {
    return null;
  }

  const normalizedName = name.includes(":") ? name.split(/:(.+)/)[1].trim() : name;
  const label = issuer && normalizedName ? `${issuer} / ${normalizedName}` : normalizedName || issuer || "未命名账户";

  return {
    label: label.slice(0, 80),
    secret,
  };
}

interface ProtoField {
  fieldNumber: number;
  wireType: number;
  value: number | Uint8Array;
}

function parseProtoFields(bytes: Uint8Array): ProtoField[] {
  const fields: ProtoField[] = [];
  let offset = 0;

  while (offset < bytes.length) {
    const key = readProtoVarint(bytes, offset);
    offset = key.next;

    const fieldNumber = key.value >>> 3;
    const wireType = key.value & 0x07;

    if (wireType === 0) {
      const value = readProtoVarint(bytes, offset);
      offset = value.next;
      fields.push({ fieldNumber, wireType, value: value.value });
      continue;
    }

    if (wireType === 2) {
      const length = readProtoVarint(bytes, offset);
      offset = length.next;
      const end = offset + length.value;
      if (end > bytes.length) {
        throw new Error("PROTOBUF_PARSE_ERROR");
      }

      fields.push({ fieldNumber, wireType, value: bytes.slice(offset, end) });
      offset = end;
      continue;
    }

    if (wireType === 5) {
      offset += 4;
      continue;
    }

    if (wireType === 1) {
      offset += 8;
      continue;
    }

    throw new Error("PROTOBUF_PARSE_ERROR");
  }

  return fields;
}

function readProtoVarint(bytes: Uint8Array, start: number): { value: number; next: number } {
  let offset = start;
  let shift = 0;
  let value = 0;

  while (offset < bytes.length) {
    const byte = bytes[offset];
    value += (byte & 0x7f) * 2 ** shift;
    offset += 1;

    if ((byte & 0x80) === 0) {
      return { value, next: offset };
    }

    shift += 7;
    if (shift > 56) {
      break;
    }
  }

  throw new Error("PROTOBUF_PARSE_ERROR");
}

export function buildImportLink(rawText: string, currentHref: string): string {
  const encoded = bytesToBase64Url(utf8ToBytes(rawText));
  const url = new URL(currentHref);
  url.searchParams.set("import", encoded);
  return url.toString();
}

export function parseImportParam(search: string): string {
  const params = new URLSearchParams(search);
  const encoded = params.get("import") ?? "";
  if (!encoded) {
    return "";
  }

  return bytesToUtf8(base64UrlToBytes(encoded));
}

export function clearImportParam(currentHref: string): string {
  const url = new URL(currentHref);
  url.searchParams.delete("import");
  return url.toString();
}

export function formatImportResult(source: string, result: Pick<ImportResult, "added" | "failed" | "skipped">): string {
  const pieces: string[] = [];
  if (result.added > 0) {
    pieces.push(`新增 ${result.added} 项`);
  }
  if (result.skipped > 0) {
    pieces.push(`跳过重复 ${result.skipped} 项`);
  }
  if (result.failed > 0) {
    pieces.push(`失败 ${result.failed} 项`);
  }

  return pieces.length > 0 ? `${source}完成：${pieces.join("，")}` : `${source}：没有可导入的内容。`;
}
