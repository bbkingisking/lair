import { execSync } from "node:child_process";
import { existsSync, cpSync, globSync, mkdirSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { resolve, basename } from "node:path";

// Configuration comes from the environment only. On the build host the systemd
// unit supplies it; by hand, export the vars or run the publish script.

// Only needed when there is no local checkout to read from; the guard for that
// lives below, once we know which mode we are in.
const REPO = process.env.POETRY_REPO_URL;

const DEST = resolve("src/content/poems");
const REPO_DIR = resolve(".poetry-repo");

// Where the poems are read from, and what their "view source" links point at,
// are two different questions.
//
// POETRY_REPO_PATH points at a checkout that already exists on this machine, so
// no clone is needed and the build does not depend on any forge being
// reachable. POETRY_BLOB_BASE is the public browse URL those poems are visible
// at. The two come apart whenever the working copy is not the published one:
// reading from a local path, or from a git host that is only reachable on the
// LAN. Without the split, source links would end up pointing at a filesystem
// path or a private address.
const LOCAL_PATH = process.env.POETRY_REPO_PATH;
const BLOB_BASE = process.env.POETRY_BLOB_BASE;

try {
  let sourceDir;

  if (LOCAL_PATH) {
    sourceDir = resolve(LOCAL_PATH);
    if (!existsSync(sourceDir)) {
      console.error(`[fetch-poems] POETRY_REPO_PATH does not exist: ${sourceDir}`);
      process.exit(1);
    }
  } else {
    if (!REPO) {
      console.error("[fetch-poems] Set POETRY_REPO_PATH (local checkout) or POETRY_REPO_URL (clone)");
      process.exit(1);
    }
    sourceDir = REPO_DIR;
    if (existsSync(REPO_DIR)) {
      execSync("git pull --ff-only", { cwd: REPO_DIR, stdio: "pipe" });
    } else {
      execSync(`git clone --depth 1 ${REPO} ${REPO_DIR}`, { stdio: "pipe" });
    }
  }

  const poems = globSync("**/*.poem", { cwd: sourceDir });
  if (poems.length === 0) {
    console.error(`[fetch-poems] No .poem files found in ${sourceDir}`);
    process.exit(1);
  }

  mkdirSync(DEST, { recursive: true });
  const sourceMap = {};
  const expected = new Set();
  for (const poem of poems) {
    const filename = poem.split("/").pop();
    expected.add(filename);
    cpSync(resolve(sourceDir, poem), resolve(DEST, filename));
    const id = basename(filename, '.poem');
    sourceMap[id] = poem;
  }

  // This directory is a copy, not a cache, so anything no longer upstream has
  // to go. Only ever adding to it means a renamed poem keeps its old page and
  // a deleted one is never actually deleted — the build cannot tell the
  // difference between a poem and the ghost of one.
  const pruned = readdirSync(DEST)
    .filter(f => f.endsWith('.poem') && !expected.has(f));
  for (const stale of pruned) rmSync(resolve(DEST, stale));

  // An explicit base wins. Otherwise derive one from the checkout's remote,
  // which only produces a usable URL for GitHub-shaped hosts — other forges
  // spell their file paths differently (Gitea uses /src/branch/, not /blob/).
  let blobBase = BLOB_BASE;
  if (!blobBase) {
    const remoteUrl = execSync("git remote get-url origin", { cwd: sourceDir, stdio: "pipe" }).toString().trim();
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: sourceDir, stdio: "pipe" }).toString().trim();
    const repoUrl = remoteUrl.replace(/\.git$/, '').replace(/^git@github\.com:/, 'https://github.com/');
    blobBase = `${repoUrl}/blob/${branch}`;
  }

  if (!/^https?:\/\//.test(blobBase)) {
    console.error(`[fetch-poems] Refusing to write unusable source links: ${blobBase}`);
    console.error("[fetch-poems] Set POETRY_BLOB_BASE to the public browse URL, e.g. https://github.com/user/repo/blob/main");
    process.exit(1);
  }

  writeFileSync(resolve(DEST, '.source-map.json'), JSON.stringify({ _repoUrl: blobBase, ...sourceMap }, null, 2));

  console.log(`[fetch-poems] Synced ${poems.length} .poem files from ${sourceDir}${pruned.length ? `, pruned ${pruned.length}` : ""}`);
  console.log(`[fetch-poems] Source links → ${blobBase}`);
} catch (err) {
  console.error("[fetch-poems] Failed to fetch poems:", err.message);
  process.exit(1);
}
