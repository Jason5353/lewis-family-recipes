import { defineConfig } from 'astro/config';

// Change `site` if the Cloudflare Pages project ends up with a different name.
export default defineConfig({
  site: 'https://lewis-family-recipes.pages.dev',
  output: 'static',
  build: { format: 'directory' },
});
