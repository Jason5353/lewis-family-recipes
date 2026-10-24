import { whoIs } from '../../importer/identity.js';
export function onRequestGet({ request, env }) {
  const { name, mode } = whoIs(request, env);
  return Response.json({ name, mode }, { headers: { 'cache-control': 'no-store' } });
}
