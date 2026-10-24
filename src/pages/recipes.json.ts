import { getCollection } from 'astro:content';
// Used by the importer to spot recipes that have already been added.
export async function GET() {
  const all = await getCollection('recipes');
  return new Response(JSON.stringify(all.map((r) => ({ id: r.id, title: r.data.title, sourceUrl: r.data.source.url ?? '', addedBy: r.data.addedBy }))), {
    headers: { 'content-type': 'application/json' },
  });
}
