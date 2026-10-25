import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { onRequestPost } from '../functions/api/import.js';

const page = readFileSync(new URL('./fixtures/bbc-style.html', import.meta.url), 'utf8');

function setup(existing = []) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    url = String(url);
    calls.push({ url, method: init.method ?? 'GET', body: init.body });
    if (url.startsWith('https://www.bbcgoodfood.com')) return new Response(page, { headers: { 'content-type': 'text/html' } });
    if (url.startsWith('https://images.example.com')) return new Response(new Uint8Array([255, 216, 255, 1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } });
    if (url.endsWith('/git/ref/heads/main')) return Response.json({ object: { sha: 'p1' } });
    if (url.endsWith('/git/commits/p1')) return Response.json({ tree: { sha: 't1' } });
    if (url.endsWith('/git/blobs')) return Response.json({ sha: 'b1' });
    if (url.endsWith('/git/trees')) return Response.json({ sha: 't2' });
    if (url.endsWith('/git/commits')) return Response.json({ sha: 'c2' });
    if (url.endsWith('/git/refs/heads/main')) return Response.json({});
    return new Response('nope', { status: 404 });
  };
  const env = {
    GITHUB_TOKEN: 'x', GITHUB_REPO: 'Jason5353/lewis-family-recipes', GITHUB_BRANCH: 'main',
    FAMILY_EMAILS: '{"jason@example.com":"Jason"}',
    ASSETS: { fetch: async () => Response.json(existing) },
  };
  return { calls, env };
}
const req = (body, headers = {}) => new Request('https://lewis-family-recipes.pages.dev/api/import', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('imports a recipe and commits markdown + photo in one commit (Zero Trust identity)', async () => {
  const { calls, env } = setup();
  const res = await onRequestPost({ request: req({ url: 'https://www.bbcgoodfood.com/recipes/honey-chicken', note: 'Double the sauce' }, { 'cf-access-authenticated-user-email': 'Jason@Example.com' }), env });
  const j = await res.json();
  assert.equal(res.status, 200, JSON.stringify(j));
  assert.equal(j.id, 'honey-chicken');
  const tree = JSON.parse(calls.find((c) => c.url.endsWith('/git/trees')).body).tree;
  assert.deepEqual(tree.map((t) => t.path), ['src/content/recipes/honey-chicken.md', 'public/recipe-images/honey-chicken.jpg']);
  const md = tree[0].content;
  assert.match(md, /addedBy: "Jason"/);
  assert.match(md, /image: "\/recipe-images\/honey-chicken.jpg"/);
  assert.match(md, /note: "Double the sauce"/);
  const commit = JSON.parse(calls.find((c) => c.url.endsWith('/git/commits') && c.method === 'POST').body);
  assert.equal(commit.message, 'Add recipe: Honey chicken (added by Jason)');
  assert.equal(calls.filter((c) => c.url.endsWith('/git/refs/heads/main') && c.method === 'PATCH').length, 1);
});

test('rejects a link that has already been saved', async () => {
  const { env } = setup([{ id: 'honey-chicken', title: 'Honey chicken', sourceUrl: 'https://www.bbcgoodfood.com/recipes/honey-chicken', addedBy: 'Rachael' }]);
  const res = await onRequestPost({ request: req({ url: 'http://bbcgoodfood.com/recipes/honey-chicken/?utm_source=share', addedBy: 'Jason' }), env });
  const j = await res.json();
  assert.equal(res.status, 409);
  assert.equal(j.existing.addedBy, 'Rachael');
});

test('needs a family name when there is no login identity', async () => {
  const { env } = setup();
  const res = await onRequestPost({ request: req({ url: 'https://www.bbcgoodfood.com/recipes/honey-chicken', addedBy: 'Mallory' }), env });
  assert.equal(res.status, 400);
});

test('gives a different id when the title already exists', async () => {
  const { calls, env } = setup([{ id: 'honey-chicken', title: 'Honey chicken', sourceUrl: 'https://other.site/x', addedBy: 'Alex' }]);
  const res = await onRequestPost({ request: req({ url: 'https://www.bbcgoodfood.com/recipes/honey-chicken', addedBy: 'Pauline' }), env });
  assert.equal((await res.json()).id, 'honey-chicken-2');
  assert.ok(calls.some((c) => c.body?.includes('honey-chicken-2.md')));
});

test('an email not in FAMILY_EMAILS never becomes a name: they must pick one from the family list', async () => {
  const unknown = { 'cf-access-authenticated-user-email': 'someone.else@example.com' };
  const { env } = setup();
  for (const addedBy of [undefined, 'someone.else', 'Mallory']) {
    const res = await onRequestPost({ request: req({ url: 'https://www.bbcgoodfood.com/recipes/honey-chicken', addedBy }, unknown), env });
    assert.equal(res.status, 400, `addedBy=${addedBy}`);
  }
  const { calls, env: env2 } = setup();
  const ok = await onRequestPost({ request: req({ url: 'https://www.bbcgoodfood.com/recipes/honey-chicken', addedBy: 'Jason' }, unknown), env: env2 });
  assert.equal(ok.status, 200);
  assert.match(JSON.parse(calls.find((c) => c.url.endsWith('/git/trees')).body).tree[0].content, /addedBy: "Jason"/);
});
