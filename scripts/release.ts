import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface CliOptions {
  tag?: string;
  repo?: string;
  notes?: string;
  skipBuild?: boolean;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];

    if (token === "--tag" && next) {
      options.tag = next;
      i += 1;
      continue;
    }

    if (token === "--repo" && next) {
      options.repo = next;
      i += 1;
      continue;
    }

    if (token === "--notes" && next) {
      options.notes = next;
      i += 1;
      continue;
    }

    if (token === "--skip-build") {
      options.skipBuild = true;
    }
  }

  return options;
}

function run(command: string, args: string[], options?: { stdio?: "inherit" | "pipe" }): string {
  const result = execFileSync(command, args, {
    cwd: repoRoot,
    stdio: options?.stdio ?? "pipe",
    encoding: "utf8",
  });

  if (typeof result === "string") {
    return result.trim();
  }

  return "";
}

function tryRun(command: string, args: string[]): { ok: boolean; output: string } {
  try {
    return { ok: true, output: run(command, args) };
  } catch (error) {
    const output = error instanceof Error ? error.message : "";
    return { ok: false, output };
  }
}

function resolveRepoSlug(inputRepo?: string): string {
  if (inputRepo) {
    return inputRepo;
  }

  const remote = run("git", ["remote", "get-url", "origin"]);

  const httpsMatch = remote.match(/^https:\/\/github\.com\/([^/]+)\/([^/.]+)(?:\.git)?$/i);
  if (httpsMatch) {
    return `${httpsMatch[1]}/${httpsMatch[2]}`;
  }

  const sshMatch = remote.match(/^git@github\.com:([^/]+)\/([^/.]+)(?:\.git)?$/i);
  if (sshMatch) {
    return `${sshMatch[1]}/${sshMatch[2]}`;
  }

  throw new Error(`无法从远程地址解析仓库名: ${remote}`);
}

function ensureCommand(command: string): void {
  const found = tryRun("which", [command]);
  if (!found.ok || !found.output) {
    throw new Error(`未找到命令: ${command}`);
  }
}

function createReleaseNotes(tag: string, repo: string, userNotes?: string): string {
  const notes = userNotes?.trim() || "包含最新前端构建产物，支持离线部署与 GitHub Pages。";
  return [
    `## ${tag}`,
    "",
    notes,
    "",
    "### 资产说明",
    "- `dist` 打包文件：可直接部署到任意静态托管服务。",
    "- GitHub 自动附带 Source code (zip/tar.gz)：可下载源码做私有化部署。",
    "",
    `仓库: https://github.com/${repo}`,
  ].join("\n");
}

function ensureTag(tag: string): void {
  const hasTag = tryRun("git", ["rev-parse", "-q", "--verify", `refs/tags/${tag}`]);
  if (!hasTag.ok) {
    run("git", ["tag", "-a", tag, "-m", `release: ${tag}`], { stdio: "inherit" });
  }

  const pushResult = tryRun("git", ["push", "origin", tag]);
  if (!pushResult.ok && !pushResult.output.includes("Everything up-to-date")) {
    throw new Error(`推送 tag 失败: ${pushResult.output}`);
  }
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const pkgPath = resolve(repoRoot, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string; name: string };

  const tag = options.tag ?? `v${pkg.version}`;
  const repo = resolveRepoSlug(options.repo);

  ensureCommand("gh");
  ensureCommand("pnpm");
  ensureCommand("tar");

  if (!options.skipBuild) {
    run("pnpm", ["build"], { stdio: "inherit" });
  }

  const distPath = resolve(repoRoot, "dist");
  if (!existsSync(distPath)) {
    throw new Error("未找到 dist 目录，请先执行构建。");
  }

  const releaseDir = resolve(repoRoot, ".release");
  if (!existsSync(releaseDir)) {
    mkdirSync(releaseDir, { recursive: true });
  }

  const archiveName = `${pkg.name}-${tag}-dist.tar.gz`;
  const archivePath = resolve(releaseDir, archiveName);
  const notesPath = resolve(releaseDir, `release-notes-${tag}.md`);

  run("tar", ["-czf", archivePath, "-C", distPath, "."], { stdio: "inherit" });
  writeFileSync(notesPath, createReleaseNotes(tag, repo, options.notes), "utf8");

  ensureTag(tag);

  const hasRelease = tryRun("gh", ["release", "view", tag, "-R", repo]);
  if (hasRelease.ok) {
    run("gh", ["release", "upload", tag, archivePath, "--clobber", "-R", repo], { stdio: "inherit" });
    run("gh", ["release", "edit", tag, "--notes-file", notesPath, "-R", repo], { stdio: "inherit" });
    console.log(`已更新 Release: ${tag}`);
  } else {
    run("gh", ["release", "create", tag, archivePath, "--title", tag, "--notes-file", notesPath, "-R", repo], {
      stdio: "inherit",
    });
    console.log(`已创建 Release: ${tag}`);
  }

  console.log(`发布完成: https://github.com/${repo}/releases/tag/${tag}`);
}

main();
