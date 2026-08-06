// Link-preview descriptions for poem pages. Unlike a prose page, a poem has
// no summary to lift — the opening lines *are* the summary — so we quote them
// verbatim and attribute them, rather than describing them.

// Budget in display columns, not code units: a CJK glyph occupies two columns
// and carries far more content than a Latin character, so a shared code-unit
// budget would let hanzi versions run several times longer than the English.
// Discord shows ~350 columns of og:description, Telegram and Twitter closer to
// 200, Google ~160. Budget for the tightest client that still matters.
const MAX_WIDTH = 160;

// Enough for a quatrain. Without this a poem of very short lines would fit a
// dozen of them inside the budget and read as a wall of text in the embed.
const MAX_LINES = 4;

// Scholarly convention for a line break in verse quoted inline. Real newlines
// are unreliable here: Discord keeps them, Telegram collapses them.
const LINE_BREAK = ' / ';

const ELISION = ' …';

// Lines that already end in CJK terminal punctuation delimit themselves; adding
// our slash on top would be double punctuation.
const SELF_DELIMITING = /[。！？]$/;

const WIDE_GLYPH =
  /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/;

function displayWidth(str: string): number {
  let width = 0;
  for (const char of str) width += WIDE_GLYPH.test(char) ? 2 : 1;
  return width;
}

/**
 * Split a poem into its verse units. Newlines are the usual marker, but
 * Classical Chinese is conventionally written as a continuous run punctuated
 * by `。`, which serves the same structural role. Genuinely unpunctuated
 * classical text has no recoverable line structure — guessing the caesura
 * would require knowing the poem's meter — so it stays a single unit and gets
 * excerpted by width alone.
 */
function verseLines(text: string): string[] {
  const byNewline = text.split('\n').map(line => line.trim()).filter(Boolean);
  if (byNewline.length > 1) return byNewline;

  const single = byNewline[0] ?? '';
  if (single.includes('。')) {
    return single.split(/(?<=。)/).map(line => line.trim()).filter(Boolean);
  }
  return byNewline;
}

function joinLines(lines: string[]): string {
  return lines.reduce(
    (acc, line, i) => (i === 0 ? line : acc + (SELF_DELIMITING.test(acc) ? '' : LINE_BREAK) + line),
    '',
  );
}

function truncateToWidth(str: string, maxWidth: number): string {
  let width = 0;
  let out = '';
  for (const char of str) {
    const next = width + (WIDE_GLYPH.test(char) ? 2 : 1);
    if (next > maxWidth) break;
    width = next;
    out += char;
  }
  return out.trimEnd();
}

/**
 * The opening lines of a poem, joined inline and trimmed to fit a link preview.
 * Always yields at least the first line (truncated mid-line only if that single
 * line exceeds the budget on its own).
 */
export function excerpt(text: string | undefined, maxWidth = MAX_WIDTH): string {
  const lines = verseLines(text ?? '');
  if (lines.length === 0) return '';

  const taken = [lines[0]];
  for (const line of lines.slice(1, MAX_LINES)) {
    if (displayWidth(joinLines([...taken, line])) > maxWidth) break;
    taken.push(line);
  }

  const joined = joinLines(taken);
  if (displayWidth(joined) > maxWidth) {
    return truncateToWidth(joined, maxWidth) + ELISION;
  }
  return taken.length < lines.length ? joined + ELISION : joined;
}
