// POST /api/import  { url, category?, note?, addedBy? }
// Fetches the recipe page, reads its recipe data, and commits a Markdown file
// (plus the photo) to GitHub. Cloudflare Pages then rebuilds the site (~1 min).
//
// Needs these settings on the Cloudflare Pages project (Settings > Variables and Secrets):
//   GITHUB_TOKEN   (secret)  fine-grained token: this repo only, Contents read & write
//   GITHUB_REPO              e.g. Jason5353/lewis-family-recipes
//   GITHUB_BRANCH            main
//   FAMILY_EMAILS            JSON map of login email to name (Zero Trust mode)

import { extractRecipe, pickCategory, pickTags, slugify, toMarkdown, normaliseUrl } from '../../importer/parse.js';
import { whoIs } from '../../importer/identity.js';
import family from '../../src/data/family.js';
import { github } from '../../importer/github.js';

const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
const MAX_IMAGE = 6 * 1024 * 1024;

const fail = (error, status = 400, extra = {}) => Response.json({ ok: false, error, ...extra }, { status });

export async function onRequestPost({ request, env }) {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) return fail('The importer is not set up yet (missing GitHub settings).', 500);

  let body;
  try { body = await request.json(); } catch { return fail('Send the recipe link as JSON.'); }
  const pageUrl = String(body.url ?? '').trim();
  let parsed;
  try { parsed = new URL(pageUrl); } catch { return fail("That doesn't look like a web address."); }
  if (!/^https?:$/.test(parsed.protocol)) return fail('Only web links (https://…) can be added.');

  const me = whoIs(request, env);
  const addedBy = me.name || String(body.addedBy ?? '').trim();
  if (!addedBy) return fail('Choose your name first.');
  if (me.mode !== 'access' && !family.people.some((p) => p.name === addedBy)) return fail('Choose a name from the list.');

  // Already saved?
  // env.ASSETS reads the site's own built files directly (no login round-trip).
  let existing = [];
  try { existing = await (await env.ASSETS.fetch(new URL('/recipes.json', request.url))).json(); } catch {}
  const key = normaliseUrl(pageUrl);
  const dupe = Array.isArray(existing) ? existing.find((r) => r.sourceUrl && normaliseUrl(r.sourceUrl) === key) : null;
  if (dupe) return fail('Already saved.', 409, { existing: dupe });

  // Fetch the page.
  let html;
  try {
    const res = await fetch(pageUrl, { headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml', 'accept-language': 'en-GB,en;q=0.9' }, redirect: 'follow' });
    if (!res.ok) return fail(`That site wouldn't let us in (HTTP ${res.status}). Try copying the recipe in by hand for now.`, 422);
    html = await res.text();
  } catch {
    return fail("Couldn't reach that site. Check the link and try again.", 422);
  }

  const r = extractRecipe(html, pageUrl);
  if (!r) return fail("That page doesn't have recipe details we can read. It might be an article or video rather than a recipe page.", 422);
  if (!r.title) r.title = 'Untitled recipe';

  const category = pickCategory({ title: r.title, ...r.raw }, family.categories, String(body.category ?? ''));
  const tags = pickTags(r, r.raw);
  let id = slugify(r.title);
  const taken = new Set(Array.isArray(existing) ? existing.map((x) => x.id) : []);
  if (taken.has(id)) { let n = 2; while (taken.has(`${id}-${n}`)) n++; id = `${id}-${n}`; }

  // Photo: saved alongside the recipe so it keeps working if the original site changes.
  let image, imageBlob;
  if (r.imageUrl) {
    try {
      const ir = await fetch(r.imageUrl, { headers: { 'user-agent': UA, referer: pageUrl } });
      const type = ir.headers.get('content-type') ?? '';
      const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : type.includes('avif') ? 'avif' : 'jpg';
      if (ir.ok && type.startsWith('image/')) {
        const buf = await ir.arrayBuffer();
        if (buf.byteLength <= MAX_IMAGE) { image = `/recipe-images/${id}.${ext}`; imageBlob = { path: `public${image}`, base64: toBase64(buf) }; }
      }
    } catch {}
  }

  const today = new Date().toISOString().slice(0, 10);
  const note = String(body.note ?? '').trim().slice(0, 200) || undefined;
  const md = toMarkdown({ ...r, image, addedBy, addedOn: today, category, tags, note });

  try {
    await github(env).commit(`Add recipe: ${r.title} (added by ${addedBy})`, [
      { path: `src/content/recipes/${id}.md`, content: md },
      ...(imageBlob ? [imageBlob] : []),
    ]);
  } catch (e) {
    return fail(`Saving to GitHub failed: ${e.message}`, 502);
  }

  return Response.json({ ok: true, id, title: r.title, source: r.source.name, category, image: r.imageUrl || '' });
}

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
