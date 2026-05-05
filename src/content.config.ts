import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

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
  loader: glob({ pattern: "**/*.yaml", base: "./src/content/poems" }),
  schema: z.object({
    canonical: versionSchema,            // required
  }).catchall(versionSchema),            // all other language keys match versionSchema
});

export const collections = {
  poems: poemsCollection,
};
