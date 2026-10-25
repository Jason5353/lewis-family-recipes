// Turns a recipe typed in by hand (the "Type it in" tab on /add/) into the same shape the
// link importer produces, so both kinds of recipe look and behave the same on the site.
// Plain JS with no JSON imports, so Cloudflare's wrangler 3.114 build is happy.

const LIMITS = { title: 120, line: 300, step: 2000, ingredients: 100, steps: 60, note: 200, from: 80, description: 300 };

const tidy = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

// Units offered on the form. '' = no unit (e.g. "2 eggs"). Shared with src/pages/add.astro.
export const UNITS = ['', 'g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'oz', 'lb', 'pinch', 'handful', 'clove', 'slice', 'tin', 'pack'];

// Amounts the recipe page's serves +/- buttons can scale: 2, 1.5, 1¾, 1 3/4, ½, 2-3.
const FRAC = '[½⅓⅔¼¾⅛⅕]';
const ONE = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?\s*${FRAC}?|${FRAC})`;
export const AMOUNT = new RegExp(String.raw`^${ONE}(?:\s*(?:-|–|to)\s*${ONE})?$`);

/** Turn [{ amount, unit, item }] rows into ingredient lines like "310 g plain flour". */
export function ingredientLines(rows) {
  if (!Array.isArray(rows)) return { error: 'Add at least one ingredient.' };
  const out = [];
  for (const row of rows) {
    const amount = tidy(row?.amount), unit = tidy(row?.unit), item = tidy(row?.item);
    if (!amount && !item) continue;
    if (!item) return { error: 'One of the ingredients has an amount but no name.' };
    if (amount && !AMOUNT.test(amount)) return { error: `"${amount}" isn't an amount we can scale. Use a number like 2, 1.5, 1¾ or 1 3/4.` };
    if (!UNITS.includes(unit)) return { error: `"${unit}" isn't one of the units on the list.` };
    if (unit && !amount) return { error: `"${item}" has a unit but no amount.` };
    if (item.length > LIMITS.line) return { error: 'One of the ingredient names is very long.' };
    out.push([amount, unit, item].filter(Boolean).join(' '));
  }
  if (!out.length) return { error: 'Add at least one ingredient.' };
  if (out.length > LIMITS.ingredients) return { error: `That's a lot of ingredients. Keep it under ${LIMITS.ingredients}.` };
  return { lines: out };
}

/** Split a text box into lines, dropping blanks, bullets and any numbering people paste in. */
export function toLines(text, { numbered = false } = {}) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((l) => tidy(l))
    .map((l) => l.replace(/^[-–•*·▢☐□]\s+/, ''))
    .map((l) => (numbered ? l.replace(/^(?:step\s*)?\d{1,2}\s*[.):-]\s*/i, '') : l))
    .map((l) => l.replace(/^#\s*/, '# ')) // "#For the icing" -> "# For the icing" (a heading)
    .filter((l) => l && l !== '#' && l !== '# ');
}

const wholeNumber = (v, max = 1000) => {
  const n = Number(String(v ?? '').trim());
  return Number.isInteger(n) && n > 0 && n <= max ? n : undefined;
};

/**
 * Check and tidy a typed-in recipe.
 * Returns { recipe } ready for toMarkdown(), or { error } with a friendly message.
 */
export function buildManualRecipe(body, { categories = [], addedBy, addedOn }) {
  const title = tidy(body.title);
  if (!title) return { error: 'Give the recipe a name.' };
  if (title.length > LIMITS.title) return { error: 'That recipe name is a bit long. Keep it under 120 characters.' };

  const ing = ingredientLines(body.ingredients);
  if (ing.error) return { error: ing.error };
  const ingredients = ing.lines;
  const steps = toLines(body.steps, { numbered: true });
  if (!steps.some((s) => !s.startsWith('# '))) return { error: 'Add at least one step (one per line).' };
  if (steps.length > LIMITS.steps) return { error: `That's a lot of steps. Keep it under ${LIMITS.steps} lines.` };
  if (steps.some((s) => s.length > LIMITS.step)) return { error: 'One of the steps is very long. Try splitting it into a few lines.' };

  // Serves is required: the recipe page uses it to scale the amounts.
  const serves = wholeNumber(body.serves, 200);
  if (!serves) return { error: 'Say how many it serves, so the amounts can be scaled.' };

  const category = categories.includes(body.category) ? body.category : categories[0] ?? 'Dinners';
  const prepMins = wholeNumber(body.prepMins);
  const cookMins = wholeNumber(body.cookMins);
  const totalMins = prepMins || cookMins ? (prepMins ?? 0) + (cookMins ?? 0) : undefined;
  const from = tidy(body.from).slice(0, LIMITS.from);
  const note = tidy(body.note).slice(0, LIMITS.note) || undefined;
  const description = tidy(body.description).slice(0, LIMITS.description);

  return {
    recipe: {
      title,
      description,
      // No web link: "source" says where it came from, defaulting to the family itself.
      source: { name: from || 'Lewis family recipe' },
      addedBy,
      addedOn,
      category,
      tags: [],
      prepMins,
      cookMins,
      totalMins,
      serves,
      yieldText: serves ? String(serves) : undefined,
      ingredients,
      steps,
      note,
    },
  };
}

/** Accept a photo sent from the browser as a data: URL (already resized there). */
export function readPhoto(dataUrl, maxBytes) {
  if (!dataUrl) return null;
  const m = String(dataUrl).match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return { error: "That photo couldn't be read. Try a JPG or PNG." };
  const bytes = Math.floor((m[2].length * 3) / 4);
  if (bytes > maxBytes) return { error: 'That photo is too big. Try a smaller one.' };
  return { ext: m[1] === 'jpeg' ? 'jpg' : m[1], base64: m[2] };
}

/**
 * Split a saved ingredient line back into { amount, unit, item } for the edit form.
 * "310 g plain flour" -> { amount: '310', unit: 'g', item: 'plain flour' }.
 * Anything that doesn't split cleanly goes whole into item, so no text is ever lost.
 */
const LEAD = new RegExp(String.raw`^(${ONE}(?:\s*(?:-|–|to)\s*${ONE})?)(.*)$`);
export function splitIngredient(line) {
  const text = tidy(line);
  const whole = { amount: '', unit: '', item: text };
  const m = text.match(LEAD);
  if (!m) return whole;
  const amount = m[1].trim();
  const rest = m[2].trim();
  if (!rest || !AMOUNT.test(amount)) return whole;
  const spaced = /\s$/.test(m[1]) || /^\s/.test(m[2]);
  const u = rest.match(/^([a-z]+)\s+(.+)$/i);
  const unit = u && UNITS.includes(u[1].toLowerCase()) ? u[1].toLowerCase() : '';
  if (unit) return { amount, unit, item: u[2] };
  // No space after the number ("2x tins", "400g/14oz tin") and no clean unit: keep the line whole.
  return spaced ? { amount, unit: '', item: rest } : whole;
}
