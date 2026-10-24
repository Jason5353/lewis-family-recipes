import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../functions/api/delete.js';

const md = `---\ntitle: "Honey chicken"\nimage: "/recipe-images/honey-chicken.jpg"\naddedBy: "Rachael"\n---\n`;
const b64 = (s) => Buffer.from(s).toString('base64');

function setup({ recipe = md, photo = true } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    url = String(url);
    calls.push({ url, method: init.method ?? 'GET', body: init.body });
    if (url.includes('/contents/src/content/recipes/honey-chicken.md')) return recipe ? Response.json({ sha: 's1', content: b64(recipe) }) : new Response('', { status: 404 });
    if (url.includes('/contents/public/recipe-images/honey-chicken.jpg')) return photo ? Response.json({ sha: 's2', content: '' }) : new Response('', { status: 404 });
    if (url.endsWith('/git/ref/heads/main')) return Response.json({ object: { sha: 'p1' } });
    if (url.endsWith('/git/commits/p1')) return Response.json({ tree: { sha: 't1' } });
    if (url.endsWith('/git/trees')) return Response.json({ sha: 't2' });
    if (url.endsWith('/git/commits')) return Response.json({ sha: 'c2' });
    if (url.endsWith('/git/refs/heads/main')) return Response.json({});
    return new Response('nope', { status: 404 });
  };
  const env = { GITHUB_TOKEN: 'x', GITHUB_REPO: 'Jason5353/lewis-family-recipes', GITHUB_BRANCH: 'main', FAMILY_EMAILS: '{"jason@example.com":"Jason"}' };
  return { calls, env };
}
const SIGNED_IN = { 'cf-access-authenticated-user-email': 'jason@example.com' };
const req = (body, headers = SIGNED_IN) => new Request('https://lewis-family-recipes.pages.dev/api/delete', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('deletes the recipe and its photo in one commit, recording who did it', async () => {
  const { calls, env } = setup();
  const res = await onRequestPost({ request: req({ id: 'honey-chicken' }), env });
  const j = await res.json();
  assert.equal(res.status, 200, JSON.stringify(j));
  assert.equal(j.title, 'Honey chicken');
  const tree = JSON.parse(calls.find((c) => c.url.endsWith('/git/trees')).body).tree;
  assert.deepEqual(tree.map((t) => [t.path, t.sha]), [['src/content/recipes/honey-chicken.md', null], ['public/recipe-images/honey-chicken.jpg', null]]);
  const commit = JSON.parse(calls.find((c) => c.url.endsWith('/git/commits') && c.method === 'POST').body);
  assert.equal(commit.message, 'Delete recipe: Honey chicken (deleted by Jason)');
});

test('still deletes the recipe when its photo is missing', async () => {
  const { calls, env } = setup({ photo: false });
  const res = await onRequestPost({ request: req({ id: 'honey-chicken' }), env });
  assert.equal(res.status, 200);
  const tree = JSON.parse(calls.find((c) => c.url.endsWith('/git/trees')).body).tree;
  assert.deepEqual(tree.map((t) => t.path), ['src/content/recipes/honey-chicken.md']);
});

test('says so if the recipe is already gone', async () => {
  const { calls, env } = setup({ recipe: null });
  const res = await onRequestPost({ request: req({ id: 'honey-chicken' }), env });
  assert.equal(res.status, 404);
  assert.ok(!calls.some((c) => c.method === 'POST'));
});

test('needs a signed-in family member', async () => {
  const { env } = setup();
  const res = await onRequestPost({ request: req({ id: 'honey-chicken' }, {}), env });
  assert.equal(res.status, 401);
});

test('rejects odd ids and requests from other sites', async () => {
  const { calls, env } = setup();
  assert.equal((await onRequestPost({ request: req({ id: '../../package' }), env })).status, 400);
  assert.equal((await onRequestPost({ request: req({ id: 'honey-chicken' }, { ...SIGNED_IN, origin: 'https://evil.example' }), env })).status, 403);
  assert.equal(calls.length, 0);
});
