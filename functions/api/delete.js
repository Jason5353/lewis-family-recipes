// POST /api/delete  { id }
// Removes a recipe (its Markdown file and its saved photo) from GitHub in one commit.
// Cloudflare Pages then rebuilds the site (~1 min) and the recipe disappears.
// Anyone signed in to the family site can delete; the commit records who did it.

import { whoIs } from '../../importer/identity.js';
import { github } from '../../importer/github.js';

const fail = (error, status = 400) => Response.json({ ok: false, error }, { status });

export async function onRequestPost({ request, env }) {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) return fail('Deleting is not set up yet (missing GitHub settings).', 500);

  // Only accept requests made by the site itself.
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return fail('Not allowed.', 403);

  const me = whoIs(request, env);
  if (!me.name) return fail('Please sign in again.', 401);

  let body;
  try { body = await request.json(); } catch { return fail('Send the recipe id as JSON.'); }
  const id = String(body.id ?? '').trim();
  if (!/^[a-z0-9][a-z0-9-]{0,120}$/.test(id)) return fail("That isn't a recipe id.");

  const { readFile, commit } = github(env);
  try {
    const mdPath = `src/content/recipes/${id}.md`;
    const md = await readFile(mdPath);
    if (!md) return fail('That recipe has already been deleted.', 404);

    const title = (md.text.match(/^title:\s*"?(.*?)"?\s*$/m)?.[1] ?? id).replace(/\\"/g, '"');
    const files = [{ path: mdPath, delete: true }];

    // Remove the saved photo too, but only one that lives in our own recipe-images folder.
    const image = md.text.match(/^image:\s*"?(\/recipe-images\/[\w.-]+)"?\s*$/m)?.[1];
    if (image && !image.includes('..') && (await readFile(`public${image}`))) files.push({ path: `public${image}`, delete: true });

    await commit(`Delete recipe: ${title} (deleted by ${me.name})`, files);
    return Response.json({ ok: true, id, title });
  } catch (e) {
    return fail(`Deleting from GitHub failed: ${e.message}`, 502);
  }
}
