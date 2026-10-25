// Turns a recipe typed in by hand (the "Type it in" tab on /add/) into the same shape the
// link importer produces, so both kinds of recipe look and behave the same on the site.
// Plain JS with no JSON imports, so Cloudflare's wrangler 3.114 build is happy.

const LIMITS = { title: 120, line: 300, step: 2000, ingredients: 100, steps: 60, note: 200, from: 80, description: 300 };

const tidy = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

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
export function buildManualRecipe(body, { categories = [], tags: allowedTags = [], addedBy, addedOn }) {
  const title = tidy(body.title);
  if (!title) return { error: 'Give the recipe a name.' };
  if (title.length > LIMITS.title) return { error: 'That recipe name is a bit long. Keep it under 120 characters.' };

  const ingredients = toLines(body.ingredients);
  const steps = toLines(body.steps, { numbered: true });
  if (!ingredients.some((i) => !i.startsWith('# '))) return { error: 'Add at least one ingredient (one per line).' };
  if (!steps.some((s) => !s.startsWith('# '))) return { error: 'Add at least one step (one per line).' };
  if (ingredients.length > LIMITS.ingredients) return { error: `That's a lot of ingredients. Keep it under ${LIMITS.ingredients} lines.` };
  if (steps.length > LIMITS.steps) return { error: `That's a lot of steps. Keep it under ${LIMITS.steps} lines.` };
  if (ingredients.some((i) => i.length > LIMITS.line)) return { error: 'One of the ingredient lines is very long. Put each ingredient on its own line.' };
  if (steps.some((s) => s.length > LIMITS.step)) return { error: 'One of the steps is very long. Try splitting it into a few lines.' };

  const category = categories.includes(body.category) ? body.category : categories[0] ?? 'Dinners';
  const tags = (Array.isArray(body.tags) ? body.tags : []).filter((t) => allowedTags.includes(t));
  const prepMins = wholeNumber(body.prepMins);
  const cookMins = wholeNumber(body.cookMins);
  const totalMins = prepMins || cookMins ? (prepMins ?? 0) + (cookMins ?? 0) : undefined;
  const serves = wholeNumber(body.serves, 200);
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
      tags,
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
