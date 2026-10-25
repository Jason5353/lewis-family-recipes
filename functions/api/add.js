// POST /api/add  { title, ingredients: [{ amount, unit, item }], steps, serves, category?, prepMins?, cookMins?, from?, note?, photo?, addedBy? }
// Saves a recipe typed in by hand (the "Type it in" tab on /add/). Writes the same Markdown
// format as the link importer, plus the photo if one was chosen, in a single commit.
// Cloudflare Pages then rebuilds the site (~1 min).

import { slugify, toMarkdown } from '../../importer/parse.js';
import { buildManualRecipe, readPhoto } from '../../importer/manual.js';
import { whoIs } from '../../importer/identity.js';
import family from '../../src/data/family.js';
import { github } from '../../importer/github.js';

const MAX_IMAGE = 6 * 1024 * 1024;
const fail = (error, status = 400) => Response.json({ ok: false, error }, { status });

export async function onRequestPost({ request, env }) {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) return fail('Saving is not set up yet (missing GitHub settings).', 500);

  // Only accept requests made by the site itself.
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return fail('Not allowed.', 403);

  let body;
  try { body = await request.json(); } catch { return fail('Send the recipe as JSON.'); }

  const me = whoIs(request, env);
  const addedBy = me.name || String(body.addedBy ?? '').trim();
  if (!addedBy) return fail('Choose your name first.');
  if (!me.name && !family.people.some((p) => p.name === addedBy)) return fail('Choose a name from the list.');

  const today = new Date().toISOString().slice(0, 10);
  const built = buildManualRecipe(body, { categories: family.categories, addedBy, addedOn: today });
  if (built.error) return fail(built.error);
  const r = built.recipe;

  const photo = readPhoto(body.photo, MAX_IMAGE);
  if (photo?.error) return fail(photo.error);

  // Pick a file name that isn't already used.
  let existing = [];
  try { existing = await (await env.ASSETS.fetch(new URL('/recipes.json', request.url))).json(); } catch {}
  const taken = new Set(Array.isArray(existing) ? existing.map((x) => x.id) : []);
  let id = slugify(r.title);
  if (taken.has(id)) { let n = 2; while (taken.has(`${id}-${n}`)) n++; id = `${id}-${n}`; }

  const files = [];
  if (photo) {
    r.image = `/recipe-images/${id}.${photo.ext}`;
    files.push({ path: `public${r.image}`, base64: photo.base64 });
  }
  files.unshift({ path: `src/content/recipes/${id}.md`, content: toMarkdown(r) });

  try {
    await github(env).commit(`Add recipe: ${r.title} (added by ${addedBy})`, files);
  } catch (e) {
    return fail(`Saving to GitHub failed: ${e.message}`, 502);
  }

  return Response.json({ ok: true, id, title: r.title, category: r.category });
}
