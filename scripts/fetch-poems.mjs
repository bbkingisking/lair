import { execSync } from "node:child_process";
import { existsSync, cpSync, globSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

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
  for (const poem of poems) {
    cpSync(resolve(REPO_DIR, poem), resolve(DEST, poem.split("/").pop()));
  }

  console.log(`[fetch-poems] Synced ${poems.length} .poem files from ${REPO}`);
} catch (err) {
  console.error("[fetch-poems] Failed to fetch poems:", err.message);
  process.exit(1);
}
