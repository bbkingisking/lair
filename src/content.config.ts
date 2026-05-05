import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const poemsCollection = defineCollection({
  loader: glob({ pattern: "**/*.yaml", base: "./src/content/poems" }),
  schema: z.object({}).catchall(z.any()),
});

export const collections = {
  poems: poemsCollection,
};
