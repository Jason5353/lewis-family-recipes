# Lewis Family Recipes – context for Claude

Private family recipe book for the Lewis family (Jason, Rachael, Jasmine, Alex, Pauline).
Owner: Jason (GitHub `Jason5353`). Kept entirely separate from BMS Cyber Defence work.

## Live setup (as of 24 Oct 2026)
- **Live site:** https://lewis-family-recipes.pages.dev (branch `main`)
- **Test site:** https://test.lewis-family-recipes.pages.dev (branch `test`)
- **Hosting:** Cloudflare Pages project `lewis-family-recipes`, Git-connected, free plan. It shares a Cloudflare account with BMS Cyber Defence (new account not possible at the time). Never touch the BMS projects (`bms-website`, `bmscyberdefence`), BMS DNS or BMS tokens.
- **Sign-in:** Cloudflare Zero Trust (Free), team `lewis-cl-zero`, One-time PIN email codes.
  - Access app **Lewis Family Recipes**: `lewis-family-recipes.pages.dev` + `*.lewis-family-recipes.pages.dev`, policy **Family** (Allow, listed emails), session 1 month.
  - Access app **Lewis Recipes app icon (public)**: paths `manifest.webmanifest` and `icons/*`, policy **Public** (Bypass, Everyone). Needed for Android share target / app install.
- **Pages variables (Production and Preview):** `GITHUB_TOKEN` (secret, fine-grained, this repo only, Contents R/W, expires ~Oct 2027), `GITHUB_REPO`, `GITHUB_BRANCH` (`main` / `test`), `FAMILY_EMAILS` (JSON email → name).
- **Outstanding:** Pauline's email not yet added (Family policy + `FAMILY_EMAILS`). Token renewal reminder ~Oct 2027.

## How it works
- Astro 7 static site; one Markdown file per recipe in `src/content/recipes/`, photos in `public/recipe-images/`.
- `functions/api/import.js` (Cloudflare Pages Function): fetches a recipe URL, parses it with `importer/parse.js`, commits recipe + photo to GitHub in one commit → Pages rebuilds (~1 min).
- `functions/api/delete.js`: deletes a recipe + its photo in one commit (`Delete recipe: … (deleted by …)`); any signed-in family member, same-origin only. Delete button + "Are you sure?" `<dialog>` on the recipe page. Shared GitHub helpers in `importer/github.js`.
- `functions/api/edit.js`: edits a recipe in one commit (`Edit recipe: … (edited by …)`); any signed-in family member. Edit button on the recipe page opens `/add/?edit=<id>`, the "Type it in" form filled from `/recipes/<id>.json` (ingredient lines split back into amount/unit/item by `splitIngredient`, anything unclear stays whole). Keeps addedBy/addedOn, source link, tags, description; a new photo gets a fresh file name and the old one is deleted.
- Parser order: schema.org JSON-LD → recipe-card fallback (WP Recipe Maker, Tasty Recipes, microdata), including cards escaped inside Next.js `__next_f` data (e.g. cookitrealgood.com).
- Identity: `Cf-Access-Authenticated-User-Email` header mapped via `FAMILY_EMAILS`; optional shared-password mode via `SITE_PASSWORD` (`functions/_middleware.js`), unused.
- People, categories, tags: `src/data/family.js`. Family snapshots: `public/family/` (resized, GPS stripped) with captions in `src/data/snapshots.json`; they appear throughout the site by design. On the home page, `SnapDeck.astro` shuffles them once per visit and feeds the collage (swaps a photo every 3.5s), the grid photos and the scrolling strips (`SnapshotStrip rolling`), so none repeat; honours reduce-motion.
- Phones: Android uses the PWA share target (`public/manifest.webmanifest`); iPhone uses a Shortcut (steps on `/help/`).

## Working rules
- **Test first.** Code changes go on `test`, Jason checks the test site, then only the code commits are cherry-picked to `main`. Never merge test recipes (test-site imports) into `main`. Before testing, merge `main` into `test` so it has the latest recipes.
- Cloudflare's Pages build uses **wrangler 3.114**: no `import … with { type: 'json' }` in `functions/` or files it imports. Check with `npx wrangler@3.114.17 pages functions build`.
- Run `npm test` (importer tests with fixtures) and `npm run build` before pushing.
- Recipes are copied for private family use with credit and a link to the source. Keep the site behind the login and `noindex`.
- Jason prefers direct, concise, step-by-step instructions for anything he has to click in Cloudflare or GitHub. Never ask for or repeat secrets in chat; if a token appears in a screenshot, tell him to regenerate it.
