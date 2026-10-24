import { sign } from '../../importer/identity.js';

export async function onRequestPost({ request, env }) {
  const form = await request.formData();
  const name = String(form.get('name') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const back = (q) => Response.redirect(new URL(`/login/${q}`, request.url), 303);
  if (!env.SITE_PASSWORD) return Response.redirect(new URL('/', request.url), 303);
  if (!name || password !== env.SITE_PASSWORD) return back('?bad=1');
  const year = 60 * 60 * 24 * 365;
  const h = new Headers({ location: '/' });
  h.append('set-cookie', `lfr_auth=${await sign('family', env.SITE_PASSWORD)}; Path=/; Max-Age=${year}; HttpOnly; Secure; SameSite=Lax`);
  h.append('set-cookie', `lfr_name=${encodeURIComponent(name)}; Path=/; Max-Age=${year}; Secure; SameSite=Lax`);
  return new Response(null, { status: 303, headers: h });
}
