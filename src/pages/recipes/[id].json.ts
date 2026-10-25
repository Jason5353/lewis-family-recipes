import { getCollection, type CollectionEntry } from 'astro:content';
// /recipes/<id>.json: one recipe's saved data. The edit form fills itself from this,
// and /api/edit uses it to keep the fields the form doesn't show (link, tags, who added it).
export async function getStaticPaths() {
  const all = await getCollection('recipes');
  return all.map((r) => ({ params: { id: r.id }, props: { r } }));
}
export function GET({ props }: { props: { r: CollectionEntry<'recipes'> } }) {
  const { r } = props;
  return new Response(JSON.stringify({ id: r.id, ...r.data, addedOn: r.data.addedOn.toISOString().slice(0, 10) }), {
    headers: { 'content-type': 'application/json' },
  });
}
