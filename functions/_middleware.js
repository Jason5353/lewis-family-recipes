import { cookies, sign } from '../importer/identity.js';

// Only does anything if you choose the shared family password (SITE_PASSWORD set in Cloudflare).
// With Cloudflare Zero Trust in front of the site, this just passes requests through.
const PUBLIC = [/^\/login\/?$/, /^\/api\/login$/, /^\/manifest\.webmanifest$/, /^\/icons\//, /^\/_astro\//, /^\/family\/cookie-day-2023\.webp$/, /^\/robots\.txt$/];

export async function onRequest({ request, env, next }) {
  if (!env.SITE_PASSWORD) return next();
  const { pathname } = new URL(request.url);
  if (PUBLIC.some((re) => re.test(pathname))) return next();
  const c = cookies(request);
  if (c.lfr_auth && c.lfr_auth === (await sign('family', env.SITE_PASSWORD))) return next();
  if (pathname.startsWith('/api/')) return Response.json({ ok: false, error: 'Please sign in again.' }, { status: 401 });
  return Response.redirect(new URL('/login/', request.url), 302);
}
