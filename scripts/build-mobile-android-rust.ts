import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
const androidJniLibsDir = resolve(repoRoot, "mobile", "android", "app", "src", "main", "jniLibs");

function runInherited(command: string, args: string[]): void {
  execFileSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
  });
}

function main(): void {
  runInherited("pnpm", ["mobile:bindings"]);
  runInherited("cargo", [
    "ndk",
    "-t",
    "arm64-v8a",
    "-t",
    "armeabi-v7a",
    "-t",
    "x86_64",
    "-o",
    androidJniLibsDir,
    "build",
    "-p",
    "gaubee-2fa-mobile-bridge",
    "--release",
  ]);

  console.log(`已生成 Android Rust 动态库到: ${androidJniLibsDir}`);
}

main();
