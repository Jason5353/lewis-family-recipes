// POST /api/edit  { id, title, ingredients: [{ amount, unit, item }], steps, serves, category?, prepMins?, cookMins?, from?, note?, photo?, editedBy? }
// Saves changes to an existing recipe from the edit form (/add/?edit=<id>) in one commit.
// Keeps what the form doesn't show: who added it and when, the original link, tags, description.
// A new photo replaces the old one (new file name, so nobody sees a cached old photo).
// Anyone signed in to the family site can edit; the commit records who did it.

import { toMarkdown } from '../../importer/parse.js';
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
  const id = String(body.id ?? '').trim();
  if (!/^[a-z0-9][a-z0-9-]{0,120}$/.test(id)) return fail("That isn't a recipe id.");

  const me = whoIs(request, env);
  const editedBy = me.name || String(body.editedBy ?? '').trim();
  if (!editedBy) return fail('Choose your name first.');
  if (!me.name && !family.people.some((p) => p.name === editedBy)) return fail('Choose a name from the list.');

  // The recipe as the site last built it.
  let old = null;
  try {
    const res = await env.ASSETS.fetch(new URL(`/recipes/${id}.json`, request.url));
    if (res.ok) old = await res.json();
  } catch {}
  if (!old?.title) return fail("Couldn't find that recipe. If it was only just added or edited, give it a minute and try again.", 404);

  const built = buildManualRecipe(body, { categories: family.categories, addedBy: old.addedBy, addedOn: old.addedOn });
  if (built.error) return fail(built.error);
  const r = built.recipe;

  // Keep what the form doesn't show.
  r.description = old.description ?? '';
  r.tags = old.tags ?? [];
  r.cuisine = old.cuisine;
  r.image = old.image;
  if (old.source?.url) {
    r.source.url = old.source.url;
    if (!String(body.from ?? '').trim()) r.source.name = old.source.name;
  }
  if (!r.prepMins && !r.cookMins && old.totalMins) r.totalMins = old.totalMins;
  if (r.serves === old.serves && old.yieldText) r.yieldText = old.yieldText;

  const photo = readPhoto(body.photo, MAX_IMAGE);
  if (photo?.error) return fail(photo.error);

  const { readFile, commit } = github(env);
  try {
    const mdPath = `src/content/recipes/${id}.md`;
    if (!(await readFile(mdPath))) return fail('That recipe has been deleted.', 404);

    const files = [{ path: mdPath, content: toMarkdown(r) }];
    if (photo) {
      r.image = `/recipe-images/${id}-${Date.now().toString(36)}.${photo.ext}`;
      files[0].content = toMarkdown(r);
      files.push({ path: `public${r.image}`, base64: photo.base64 });
      // Remove the old photo, but only one that lives in our own recipe-images folder.
      const oldImg = /^\/recipe-images\/[\w.-]+$/.test(old.image ?? '') && !old.image.includes('..') ? old.image : null;
      if (oldImg && (await readFile(`public${oldImg}`))) files.push({ path: `public${oldImg}`, delete: true });
    }

    await commit(`Edit recipe: ${r.title} (edited by ${editedBy})`, files);
    return Response.json({ ok: true, id, title: r.title, category: r.category });
  } catch (e) {
    return fail(`Saving to GitHub failed: ${e.message}`, 502);
  }
}
