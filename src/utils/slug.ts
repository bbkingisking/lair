// Typographic punctuation folded to the plain ASCII a URL wants. Filenames are
// written by hand, so a line range like 242–270 arrives with a real en dash and
// there is no reason for that to reach the address bar.
//
// Deliberately narrow: these are characters whose ASCII counterpart is exact.
// Anything with only an approximate equivalent — a romanization of 김소월, say —
// is a transliteration scheme, not a mapping, and does not belong here.
const PUNCTUATION: Record<string, string> = {
  '‐': '-', // hyphen
  '‑': '-', // non-breaking hyphen
  '‒': '-', // figure dash
  '–': '-', // en dash
  '—': '-', // em dash
  '―': '-', // horizontal bar
  '−': '-', // minus sign
  ' ': '-', // no-break space
  ' ': '-', // narrow no-break space
  '‘': '',  // ‘
  '’': '',  // ’
  '‚': '',  // ‚
  '‛': '',  // ‛
  '“': '',  // “
  '”': '',  // ”
  '„': '',  // „
  '′': '',  // prime
  '″': '',  // double prime
  '…': '',  // ellipsis
};

/**
 * A URL-safe slug, without percent-encoding anything that did not need it.
 *
 * Accented Latin is folded to its base letter by decomposing and dropping the
 * combining marks. Scripts that do not decompose that way — Hangul, Cyrillic,
 * Han — are recomposed and left exactly as they were: they are already valid in
 * a path, and the alternative is inventing a romanization.
 */
export function slugify(value: string): string {
  const folded = [...value].map(char => PUNCTUATION[char] ?? char).join('');

  return folded
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}
