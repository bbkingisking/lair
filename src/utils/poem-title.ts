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
  return version?.title || deriveTitle(version?.text);
}
