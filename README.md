# Lewis Family Recipes

A private recipe book for the Lewis family. Anyone in the family can share a recipe they find online (from their phone's Share button or by pasting a link) and it's saved here with their name, the source site, a category and tags.

**First time? Follow [SETUP.md](SETUP.md).**

## How it works

- **Site:** [Astro](https://astro.build) builds static pages from one Markdown file per recipe in `src/content/recipes/`.
- **Hosting:** Cloudflare Pages (free). Every commit to `main` rebuilds the site.
- **Adding recipes:** `functions/api/import.js` fetches the recipe page, reads its schema.org recipe data (`importer/parse.js`), and commits the recipe and its photo to this repo in one commit.
- **Sign-in:** Cloudflare Zero Trust (each person's email), or a shared family password (`functions/_middleware.js`).
- **Phones:** the site installs as an app (`public/manifest.webmanifest`) and appears in Android's Share menu. iPhones use a Shortcut (see `/help/`).

## Folders

| Path | What's in it |
|---|---|
| `src/content/recipes/` | The recipes, one `.md` file each |
| `public/recipe-images/` | Recipe photos saved by the importer |
| `public/family/` | Family snapshots (resized, location data removed) |
| `src/data/family.json` | People, categories and tags |
| `src/data/snapshots.json` | Captions for the family snapshots |
| `functions/` | The importer and sign-in code (Cloudflare Pages Functions) |
| `importer/` | Recipe-reading logic, shared with the tests |

## Working on it locally

```bash
npm install
npm run dev     # http://localhost:4321
npm test        # importer tests
npm run build
```
