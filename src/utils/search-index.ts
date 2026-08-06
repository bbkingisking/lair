import { getCollection } from 'astro:content';
import { versionTitle } from './poem-title';

export interface SearchEntry {
  title: string;
  author: string;
  slug: string;
  lang: string;
  text: string;
}

/**
 * Every searchable version of every poem.
 *
 * One definition, served once from /search-index.json. Six pages used to build
 * this inline with three different shapes — two of them omitted `text`
 * entirely — so what search found depended on which page you searched from.
 */
export async function buildSearchIndex(): Promise<SearchEntry[]> {
  const poems = await getCollection('poems');

  return poems.flatMap(poem => {
    const fallbackAuthor = poem.data.canonical?.author || 'Unknown';
    const entries: SearchEntry[] = [];

    for (const [lang, version] of Object.entries(poem.data)) {
      // `sourceUrl` is a string on the same object, so check for a real version.
      if (!version || typeof version !== 'object' || !(version as any).text) continue;
      entries.push({
        title: versionTitle(version as any),
        author: (version as any).author || fallbackAuthor,
        slug: poem.id,
        lang,
        text: (version as any).text,
      });
    }

    return entries;
  });
}
