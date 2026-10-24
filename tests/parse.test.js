import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractRecipe, pickCategory, pickTags, slugify, toMarkdown, normaliseUrl, isoMins } from '../importer/parse.js';
import family from '../src/data/family.js';

const fx = (f) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');

test('reads a BBC Good Food style page', () => {
  const r = extractRecipe(fx('bbc-style.html'), 'https://www.bbcgoodfood.com/recipes/honey-chicken');
  assert.equal(r.title, 'Honey chicken');
  assert.equal(r.description, 'Sticky & sweet honey chicken – a family favourite.');
  assert.equal(r.source.name, 'BBC Good Food');
  assert.equal(r.imageUrl, 'https://images.example.com/honey-chicken.jpg');
  assert.deepEqual([r.prepMins, r.cookMins, r.totalMins, r.serves], [10, 25, 35, 4]);
  assert.equal(r.ingredients.length, 4);
  assert.deepEqual(r.steps, ['Toss the chicken in the cornflour.', 'Fry for 6-8 mins until golden.']);
  assert.equal(pickCategory({ title: r.title, ...r.raw }, family.categories), 'Dinners');
  assert.ok(!pickTags(r, r.raw).includes('Quick'));
});

test('finds a recipe inside @graph with sections', () => {
  const r = extractRecipe(fx('graph-sections.html'), 'https://www.jamieoliver.com/recipes/veggie-lasagne/');
  assert.equal(r.title, 'Veggie lasagne');
  assert.equal(r.source.name, 'Jamie Oliver');
  assert.equal(r.totalMins, 90);
  assert.equal(r.serves, 6);
  assert.deepEqual(r.steps, ['# For the sauce', 'Soften the onions.', 'Add the tomatoes.', '# To assemble', 'Layer it up and bake.']);
  assert.ok(pickTags(r, r.raw).includes('Veggie'));
  assert.equal(pickCategory({ title: r.title, ...r.raw }, family.categories), 'Dinners');
});

test('splits a one-string method and handles "Makes 1 loaf"', () => {
  const r = extractRecipe(fx('string-method.html'), 'https://example.org/banana-bread');
  assert.deepEqual(r.steps, ['Heat oven to 180C.', 'Mash the bananas.', 'Mix and bake for 1 hr.']);
  assert.equal(r.serves, 1);
  assert.equal(r.yieldText, 'Makes 1 loaf');
  assert.equal(pickCategory({ title: r.title, ...r.raw }, family.categories), 'Baking & bread');
  assert.ok(pickTags(r, r.raw).includes('Batch cook'));
  assert.equal(r.source.name, 'example.org');
});

test('returns null when there is no recipe', () => {
  assert.equal(extractRecipe(fx('no-recipe.html'), 'https://example.org/'), null);
});

test('category rules avoid the classic traps', () => {
  const c = (title, category = '') => pickCategory({ title, category, keywords: '' }, family.categories);
  assert.equal(c('Cheesy pasta bake', 'Baking'), 'Dinners');
  assert.equal(c('Giant Yorkshire puddings', 'Dessert'), 'Sunday roast & sides');
  assert.equal(c('Classic apple pie'), 'Desserts & treats');
  assert.equal(c('Steak pie'), 'Dinners');
  assert.equal(c('Chocolate brownies'), 'Baking & bread');
  assert.equal(c('Anything', ''), 'Dinners');
  assert.equal(pickCategory({ title: 'x' }, family.categories, 'Drinks'), 'Drinks');
});

test('helpers', () => {
  assert.equal(slugify("Nan's Shepherd's Pie & Mash!"), 'nans-shepherds-pie-and-mash');
  assert.equal(slugify('Crème brûlée'), 'creme-brulee');
  assert.equal(normaliseUrl('http://www.bbcgoodfood.com/recipes/x/?utm_source=a#top'), 'https://bbcgoodfood.com/recipes/x');
  assert.equal(isoMins('PT1H5M'), 65);
  assert.equal(isoMins('P0DT0H20M'), 20);
});

test('markdown front matter round-trips as YAML-safe JSON values', () => {
  const md = toMarkdown({ title: 'He said "hi": a: b', description: '', source: { name: 'X', url: 'https://x' }, addedBy: 'Jason', addedOn: '2026-10-24', category: 'Dinners', tags: ['Quick'], ingredients: ['1 egg'], steps: ['Go'], serves: 2, note: 'Yum #1' });
  assert.match(md, /^---\ntitle: "He said \\"hi\\": a: b"\n/);
  assert.match(md, /note: "Yum #1"\n---\n$/);
});
