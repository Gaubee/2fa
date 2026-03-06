import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
const crateName = "gaubee-2fa-mobile-bridge";
const libraryBaseName = "gaubee_2fa_mobile_bridge";
const androidSourceRoot = resolve(repoRoot, "mobile", "android", "app", "src", "main", "java");
const androidBindingsRoot = resolve(androidSourceRoot, "uniffi", libraryBaseName);
const iosBindingsRoot = resolve(repoRoot, "mobile", "ios", "Core", "Generated");

function run(command: string, args: string[]): string {
  const output = execFileSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "pipe",
  });

  return output.trim();
}

function runInherited(command: string, args: string[]): void {
  execFileSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
  });
}

function libraryFileName(): string {
  if (process.platform === "darwin") {
    return `lib${libraryBaseName}.dylib`;
  }

  if (process.platform === "win32") {
    return `${libraryBaseName}.dll`;
  }

  return `lib${libraryBaseName}.so`;
}

function main(): void {
  runInherited("cargo", ["build", "-p", crateName]);

  const libraryPath = resolve(repoRoot, "target", "debug", libraryFileName());
  if (!existsSync(libraryPath)) {
    throw new Error(`未找到 UniFFI 动态库: ${libraryPath}`);
  }

  const tempRoot = run("mktemp", ["-d", join(tmpdir(), "gaubee-2fa-mobile-bindings.XXXXXX")]);
  const kotlinTempDir = resolve(tempRoot, "kotlin");
  const swiftTempDir = resolve(tempRoot, "swift");

  runInherited("uniffi-bindgen", [
    "generate",
    "--no-format",
    "--library",
    libraryPath,
    "--language",
    "kotlin",
    "--out-dir",
    kotlinTempDir,
  ]);

  runInherited("uniffi-bindgen", [
    "generate",
    "--library",
    libraryPath,
    "--language",
    "swift",
    "--out-dir",
    swiftTempDir,
  ]);

  rmSync(androidBindingsRoot, { recursive: true, force: true });
  mkdirSync(resolve(androidSourceRoot, "uniffi"), { recursive: true });
  cpSync(resolve(kotlinTempDir, "uniffi", libraryBaseName), androidBindingsRoot, { recursive: true });

  rmSync(iosBindingsRoot, { recursive: true, force: true });
  mkdirSync(iosBindingsRoot, { recursive: true });
  cpSync(swiftTempDir, iosBindingsRoot, { recursive: true });

  console.log(`已生成 Android 绑定: ${androidBindingsRoot}`);
  console.log(`已生成 iOS 绑定: ${iosBindingsRoot}`);
}

main();
