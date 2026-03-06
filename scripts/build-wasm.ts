import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
const wasmTarget = "wasm32-unknown-unknown";
const toolchain = "stable";
const wasmCrate = "gaubee-2fa-wasm-core";
const wasmBinary = resolve(repoRoot, "target", wasmTarget, "release", "gaubee_2fa_wasm_core.wasm");
const wasmOutDir = resolve(repoRoot, "packages", "wasm-web", "pkg");

function run(command: string, args: string[], options?: { env?: NodeJS.ProcessEnv }): string {
  const output = execFileSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "pipe",
    env: {
      ...process.env,
      ...options?.env,
    },
  });

  return output.trim();
}

function runInherited(command: string, args: string[], options?: { env?: NodeJS.ProcessEnv }): void {
  execFileSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      ...options?.env,
    },
  });
}

function main(): void {
  const rustupCargo = run("rustup", ["which", "--toolchain", toolchain, "cargo"]);
  const rustupRustc = run("rustup", ["which", "--toolchain", toolchain, "rustc"]);

  if (!existsSync(wasmOutDir)) {
    mkdirSync(wasmOutDir, { recursive: true });
  }

  runInherited(rustupCargo, ["build", "-p", wasmCrate, "--target", wasmTarget, "--release"], {
    env: {
      RUSTC: rustupRustc,
    },
  });

  runInherited("wasm-bindgen", ["--target", "web", "--out-dir", wasmOutDir, wasmBinary]);
}

main();
