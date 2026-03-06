const STORAGE_KEY = "totp.entries.v1";
const TOTP_PERIOD = 30;
const TOTP_DIGITS = 6;

const ENTRY_ERROR = {
  invalidSecret: "INVALID_SECRET",
  generateFailed: "GENERATE_FAILED",
};

const SCAN_INTERVAL_MS = 250;
const SECURE_SHARE_PREFIX = "otpauth-secure://v1#";
const SECURE_SHARE_ITERATIONS = 210000;

/** @typedef {{id: string; label: string; secret: string}} Entry */
/** @typedef {{code: string; error?: string}} EntryCode */

/** @type {{entries: Entry[]; codeMap: Map<string, EntryCode>; currentCounter: number | null; timerId: number | null; editingId: string | null; selectedIds: Set<string>; detector: BarcodeDetector | null; scanning: {running: boolean; busy: boolean; rafId: number | null; stream: MediaStream | null; lastDetectAt: number};}} */
const state = {
  entries: [],
  codeMap: new Map(),
  currentCounter: null,
  timerId: null,
  editingId: null,
  selectedIds: new Set(),
  detector: null,
  scanning: {
    running: false,
    busy: false,
    rafId: null,
    stream: null,
    lastDetectAt: 0,
  },
};

const refs = {
  form: document.querySelector("#entry-form"),
  labelInput: document.querySelector("#entry-label"),
  secretInput: document.querySelector("#entry-secret"),
  submitBtn: document.querySelector("#submit-btn"),
  cancelEditBtn: document.querySelector("#cancel-edit-btn"),
  list: document.querySelector("#entry-list"),
  template: document.querySelector("#entry-template"),
  entryCount: document.querySelector("#entry-count"),
  globalCountdown: document.querySelector("#global-countdown"),
  countdownProgress: document.querySelector("#countdown-progress"),
  selectAllBtn: document.querySelector("#select-all-btn"),
  clearSelectionBtn: document.querySelector("#clear-selection-btn"),
  shareSelectedBtn: document.querySelector("#share-selected-btn"),
  shareEncryptedBtn: document.querySelector("#share-encrypted-btn"),
  selectedCount: document.querySelector("#selected-count"),
  importTextArea: document.querySelector("#otpauth-input"),
  importTextBtn: document.querySelector("#import-text-btn"),
  qrImageInput: document.querySelector("#qr-image-input"),
  scanQrBtn: document.querySelector("#scan-qr-btn"),
  scannerDialog: document.querySelector("#scanner-dialog"),
  scannerVideo: document.querySelector("#scanner-video"),
  closeScannerBtn: document.querySelector("#close-scanner-btn"),
  shareDialog: document.querySelector("#share-dialog"),
  closeShareBtn: document.querySelector("#close-share-btn"),
  shareRawOutput: document.querySelector("#share-raw-output"),
  shareLinkOutput: document.querySelector("#share-link-output"),
  copyShareRawBtn: document.querySelector("#copy-share-raw-btn"),
  copyShareLinkBtn: document.querySelector("#copy-share-link-btn"),
  toastContainer: document.querySelector("#toast-container"),
};

init().catch((error) => {
  console.error(error);
  toast("初始化失败，请刷新后重试。", "error");
});

async function init() {
  state.entries = loadEntries();
  bindEvents();
  updateEditingUi();
  await importPayloadFromLocation();
  renderList();
  await refreshCodes(true);
  startTicker();
}

function bindEvents() {
  refs.form?.addEventListener("submit", onSubmit);
  refs.list?.addEventListener("click", onListClick);
  refs.list?.addEventListener("change", onListChange);
  refs.cancelEditBtn?.addEventListener("click", onCancelEdit);

  refs.selectAllBtn?.addEventListener("click", onSelectAll);
  refs.clearSelectionBtn?.addEventListener("click", onClearSelection);
  refs.shareSelectedBtn?.addEventListener("click", onShareSelected);
  refs.shareEncryptedBtn?.addEventListener("click", onShareEncrypted);

  refs.importTextBtn?.addEventListener("click", onImportText);
  refs.qrImageInput?.addEventListener("change", onImportQrImage);
  refs.scanQrBtn?.addEventListener("click", onOpenScanner);
  refs.closeScannerBtn?.addEventListener("click", onCloseScanner);
  refs.scannerDialog?.addEventListener("close", stopCameraScan);
  refs.scannerDialog?.addEventListener("cancel", () => {
    stopCameraScan();
  });

  refs.closeShareBtn?.addEventListener("click", onCloseShareDialog);
  refs.copyShareRawBtn?.addEventListener("click", onCopyShareRaw);
  refs.copyShareLinkBtn?.addEventListener("click", onCopyShareLink);
}

async function onSubmit(event) {
  event.preventDefault();
  if (!(refs.labelInput instanceof HTMLInputElement) || !(refs.secretInput instanceof HTMLInputElement)) {
    return;
  }

  const label = refs.labelInput.value.trim();
  const secret = normalizeSecret(refs.secretInput.value);

  if (!label) {
    toast("请输入备注名字。", "error");
    return;
  }

  const secretError = validateSecret(secret);
  if (secretError) {
    toast(secretError, "error");
    return;
  }

  if (state.editingId) {
    const target = state.entries.find((entry) => entry.id === state.editingId);
    if (!target) {
      clearEditingMode({ resetForm: false });
      toast("要编辑的密钥不存在。", "error");
      return;
    }

    target.label = label;
    target.secret = secret;
    clearEditingMode({ resetForm: true });
    toast("密钥已更新。", "success");
  } else {
    const nextEntry = {
      id: createId(),
      label,
      secret,
    };
    state.entries.unshift(nextEntry);
    refs.form?.reset();
    toast("密钥已保存。", "success");
  }

  persistEntries();
  await refreshCodes(true);
}

function onCancelEdit() {
  clearEditingMode({ resetForm: true });
  toast("已取消编辑。", "info");
}

function onListChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || !target.classList.contains("entry-select")) {
    return;
  }

  const card = target.closest(".entry-card");
  if (!(card instanceof HTMLElement)) {
    return;
  }

  const entryId = card.dataset.id;
  if (!entryId) {
    return;
  }

  if (target.checked) {
    state.selectedIds.add(entryId);
  } else {
    state.selectedIds.delete(entryId);
  }

  updateSelectionUi();
}

async function onListClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const action = target.closest("button");
  if (!(action instanceof HTMLButtonElement)) {
    return;
  }

  const card = action.closest(".entry-card");
  if (!(card instanceof HTMLElement)) {
    return;
  }

  const entryId = card.dataset.id;
  if (!entryId) {
    return;
  }

  if (action.classList.contains("edit-btn")) {
    const entry = state.entries.find((item) => item.id === entryId);
    if (!entry) {
      return;
    }

    startEdit(entry);
    return;
  }

  if (action.classList.contains("delete-btn")) {
    state.entries = state.entries.filter((entry) => entry.id !== entryId);
    state.codeMap.delete(entryId);
    state.selectedIds.delete(entryId);

    if (state.editingId === entryId) {
      clearEditingMode({ resetForm: true });
    }

    persistEntries();
    renderList();
    toast("密钥已删除。", "success");
    return;
  }

  if (action.classList.contains("copy-btn") || action.classList.contains("entry-code")) {
    await copyEntryCode(entryId);
  }
}

function onSelectAll() {
  state.selectedIds.clear();
  for (const entry of state.entries) {
    state.selectedIds.add(entry.id);
  }
  renderList();
}

function onClearSelection() {
  state.selectedIds.clear();
  renderList();
}

async function onShareSelected() {
  const selectedEntries = getSelectedEntries();
  if (selectedEntries.length === 0) {
    toast("请先选择要分享的密钥。", "error");
    return;
  }
  const shareText = selectedEntries.map(toOtpauthUri).join("\n");
  const shareLink = buildImportLink(shareText);
  openShareDialog(shareText, shareLink);
}

async function onShareEncrypted() {
  const selectedEntries = getSelectedEntries();
  if (selectedEntries.length === 0) {
    toast("请先选择要加密分享的密钥。", "error");
    return;
  }

  if (!crypto?.subtle) {
    toast("当前环境不支持加密分享，请使用较新的浏览器。", "error");
    return;
  }

  const passphrase = window.prompt("请输入分享口令（用于接收方解密）：");
  if (!passphrase) {
    return;
  }

  const confirmPassphrase = window.prompt("请再次输入分享口令：");
  if (!confirmPassphrase || confirmPassphrase !== passphrase) {
    toast("两次口令不一致，已取消。", "error");
    return;
  }

  const plainText = selectedEntries.map(toOtpauthUri).join("\n");
  try {
    const secureText = await encryptShareText(plainText, passphrase);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "2FA 加密密钥",
          text: secureText,
        });
        toast(`已加密分享 ${selectedEntries.length} 项。`, "success");
        return;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
      }
    }

    const copied = await copyText(secureText);
    if (copied) {
      toast(`已复制加密分享内容（${selectedEntries.length} 项）。`, "success", 4200);
    } else {
      toast("加密分享失败，请重试。", "error");
    }
  } catch {
    toast("加密分享失败，请重试。", "error");
  }
}

function getSelectedEntries() {
  return state.entries.filter((entry) => state.selectedIds.has(entry.id));
}

function openShareDialog(rawText, linkText) {
  if (!(refs.shareDialog instanceof HTMLDialogElement)) {
    return;
  }

  if (refs.shareRawOutput instanceof HTMLTextAreaElement) {
    refs.shareRawOutput.value = rawText;
  }

  if (refs.shareLinkOutput instanceof HTMLTextAreaElement) {
    refs.shareLinkOutput.value = linkText;
  }

  if (!refs.shareDialog.open) {
    refs.shareDialog.showModal();
  }
}

function onCloseShareDialog() {
  if (refs.shareDialog instanceof HTMLDialogElement && refs.shareDialog.open) {
    refs.shareDialog.close();
  }
}

async function onCopyShareRaw() {
  if (!(refs.shareRawOutput instanceof HTMLTextAreaElement)) {
    return;
  }

  const copied = await copyText(refs.shareRawOutput.value);
  if (copied) {
    toast("原始分享内容已复制。", "success");
  } else {
    toast("复制失败，请重试。", "error");
  }
}

async function onCopyShareLink() {
  if (!(refs.shareLinkOutput instanceof HTMLTextAreaElement)) {
    return;
  }

  const copied = await copyText(refs.shareLinkOutput.value);
  if (copied) {
    toast("分享链接已复制。", "success");
  } else {
    toast("复制失败，请重试。", "error");
  }
}

function buildImportLink(rawText) {
  const encoded = bytesToBase64Url(utf8ToBytes(rawText));
  const base = window.location.href.split("?")[0].split("#")[0];
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}import=${encodeURIComponent(encoded)}`;
}

async function importPayloadFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get("import");
  if (!encoded) {
    return;
  }

  try {
    const rawText = bytesToUtf8(base64UrlToBytes(encoded));
    const result = await importPayload(rawText);
    toastImportResult(result, "链接导入");
  } catch (error) {
    toast(importErrorText(error), "error");
  } finally {
    params.delete("import");
    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", nextUrl);
  }
}

async function onImportText() {
  if (!(refs.importTextArea instanceof HTMLTextAreaElement)) {
    return;
  }

  const rawText = refs.importTextArea.value.trim();
  if (!rawText) {
    toast("请输入导入文本。", "error");
    return;
  }

  try {
    const result = await importPayload(rawText);
    refs.importTextArea.value = "";
    toastImportResult(result, "文本导入");
  } catch (error) {
    toast(importErrorText(error), "error");
  }
}

async function onImportQrImage(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  const file = target.files?.[0];
  target.value = "";

  if (!file) {
    return;
  }

  try {
    const payload = await detectQrFromImage(file);
    const result = await importPayload(payload);
    toastImportResult(result, "二维码图片导入");
  } catch (error) {
    const message = isImportError(error) ? importErrorText(error) : qrErrorText(error);
    toast(message, "error");
  }
}

async function onOpenScanner() {
  if (!(refs.scannerDialog instanceof HTMLDialogElement) || !(refs.scannerVideo instanceof HTMLVideoElement)) {
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    toast("当前浏览器不支持摄像头扫码。", "error");
    return;
  }

  try {
    await getQrDetector();
  } catch (error) {
    toast(qrErrorText(error), "error");
    return;
  }

  if (!refs.scannerDialog.open) {
    refs.scannerDialog.showModal();
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
      },
      audio: false,
    });

    refs.scannerVideo.srcObject = stream;
    await refs.scannerVideo.play();

    state.scanning.stream = stream;
    state.scanning.running = true;
    state.scanning.busy = false;
    state.scanning.lastDetectAt = 0;

    scanLoop();
    toast("摄像头已启动，请将二维码放入画面。", "info");
  } catch {
    stopCameraScan();
    if (refs.scannerDialog.open) {
      refs.scannerDialog.close();
    }
    toast("无法启动摄像头，请检查权限设置。", "error");
  }
}

function onCloseScanner() {
  if (refs.scannerDialog instanceof HTMLDialogElement && refs.scannerDialog.open) {
    refs.scannerDialog.close();
  } else {
    stopCameraScan();
  }
}

function scanLoop() {
  if (!state.scanning.running) {
    return;
  }

  state.scanning.rafId = window.requestAnimationFrame(async (ts) => {
    if (!state.scanning.running) {
      return;
    }

    if (!state.scanning.busy && ts - state.scanning.lastDetectAt > SCAN_INTERVAL_MS) {
      state.scanning.busy = true;
      state.scanning.lastDetectAt = ts;

      try {
        const payload = await detectQrFromVideo();
        const result = await importPayload(payload);
        toastImportResult(result, "扫码导入");

        onCloseScanner();
        state.scanning.busy = false;
        return;
      } catch (error) {
        if (isImportError(error)) {
          toast(importErrorText(error), "error");
          onCloseScanner();
          state.scanning.busy = false;
          return;
        }

        if (!(error instanceof Error) || error.message !== "QR_NOT_FOUND") {
          toast(qrErrorText(error), "error");
          onCloseScanner();
          state.scanning.busy = false;
          return;
        }
      }

      state.scanning.busy = false;
    }

    scanLoop();
  });
}

function stopCameraScan() {
  state.scanning.running = false;
  state.scanning.busy = false;

  if (state.scanning.rafId !== null) {
    window.cancelAnimationFrame(state.scanning.rafId);
    state.scanning.rafId = null;
  }

  if (state.scanning.stream) {
    for (const track of state.scanning.stream.getTracks()) {
      track.stop();
    }
    state.scanning.stream = null;
  }

  if (refs.scannerVideo instanceof HTMLVideoElement) {
    refs.scannerVideo.srcObject = null;
  }
}

async function detectQrFromImage(file) {
  const detector = await getQrDetector();
  if (typeof createImageBitmap !== "function") {
    throw new Error("QR_IMAGE_UNSUPPORTED");
  }

  const bitmap = await createImageBitmap(file);
  try {
    const results = await detector.detect(bitmap);
    const payload = readQrPayload(results);
    if (!payload) {
      throw new Error("QR_NOT_FOUND");
    }
    return payload;
  } finally {
    if (typeof bitmap.close === "function") {
      bitmap.close();
    }
  }
}

async function detectQrFromVideo() {
  const detector = await getQrDetector();
  if (!(refs.scannerVideo instanceof HTMLVideoElement)) {
    throw new Error("QR_SCAN_UNAVAILABLE");
  }

  const results = await detector.detect(refs.scannerVideo);
  const payload = readQrPayload(results);
  if (!payload) {
    throw new Error("QR_NOT_FOUND");
  }

  return payload;
}

async function getQrDetector() {
  if (state.detector) {
    return state.detector;
  }

  if (typeof BarcodeDetector === "undefined") {
    throw new Error("QR_DETECTOR_UNSUPPORTED");
  }

  const supported =
    typeof BarcodeDetector.getSupportedFormats === "function" ? await BarcodeDetector.getSupportedFormats() : ["qr_code"];

  if (!supported.includes("qr_code")) {
    throw new Error("QR_DETECTOR_UNSUPPORTED");
  }

  state.detector = new BarcodeDetector({ formats: ["qr_code"] });
  return state.detector;
}

function readQrPayload(results) {
  if (!Array.isArray(results) || results.length === 0) {
    return "";
  }

  const first = results[0];
  if (!first || typeof first !== "object") {
    return "";
  }

  if (typeof first.rawValue === "string") {
    return first.rawValue.trim();
  }

  if (first.rawData instanceof Uint8Array) {
    return new TextDecoder().decode(first.rawData).trim();
  }

  return "";
}

async function importPayload(rawText) {
  const lines = await resolveSecureImportLines(splitImportLines(rawText));

  const accepted = [];
  const knownSecretSet = new Set(state.entries.map((entry) => entry.secret));
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
        accepted.push(candidate);
      }
    } catch {
      failed += 1;
    }
  }

  if (accepted.length > 0) {
    const importedEntries = accepted.map((item) => ({
      id: createId(),
      label: item.label,
      secret: item.secret,
    }));

    state.entries = [...importedEntries.reverse(), ...state.entries];
    persistEntries();
    await refreshCodes(true);
  }

  return {
    added: accepted.length,
    skipped,
    failed,
  };
}

function parseImportLine(line) {
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

  if (line.startsWith(SECURE_SHARE_PREFIX)) {
    throw new Error("SECURE_IMPORT_REQUIRED");
  }

  throw new Error("UNSUPPORTED_IMPORT_LINE");
}

function parsePlainEntry(label, secret) {
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

function parseOtpauthUri(value) {
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

function splitImportLines(rawText) {
  return rawText
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function resolveSecureImportLines(lines) {
  const expanded = [];
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

function parseOtpauthMigrationUri(value) {
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
  const candidates = [];

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

function parseMigrationOtpParameter(rawBytes) {
  const fields = parseProtoFields(rawBytes);
  let secretBytes = null;
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

function parseProtoFields(bytes) {
  const fields = [];
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

function readProtoVarint(bytes, start) {
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

function startEdit(entry) {
  if (!(refs.labelInput instanceof HTMLInputElement) || !(refs.secretInput instanceof HTMLInputElement)) {
    return;
  }

  state.editingId = entry.id;
  refs.labelInput.value = entry.label;
  refs.secretInput.value = entry.secret;

  updateEditingUi();
  renderList();

  refs.labelInput.focus();
  refs.form?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  toast(`正在编辑：${entry.label}`, "info");
}

function clearEditingMode(options) {
  state.editingId = null;
  updateEditingUi();

  if (options.resetForm) {
    refs.form?.reset();
  }

  renderList();
}

function updateEditingUi() {
  if (refs.submitBtn instanceof HTMLButtonElement) {
    refs.submitBtn.textContent = state.editingId ? "保存修改" : "保存并生成";
  }

  if (refs.cancelEditBtn instanceof HTMLButtonElement) {
    refs.cancelEditBtn.hidden = !state.editingId;
  }
}

function renderList() {
  if (!(refs.list instanceof HTMLUListElement) || !(refs.template instanceof HTMLTemplateElement)) {
    return;
  }

  refs.list.innerHTML = "";

  if (state.entries.length === 0) {
    const empty = document.createElement("li");
    empty.className = "entry-card";
    empty.textContent = "还没有密钥，请先在上方添加或导入。";
    refs.list.appendChild(empty);
    updateEntryCount();
    updateSelectionUi();
    return;
  }

  for (const entry of state.entries) {
    const fragment = refs.template.content.cloneNode(true);
    const card = fragment.querySelector(".entry-card");
    if (!(card instanceof HTMLElement)) {
      continue;
    }

    card.dataset.id = entry.id;
    card.classList.toggle("is-editing", entry.id === state.editingId);

    const checkInput = card.querySelector(".entry-select");
    if (checkInput instanceof HTMLInputElement) {
      checkInput.checked = state.selectedIds.has(entry.id);
    }

    const labelEl = card.querySelector(".entry-label");
    if (labelEl) {
      labelEl.textContent = entry.label;
    }

    const previewEl = card.querySelector(".entry-secret-preview");
    if (previewEl) {
      previewEl.textContent = `密钥: ${maskSecret(entry.secret)}`;
    }

    const codeEl = card.querySelector(".entry-code");
    const remainEl = card.querySelector(".entry-remain");
    const entryCode = state.codeMap.get(entry.id);

    if (codeEl instanceof HTMLButtonElement) {
      if (entryCode?.error) {
        codeEl.textContent = entryErrorText(entryCode.error);
        codeEl.classList.add("is-error");
        codeEl.disabled = true;
      } else {
        codeEl.textContent = entryCode?.code ?? "------";
        codeEl.classList.remove("is-error");
        codeEl.disabled = false;
      }
    }

    if (remainEl) {
      remainEl.textContent = `剩余 ${currentRemainSeconds()} 秒`;
    }

    refs.list.appendChild(fragment);
  }

  updateEntryCount();
  updateSelectionUi();
}

function updateEntryCount() {
  if (refs.entryCount) {
    refs.entryCount.textContent = `${state.entries.length} 项`;
  }
}

function updateSelectionUi() {
  const selectedCount = state.selectedIds.size;
  const allSelected = state.entries.length > 0 && selectedCount === state.entries.length;

  if (refs.selectedCount) {
    refs.selectedCount.textContent = `已选 ${selectedCount} 项`;
  }

  if (refs.shareSelectedBtn instanceof HTMLButtonElement) {
    refs.shareSelectedBtn.disabled = selectedCount === 0;
  }

  if (refs.shareEncryptedBtn instanceof HTMLButtonElement) {
    refs.shareEncryptedBtn.disabled = selectedCount === 0;
  }

  if (refs.clearSelectionBtn instanceof HTMLButtonElement) {
    refs.clearSelectionBtn.disabled = selectedCount === 0;
  }

  if (refs.selectAllBtn instanceof HTMLButtonElement) {
    refs.selectAllBtn.disabled = state.entries.length === 0 || allSelected;
  }
}

async function copyEntryCode(entryId) {
  const entryCode = state.codeMap.get(entryId);
  if (!entryCode || entryCode.error) {
    toast("当前密钥无法生成验证码。", "error");
    return;
  }

  const copied = await copyText(entryCode.code);
  if (copied) {
    toast("验证码已复制。", "success");
  } else {
    toast("复制失败，请检查浏览器权限。", "error");
  }
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // ignore
    }
  }

  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  area.style.pointerEvents = "none";
  document.body.appendChild(area);
  area.select();

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }

  document.body.removeChild(area);
  return copied;
}

function startTicker() {
  if (state.timerId !== null) {
    window.clearInterval(state.timerId);
  }

  state.timerId = window.setInterval(() => {
    void refreshCodes(false);
  }, 250);
}

async function refreshCodes(force) {
  updateGlobalCountdown();
  updateRemainLabels();

  const counter = currentCounter();
  if (!force && state.currentCounter === counter) {
    return;
  }

  state.currentCounter = counter;
  await regenerateCodes(counter);
  renderList();
}

async function regenerateCodes(counter) {
  const entries = state.entries.slice();
  const nextMap = new Map();

  await Promise.all(
    entries.map(async (entry) => {
      try {
        const code = await generateTotp(entry.secret, counter, TOTP_DIGITS);
        nextMap.set(entry.id, { code });
      } catch (error) {
        nextMap.set(entry.id, { code: "------", error: resolveEntryError(error) });
      }
    }),
  );

  state.codeMap = nextMap;
}

function resolveEntryError(error) {
  if (error instanceof Error && error.message.includes("Base32")) {
    return ENTRY_ERROR.invalidSecret;
  }

  return ENTRY_ERROR.generateFailed;
}

function updateGlobalCountdown() {
  const remain = currentRemainSeconds();
  const now = Date.now();
  const periodMs = TOTP_PERIOD * 1000;
  const elapsed = now % periodMs;
  const progress = Math.max(0, 1 - elapsed / periodMs);

  if (refs.globalCountdown) {
    refs.globalCountdown.textContent = `${remain}s`;
  }

  if (refs.countdownProgress instanceof HTMLElement) {
    refs.countdownProgress.style.width = `${(progress * 100).toFixed(1)}%`;
  }
}

function updateRemainLabels() {
  const remain = currentRemainSeconds();
  document.querySelectorAll(".entry-remain").forEach((el) => {
    el.textContent = `剩余 ${remain} 秒`;
  });
}

function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }

        const id = typeof item.id === "string" ? item.id : createId();
        const label = typeof item.label === "string" ? item.label.trim() : "";
        const secret = typeof item.secret === "string" ? normalizeSecret(item.secret) : "";

        if (!id || !label || validateSecret(secret)) {
          return null;
        }

        return { id, label, secret };
      })
      .filter((item) => item !== null);
  } catch {
    return [];
  }
}

function persistEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entries));
}

function validateSecret(secret) {
  if (!secret) {
    return "请输入 2FA 密钥。";
  }

  if (!isBase32Secret(secret)) {
    return "密钥格式无效：只支持 Base32 字符（A-Z、2-7）。";
  }

  try {
    decodeBase32(secret);
  } catch {
    return "密钥格式无效，请检查是否是完整 Base32 密钥。";
  }

  return "";
}

function normalizeSecret(secret) {
  return secret.replace(/[\s-]/g, "").toUpperCase();
}

function isBase32Secret(secret) {
  return /^[A-Z2-7]+=*$/.test(secret);
}

function maskSecret(secret) {
  if (secret.length <= 8) {
    return secret;
  }

  return `${secret.slice(0, 4)}••••${secret.slice(-4)}`;
}

function entryErrorText(errorCode) {
  if (errorCode === ENTRY_ERROR.invalidSecret) {
    return "密钥无效";
  }

  return "生成失败";
}

function currentCounter() {
  return Math.floor(Date.now() / 1000 / TOTP_PERIOD);
}

function currentRemainSeconds() {
  const periodMs = TOTP_PERIOD * 1000;
  const elapsed = Date.now() % periodMs;
  return Math.max(1, Math.ceil((periodMs - elapsed) / 1000));
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function toOtpauthUri(entry) {
  const [issuerPart, accountPart] = entry.label.split(" / ");
  const issuer = (issuerPart ?? "").trim();
  const account = (accountPart ?? "").trim();
  const rawLabel = issuer && account ? `${issuer}:${account}` : entry.label;
  const label = encodeURIComponent(rawLabel);
  const issuerParam = issuer ? `&issuer=${encodeURIComponent(issuer)}` : "";
  return `otpauth://totp/${label}?secret=${entry.secret}${issuerParam}`;
}

async function encryptShareText(plainText, passphrase) {
  if (!crypto?.subtle || !crypto?.getRandomValues) {
    throw new Error("SECURE_SHARE_UNSUPPORTED");
  }

  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveAesKey(passphrase, salt, ["encrypt"]);
  const cipherBuffer = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, utf8ToBytes(plainText));

  const payload = {
    version: 1,
    iterations: SECURE_SHARE_ITERATIONS,
    salt: bytesToBase64Url(salt),
    iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(new Uint8Array(cipherBuffer)),
  };

  const payloadText = JSON.stringify(payload);
  return `${SECURE_SHARE_PREFIX}${bytesToBase64Url(utf8ToBytes(payloadText))}`;
}

async function decryptShareText(shareText, passphrase) {
  if (!crypto?.subtle) {
    throw new Error("SECURE_SHARE_UNSUPPORTED");
  }

  const payload = parseSecureSharePayload(shareText);
  const salt = base64UrlToBytes(payload.salt);
  const iv = base64UrlToBytes(payload.iv);
  const ciphertext = base64UrlToBytes(payload.ciphertext);
  const key = await deriveAesKey(passphrase, salt, ["decrypt"], payload.iterations);

  try {
    const plainBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return bytesToUtf8(new Uint8Array(plainBuffer));
  } catch {
    throw new Error("SECURE_IMPORT_BAD_PASSPHRASE");
  }
}

function parseSecureSharePayload(shareText) {
  if (!shareText.startsWith(SECURE_SHARE_PREFIX)) {
    throw new Error("SECURE_SHARE_FORMAT_ERROR");
  }

  const rawData = shareText.slice(SECURE_SHARE_PREFIX.length).trim();
  if (!rawData) {
    throw new Error("SECURE_SHARE_FORMAT_ERROR");
  }

  const payloadText = bytesToUtf8(base64UrlToBytes(rawData));
  const payload = JSON.parse(payloadText);
  if (!payload || typeof payload !== "object") {
    throw new Error("SECURE_SHARE_FORMAT_ERROR");
  }

  if (
    payload.version !== 1 ||
    typeof payload.iterations !== "number" ||
    typeof payload.salt !== "string" ||
    typeof payload.iv !== "string" ||
    typeof payload.ciphertext !== "string"
  ) {
    throw new Error("SECURE_SHARE_FORMAT_ERROR");
  }

  return payload;
}

async function deriveAesKey(passphrase, salt, usages, iterations = SECURE_SHARE_ITERATIONS) {
  const sourceKey = await crypto.subtle.importKey("raw", utf8ToBytes(passphrase), { name: "PBKDF2" }, false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
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

function randomBytes(length) {
  const output = new Uint8Array(length);
  crypto.getRandomValues(output);
  return output;
}

function bytesToUtf8(bytes) {
  return new TextDecoder().decode(bytes);
}

function utf8ToBytes(text) {
  return new TextEncoder().encode(text);
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  const base64 = typeof btoa === "function" ? btoa(binary) : Buffer.from(bytes).toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(input) {
  const normalized = normalizeBase64(input);
  const binary = typeof atob === "function" ? atob(normalized) : Buffer.from(normalized, "base64").toString("binary");
  const output = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    output[i] = binary.charCodeAt(i);
  }
  return output;
}

function normalizeBase64(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const paddingLength = (4 - (base64.length % 4)) % 4;
  return `${base64}${"=".repeat(paddingLength)}`;
}

function bytesToBase32(bytes) {
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

function toastImportResult(result, sourceName) {
  const pieces = [];
  if (result.added > 0) {
    pieces.push(`新增 ${result.added} 项`);
  }
  if (result.skipped > 0) {
    pieces.push(`跳过重复 ${result.skipped} 项`);
  }
  if (result.failed > 0) {
    pieces.push(`失败 ${result.failed} 项`);
  }

  if (pieces.length === 0) {
    toast(`${sourceName}：没有可导入的内容。`, "error");
    return;
  }

  const type = result.failed > 0 ? "info" : "success";
  toast(`${sourceName}完成：${pieces.join("，")}`, type, 4200);
}

function qrErrorText(error) {
  if (!(error instanceof Error)) {
    return "二维码解析失败，请重试。";
  }

  if (error.message === "QR_DETECTOR_UNSUPPORTED") {
    return "当前浏览器不支持二维码识别，请使用最新版 Chrome/Safari。";
  }

  if (error.message === "QR_NOT_FOUND") {
    return "未识别到二维码，请换更清晰的图片或调整拍摄距离。";
  }

  if (error.message === "QR_IMAGE_UNSUPPORTED") {
    return "当前环境不支持图片二维码识别。";
  }

  return "二维码解析失败，请重试。";
}

function isImportError(error) {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.startsWith("SECURE_IMPORT_") ||
    error.message.startsWith("MIGRATION_") ||
    error.message.startsWith("UNSUPPORTED_MIGRATION_")
  );
}

function importErrorText(error) {
  if (!(error instanceof Error)) {
    return "导入失败，请重试。";
  }

  if (error.message === "SECURE_IMPORT_CANCELLED") {
    return "你已取消加密内容解密。";
  }

  if (error.message === "SECURE_IMPORT_BAD_PASSPHRASE") {
    return "解密失败：口令错误或分享内容已损坏。";
  }

  if (error.message === "SECURE_SHARE_UNSUPPORTED") {
    return "当前浏览器不支持加密导入。";
  }

  if (error.message === "MIGRATION_PAYLOAD_EMPTY") {
    return "未从迁移二维码中解析出可用账户。";
  }

  if (error.message === "UNSUPPORTED_MIGRATION_URI") {
    return "不支持的迁移二维码格式。";
  }

  return "导入失败，请检查内容格式。";
}

function toast(message, type = "info", duration = 2600) {
  if (!(refs.toastContainer instanceof HTMLElement)) {
    return;
  }

  const item = document.createElement("div");
  item.className = `toast ${type}`;
  item.textContent = message;
  refs.toastContainer.appendChild(item);

  window.setTimeout(() => {
    item.remove();
  }, duration);
}

async function generateTotp(secret, counter, digits) {
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

async function signHmacSha1(keyBytes, messageBytes) {
  const subtle = typeof crypto !== "undefined" ? crypto.subtle : undefined;

  if (subtle) {
    try {
      const cryptoKey = await subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
      const digestBuffer = await subtle.sign("HMAC", cryptoKey, messageBytes);
      return new Uint8Array(digestBuffer);
    } catch {
      // use fallback
    }
  }

  return hmacSha1(keyBytes, messageBytes);
}

function hmacSha1(keyBytes, messageBytes) {
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

function sha1(bytes) {
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

function leftRotate(value, amount) {
  return ((value << amount) | (value >>> (32 - amount))) >>> 0;
}

function concatBytes(first, second) {
  const output = new Uint8Array(first.length + second.length);
  output.set(first, 0);
  output.set(second, first.length);
  return output;
}

function decodeBase32(secret) {
  const clean = secret.replace(/=+$/, "");
  if (!clean || !isBase32Secret(clean)) {
    throw new Error("Invalid Base32 secret");
  }

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bytes = [];
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
