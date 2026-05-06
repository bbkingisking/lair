#!/usr/bin/env node

/**
 * Build-time font optimizer.
 * - Scans poem YAML files for used characters
 * - Subsets CJK/Hangul fonts to only needed glyphs
 * - Converts all fonts to WOFF2
 *
 * Requires: python3, fonttools (pyftsubset), brotli
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const ROOT = new URL('..', import.meta.url).pathname;
const POEMS_DIR = join(ROOT, 'src/content/poems');
const SRC_DIR = join(ROOT, 'fonts-src');
const OUT_DIR = join(ROOT, 'public/fonts');

// --- Step 1: collect all characters used in poems ---

function extractChars() {
  const files = readdirSync(POEMS_DIR).filter(f => f.endsWith('.yaml'));
  const chars = new Set();

  for (const file of files) {
    const content = readFileSync(join(POEMS_DIR, file), 'utf8');
    for (const ch of content) {
      chars.add(ch);
    }
  }

  // Always include basic Latin, digits, common punctuation, whitespace
  const extras = ' \t\n\r' +
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz' +
    '0123456789' +
    '.,;:!?\'"()-[]{}/@#$%^&*_=+<>~`|\u00a0\u2014\u2013\u2018\u2019\u201c\u201d\u2026\u00b7\u00ab\u00bb\u2039\u203a' +
    // CJK punctuation
    '\u3000\u3001\u3002\u300a\u300b\u300c\u300d\u300e\u300f\u3010\u3011\u3014\u3015\uff01\uff0c\uff0e\uff1a\uff1b\uff1f' +
    // Ideographic description characters, zero-width, etc.
    '\ufeff\u200b\u200c\u200d';

  for (const ch of extras) {
    chars.add(ch);
  }

  return chars;
}

// --- Step 2: write unicodes to a temp file for pyftsubset ---

function writeUnicodesFile(chars) {
  const codepoints = [...chars].map(ch => ch.codePointAt(0));
  const sorted = [...new Set(codepoints)].sort((a, b) => a - b);

  // pyftsubset --unicodes-file accepts one U+XXXX per line
  const lines = sorted.map(cp => `U+${cp.toString(16).toUpperCase()}`);
  const file = join(tmpdir(), 'lair-unicodes.txt');
  writeFileSync(file, lines.join('\n'));
  return file;
}

// --- Step 3: subset + convert fonts ---

const FONTS = [
  // CJK/Hangul — subset to used chars
  { file: 'ZhuqueFangsong-Regular.ttf', subset: true },
  { file: 'AGChoiJeongHoStd.otf', subset: true },
  // Latin/Cyrillic — just convert to WOFF2, no subsetting needed
  { file: 'IMFellEnglish-Regular.ttf', subset: false },
  { file: 'IMFellEnglish-Italic.ttf', subset: false },
  { file: 'TT Marxiana Trial Antiqua.ttf', subset: false },
  { file: 'TT Marxiana Trial Antiqua Italic.ttf', subset: false },
];

function optimizeFonts() {
  console.log('Scanning poems for used characters…');
  const chars = extractChars();
  const unicodesFile = writeUnicodesFile(chars);
  console.log(`Found ${chars.size} unique characters (${unicodesFile})`);

  const results = [];

  for (const font of FONTS) {
    const input = join(SRC_DIR, font.file);
    const outName = font.file.replace(/\.(ttf|otf)$/, '.woff2');
    const output = join(OUT_DIR, outName);

    if (!existsSync(input)) {
      console.warn(`  SKIP ${font.file} (not found)`);
      continue;
    }

    const args = [input, `--output-file=${output}`, '--flavor=woff2'];

    if (font.subset) {
      args.push(`--unicodes-file=${unicodesFile}`);
      // Preserve layout tables for complex scripts
      args.push('--layout-features=*');
      args.push('--name-IDs=*');
      args.push('--notdef-outline');
    } else {
      // Full glyph set, just convert
      args.push('--glyphs=*');
      args.push('--layout-features=*');
      args.push('--name-IDs=*');
    }

    const cmd = `pyftsubset ${args.map(a => `"${a}"`).join(' ')}`;
    console.log(`  ${font.file} → ${outName}`);

    try {
      execSync(cmd, { stdio: 'pipe' });
      const before = readFileSync(input).length;
      const after = readFileSync(output).length;
      const pct = ((1 - after / before) * 100).toFixed(1);
      console.log(`    ${(before / 1024).toFixed(0)}KB → ${(after / 1024).toFixed(0)}KB (${pct}% smaller)`);
      results.push({ file: font.file, before, after });
    } catch (err) {
      console.error(`    FAILED: ${err.stderr?.toString() || err.message}`);
    }
  }

  // Summary
  const totalBefore = results.reduce((s, r) => s + r.before, 0);
  const totalAfter = results.reduce((s, r) => s + r.after, 0);
  console.log(`\nTotal: ${(totalBefore / 1024).toFixed(0)}KB → ${(totalAfter / 1024).toFixed(0)}KB (${((1 - totalAfter / totalBefore) * 100).toFixed(1)}% smaller)`);
}

optimizeFonts();
