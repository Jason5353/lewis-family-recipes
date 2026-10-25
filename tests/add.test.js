import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../functions/api/add.js';
import { toLines, buildManualRecipe } from '../importer/manual.js';

// The Sugar Cookies recipe, typed in the way a family member would.
const cookies = {
  title: 'Sugar Cookies',
  category: 'Baking & bread',
  serves: '20', prepMins: '20', cookMins: '10',
  ingredients: '310 g plain flour\n150 g salted butter\n\n1¾ tsp baking powder\n150 g cane sugar\n25 g granulated sugar\n2 medium eggs\n2 tsp vanilla extract\n1 tbsp mixed spice\n',
  steps: '1. Preheat oven to 175°C and line two baking sheets with parchment – they spread!\n2) Whisk the flour, baking powder and sugar together. Set aside.\nIn another bowl mix the eggs, vanilla and butter until combined.\nGradually add the wet mix to the dry until a crumbly dough forms.\nMix in the mixed spice.\nShape the cookies and bake until golden.',
  tags: ['Kids can make', 'Not a real tag'],
  note: 'Kids love these',
};

test('lines: drops blanks, bullets and pasted-in numbers; keeps headings', () => {
  assert.deepEqual(toLines('- 2 eggs\n\n• 100 g sugar\n#For the icing\n50 g icing sugar'), ['2 eggs', '100 g sugar', '# For the icing', '50 g icing sugar']);
  assert.deepEqual(toLines('1. Mix\n2) Bake\nStep 3: Cool\n10 minutes later, eat', { numbered: true }), ['Mix', 'Bake', 'Cool', '10 minutes later, eat']);
});

test('builds a recipe in the same shape as an imported one', () => {
  const { recipe, error } = buildManualRecipe(cookies, { categories: ['Dinners', 'Baking & bread'], tags: ['Kids can make'], addedBy: 'Jason', addedOn: '2026-10-25' });
  assert.equal(error, undefined);
  assert.equal(recipe.ingredients.length, 8);
  assert.equal(recipe.steps[0], 'Preheat oven to 175°C and line two baking sheets with parchment – they spread!');
  assert.equal(recipe.steps.length, 6);
  assert.deepEqual(recipe.tags, ['Kids can make']);
  assert.equal(recipe.totalMins, 30);
  assert.equal(recipe.serves, 20);
  assert.deepEqual(recipe.source, { name: 'Lewis family recipe' });
});

test('asks for the missing bits', () => {
  const opts = { categories: ['Dinners'], tags: [], addedBy: 'Jason', addedOn: '2026-10-25' };
  assert.match(buildManualRecipe({ ...cookies, title: ' ' }, opts).error, /name/);
  assert.match(buildManualRecipe({ ...cookies, ingredients: '\n# Heading only\n' }, opts).error, /ingredient/);
  assert.match(buildManualRecipe({ ...cookies, steps: '' }, opts).error, /step/);
});

function setup() {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    url = String(url);
    calls.push({ url, method: init.method ?? 'GET', body: init.body });
    if (url.endsWith('/git/ref/heads/test')) return Response.json({ object: { sha: 'p1' } });
    if (url.endsWith('/git/commits/p1')) return Response.json({ tree: { sha: 't1' } });
    if (url.endsWith('/git/blobs')) return Response.json({ sha: 'b1' });
    if (url.endsWith('/git/trees')) return Response.json({ sha: 't2' });
    if (url.endsWith('/git/commits')) return Response.json({ sha: 'c2' });
    if (url.endsWith('/git/refs/heads/test')) return Response.json({});
    return new Response('nope', { status: 404 });
  };
  const env = {
    GITHUB_TOKEN: 'x', GITHUB_REPO: 'Jason5353/lewis-family-recipes', GITHUB_BRANCH: 'test', FAMILY_EMAILS: '{"jason@example.com":"Jason"}',
    ASSETS: { fetch: async () => Response.json([{ id: 'sugar-cookies', title: 'Sugar Cookies' }]) },
  };
  return { calls, env };
}
const req = (body, headers = { 'cf-access-authenticated-user-email': 'jason@example.com' }) =>
  new Request('https://test.lewis-family-recipes.pages.dev/api/add', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('saves recipe and photo in one commit, avoiding a name clash', async () => {
  const { calls, env } = setup();
  const photo = 'data:image/jpeg;base64,' + Buffer.from('fake jpeg').toString('base64');
  const res = await onRequestPost({ request: req({ ...cookies, photo }), env });
  const j = await res.json();
  assert.equal(res.status, 200, JSON.stringify(j));
  assert.equal(j.id, 'sugar-cookies-2');
  const tree = JSON.parse(calls.find((c) => c.url.endsWith('/git/trees')).body).tree;
  assert.deepEqual(tree.map((t) => t.path), ['src/content/recipes/sugar-cookies-2.md', 'public/recipe-images/sugar-cookies-2.jpg']);
  const md = tree[0].content;
  assert.match(md, /^title: "Sugar Cookies"$/m);
  assert.match(md, /^image: "\/recipe-images\/sugar-cookies-2.jpg"$/m);
  assert.match(md, /^  name: "Lewis family recipe"$/m);
  assert.match(md, /^addedBy: "Jason"$/m);
  assert.match(md, /^category: "Baking & bread"$/m);
  assert.match(md, /^  - "310 g plain flour"$/m);
  const commit = JSON.parse(calls.find((c) => c.url.endsWith('/git/commits') && c.method === 'POST').body);
  assert.equal(commit.message, 'Add recipe: Sugar Cookies (added by Jason)');
});

test('rejects other sites and bad photos', async () => {
  const { env } = setup();
  let res = await onRequestPost({ request: req(cookies, { 'cf-access-authenticated-user-email': 'jason@example.com', origin: 'https://evil.example' }), env });
  assert.equal(res.status, 403);
  res = await onRequestPost({ request: req({ ...cookies, photo: 'data:text/html;base64,PGI+' }), env });
  assert.equal(res.status, 400);
});
