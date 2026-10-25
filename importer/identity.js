// Works out who is using the site.
// Zero Trust mode: Cloudflare Access adds the signed-in email as a header; FAMILY_EMAILS maps it to a name.
// Family-password mode: the name chosen at sign-in is kept in a cookie.

export function cookies(request) {
  const out = {};
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function familyEmails(env) {
  try { return Object.fromEntries(Object.entries(JSON.parse(env.FAMILY_EMAILS || '{}')).map(([k, v]) => [k.toLowerCase(), v])); }
  catch { return {}; }
}

export function whoIs(request, env) {
  const email = request.headers.get('cf-access-authenticated-user-email');
  if (email) {
    const name = familyEmails(env)[email.toLowerCase()];
    // Unknown email: no name, so the add page asks them to pick one from the family list.
    return { name: name ?? null, email, mode: 'access' };
  }
  if (env.SITE_PASSWORD) {
    const name = cookies(request).lfr_name;
    return { name: name || null, mode: 'password' };
  }
  return { name: null, mode: 'open' };
}

export async function sign(value, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
