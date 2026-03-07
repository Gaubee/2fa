import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearImportParam,
  createId,
  currentCounter,
  encryptShareText,
  formatImportResult,
  generateTotp,
  getOtpCoreStatus,
  importEntries,
  initOtpCore,
  maskSecret,
  normalizeSecret,
  parseImportParam,
  progressPercent,
  remainSeconds,
  SECURE_SHARE_PREFIX,
  TOTP_DIGITS,
  validateSecret,
  buildImportLink,
  toOtpauthUri,
} from "@/lib/otp";
import type { Entry, EntryCode } from "@/lib/otp";
import {
  defaultWebDavState,
  isConfiguredWebDav,
  loadVaultState,
  saveVaultState,
  type VaultState,
  type WebDavState,
} from "@/lib/vault-store";
import {
  normalizeWebDavBaseUrl,
  pullWebDavVault,
  pushWebDavVault,
  verifyWebDavConfig,
} from "@/lib/webdav-provider";
import { cn } from "@/lib/utils";
import { WebDavProviderCard } from "@/components/webdav-provider-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Camera, Copy, Edit3, Github, QrCode, Share2, Shield, Trash2, Upload } from "lucide-react";

const SCAN_INTERVAL_MS = 250;

type EntriesUpdate = Entry[] | ((prevEntries: Entry[]) => Entry[]);

type ToastType = "info" | "success" | "error";

interface ToastMessage {
  id: string;
  text: string;
  type: ToastType;
}

interface BarcodeDetectionResultLike {
  rawValue?: string;
  rawData?: Uint8Array;
}

interface BarcodeDetectorLike {
  detect(source: ImageBitmap | HTMLVideoElement): Promise<BarcodeDetectionResultLike[]>;
}

interface BarcodeDetectorConstructorLike {
  new (options: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

function getBarcodeDetectorClass(): BarcodeDetectorConstructorLike | undefined {
  return (globalThis as unknown as { BarcodeDetector?: BarcodeDetectorConstructorLike }).BarcodeDetector;
}

async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fallback below
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

function qrErrorText(error: unknown): string {
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

function syncErrorText(error: unknown): string {
  if (!(error instanceof Error)) {
    return "同步失败，请重试。";
  }

  if (error.message === "RUST_CRYPTO_UNAVAILABLE") {
    return "当前浏览器未能加载 Rust/WASM 核心，无法加解密 WebDAV 快照。";
  }

  if (error.message === "WEBDAV_HASH_UNAVAILABLE") {
    return "当前浏览器不支持 SHA-256，无法生成同步快照。";
  }

  if (error.message === "WEBDAV_REVISION_CONFLICT") {
    return "远端版本已变化，请先刷新或拉取远端后再重试。";
  }

  if (error.message === "WEBDAV_INVALID_MANIFEST" || error.message === "WEBDAV_INVALID_SNAPSHOT_LINE") {
    return "远端数据格式无效，无法继续同步。";
  }

  return error.message || "同步失败，请重试。";
}

function formatDateTime(value: number | null): string {
  if (!value) {
    return "未同步";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function App() {
  const [vaultState, setVaultState] = useState<VaultState>(() => loadVaultState());
  const entries = vaultState.entries;
  const providers = vaultState.providers;
  const webdav = vaultState.webdav;
  const [coreStatus, setCoreStatus] = useState(() => getOtpCoreStatus());
  const entriesRef = useRef(entries);
  const [codes, setCodes] = useState<Record<string, EntryCode>>({});
  const [now, setNow] = useState(() => Date.now());

  const setEntries = useCallback((nextEntries: EntriesUpdate) => {
    setVaultState((prev) => ({
      ...prev,
      entries: typeof nextEntries === "function" ? nextEntries(prev.entries) : nextEntries,
      updatedAtMs: Date.now(),
    }));
  }, []);

  const replaceEntriesFromSync = useCallback((nextEntries: Entry[], updatedAtMs: number) => {
    setVaultState((prev) => ({
      ...prev,
      entries: nextEntries,
      updatedAtMs,
    }));
  }, []);

const updateWebDavState = useCallback((updater: (prev: WebDavState) => WebDavState) => {
  setVaultState((prev) => {
    const nextWebDav = updater(prev.webdav);
    const enabled = isConfiguredWebDav(nextWebDav);
    return {
      ...prev,
      webdav: nextWebDav,
      providers: prev.providers.map((provider) =>
        provider.id === "webdav"
          ? {
              ...provider,
              status: "ready",
              enabled,
              lastSyncAtMs: nextWebDav.lastSyncAtMs,
            }
          : provider,
      ),
    };
  });
}, []);

const [labelInput, setLabelInput] = useState("");
const [secretInput, setSecretInput] = useState("");
const [editingId, setEditingId] = useState<string | null>(null);
const [webdavAction, setWebdavAction] = useState<string | null>(null);

  const [importText, setImportText] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const [shareOpen, setShareOpen] = useState(false);
  const [shareRaw, setShareRaw] = useState("");
  const [shareLink, setShareLink] = useState("");

  const [scannerOpen, setScannerOpen] = useState(false);
  const scannerDialogRef = useRef<HTMLDialogElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const busyRef = useRef(false);
  const lastDetectAtRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);

const counter = useMemo(() => currentCounter(now), [now]);
const remain = useMemo(() => remainSeconds(now), [now]);
const progress = useMemo(() => progressPercent(now), [now]);
const logoUrl = useMemo(() => `${import.meta.env.BASE_URL}logo-2fa.svg`, []);
const webdavConfigured = useMemo(() => isConfiguredWebDav(webdav), [webdav]);
const webdavConnectionLabel = useMemo(() => {
  if (webdavConfigured) {
    return `已配置 · ${webdav.baseUrl}`;
  }
  if (webdav.baseUrl) {
    return `待补全 · ${webdav.baseUrl}`;
  }
  return "未配置";
}, [webdav.baseUrl, webdavConfigured]);
const webdavLastSyncLabel = useMemo(() => formatDateTime(webdav.lastSyncAtMs), [webdav.lastSyncAtMs]);

const shareDialogRef = useRef<HTMLDialogElement | null>(null);

const pushToast = useCallback((text: string, type: ToastType = "info", duration = 2800) => {
  const id = createId();
  setToasts((prev) => [...prev, { id, text, type }]);
  window.setTimeout(() => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, duration);
}, []);

const resolveWebDavConfig = useCallback(
  (options: { requireVaultSecret: boolean } = { requireVaultSecret: true }) => {
    const baseUrl = normalizeWebDavBaseUrl(webdav.baseUrl);
    const username = webdav.username.trim();
    const password = webdav.password.trim();
    const vaultSecret = webdav.vaultSecret.trim();

    if (!baseUrl) {
      pushToast("请输入可访问的 WebDAV Host。", "error");
      return null;
    }
    if (!username) {
      pushToast("请输入 WebDAV Account。", "error");
      return null;
    }
    if (!password) {
      pushToast("请输入 WebDAV Password。", "error");
      return null;
    }
    if (options.requireVaultSecret && !vaultSecret) {
      pushToast("请输入 Vault Secret。", "error");
      return null;
    }

    return {
      baseUrl,
      username,
      password,
      vaultSecret,
      revision: webdav.revision,
    };
  },
  [pushToast, webdav],
);

const handleImport = useCallback(async (rawText: string, source: string) => {

    const result = await importEntries(rawText, new Set(entriesRef.current.map((item) => item.secret)));

    if (result.entries.length > 0) {
      const newEntries = result.entries.map((item) => ({
        id: createId(),
        label: item.label,
        secret: item.secret,
      }));

      setEntries((prev) => [...newEntries.reverse(), ...prev]);
    }

    const text = formatImportResult(source, result);
    const toastType: ToastType = result.failed > 0 ? "info" : result.added > 0 ? "success" : "error";
    pushToast(text, toastType, 4200);
  }, [pushToast, setEntries]);

  useEffect(() => {
    entriesRef.current = entries;
    saveVaultState(vaultState);
  }, [entries, vaultState]);

  useEffect(() => {
    let cancelled = false;

    void initOtpCore().finally(() => {
      if (!cancelled) {
        setCoreStatus(getOtpCoreStatus());
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 250);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const nextCodes: Record<string, EntryCode> = {};
      await Promise.all(
        entries.map(async (entry) => {
          try {
            const code = await generateTotp(entry.secret, counter, TOTP_DIGITS);
            nextCodes[entry.id] = { code };
          } catch (error) {
            const message = error instanceof Error ? error.message : "";
            nextCodes[entry.id] = {
              code: "------",
              error: message.includes("Base32") ? "INVALID_SECRET" : "GENERATE_FAILED",
            };
          }
        }),
      );

      if (!cancelled) {
        setCodes(nextCodes);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [entries, counter]);

  useEffect(() => {
    const rawFromLink = parseImportParam(window.location.search);
    if (!rawFromLink) {
      return;
    }

    void handleImport(rawFromLink, "链接导入").finally(() => {
      const cleaned = clearImportParam(window.location.href);
      window.history.replaceState({}, "", cleaned);
    });
  }, [handleImport]);

  useEffect(() => {
    const dialog = shareDialogRef.current;
    if (!dialog) {
      return;
    }

    if (shareOpen && !dialog.open) {
      dialog.showModal();
    }

    if (!shareOpen && dialog.open) {
      dialog.close();
    }
  }, [shareOpen]);

  useEffect(() => {
    const dialog = scannerDialogRef.current;
    if (!dialog) {
      return;
    }

    if (scannerOpen && !dialog.open) {
      dialog.showModal();
    }

    if (!scannerOpen && dialog.open) {
      dialog.close();
    }
  }, [handleImport, pushToast, scannerOpen]);

  useEffect(() => {
    if (!scannerOpen) {
      stopScanner();
      return;
    }

    const run = async () => {
      const video = videoRef.current;
      if (!video) {
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        pushToast("当前浏览器不支持摄像头扫码。", "error");
        setScannerOpen(false);
        return;
      }

      try {
        const detector = await getDetector();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });

        streamRef.current = stream;
        video.srcObject = stream;
        await video.play();
        pushToast("摄像头已启动，请将二维码放入画面。", "info");

        const scanLoop = async (ts: number) => {
          if (!scannerOpen || !videoRef.current) {
            return;
          }

          if (!busyRef.current && ts - lastDetectAtRef.current > SCAN_INTERVAL_MS) {
            busyRef.current = true;
            lastDetectAtRef.current = ts;

            try {
              const results = await detector.detect(videoRef.current);
              const payload = readQrPayload(results);
              if (payload) {
                await handleImport(payload, "扫码导入");
                setScannerOpen(false);
                busyRef.current = false;
                return;
              }
            } catch (error) {
              pushToast(qrErrorText(error), "error");
              setScannerOpen(false);
              busyRef.current = false;
              return;
            }

            busyRef.current = false;
          }

          rafIdRef.current = window.requestAnimationFrame((nextTs) => {
            void scanLoop(nextTs);
          });
        };

        rafIdRef.current = window.requestAnimationFrame((ts) => {
          void scanLoop(ts);
        });
      } catch (error) {
        stopScanner();
        pushToast(qrErrorText(error), "error");
        setScannerOpen(false);
      }
    };

    void run();

    return () => {
      stopScanner();
    };
  }, [handleImport, pushToast, scannerOpen]);

  const getDetector = async (): Promise<BarcodeDetectorLike> => {
    if (detectorRef.current) {
      return detectorRef.current;
    }

    const Detector = getBarcodeDetectorClass();
    if (!Detector) {
      throw new Error("QR_DETECTOR_UNSUPPORTED");
    }

    const supported =
      typeof Detector.getSupportedFormats === "function" ? await Detector.getSupportedFormats() : ["qr_code"];

    if (!supported.includes("qr_code")) {
      throw new Error("QR_DETECTOR_UNSUPPORTED");
    }

    detectorRef.current = new Detector({ formats: ["qr_code"] });
    return detectorRef.current;
  };

  const stopScanner = () => {
    busyRef.current = false;
    lastDetectAtRef.current = 0;

    if (rafIdRef.current !== null) {
      window.cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const readQrPayload = (results: BarcodeDetectionResultLike[]): string => {
    if (!Array.isArray(results) || results.length === 0) {
      throw new Error("QR_NOT_FOUND");
    }

    const first = results[0];
    if (!first) {
      throw new Error("QR_NOT_FOUND");
    }

    if (typeof first.rawValue === "string" && first.rawValue.trim()) {
      return first.rawValue.trim();
    }

    if (first.rawData instanceof Uint8Array) {
      return new TextDecoder().decode(first.rawData).trim();
    }

    throw new Error("QR_NOT_FOUND");
  };

  const resetForm = () => {
    setLabelInput("");
    setSecretInput("");
    setEditingId(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const label = labelInput.trim();
    const secret = normalizeSecret(secretInput);

    if (!label) {
      pushToast("请输入备注名字。", "error");
      return;
    }

    const secretError = validateSecret(secret);
    if (secretError) {
      pushToast(secretError, "error");
      return;
    }

    if (editingId) {
      setEntries((prev) => prev.map((entry) => (entry.id === editingId ? { ...entry, label, secret } : entry)));
      resetForm();
      pushToast("密钥已更新。", "success");
      return;
    }

    setEntries((prev) => [{ id: createId(), label, secret }, ...prev]);
    resetForm();
    pushToast("密钥已保存。", "success");
  };

  const handleEdit = (entry: Entry) => {
    setEditingId(entry.id);
    setLabelInput(entry.label);
    setSecretInput(entry.secret);
    pushToast(`正在编辑：${entry.label}`, "info");
  };

  const handleDelete = (entryId: string) => {
    setEntries((prev) => prev.filter((entry) => entry.id !== entryId));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(entryId);
      return next;
    });

    if (editingId === entryId) {
      resetForm();
    }

    pushToast("密钥已删除。", "success");
  };

  const handleCopyCode = async (entryId: string) => {
    const codeInfo = codes[entryId];
    if (!codeInfo || codeInfo.error) {
      pushToast("当前密钥无法生成验证码。", "error");
      return;
    }

    const copied = await copyText(codeInfo.code);
    pushToast(copied ? "验证码已复制。" : "复制失败，请检查浏览器权限。", copied ? "success" : "error");
  };

  const selectedEntries = entries.filter((entry) => selectedIds.has(entry.id));

  const handleOpenShare = () => {
    if (selectedEntries.length === 0) {
      pushToast("请先选择要分享的密钥。", "error");
      return;
    }

    const raw = selectedEntries.map(toOtpauthUri).join("\n");
    setShareRaw(raw);
    setShareLink(buildImportLink(raw, window.location.href));
    setShareOpen(true);
  };

  const handleOpenEncryptedShare = async () => {
    if (selectedEntries.length === 0) {
      pushToast("请先选择要加密分享的密钥。", "error");
      return;
    }

    const passphrase = window.prompt("请输入分享口令（用于接收方解密）：");
    if (!passphrase) {
      return;
    }

    const confirmPassphrase = window.prompt("请再次输入分享口令：");
    if (!confirmPassphrase || confirmPassphrase !== passphrase) {
      pushToast("两次口令不一致，已取消。", "error");
      return;
    }

    try {
      const raw = selectedEntries.map(toOtpauthUri).join("\n");
      const secureText = await encryptShareText(raw, passphrase);
      setShareRaw(secureText);
      setShareLink(buildImportLink(secureText, window.location.href));
      setShareOpen(true);
      pushToast(`已生成加密分享内容（前缀 ${SECURE_SHARE_PREFIX}）。`, "success", 3600);
    } catch {
      pushToast("加密分享失败，请使用较新的浏览器。", "error");
    }
  };

  const handleCopyShareRaw = async () => {
    const copied = await copyText(shareRaw);
    pushToast(copied ? "原始分享内容已复制。" : "复制失败，请重试。", copied ? "success" : "error");
  };

  const handleCopyShareLink = async () => {
    const copied = await copyText(shareLink);
    pushToast(copied ? "分享链接已复制。" : "复制失败，请重试。", copied ? "success" : "error");
  };

  const handleImportText = async () => {
    const text = importText.trim();
    if (!text) {
      pushToast("请输入导入内容。", "error");
      return;
    }

    try {
      await handleImport(text, "文本导入");
      setImportText("");
    } catch {
      pushToast("导入失败，请检查内容格式。", "error");
    }
  };

  const handleImportImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      const detector = await getDetector();
      if (typeof createImageBitmap !== "function") {
        throw new Error("QR_IMAGE_UNSUPPORTED");
      }

      const bitmap = await createImageBitmap(file);
      try {
        const results = await detector.detect(bitmap);
        const payload = readQrPayload(results);
        await handleImport(payload, "二维码图片导入");
      } finally {
        bitmap.close();
      }
    } catch (error) {
      pushToast(qrErrorText(error), "error");
    }
  };

  const toggleSelect = (entryId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(entryId);
      } else {
        next.delete(entryId);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(entries.map((entry) => entry.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

const handleWebDavVerify = async () => {
  const config = resolveWebDavConfig({ requireVaultSecret: false });
  if (!config) {
    return;
  }

  setWebdavAction("验证");
  try {
    const result = await verifyWebDavConfig(config);
    updateWebDavState((prev) => ({
      ...prev,
      baseUrl: config.baseUrl,
      username: config.username,
      password: config.password,
      vaultSecret: config.vaultSecret || prev.vaultSecret,
      revision: result.manifest?.revision ?? "",
    }));
    pushToast(
      result.manifest
        ? `WebDAV 配置可用，远端已有 ${result.manifest.entryCount} 条密钥快照。`
        : "WebDAV 配置可用，远端还没有快照。",
      "success",
      4200,
    );
  } catch (error) {
    pushToast(syncErrorText(error), "error", 4200);
  } finally {
    setWebdavAction(null);
  }
};

const handleWebDavPull = async () => {
  const config = resolveWebDavConfig();
  if (!config) {
    return;
  }
  if (entriesRef.current.length > 0 && !window.confirm("拉取会用远端快照覆盖当前本地列表，是否继续？")) {
    return;
  }

  setWebdavAction("拉取");
  try {
    const pulled = await pullWebDavVault(config);
    updateWebDavState((prev) => ({
      ...prev,
      baseUrl: config.baseUrl,
      username: config.username,
      password: config.password,
      vaultSecret: config.vaultSecret,
      revision: pulled.manifest?.revision ?? "",
      lastSyncAtMs: pulled.manifest ? Date.now() : prev.lastSyncAtMs,
    }));

    if (!pulled.manifest) {
      pushToast("远端还没有可拉取的快照。", "info");
      return;
    }

    replaceEntriesFromSync(pulled.entries, pulled.manifest.updatedAtMs);
    pushToast(`已从 WebDAV 拉取 ${pulled.entries.length} 条密钥。`, "success", 4200);
  } catch (error) {
    pushToast(syncErrorText(error), "error", 4200);
  } finally {
    setWebdavAction(null);
  }
};

const handleWebDavPush = async () => {
  const config = resolveWebDavConfig();
  if (!config) {
    return;
  }

  setWebdavAction("推送");
  try {
    const manifest = await pushWebDavVault(config, entriesRef.current, vaultState.updatedAtMs);
    updateWebDavState((prev) => ({
      ...prev,
      baseUrl: config.baseUrl,
      username: config.username,
      password: config.password,
      vaultSecret: config.vaultSecret,
      revision: manifest.revision,
      lastSyncAtMs: Date.now(),
    }));
    pushToast(`已推送 ${entriesRef.current.length} 条密钥到 WebDAV。`, "success", 4200);
  } catch (error) {
    pushToast(syncErrorText(error), "error", 4200);
  } finally {
    setWebdavAction(null);
  }
};

const handleWebDavRefresh = async () => {
  const config = resolveWebDavConfig({ requireVaultSecret: false });
  if (!config) {
    return;
  }

  setWebdavAction("刷新");
  try {
    const result = await verifyWebDavConfig(config);
    updateWebDavState((prev) => ({
      ...prev,
      baseUrl: config.baseUrl,
      username: config.username,
      password: config.password,
      vaultSecret: config.vaultSecret || prev.vaultSecret,
      revision: result.manifest?.revision ?? "",
    }));
    pushToast(result.manifest ? "WebDAV 远端状态已刷新。" : "WebDAV 可访问，远端仍为空。", "success", 4200);
  } catch (error) {
    pushToast(syncErrorText(error), "error", 4200);
  } finally {
    setWebdavAction(null);
  }
};

const handleWebDavClear = () => {
  updateWebDavState(() => defaultWebDavState());
  pushToast("WebDAV 配置已清空。", "info");
};

  return (
    <div className="min-h-[100dvh] px-4 py-6 text-slate-900">
      <div className="ambient-grid" />
      <div className="ambient-blob left" />
      <div className="ambient-blob right" />
      <div className="relative z-10 mx-auto grid w-full max-w-6xl gap-4">
        <Card className="liquid-card reveal-up">
          <CardContent className="grid gap-4 p-5 md:grid-cols-[1.35fr_0.65fr] md:items-end">
            <div className="grid gap-2">
              <div className="flex items-center gap-3">
                <img src={logoUrl} alt="2FA logo" className="size-10 rounded-xl ring-1 ring-white/60 md:size-12" />
                <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">两步验证验证码生成器</h1>
              </div>
              <p className="mt-1 text-sm text-slate-600">本地离线生成 TOTP 验证码，支持扫码导入、链接导入、多选分享，以及通过 WebDAV 同步加密快照。</p>
              <div className="mt-1 flex flex-wrap gap-2">
                <a
                  href="https://github.com/Gaubee/2fa"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white/80 px-3 py-1 text-xs font-medium text-sky-800 shadow-sm transition-colors hover:border-sky-300 hover:text-sky-900"
                >
                  <Github className="size-3.5" />
                  GitHub 仓库（源码与私有化部署）
                </a>
                <code className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] text-slate-700">
                  curl -fsSL .../install-www.sh | sh -s -- --www=./mydir
                </code>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-700">
                <span className={cn(
                  "inline-flex items-center rounded-full border px-3 py-1",
                  coreStatus === "ready" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800",
                )}>
                  Rust Core · {coreStatus === "ready" ? "已启用" : coreStatus === "loading" ? "加载中" : "JS 回退"}
                </span>
                {providers.map((provider) => (
                  <span
                    key={provider.id}
                    className={cn(
                      "inline-flex items-center rounded-full border px-3 py-1",
                      provider.status === "ready"
                        ? "border-sky-200 bg-sky-50 text-sky-800"
                        : "border-slate-200 bg-slate-50 text-slate-600",
                    )}
                  >
                    {provider.label} · {provider.status === "planned" ? "待接入" : provider.enabled ? "已启用" : "可用"}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-teal-100 bg-white/70 p-3">
              <p className="text-xs text-slate-500">刷新倒计时</p>
              <p className="mono-num text-3xl font-semibold">{remain}s</p>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-teal-100">
                <div className="h-full bg-gradient-to-r from-teal-500 to-sky-500 transition-[width] duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="liquid-card reveal-up">
          <CardHeader>
            <CardTitle>添加或编辑密钥</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid grid-cols-1 items-end gap-3 md:grid-cols-[1fr_1fr_auto]" onSubmit={handleSubmit}>
              <label className="grid gap-1 text-sm">
                备注名字
                <Input value={labelInput} onChange={(event) => setLabelInput(event.target.value)} maxLength={80} required />
              </label>
              <label className="grid gap-1 text-sm">
                2FA 密钥（Base32）
                <Input
                  value={secretInput}
                  onChange={(event) => setSecretInput(event.target.value)}
                  spellCheck={false}
                  inputMode="text"
                  required
                />
              </label>
              <div className="grid gap-2">
                <Button type="submit">{editingId ? "保存修改" : "保存并生成"}</Button>
                {editingId ? (
                  <Button type="button" variant="secondary" onClick={resetForm}>
                    取消编辑
                  </Button>
                ) : null}
              </div>
            </form>
            <p className="mt-2 text-xs text-slate-500">当前默认启用 Local Vault，并已支持通过 WebDAV 同步加密快照；GitHub Gist 与 Google Drive 会在后续版本接入。</p>
          </CardContent>
        </Card>

<WebDavProviderCard
  baseUrl={webdav.baseUrl}
  username={webdav.username}
  password={webdav.password}
  vaultSecret={webdav.vaultSecret}
  configured={webdavConfigured}
  busyLabel={webdavAction}
  revision={webdav.revision}
  connectionLabel={webdavConnectionLabel}
  lastSyncLabel={webdavLastSyncLabel}
  onBaseUrlChange={(value) => updateWebDavState((prev) => ({ ...prev, baseUrl: value }))}
  onUsernameChange={(value) => updateWebDavState((prev) => ({ ...prev, username: value }))}
  onPasswordChange={(value) => updateWebDavState((prev) => ({ ...prev, password: value }))}
  onVaultSecretChange={(value) => updateWebDavState((prev) => ({ ...prev, vaultSecret: value }))}
  onVerify={() => void handleWebDavVerify()}
  onPull={() => void handleWebDavPull()}
  onPush={() => void handleWebDavPush()}
  onRefresh={() => void handleWebDavRefresh()}
  onClear={handleWebDavClear}
/>

        <Card className="liquid-card reveal-up">
          <CardHeader>
            <CardTitle>导入密钥</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200/80 bg-white/85 p-4">
              <h3 className="text-sm font-semibold">二维码导入</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button type="button" onClick={() => setScannerOpen(true)}>
                  <Camera className="size-4" />
                  摄像头扫码
                </Button>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-slate-300 bg-white px-3 py-2 text-sm">
                  <Upload className="size-4" />
                  选择二维码图片
                  <input type="file" accept="image/*" className="hidden" onChange={handleImportImage} />
                </label>
              </div>
              <p className="mt-2 text-xs text-slate-500">支持 otpauth://totp 与 otpauth-migration://offline 二维码。</p>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-white/85 p-4">
              <h3 className="text-sm font-semibold">文本导入</h3>
              <Textarea
                className="mt-2"
                rows={5}
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                placeholder="每行一项：otpauth://... / otpauth-migration://... / otpauth-secure://..."
              />
              <Button type="button" className="mt-2" onClick={() => void handleImportText()}>
                导入文本
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="liquid-card reveal-up">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>我的验证码</CardTitle>
              <p className="text-sm text-slate-500">{entries.length} 项</p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={selectAll} disabled={entries.length === 0 || selectedIds.size === entries.length}>
                  全选
                </Button>
                <Button variant="secondary" size="sm" onClick={clearSelection} disabled={selectedIds.size === 0}>
                  清空选择
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-slate-500">已选 {selectedIds.size} 项</span>
                <Button size="sm" onClick={handleOpenShare} disabled={selectedIds.size === 0}>
                  <Share2 className="size-4" />
                  分享所选
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void handleOpenEncryptedShare()} disabled={selectedIds.size === 0}>
                  <Shield className="size-4" />
                  加密分享
                </Button>
              </div>
            </div>

            {entries.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">还没有密钥，请先在上方添加或导入。</div>
            ) : (
              <ul className="grid gap-2">
                {entries.map((entry, index) => {
                  const codeInfo = codes[entry.id];
                  const isError = Boolean(codeInfo?.error);
                  const isEditing = editingId === entry.id;
                  const codeText = codeInfo?.code ?? "------";

                  return (
                    <li
                      key={entry.id}
                      style={{ animationDelay: `${index * 42}ms` }}
                      className={cn(
                        "reveal-up flex flex-col gap-3 rounded-xl border bg-white/92 p-3 md:flex-row md:items-center md:justify-between",
                        isEditing ? "border-sky-400 shadow-[inset_0_0_0_1px_rgba(14,116,144,0.2)]" : "border-slate-200",
                      )}
                    >
                      <div className="grid gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="inline-flex items-center gap-2 text-sm font-medium">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(entry.id)}
                              onChange={(event) => toggleSelect(entry.id, event.target.checked)}
                            />
                            {entry.label}
                          </label>
                          <span className="text-xs text-slate-500">密钥: {maskSecret(entry.secret)}</span>
                        </div>

                        <button
                          type="button"
                          className={cn(
                            "mono-num justify-self-start bg-transparent p-0 text-left text-3xl tracking-[0.04em]",
                            isError ? "cursor-default text-red-700" : "text-slate-900 hover:text-sky-700",
                          )}
                          onClick={() => void handleCopyCode(entry.id)}
                          disabled={isError}
                        >
                          {isError ? (codeInfo?.error === "INVALID_SECRET" ? "密钥无效" : "生成失败") : codeText}
                        </button>

                        <span className="text-xs text-slate-500">剩余 {remain} 秒</span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 md:w-[260px]">
                        <Button size="sm" variant="secondary" onClick={() => handleEdit(entry)}>
                          <Edit3 className="size-4" />
                          编辑
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void handleCopyCode(entry.id)}>
                          <Copy className="size-4" />
                          复制
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => handleDelete(entry.id)}>
                          <Trash2 className="size-4" />
                          删除
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <dialog ref={scannerDialogRef} className="w-[min(560px,calc(100%-1rem))] rounded-xl border border-slate-300/90 bg-white/96 p-3 backdrop:bg-slate-900/55">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">摄像头扫码导入</h3>
          <Button size="sm" variant="secondary" onClick={() => setScannerOpen(false)}>
            关闭
          </Button>
        </div>
        <video ref={videoRef} autoPlay muted playsInline className="min-h-64 w-full rounded-lg bg-slate-950 object-cover" />
        <p className="mt-2 text-xs text-slate-500">将二维码放入画面，识别后自动导入并关闭。</p>
      </dialog>

      <dialog ref={shareDialogRef} className="w-[min(760px,calc(100%-1rem))] rounded-xl border border-slate-300/90 bg-white/96 p-3 backdrop:bg-slate-900/55">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">分享内容</h3>
          <Button size="sm" variant="secondary" onClick={() => setShareOpen(false)}>
            关闭
          </Button>
        </div>

        <label className="grid gap-1 text-sm">
          原始 otpauth 列表
          <Textarea rows={6} readOnly value={shareRaw} />
        </label>
        <Button className="mt-2" onClick={() => void handleCopyShareRaw()}>
          <Copy className="size-4" />
          复制原始内容
        </Button>

        <label className="mt-3 grid gap-1 text-sm">
          链接导入地址
          <Textarea rows={3} readOnly value={shareLink} />
        </label>
        <Button className="mt-2" onClick={() => void handleCopyShareLink()}>
          <QrCode className="size-4" />
          复制链接
        </Button>
        <p className="mt-2 text-xs text-slate-500">链接格式：当前域名 + ?import=BASE64CONTENT</p>
      </dialog>

      <div className="fixed bottom-3 right-3 z-50 grid gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "max-w-[360px] rounded-md px-3 py-2 text-sm text-white shadow-lg",
              toast.type === "success" && "bg-teal-700",
              toast.type === "error" && "bg-red-700",
              toast.type === "info" && "bg-sky-700",
            )}
          >
            {toast.text}
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
