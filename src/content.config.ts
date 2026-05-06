import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import yaml from 'js-yaml';

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

        for (const file of files) {
          const id = basename(file, '.poem');
          const raw = readFileSync(join(absBase, file), 'utf8');
          const data = yaml.load(raw) as Record<string, unknown>;
          const parsed = await parseData({ id, data });
          if (repoUrl && sourceMap[id]) {
            parsed.sourceUrl = `${repoUrl}/${sourceMap[id]}`;
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
