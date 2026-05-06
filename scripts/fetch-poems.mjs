import { execSync } from "node:child_process";
import { existsSync, cpSync, globSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, basename } from "node:path";

const REPO = process.env.POETRY_REPO_URL;
if (!REPO) {
  console.error("[fetch-poems] POETRY_REPO_URL is not set");
  process.exit(1);
}

const DEST = resolve("src/content/poems");
const REPO_DIR = resolve(".poetry-repo");

try {
  if (existsSync(REPO_DIR)) {
    execSync("git pull --ff-only", { cwd: REPO_DIR, stdio: "pipe" });
  } else {
    execSync(`git clone --depth 1 ${REPO} ${REPO_DIR}`, { stdio: "pipe" });
  }

  const poems = globSync("**/*.poem", { cwd: REPO_DIR });
  if (poems.length === 0) {
    console.error("[fetch-poems] No .poem files found in repo");
    process.exit(1);
  }

  mkdirSync(DEST, { recursive: true });
  const sourceMap = {};
  for (const poem of poems) {
    const filename = poem.split("/").pop();
    cpSync(resolve(REPO_DIR, poem), resolve(DEST, filename));
    const id = basename(filename, '.poem');
    sourceMap[id] = poem;
  }

  // Derive GitHub blob URL from git remote
  const remoteUrl = execSync("git remote get-url origin", { cwd: REPO_DIR, stdio: "pipe" }).toString().trim();
  const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: REPO_DIR, stdio: "pipe" }).toString().trim();
  const repoUrl = remoteUrl.replace(/\.git$/, '').replace(/^git@github\.com:/, 'https://github.com/');

  writeFileSync(resolve(DEST, '.source-map.json'), JSON.stringify({ _repoUrl: `${repoUrl}/blob/${branch}`, ...sourceMap }, null, 2));

  console.log(`[fetch-poems] Synced ${poems.length} .poem files from ${REPO}`);
} catch (err) {
  console.error("[fetch-poems] Failed to fetch poems:", err.message);
  process.exit(1);
}
