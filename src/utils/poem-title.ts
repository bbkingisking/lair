const MAX_LENGTH = 50;

// Poems without a title are semantically valid; fall back to the first line
// of the text, truncated at a word boundary, rather than a generic label.
export function deriveTitle(text: string | undefined, maxLength = MAX_LENGTH): string {
  const firstLine = text?.split('\n').find(line => line.trim().length > 0)?.trim();
  if (!firstLine) return 'Untitled';
  if (firstLine.length <= maxLength) return firstLine;

  const truncated = firstLine.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  const words = lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
  return `${words}…`;
}

export function versionTitle(version: { title?: string; text?: string } | undefined): string {
  return version?.title || `[${deriveTitle(version?.text)}]`;
}

// Script-neutral name separator: reads as a middle dot in Latin and Cyrillic
// and as 中黑点 in CJK, where an em dash would sit awkwardly.
const ATTRIBUTION = ' · ';

/**
 * Title carrying its own byline, for contexts that show a title without the
 * page around it to supply the author — link previews, chiefly.
 *
 * `fallbackAuthor` covers versions that carry no author of their own; a
 * translation usually inherits the canonical attribution.
 */
export function attributedTitle(
  version: { title?: string; text?: string; author?: string } | undefined,
  fallbackAuthor?: string,
): string {
  const author = version?.author || fallbackAuthor;
  return [versionTitle(version), author].filter(Boolean).join(ATTRIBUTION);
}
