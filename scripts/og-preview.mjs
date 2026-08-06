// Renders every built page's Open Graph tags as mock Discord/Telegram cards, so
// link previews can be eyeballed without deploying and without fighting the
// aggressive per-URL caches those clients keep.
//
//   npm run build && npm run og-preview && npm run preview
//   → http://localhost:4321/_og-preview.html
//
// Output lands inside dist/, which is gitignored and wiped by the next build.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;
const OUT = join(DIST, '_og-preview.html');

// Where each client visibly cuts an og:description short.
const LIMITS = { Google: 160, Telegram: 200, Discord: 350 };

async function* htmlFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(path);
    else if (entry.name.endsWith('.html') && entry.name !== '_og-preview.html') yield path;
  }
}

function unescapeHtml(str) {
  return str
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

// Both patterns consume quoted runs as units, so an apostrophe inside a
// double-quoted value (Sleep's, dragon's) can't be mistaken for a delimiter —
// and neither can a `>` inside one.
const META_TAG = /<meta\b((?:[^>"']|"[^"]*"|'[^']*')*)\/?>/gi;
const ATTRIBUTE = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

/** Every <meta> in the document, as plain attribute maps with entities resolved. */
function metaTags(html) {
  return [...html.matchAll(META_TAG)].map(([, attrs]) => {
    const tag = {};
    for (const [, name, doubleQuoted, singleQuoted, bare] of attrs.matchAll(ATTRIBUTE)) {
      tag[name.toLowerCase()] = unescapeHtml(doubleQuoted ?? singleQuoted ?? bare ?? '');
    }
    return tag;
  });
}

function metaContent(tags, key) {
  const attr = key.startsWith('og:') ? 'property' : 'name';
  return tags.find(tag => tag[attr] === key)?.content;
}

function escapeHtml(str = '') {
  return str.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function card(page) {
  const { url, title, description, siteName, image } = page;
  const len = description?.length ?? 0;
  const overflows = Object.entries(LIMITS).filter(([, limit]) => len > limit).map(([name]) => name);

  const flags = [
    description ? null : { level: 'warn', text: 'no og:description' },
    image ? null : { level: 'info', text: 'no og:image' },
    overflows.length ? { level: 'warn', text: `truncated by ${overflows.join(', ')}` } : null,
  ].filter(Boolean);

  // og:image is absolute (pointing at the production host); the mockup is served
  // out of the same dist/, so borrow the path and let it resolve locally.
  const thumbSrc = image ? URL.parse(image)?.pathname ?? image : undefined;
  const thumb = thumbSrc
    ? `<img class="thumb" src="${escapeHtml(thumbSrc)}" alt="">`
    : '';

  return `
  <article class="row" data-search="${escapeHtml((url + ' ' + (title ?? '') + ' ' + (description ?? '')).toLowerCase())}">
    <header>
      <a class="path" href="${escapeHtml(url)}">${escapeHtml(url)}</a>
      <span class="len">${len} chars</span>
      ${flags.map(f => `<span class="flag ${f.level}">${escapeHtml(f.text)}</span>`).join('')}
    </header>
    <div class="cards">
      <div class="mock discord">
        <div class="body">
          <div class="site">${escapeHtml(siteName ?? '')}</div>
          <div class="title">${escapeHtml(title ?? '(no title)')}</div>
          <div class="desc">${escapeHtml(description ?? '')}</div>
        </div>${thumb}
      </div>
      <div class="mock telegram">
        <div class="body">
          <div class="site">${escapeHtml(siteName ?? '')}</div>
          <div class="title">${escapeHtml(title ?? '(no title)')}</div>
          <div class="desc">${escapeHtml(description ?? '')}</div>
        </div>${thumb}
      </div>
    </div>
  </article>`;
}

const pages = [];
let suppressed = 0;
for await (const file of htmlFiles(DIST)) {
  const tags = metaTags(await readFile(file, 'utf8'));
  const title = metaContent(tags, 'og:title');
  // Pages that deliberately emit no Open Graph tags aren't previewable; counting
  // them beats listing hundreds of empty cards.
  if (!title) {
    suppressed++;
    continue;
  }
  const url = '/' + relative(DIST, file).split(sep).join('/').replace(/(^|\/)index\.html$/, '$1');
  pages.push({
    url,
    title,
    description: metaContent(tags, 'og:description'),
    siteName: metaContent(tags, 'og:site_name'),
    image: metaContent(tags, 'og:image'),
  });
}
pages.sort((a, b) => a.url.localeCompare(b.url));

const withDesc = pages.filter(p => p.description).length;

const doc = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>OG preview — ${pages.length} pages</title>
<style>
  body { font: 14px/1.5 system-ui, sans-serif; margin: 0; padding: 2rem; background: #f4f1ea; color: #2b2724; }
  h1 { font-size: 1.1rem; margin: 0 0 .25rem; }
  .summary { color: #6b625a; margin: 0 0 1.5rem; }
  #filter { width: 100%; max-width: 640px; padding: .6rem .8rem; font: inherit;
            border: 1px solid #cfc7bb; border-radius: 4px; margin-bottom: 2rem; background: #fff; }
  .row { margin-bottom: 2.5rem; }
  header { display: flex; align-items: center; gap: .6rem; flex-wrap: wrap; margin-bottom: .6rem; }
  .path { font-family: ui-monospace, monospace; font-size: .8rem; color: #8a4b2a; }
  .len { font-size: .75rem; color: #8b8177; }
  .flag { font-size: .7rem; padding: .1rem .45rem; border-radius: 3px; text-transform: uppercase; letter-spacing: .04em; }
  .flag.warn { background: #f6d9cf; color: #8a3b1c; }
  .flag.info { background: #e4e0d6; color: #6b625a; }
  .cards { display: flex; gap: 1.25rem; flex-wrap: wrap; align-items: flex-start; }
  .mock { width: 432px; max-width: 100%; padding: .75rem 1rem; border-radius: 4px;
          display: flex; gap: .75rem; align-items: flex-start; }
  .mock .body { flex: 1; min-width: 0; }
  .mock .title { font-weight: 600; margin: .15rem 0 .3rem; }
  /* Roughly the size Discord and Telegram render a square summary thumbnail. */
  .thumb { width: 80px; height: 80px; border-radius: 4px; flex-shrink: 0; }
  .discord { background: #2b2d31; border-left: 4px solid #8a4b2a; }
  .discord .site { color: #b5bac1; font-size: .75rem; }
  .discord .title { color: #00a8fc; font-size: 1rem; }
  .discord .desc { color: #dbdee1; font-size: .875rem; white-space: pre-wrap; }
  .telegram { background: #fff; border-left: 3px solid #3390ec; }
  .telegram .site { color: #3390ec; font-size: .8rem; font-weight: 600; }
  .telegram .title { color: #000; font-size: .9rem; }
  .telegram .desc { color: #333; font-size: .875rem; white-space: pre-wrap; }
</style></head><body>
<h1>Link preview mockups</h1>
<p class="summary">${pages.length} previewable pages · ${withDesc} with an og:description · ${suppressed} with previews suppressed · left card approximates Discord, right approximates Telegram. Fonts and exact metrics differ from the real clients; this checks wording and length, not pixels.</p>
<input id="filter" type="search" placeholder="Filter by path, title, or text…" autofocus>
<div id="rows">${pages.map(card).join('')}</div>
<script>
  const rows = [...document.querySelectorAll('.row')];
  document.getElementById('filter').addEventListener('input', e => {
    const q = e.target.value.toLowerCase().trim();
    for (const row of rows) row.hidden = q && !row.dataset.search.includes(q);
  });
</script>
</body></html>`;

await writeFile(OUT, doc);
console.log(`Wrote ${relative(process.cwd(), OUT)} — ${pages.length} previewable pages, ${withDesc} with descriptions, ${suppressed} suppressed.`);
console.log('Run `npm run preview` and open http://localhost:4321/_og-preview.html');
