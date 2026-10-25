import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../functions/api/edit.js';
import { splitIngredient, ingredientLines } from '../importer/manual.js';

const OLD = {
  id: 'honey-chicken', title: 'Honey chicken', description: 'Sticky and quick.', image: '/recipe-images/honey-chicken.jpg',
  source: { name: 'BBC Good Food', url: 'https://www.bbcgoodfood.com/recipes/honey-chicken' },
  addedBy: 'Rachael', addedOn: '2026-10-01', category: 'Dinners', tags: ['Quick'], cuisine: 'Asian',
  totalMins: 30, serves: 4, yieldText: 'Serves 4', ingredients: ['4 chicken thighs', '2 tbsp honey'], steps: ['Fry.', 'Glaze.'],
};

function setup({ exists = true, photo = true, old = OLD } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    url = String(url);
    calls.push({ url, method: init.method ?? 'GET', body: init.body });
    if (url.includes('/contents/src/content/recipes/honey-chicken.md')) return exists ? Response.json({ sha: 's1', content: '' }) : new Response('', { status: 404 });
    if (url.includes('/contents/public/recipe-images/honey-chicken.jpg')) return photo ? Response.json({ sha: 's2', content: '' }) : new Response('', { status: 404 });
    if (url.endsWith('/git/ref/heads/main')) return Response.json({ object: { sha: 'p1' } });
    if (url.endsWith('/git/commits/p1')) return Response.json({ tree: { sha: 't1' } });
    if (url.endsWith('/git/blobs')) return Response.json({ sha: 'b1' });
    if (url.endsWith('/git/trees')) return Response.json({ sha: 't2' });
    if (url.endsWith('/git/commits')) return Response.json({ sha: 'c2' });
    if (url.endsWith('/git/refs/heads/main')) return Response.json({});
    return new Response('nope', { status: 404 });
  };
  const env = {
    GITHUB_TOKEN: 'x', GITHUB_REPO: 'Jason5353/lewis-family-recipes', GITHUB_BRANCH: 'main', FAMILY_EMAILS: '{"jason@example.com":"Jason"}',
    ASSETS: { fetch: async (u) => (String(u).endsWith('/recipes/honey-chicken.json') && old ? Response.json(old) : new Response('', { status: 404 })) },
  };
  return { calls, env };
}
const SIGNED_IN = { 'cf-access-authenticated-user-email': 'jason@example.com' };
const req = (body, headers = SIGNED_IN) => new Request('https://lewis-family-recipes.pages.dev/api/edit', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const form = (over = {}) => ({
  id: 'honey-chicken', title: 'Honey garlic chicken', category: 'Dinners', serves: '4', prepMins: '', cookMins: '',
  ingredients: [{ amount: '4', unit: '', item: 'chicken thighs' }, { amount: '3', unit: 'tbsp', item: 'honey' }], steps: 'Fry.\nGlaze.\nServe.',
  from: '', note: 'More honey!', ...over,
});
const tree = (calls) => JSON.parse(calls.find((c) => c.url.endsWith('/git/trees')).body).tree;

test('edits a recipe in one commit, keeping who added it, the link, tags and photo', async () => {
  const { calls, env } = setup();
  const res = await onRequestPost({ request: req(form()), env });
  const j = await res.json();
  assert.equal(res.status, 200, JSON.stringify(j));
  const t = tree(calls);
  assert.deepEqual(t.map((x) => x.path), ['src/content/recipes/honey-chicken.md']);
  const md = t[0].content;
  for (const re of [/title: "Honey garlic chicken"/, /addedBy: "Rachael"/, /addedOn: 2026-10-01/, /url: "https:\/\/www.bbcgoodfood.com\/recipes\/honey-chicken"/,
    /name: "BBC Good Food"/, /tags: \["Quick"\]/, /cuisine: "Asian"/, /image: "\/recipe-images\/honey-chicken.jpg"/, /description: "Sticky and quick."/,
    /totalMins: 30/, /yieldText: "Serves 4"/, /"3 tbsp honey"/, /"Serve."/, /note: "More honey!"/]) assert.match(md, re);
  const commit = JSON.parse(calls.find((c) => c.url.endsWith('/git/commits') && c.method === 'POST').body);
  assert.equal(commit.message, 'Edit recipe: Honey garlic chicken (edited by Jason)');
});

test('a new photo gets a fresh file name and the old photo is removed', async () => {
  const { calls, env } = setup();
  const res = await onRequestPost({ request: req(form({ photo: 'data:image/jpeg;base64,/9j/AQID' })), env });
  assert.equal(res.status, 200);
  const t = tree(calls);
  const img = t.find((x) => x.path.startsWith('public/recipe-images/honey-chicken-'));
  assert.ok(img && img.path.endsWith('.jpg'));
  assert.match(t[0].content, new RegExp(`image: "${img.path.slice(6)}"`));
  assert.deepEqual(t.find((x) => x.path === 'public/recipe-images/honey-chicken.jpg'), { path: 'public/recipe-images/honey-chicken.jpg', mode: '100644', type: 'blob', sha: null });
});

test('refuses recipes that are gone, bad input and outsiders', async () => {
  let { env } = setup({ exists: false });
  assert.equal((await onRequestPost({ request: req(form()), env })).status, 404);
  ({ env } = setup({ old: null }));
  assert.equal((await onRequestPost({ request: req(form()), env })).status, 404);
  ({ env } = setup());
  assert.equal((await onRequestPost({ request: req(form({ id: '../secrets' })), env })).status, 400);
  assert.equal((await onRequestPost({ request: req(form({ title: '' })), env })).status, 400);
  assert.equal((await onRequestPost({ request: req(form(), { 'cf-access-authenticated-user-email': 'x@example.com' }), env })).status, 400);
  assert.equal((await onRequestPost({ request: req(form(), { ...SIGNED_IN, origin: 'https://evil.example' }), env })).status, 403);
});

test('ingredient lines split for the edit form and come back the same', () => {
  const cases = {
    '310 g plain flour': ['310', 'g', 'plain flour'], '200g plain flour': ['200', 'g', 'plain flour'], '1 3/4 tsp salt': ['1 3/4', 'tsp', 'salt'],
    '2 to 3 apples': ['2 to 3', '', 'apples'], '1 large onion, chopped': ['1', '', 'large onion, chopped'],
    'salt, to taste': ['', '', 'salt, to taste'], '2x tins tomatoes': ['', '', '2x tins tomatoes'], '400g/14oz tin tomatoes': ['', '', '400g/14oz tin tomatoes'],
    '# For the icing': ['', '', '# For the icing'],
  };
  for (const [line, [amount, unit, item]] of Object.entries(cases)) {
    const s = splitIngredient(line);
    assert.deepEqual(s, { amount, unit, item }, line);
    assert.equal(ingredientLines([s]).lines[0], [amount, unit, item].filter(Boolean).join(' '), line);
  }
});
