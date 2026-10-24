// Turns a recipe web page into a clean recipe object.
// Most recipe sites (BBC Good Food, Jamie Oliver, BBC Food, Tesco, Waitrose…) embed
// schema.org "Recipe" data as JSON-LD for Google. We read that, so no fragile scraping.
// Pure functions only: used by the Cloudflare function and by the tests.

const SITE_NAMES = {
  'bbcgoodfood.com': 'BBC Good Food',
  'bbc.co.uk': 'BBC Food',
  'jamieoliver.com': 'Jamie Oliver',
  'deliciousmagazine.co.uk': 'Delicious',
  'realfood.tesco.com': 'Tesco Real Food',
  'waitrose.com': 'Waitrose',
  'sainsburysmagazine.co.uk': "Sainsbury's Magazine",
  'mob.co.uk': 'Mob',
  'nigella.com': 'Nigella',
  'theguardian.com': 'The Guardian',
  'allrecipes.com': 'Allrecipes',
  'olivemagazine.com': 'Olive',
  'goodto.com': 'GoodTo',
  'pinchofnom.com': 'Pinch of Nom',
  'hellofresh.co.uk': 'HelloFresh',
  'gousto.co.uk': 'Gousto',
  'nytimes.com': 'NYT Cooking',
  'seriouseats.com': 'Serious Eats',
};

export const CATEGORY_RULES = [
  ['Drinks', /\b(drinks?|cocktails?|smoothies?|lemonade|mocktails?|milkshakes?)\b/],
  ['Breakfast & brunch', /\b(breakfast|brunch|pancakes?|porridge|granola|overnight oats)\b/],
  ['Desserts & treats', /\b(desserts?|puddings?|ice cream|cheesecakes?|crumbles?|trifles?|mousse|sweets?|fudge|tiramisu|pavlova)\b/],
  ['Baking & bread', /\b(baking|bakes?|breads?|loaf|loaves|cakes?|cupcakes?|muffins?|scones?|biscuits?|cookies?|brownies?|blondies?|flapjacks?|traybakes?|focaccia|sourdough|buns?)\b/],
  ['Sunday roast & sides', /\b(roasts?|roast dinner|side dish(es)?|sides?|yorkshire puddings?|gravy|stuffing|roast potatoes)\b/],
  ['Light bites & lunch', /\b(lunch|salads?|soups?|sandwich(es)?|snacks?|starters?|light bites?|wraps?|canap[eé]s?)\b/],
];

export function pickCategory({ title = '', category = '', keywords = '' }, categories, chosen) {
  if (chosen && categories.includes(chosen)) return chosen;
  const t = title.toLowerCase();
  const hay = `${category} ${keywords}`.toLowerCase();
  // Title wins over site metadata (e.g. "pasta bake" is not baking; "Yorkshire puddings" are not desserts).
  if (/\b(apple|cherry|lemon meringue|banoffee|mince|pecan|key lime|rhubarb|blackberry|pumpkin) pies?\b/.test(t)) return pick('Desserts & treats');
  if (/\bpasta bake\b|\b(pie|stew|curry|lasagne|chilli|casserole)\b/.test(t)) return pick('Dinners');
  if (/\byorkshire pudding/.test(t)) return pick('Sunday roast & sides');
  for (const [cat, re] of CATEGORY_RULES) if (re.test(t)) return pick(cat);
  for (const [cat, re] of CATEGORY_RULES) if (re.test(hay)) return pick(cat);
  return pick('Dinners');
  function pick(c) { return categories.includes(c) ? c : categories[0]; }
}

export function pickTags(r, raw) {
  const hay = `${r.title} ${raw.category} ${raw.keywords} ${raw.diet} ${r.description}`.toLowerCase();
  const tags = [];
  if (r.totalMins && r.totalMins <= 30) tags.push('Quick');
  if (/\b(vegetarian|vegan|veggie|meat-?free|plant-?based)\b/.test(hay) && !/\b(non-vegetarian)\b/.test(hay)) tags.push('Veggie');
  if (/slow[ -]?cooker|crock[ -]?pot/.test(hay)) tags.push('Slow cooker');
  if (/air[ -]?fr(y|ied|yer)/.test(hay)) tags.push('Air fryer');
  if (/\b(bbq|barbecue|barbeque)\b/.test(hay)) tags.push('BBQ');
  if (/\b(christmas|festive|xmas)\b/.test(hay)) tags.push('Christmas');
  if (/\b(batch[ -]?cook|freezable|freezer|make[ -]ahead)\b/.test(hay)) tags.push('Batch cook');
  return tags;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', frac12: '½', frac14: '¼', frac34: '¾', deg: '°', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', eacute: 'é', egrave: 'è' };
export function clean(s) {
  if (s == null) return '';
  return String(s)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-z]+\d*);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

export function isoMins(v) {
  if (!v) return undefined;
  if (typeof v === 'number') return v;
  const m = String(v).match(/P(?:(\d+)D)?T?(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?/i);
  if (!m) return undefined;
  const total = (+(m[1] || 0)) * 1440 + (+(m[2] || 0)) * 60 + Math.round(+(m[3] || 0));
  return total > 0 ? total : undefined;
}

const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const textOf = (v) => (typeof v === 'string' ? v : v?.name ?? v?.['@value'] ?? v?.text ?? '');
const hasType = (node, t) => asArray(node?.['@type']).some((x) => String(x).toLowerCase() === t.toLowerCase());

function findRecipe(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 6) return null;
  if (Array.isArray(node)) {
    for (const n of node) { const r = findRecipe(n, depth + 1); if (r) return r; }
    return null;
  }
  if (hasType(node, 'Recipe')) return node;
  for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'item']) {
    const r = findRecipe(node[key], depth + 1);
    if (r) return r;
  }
  return null;
}

function jsonLdBlocks(html) {
  const out = [];
  const re = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    let txt = m[1].trim().replace(/^<!\[CDATA\[|\]\]>$/g, '').trim();
    try { out.push(JSON.parse(txt)); continue; } catch {}
    try { out.push(JSON.parse(txt.replace(/[\u0000-\u001f]+/g, ' '))); } catch {}
  }
  return out;
}

function meta(html, prop) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*>`, 'i');
  const tag = html.match(re)?.[0];
  return tag ? clean(tag.match(/content=["']([^"']*)["']/i)?.[1] ?? '') : '';
}

function steps(instr) {
  const out = [];
  const walk = (v) => {
    if (v == null) return;
    if (typeof v === 'string') {
      // Some sites put the whole method in one string; split on line breaks or numbered steps.
      const parts = v.split(/\r?\n+|<\/p>|<br\s*\/?>|(?:^|\s)(?=\d+\.\s+[A-Z])/i).map(clean).filter(Boolean);
      out.push(...parts.map((p) => p.replace(/^\d+\.\s+/, '')));
      return;
    }
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (hasType(v, 'HowToSection')) {
      if (v.name) out.push(`# ${clean(v.name)}`);
      walk(v.itemListElement ?? v.steps);
      return;
    }
    if (hasType(v, 'ItemList')) { walk(v.itemListElement); return; }
    const t = clean(v.text ?? v.description ?? v.name ?? '');
    if (t) out.push(t);
  };
  walk(instr);
  return out.filter((s, i) => s && s !== out[i - 1]);
}

function imageUrl(img, base) {
  const first = asArray(img)[0];
  const u = typeof first === 'string' ? first : first?.url ?? first?.contentUrl ?? first?.['@id'];
  if (!u) return '';
  try { return new URL(u, base).href; } catch { return ''; }
}

export function siteName(pageUrl, html = '', node = {}) {
  let host = '';
  try { host = new URL(pageUrl).hostname.replace(/^www\./, ''); } catch {}
  for (const [domain, name] of Object.entries(SITE_NAMES)) if (host === domain || host.endsWith(`.${domain}`)) return name;
  return clean(meta(html, 'og:site_name')) || clean(textOf(node.publisher)) || host;
}

export function servesFrom(y) {
  for (const v of asArray(y)) {
    const m = String(textOf(v) || v).match(/\d+/);
    if (m && +m[0] > 0 && +m[0] <= 50) return { serves: +m[0], yieldText: clean(textOf(v) || v) };
  }
  const t = asArray(y).map((v) => clean(textOf(v) || v)).find(Boolean);
  return { serves: undefined, yieldText: t || undefined };
}

/** Returns a recipe object, or null if the page has no usable recipe data. */
export function extractRecipe(html, pageUrl) {
  let node = null;
  for (const block of jsonLdBlocks(html)) { node = findRecipe(block); if (node) break; }
  if (!node) return null;

  const ingredients = asArray(node.recipeIngredient ?? node.ingredients).map((i) => clean(textOf(i) || i)).filter(Boolean);
  const method = steps(node.recipeInstructions);
  if (!ingredients.length && !method.length) return null;

  const prepMins = isoMins(node.prepTime);
  const cookMins = isoMins(node.cookTime);
  const totalMins = isoMins(node.totalTime) ?? (prepMins || cookMins ? (prepMins ?? 0) + (cookMins ?? 0) : undefined);
  const { serves, yieldText } = servesFrom(node.recipeYield ?? node.yield);
  const kw = asArray(node.keywords).map(textOf).join(', ');
  const raw = {
    category: asArray(node.recipeCategory).map(textOf).join(', '),
    keywords: kw,
    diet: asArray(node.suitableForDiet).map((d) => String(textOf(d) || d).replace(/^https?:\/\/schema\.org\//, '')).join(' '),
  };
  const cuisine = clean(asArray(node.recipeCuisine).map(textOf)[0] ?? '') || undefined;
  const title = clean(node.name || node.headline || meta(html, 'og:title'));
  const description = clean(node.description || meta(html, 'og:description')).slice(0, 300);

  return {
    title,
    description,
    imageUrl: imageUrl(node.image, pageUrl) || meta(html, 'og:image'),
    source: { name: siteName(pageUrl, html, node), url: pageUrl },
    author: clean(asArray(node.author).map(textOf)[0] ?? ''),
    cuisine,
    prepMins, cookMins, totalMins, serves, yieldText,
    ingredients,
    steps: method,
    raw,
  };
}

export function slugify(s) {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 60).replace(/-+$/, '') || 'recipe';
}

export function normaliseUrl(u) {
  try {
    const x = new URL(u);
    x.hash = '';
    [...x.searchParams.keys()].filter((k) => /^(utm_|fbclid|gclid|mc_|ref$|igshid)/i.test(k)).forEach((k) => x.searchParams.delete(k));
    x.hostname = x.hostname.replace(/^www\./, '');
    x.protocol = 'https:';
    return x.href.replace(/\/$/, '');
  } catch { return u; }
}

// YAML front matter. JSON strings and arrays are valid YAML, which keeps quoting safe.
export function toMarkdown(r) {
  const j = (v) => JSON.stringify(v);
  const lines = ['---', `title: ${j(r.title)}`, `description: ${j(r.description ?? '')}`];
  if (r.image) lines.push(`image: ${j(r.image)}`);
  lines.push('source:', `  name: ${j(r.source.name)}`);
  if (r.source.url) lines.push(`  url: ${j(r.source.url)}`);
  lines.push(`addedBy: ${j(r.addedBy)}`, `addedOn: ${r.addedOn}`, `category: ${j(r.category)}`, `tags: ${j(r.tags ?? [])}`);
  if (r.cuisine) lines.push(`cuisine: ${j(r.cuisine)}`);
  for (const k of ['prepMins', 'cookMins', 'totalMins', 'serves']) if (Number.isFinite(r[k])) lines.push(`${k}: ${r[k]}`);
  if (r.yieldText) lines.push(`yieldText: ${j(r.yieldText)}`);
  lines.push('ingredients:', ...r.ingredients.map((i) => `  - ${j(i)}`));
  lines.push('steps:', ...r.steps.map((s) => `  - ${j(s)}`));
  if (r.note) lines.push(`note: ${j(r.note)}`);
  lines.push('---', '');
  return lines.join('\n');
}
