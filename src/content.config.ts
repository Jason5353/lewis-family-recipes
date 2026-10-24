import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// One Markdown file per recipe in src/content/recipes/.
// The importer (functions/api/import.js) writes these; you can also edit them by hand on GitHub.
const recipes = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/recipes' }),
  schema: z.object({
    title: z.string(),
    description: z.string().default(''),
    image: z.string().optional(),
    source: z.object({ name: z.string(), url: z.string().optional() }),
    addedBy: z.string(),
    addedOn: z.coerce.date(),
    category: z.string(),
    tags: z.array(z.string()).default([]),
    cuisine: z.string().optional(),
    prepMins: z.number().optional(),
    cookMins: z.number().optional(),
    totalMins: z.number().optional(),
    serves: z.number().optional(),
    yieldText: z.string().optional(),
    ingredients: z.array(z.string()).default([]),
    steps: z.array(z.string()).default([]),
    note: z.string().optional(),
  }),
});

export const collections = { recipes };
