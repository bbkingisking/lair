import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import yaml from 'js-yaml';
import { slugify } from './utils/slug';

function poemLoader(base: string) {
  const absBase = join(process.cwd(), base);
  return {
    name: 'poem-loader',
    load: async ({ store, parseData, generateDigest, watcher }) => {
      const loadAll = async () => {
        store.clear();
        const files = readdirSync(absBase).filter(f => f.endsWith('.poem'));

        // Load source map for GitHub links
        const sourceMapPath = join(absBase, '.source-map.json');
        let sourceMap: Record<string, string> = {};
        let repoUrl = '';
        if (existsSync(sourceMapPath)) {
          const raw = JSON.parse(readFileSync(sourceMapPath, 'utf8'));
          repoUrl = raw._repoUrl || '';
          delete raw._repoUrl;
          sourceMap = raw;
        }

        // The slug is what appears in URLs; the filename is what the source map
        // is keyed by. They are only the same string most of the time.
        const seen = new Map<string, string>();

        for (const file of files) {
          const filename = basename(file, '.poem');
          const id = slugify(filename);

          const clash = seen.get(id);
          if (clash) {
            throw new Error(
              `Two poems slugify to "${id}": ${clash}.poem and ${filename}.poem. ` +
              'One would silently replace the other; rename one of them.',
            );
          }
          seen.set(id, filename);

          const raw = readFileSync(join(absBase, file), 'utf8');
          const data = yaml.load(raw) as Record<string, unknown>;
          const parsed = await parseData({ id, data });
          if (repoUrl && sourceMap[filename]) {
            // Encoded per path segment. Our own slugs are folded to ASCII so
            // they never need this, but the file on the forge really is named
            // with an en dash and we do not get to rename it — github serves
            // that path only in its percent-encoded form.
            const path = sourceMap[filename].split('/').map(encodeURIComponent).join('/');
            parsed.sourceUrl = `${repoUrl}/${path}`;
          }
          store.set({ id, data: parsed, digest: generateDigest(raw), filePath: `src/content/poems/${file}` });
        }
      };
      await loadAll();
      if (watcher) {
        watcher.add(absBase);
        watcher.on('all', (_event, path) => {
          if (path.endsWith('.poem')) loadAll();
        });
      }
    },
  };
}

const versionSchema = z.object({
  text: z.string(),                      // required
  title: z.string().optional(),
  author: z.string().optional(),
  language: z.string().optional(),
  epigraph: z.string().optional(),
  rtl: z.boolean().optional(),
  vertical: z.boolean().optional(),
}).catchall(z.any());                    // additionalProperties: true

const poemsCollection = defineCollection({
  loader: poemLoader('./src/content/poems'),
  schema: z.object({
    canonical: versionSchema,            // required
    sourceUrl: z.string().optional(),    // GitHub source link (injected by loader)
  }).catchall(versionSchema),            // all other language keys match versionSchema
});

export const collections = {
  poems: poemsCollection,
};
