// Sync dist/ to a bunny.net Edge Storage zone, which a pull zone serves as the
// site. Bunny resolves directory indexes natively (/foo, /foo/ and
// /foo/index.html all serve the same file) and returns real 404s for misses, so
// Astro's default `directory` build format needs no rewrite rules.
//
//   BUNNY_PASSWORD=<storage zone password> node scripts/deploy-bunny.mjs
//
// Env:
//   BUNNY_PASSWORD      required — Storage zone password (FTP & API Access)
//   BUNNY_API_KEY       optional — account key; without it the edge is not purged
//   BUNNY_STORAGE_ZONE  default 'dragonlair'
//   BUNNY_STORAGE_HOST  default 'storage.bunnycdn.com' (region-specific otherwise)
//   BUNNY_DRY_RUN       set to any value to report the plan without writing
//
// Either secret may instead be given as BUNNY_PASSWORD_FILE / BUNNY_API_KEY_FILE
// pointing at a file, which is how the systemd unit passes credentials.
//
// Uploads only what changed, by comparing the remote SHA256 the list API
// reports against the local file's. Removes remote files that are no longer in
// dist/, so a deploy leaves the zone matching the build exactly.

import { readFile, readdir, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, sep, posix } from 'node:path';

/**
 * A secret, from either the variable itself or a file it points at.
 *
 * systemd hands credentials to a unit as files under $CREDENTIALS_DIRECTORY
 * rather than as environment variables, so the *_FILE spelling is what the
 * service uses; the plain variable stays for interactive runs.
 */
function secret(name) {
  const path = process.env[`${name}_FILE`];
  if (path) return readFileSync(path, 'utf8').trim();
  return process.env[name];
}

const ZONE = process.env.BUNNY_STORAGE_ZONE ?? 'dragonlair';
const HOST = process.env.BUNNY_STORAGE_HOST ?? 'storage.bunnycdn.com';
const KEY = secret('BUNNY_PASSWORD');
const DRY_RUN = Boolean(process.env.BUNNY_DRY_RUN);
const DIST = new URL('../dist/', import.meta.url).pathname;
const BASE = `https://${HOST}/${ZONE}`;
const CONCURRENCY = 16;

if (!KEY) {
  console.error('Set BUNNY_PASSWORD or BUNNY_PASSWORD_FILE.');
  process.exit(1);
}

const headers = { AccessKey: KEY };

/** Every file under dist/, keyed by its URL path, with a SHA256 to compare. */
async function localFiles() {
  const out = new Map();
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      const body = await readFile(full);
      out.set(relative(DIST, full).split(sep).join('/'), {
        body,
        hash: createHash('sha256').update(body).digest('hex').toUpperCase(),
      });
    }
  }
  await walk(DIST);
  return out;
}

/** Every file in the storage zone, keyed the same way. */
async function remoteFiles() {
  const out = new Map();
  async function walk(prefix) {
    const res = await fetch(`${BASE}/${prefix}`, { headers });
    if (!res.ok) throw new Error(`list ${prefix || '/'} failed: ${res.status}`);
    for (const item of await res.json()) {
      const path = posix.join(prefix, item.ObjectName);
      if (item.IsDirectory) await walk(`${path}/`);
      else out.set(path, item.Checksum ?? '');
    }
  }
  await walk('');
  return out;
}

/** Run `worker` over `items`, at most CONCURRENCY in flight. */
async function pooled(items, worker) {
  const queue = [...items];
  const failures = [];
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length) {
        const item = queue.shift();
        try {
          await worker(item);
        } catch (err) {
          failures.push(`${item[0] ?? item}: ${err.message}`);
        }
      }
    }),
  );
  return failures;
}

const [local, remote] = await Promise.all([localFiles(), remoteFiles()]);

const changed = [...local].filter(([path, { hash }]) => remote.get(path) !== hash);
const stale = [...remote.keys()].filter(path => !local.has(path));

console.log(`local ${local.size} files, remote ${remote.size}`);
console.log(`  upload ${changed.length}, delete ${stale.length}, unchanged ${local.size - changed.length}`);

// A deploy that removes most of the zone is far likelier to be a truncated
// build than an intended change — a half-synced poem directory, an aborted
// build, a wrong path. The sync would otherwise carry it out faithfully.
const MAX_DELETE_RATIO = Number(process.env.BUNNY_MAX_DELETE_RATIO ?? 0.2);
const deleteRatio = remote.size ? stale.length / remote.size : 0;
if (deleteRatio > MAX_DELETE_RATIO && !process.env.BUNNY_ALLOW_MASS_DELETE) {
  console.error(
    `\nRefusing to delete ${stale.length} of ${remote.size} remote files ` +
    `(${(deleteRatio * 100).toFixed(1)}%, limit ${(MAX_DELETE_RATIO * 100).toFixed(0)}%).`,
  );
  console.error('If the build really is meant to be this much smaller, set BUNNY_ALLOW_MASS_DELETE=1.');
  process.exit(1);
}

if (DRY_RUN) {
  for (const [path] of changed.slice(0, 20)) console.log(`  + ${path}`);
  for (const path of stale.slice(0, 20)) console.log(`  - ${path}`);
  console.log('dry run — nothing written.');
  process.exit(0);
}

const uploadFailures = await pooled(changed, async ([path, { body }]) => {
  const res = await fetch(`${BASE}/${path}`, { method: 'PUT', headers, body });
  if (!res.ok) throw new Error(`PUT ${res.status}`);
});

const deleteFailures = await pooled(stale, async path => {
  const res = await fetch(`${BASE}/${path}`, { method: 'DELETE', headers });
  // A file already gone is the state we wanted anyway.
  if (!res.ok && res.status !== 404) throw new Error(`DELETE ${res.status}`);
});

const failures = [...uploadFailures, ...deleteFailures];
if (failures.length) {
  console.error(`\n${failures.length} operation(s) failed:`);
  for (const f of failures.slice(0, 20)) console.error(`  ${f}`);
  process.exit(1);
}

// Uploading to storage does not invalidate the edge. The pull zone caches for
// its configured TTL (30 days by default), so without this a deploy is
// invisible until the cache expires. Purging needs an *account* API key, which
// is a different credential from the storage zone password.
if (changed.length || stale.length) {
  const apiKey = secret('BUNNY_API_KEY');
  if (!apiKey) {
    console.warn('\nBUNNY_API_KEY not set — edge cache NOT purged.');
    console.warn('Changed files will keep serving stale until the pull zone TTL expires.');
  } else {
    const pullZoneName = process.env.BUNNY_PULLZONE ?? ZONE;
    let id = process.env.BUNNY_PULLZONE_ID;
    if (!id) {
      const res = await fetch('https://api.bunny.net/pullzone', {
        headers: { AccessKey: apiKey, accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`pull zone lookup failed: ${res.status}`);
      const zones = await res.json();
      const list = Array.isArray(zones) ? zones : zones.Items ?? [];
      id = list.find(z => z.Name === pullZoneName)?.Id;
      if (!id) throw new Error(`no pull zone named ${pullZoneName}`);
    }
    const res = await fetch(`https://api.bunny.net/pullzone/${id}/purgeCache`, {
      method: 'POST',
      headers: { AccessKey: apiKey },
    });
    if (!res.ok) throw new Error(`purge failed: ${res.status}`);
    console.log(`purged pull zone ${pullZoneName} (${id}).`);
  }
}

console.log('done.');
